// WebGL2 렌더러. 배경 그림을 깔고, 그 위에 입자를 빛처럼 더해서(가산 혼합) 그린다.
// 물에 비친 불꽃은 입자를 수면 아래로 뒤집어 한 번 더 흐리게 그린다.
// 화질이 「높음·보통」이면 밝기 범위가 넓은 화면(HDR, 반정밀도 실수)에 그린 뒤
// 밝은 부분만 뽑아 반씩 줄여 가며 번지게(블룸) 하고, 밝은 쪽만 부드럽게 눌러(톤 매핑) 화면에 낸다.
// 실수 화면을 못 쓰는 기기는 예전처럼 바로 그린다.

import type { Mat4 } from '../camera.ts';
import { CITY_STRIDE, type CityMesh } from './city.ts';
import { RENDER_STRIDE } from '../sim.ts';
import type { Vec3 } from '../show.ts';

const QUAD_VS = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const QUAD_FS = `#version 300 es
precision mediump float;
uniform sampler2D uBackdrop;
uniform vec3 uSkyLight;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec3 c = texture(uBackdrop, vUv).rgb;
  c += uSkyLight * (0.2 + 0.8 * vUv.y);
  outColor = vec4(c, 1.0);
}`;

const POINT_VS = `#version 300 es
layout(location = 0) in vec4 aPos;   // x, y, z, 크기(m)
layout(location = 1) in vec4 aColor; // r, g, b, 밝기
uniform mat4 uViewProj;
uniform float uPxPerMeter;
uniform float uMaxPoint;
uniform float uMirror;   // 1: 그대로, -1: 수면 아래로 뒤집기
uniform float uFade;
uniform vec3 uEye;
uniform vec2 uShore;     // 물이 있는 북쪽 범위 (가까운 강가 z, 먼 강가 z)
uniform float uFog;      // 안개: 이 거리마다 빛이 1/e로 줄어든다 (0이면 안개 없음)
out vec4 vColor;
void main() {
  vec3 p = vec3(aPos.x, aPos.y * uMirror, aPos.z);
  vec4 clip = uViewProj * vec4(p, 1.0);
  gl_Position = clip;
  float px = aPos.w * uPxPerMeter / max(clip.w, 1.0);
  float size = clamp(px, 1.5, uMaxPoint);
  // 최소 크기로 키운 점은 그만큼 어둡게 해서, 멀리 있는 작은 불티가 과하게 밝지 않게 한다.
  float energy = min(1.0, (px * px) / (size * size));
  float a = aColor.a * energy * uFade;
  if (uFog > 0.0) a *= exp(-clip.w / uFog);
  if (uMirror < 0.0) {
    // 비친 모습이 실제로 물 위에 떨어지는지 확인한다. 강가 땅 위라면 그리지 않는다.
    float t = uEye.y / max(uEye.y - p.y, 0.001);
    float hitZ = uEye.z + (p.z - uEye.z) * t;
    if (hitZ < uShore.x || hitZ > uShore.y) a = 0.0;
  }
  vColor = vec4(aColor.rgb, a);
  gl_PointSize = size;
}`;

const POINT_FS = `#version 300 es
precision mediump float;
in vec4 vColor;
out vec4 outColor;
void main() {
  vec2 d = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(d, d);
  if (r2 > 1.0) discard;
  float core = exp(-r2 * 10.0);
  float halo = (1.0 - r2) * (1.0 - r2) * 0.5;
  float a = (core + halo) * vColor.a;
  outColor = vec4(vColor.rgb * a, a);
}`;

/** 3D 도시: 건물·다리 상자. 물에 비친 모습은 아래로 뒤집어 물 위에 떨어지는 곳만 그린다 */
const CITY_VS = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUv;
layout(location = 3) in vec2 aInfo;  // 건물 번호, 종류(0 건물, 1 다리)
uniform mat4 uViewProj;
uniform float uMirror;
out vec3 vWorld;
out vec3 vNormal;
out vec2 vUv;
out vec2 vInfo;
out float vDist;
void main() {
  vec3 p = vec3(aPos.x, aPos.y * uMirror, aPos.z);
  vWorld = p;
  vNormal = aNormal;
  vUv = aUv;
  vInfo = aInfo;
  vec4 clip = uViewProj * vec4(p, 1.0);
  vDist = clip.w;
  gl_Position = clip;
}`;

const CITY_FS = `#version 300 es
precision highp float;
in vec3 vWorld;
in vec3 vNormal;
in vec2 vUv;
in vec2 vInfo;
in float vDist;
uniform vec3 uSkyLight;  // 지금 터진 불꽃이 비추는 빛
uniform float uWindows;  // 창문 불빛 세기 (하늘 모습마다)
uniform float uMirror;
uniform float uFade;
uniform vec3 uEye;
uniform vec2 uShore;
uniform float uFog;
out vec4 outColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  if (uMirror < 0.0) {
    // 비친 모습이 실제로 물 위에 떨어지는 곳만 (강가 땅 위는 그리지 않는다)
    float t = uEye.y / max(uEye.y - vWorld.y, 0.001);
    float hitZ = uEye.z + (vWorld.z - uEye.z) * t;
    if (hitZ < uShore.x || hitZ > uShore.y) discard;
  }
  bool bridge = vInfo.y > 0.5;
  float up = max(vNormal.y, 0.0);
  vec3 base = bridge ? vec3(0.035, 0.04, 0.085) : vec3(0.02, 0.022, 0.042);
  // 불꽃 빛을 받는다: 지붕은 하늘을 보고, 앞면은 강(불꽃) 쪽을 본다
  float facing = max(-vNormal.z, 0.0) * 0.8 + up * 0.5 + 0.15;
  vec3 c = base + uSkyLight * 0.55 * facing;
  if (!bridge && abs(vNormal.y) < 0.5) {
    // 창문: 가로 4m, 층 높이 3.6m 격자. 몇 개는 불이 켜져 있다 (따뜻한 빛이 많고 가끔 흰빛)
    // 멀어서 한 칸이 화소보다 작아지면 칸을 두 배씩 키워, 반짝이지 않는 불빛 점으로 남긴다.
    float px = max(fwidth(vUv.x) / 4.0, fwidth(vUv.y) / 3.6);
    vec2 size = vec2(4.0, 3.6) * exp2(max(0.0, floor(log2(px * 2.5))));
    vec2 cell = floor(vUv / size);
    vec2 f = fract(vUv / size);
    float win = step(0.22, f.x) * step(f.x, 0.78) * step(0.28, f.y) * step(f.y, 0.78);
    float h = hash(cell + vInfo.x * 17.13);
    float lit = step(1.0 - uWindows * 0.9, h);
    vec3 tone = mix(vec3(1.0, 0.7, 0.4), vec3(0.78, 0.88, 1.0), step(0.82, hash(cell * 1.7 + vInfo.x)));
    c += win * (lit * tone * (0.35 + 0.35 * hash(cell + 3.1)) + (1.0 - lit) * vec3(0.012, 0.016, 0.03));
  }
  // 물에 비친 모습은 잔물결로 가로 줄이 흔들린다
  if (uMirror < 0.0) c *= 0.65 + 0.35 * sin(gl_FragCoord.y * 0.9 + vWorld.x * 0.04);
  if (uFog > 0.0) c = mix(vec3(0.18, 0.19, 0.27), c, exp(-vDist / uFog));
  outColor = vec4(c * uFade, 1.0);
}`;

/** 연기: 가운데가 짙고 가장자리로 부드럽게 옅어지는 덩어리. 받은 빛깔로 물들고 뒤를 조금 가린다 */
const SMOKE_FS = `#version 300 es
precision mediump float;
in vec4 vColor;
out vec4 outColor;
void main() {
  vec2 d = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(d, d);
  if (r2 > 1.0) discard;
  float a = vColor.a * (1.0 - r2) * (1.0 - r2);
  outColor = vec4(vColor.rgb * a, a);
}`;

/** 블룸: 줄이며 번지기. 처음 한 번은 밝은 부분만 뽑는다 (부드러운 문턱) */
const DOWN_FS = `#version 300 es
precision mediump float;
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uThreshold; // 0보다 작으면 문턱 없이 줄이기만
in vec2 vUv;
out vec4 outColor;
vec3 pick(vec2 uv) {
  vec3 c = texture(uSrc, uv).rgb;
  if (uThreshold < 0.0) return c;
  // 별이 빽빽이 겹친 곳은 밝기가 몇 배로 쌓이므로, 먼저 부드럽게 눌러야 덩어리로 번지지 않는다.
  c = c / (1.0 + max(c.r, max(c.g, c.b)) * 0.5);
  float b = max(c.r, max(c.g, c.b));
  float knee = uThreshold * 0.5;
  float soft = clamp(b - uThreshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-4);
  return c * max(soft, b - uThreshold) / max(b, 1e-4);
}
void main() {
  vec2 h = uTexel * 0.5;
  vec3 c = pick(vUv) * 4.0 + pick(vUv - h) + pick(vUv + h) + pick(vUv + vec2(h.x, -h.y)) + pick(vUv - vec2(h.x, -h.y));
  outColor = vec4(c / 8.0, 1.0);
}`;

/** 블룸: 늘리며 위 단계에 더하기 */
const UP_FS = `#version 300 es
precision mediump float;
uniform sampler2D uSrc;
uniform vec2 uTexel;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec2 h = uTexel * 0.5;
  vec3 c = texture(uSrc, vUv + vec2(-h.x * 2.0, 0.0)).rgb + texture(uSrc, vUv + vec2(h.x * 2.0, 0.0)).rgb
    + texture(uSrc, vUv + vec2(0.0, -h.y * 2.0)).rgb + texture(uSrc, vUv + vec2(0.0, h.y * 2.0)).rgb
    + (texture(uSrc, vUv + vec2(-h.x, h.y)).rgb + texture(uSrc, vUv + vec2(h.x, h.y)).rgb
    + texture(uSrc, vUv + vec2(-h.x, -h.y)).rgb + texture(uSrc, vUv + vec2(h.x, -h.y)).rgb) * 2.0;
  outColor = vec4(c / 12.0, 1.0);
}`;

/** 합치기: 장면 + 번짐, 어두운 곳은 그대로 두고 밝은 쪽만 부드럽게 눌러 색이 하얗게 타지 않게 */
const COMPOSE_FS = `#version 300 es
precision mediump float;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uBloomAmount;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec3 c = texture(uScene, vUv).rgb + texture(uBloom, vUv).rgb * uBloomAmount;
  float m = max(c.r, max(c.g, c.b));
  const float k = 0.72;
  if (m > k) {
    float t = k + (1.0 - k) * (1.0 - exp(-(m - k) / (1.0 - k)));
    // 가장 밝은 빛깔로 줄이되, 아주 밝으면 조금 하얘진다 (실제 불꽃 한가운데처럼)
    c = c * (t / m);
    c = mix(c, vec3(t), clamp((m - 1.5) / 6.0, 0.0, 0.6));
  }
  outColor = vec4(c, 1.0);
}`;

/** 화질: 높음(블룸 여섯 단), 보통(네 단), 낮음(블룸 없이 바로 그리기) */
export type RenderQuality = 'high' | 'medium' | 'low';

interface Target {
  fb: WebGLFramebuffer;
  tex: WebGLTexture;
  w: number;
  h: number;
}

function compile(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const make = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, make(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, make(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
  return p;
}

export interface FrameInput {
  buffer: Float32Array;
  count: number;
  viewProj: Mat4;
  pxPerMeter: number;
  eye: Vec3;
  skyLight: readonly [number, number, number];
  reflection: boolean;
  /** [가까운 강가 z, 먼 강가 z] */
  shore: [number, number];
  /** 안개 거리(m). 0이면 없음 */
  fog?: number;
  /** 연기 덩어리 (Simulation.writeSmoke). 없으면 그리지 않는다 */
  smoke?: { buffer: Float32Array; count: number };
  /** 도시의 움직이는 불빛 (차 불빛, writeCityTraffic). 물에도 비친다 */
  lights?: { buffer: Float32Array; count: number };
  /** 창문 불빛 세기 (SkyLook.windows) */
  windows?: number;
}

/** 블룸 세기 */
const BLOOM = { high: { levels: 6, amount: 1.4, threshold: 0.22 }, medium: { levels: 4, amount: 1.15, threshold: 0.26 } };

export class StageRenderer {
  readonly gl: WebGL2RenderingContext;
  private readonly pointProg: WebGLProgram;
  private readonly quadProg: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly vbo: WebGLBuffer;
  private readonly backdrop: WebGLTexture;
  private readonly maxPoint: number;
  private capacityFloats = 0;
  private readonly u: Record<string, WebGLUniformLocation | null>;
  private readonly downProg: WebGLProgram;
  private readonly smokeProg: WebGLProgram;
  private readonly cityProg: WebGLProgram;
  private readonly cityVao: WebGLVertexArrayObject;
  private readonly cityVbo: WebGLBuffer;
  private cityCount = 0;
  private readonly lampVao: WebGLVertexArrayObject;
  private readonly lampVbo: WebGLBuffer;
  private lampCount = 0;
  private lightCapacity = 0;
  private readonly lightVao: WebGLVertexArrayObject;
  private readonly lightVbo: WebGLBuffer;
  private readonly cu: Record<string, WebGLUniformLocation | null>;
  private readonly smokeVao: WebGLVertexArrayObject;
  private readonly smokeVbo: WebGLBuffer;
  private smokeCapacity = 0;
  private readonly su: Record<string, WebGLUniformLocation | null>;
  private readonly upProg: WebGLProgram;
  private readonly composeProg: WebGLProgram;
  /** 반정밀도 실수 화면에 그릴 수 있는지 (없으면 화질을 낮음으로) */
  private readonly hdr: boolean;
  private scene: Target | null = null;
  private mips: Target[] = [];
  /** 화질. 바꾸면 다음 프레임부터 */
  quality: RenderQuality;

  /** preserve: 그린 화면을 다음 프레임까지 남긴다 (사진·영상처럼 그린 뒤 바로 복사할 때) */
  constructor(canvas: HTMLCanvasElement | OffscreenCanvas, options: { preserve?: boolean; quality?: RenderQuality } = {}) {
    const gl = canvas.getContext('webgl2', {
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: options.preserve ?? false,
    }) as WebGL2RenderingContext | null;
    if (!gl) throw new Error('이 브라우저에서는 WebGL2를 쓸 수 없습니다.');
    this.gl = gl;
    this.pointProg = compile(gl, POINT_VS, POINT_FS);
    this.quadProg = compile(gl, QUAD_VS, QUAD_FS);
    const range = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array;
    this.maxPoint = Math.min(256, range[1]);

    this.vao = gl.createVertexArray()!;
    this.vbo = gl.createBuffer()!;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, RENDER_STRIDE * 4, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, RENDER_STRIDE * 4, 16);
    gl.bindVertexArray(null);

    this.backdrop = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.backdrop);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const names = ['uViewProj', 'uPxPerMeter', 'uMaxPoint', 'uMirror', 'uFade', 'uEye', 'uShore', 'uFog'];
    this.u = Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(this.pointProg, n)]));
    this.u.uSkyLight = gl.getUniformLocation(this.quadProg, 'uSkyLight');
    this.u.uBackdrop = gl.getUniformLocation(this.quadProg, 'uBackdrop');

    // 연기: 점 위치·크기 계산은 별과 같고, 그리는 방식(가리며 섞기)만 다르다.
    this.smokeProg = compile(gl, POINT_VS, SMOKE_FS);
    this.su = Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(this.smokeProg, n)]));
    this.smokeVao = gl.createVertexArray()!;
    this.smokeVbo = gl.createBuffer()!;
    gl.bindVertexArray(this.smokeVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.smokeVbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, RENDER_STRIDE * 4, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, RENDER_STRIDE * 4, 16);
    gl.bindVertexArray(null);

    // 3D 도시
    this.cityProg = compile(gl, CITY_VS, CITY_FS);
    this.cu = Object.fromEntries(
      ['uViewProj', 'uMirror', 'uFade', 'uEye', 'uShore', 'uFog', 'uSkyLight', 'uWindows'].map((n) => [n, gl.getUniformLocation(this.cityProg, n)]),
    );
    this.cityVao = gl.createVertexArray()!;
    this.cityVbo = gl.createBuffer()!;
    gl.bindVertexArray(this.cityVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cityVbo);
    const cs = CITY_STRIDE * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, cs, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, cs, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, cs, 24);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, cs, 32);
    // 늘 켜진 등(다리 가로등·항공등)과 움직이는 차 불빛은 별과 같은 점으로 그린다.
    const pointVao = (): [WebGLVertexArrayObject, WebGLBuffer] => {
      const vao = gl.createVertexArray()!;
      const vbo = gl.createBuffer()!;
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 4, gl.FLOAT, false, RENDER_STRIDE * 4, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, RENDER_STRIDE * 4, 16);
      return [vao, vbo];
    };
    [this.lampVao, this.lampVbo] = pointVao();
    [this.lightVao, this.lightVbo] = pointVao();
    gl.bindVertexArray(null);

    this.hdr = !!gl.getExtension('EXT_color_buffer_float');
    this.downProg = compile(gl, QUAD_VS, DOWN_FS);
    this.upProg = compile(gl, QUAD_VS, UP_FS);
    this.composeProg = compile(gl, QUAD_VS, COMPOSE_FS);
    // 그래픽 카드 없이 CPU로 그리는 기기(소프트웨어 렌더러)는 번짐 단계가 너무 무거워 낮음으로 시작한다.
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    this.software = /swiftshader|llvmpipe|softpipe|software/i.test(name);
    this.quality = this.hdr ? (options.quality ?? (this.software ? 'low' : 'high')) : 'low';
  }

  /** CPU로 그리는 기기인지 */
  readonly software: boolean;

  /** 지금 쓰는 화질 (실수 화면을 못 쓰면 늘 낮음) */
  get effectiveQuality(): RenderQuality {
    return this.hdr ? this.quality : 'low';
  }

  private makeTarget(w: number, h: number, depth = false): Target {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (depth) {
      // 3D 도시가 서로 앞뒤를 가리도록 깊이 버퍼
      const rb = gl.createRenderbuffer()!;
      gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
    }
    return { fb, tex, w, h };
  }

  private freeTarget(t: Target): void {
    this.gl.deleteFramebuffer(t.fb);
    this.gl.deleteTexture(t.tex);
  }

  /** 화면 크기와 화질에 맞게 실수 화면과 블룸 단을 만든다 */
  private ensureTargets(levels: number): void {
    const gl = this.gl;
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    if (!this.scene || this.scene.w !== w || this.scene.h !== h || this.mips.length !== levels) {
      if (this.scene) this.freeTarget(this.scene);
      for (const m of this.mips) this.freeTarget(m);
      this.scene = this.makeTarget(w, h, true);
      this.mips = [];
      for (let i = 1; i <= levels; i++) this.mips.push(this.makeTarget(Math.max(1, w >> i), Math.max(1, h >> i)));
    }
  }

  private pass(prog: WebGLProgram, src: WebGLTexture, srcW: number, srcH: number, dst: Target | null, extra?: (p: WebGLProgram) => void): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fb : null);
    gl.viewport(0, 0, dst ? dst.w : gl.drawingBufferWidth, dst ? dst.h : gl.drawingBufferHeight);
    gl.useProgram(prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src);
    gl.uniform1i(gl.getUniformLocation(prog, 'uSrc'), 0);
    gl.uniform2f(gl.getUniformLocation(prog, 'uTexel'), 1 / srcW, 1 / srcH);
    extra?.(prog);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** 3D 도시 모형을 올린다 (무대가 바뀔 때만). null이면 도시를 그리지 않는다 */
  setCity(mesh: CityMesh | null): void {
    const gl = this.gl;
    this.cityCount = mesh?.count ?? 0;
    this.lampCount = mesh?.lampCount ?? 0;
    if (!mesh) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cityVbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lampVbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.lamps.length ? mesh.lamps : new Float32Array(RENDER_STRIDE), gl.STATIC_DRAW);
  }

  /** 배경 그림을 올린다. 관람석이나 화면 크기가 바뀔 때만 부른다. */
  setBackdrop(source: TexImageSource): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.backdrop);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  }

  render(f: FrameInput): void {
    const gl = this.gl;
    const q = this.effectiveQuality;
    const bloom = q === 'low' ? null : BLOOM[q];
    if (bloom) {
      this.ensureTargets(bloom.levels);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.scene!.fb);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    this.drawScene(f);
    if (bloom) this.postProcess(bloom);
  }

  /** 밝은 부분을 뽑아 반씩 줄였다가 다시 늘리며 더하고, 장면과 합쳐 화면에 낸다 */
  private postProcess(b: { levels: number; amount: number; threshold: number }): void {
    const gl = this.gl;
    gl.disable(gl.BLEND);
    let src = this.scene!;
    this.mips.forEach((dst, i) => {
      this.pass(this.downProg, src.tex, src.w, src.h, dst, (p) => gl.uniform1f(gl.getUniformLocation(p, 'uThreshold'), i === 0 ? b.threshold : -1));
      src = dst;
    });
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    for (let i = this.mips.length - 1; i > 0; i--) this.pass(this.upProg, this.mips[i].tex, this.mips[i].w, this.mips[i].h, this.mips[i - 1]);
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.useProgram(this.composeProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.scene!.tex);
    gl.uniform1i(gl.getUniformLocation(this.composeProg, 'uScene'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.mips[0].tex);
    gl.uniform1i(gl.getUniformLocation(this.composeProg, 'uBloom'), 1);
    gl.uniform1f(gl.getUniformLocation(this.composeProg, 'uBloomAmount'), b.amount);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE0);
  }

  private drawScene(f: FrameInput): void {
    const gl = this.gl;

    gl.disable(gl.BLEND);
    gl.useProgram(this.quadProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.backdrop);
    gl.uniform1i(this.u.uBackdrop, 0);
    gl.uniform3f(this.u.uSkyLight, f.skyLight[0], f.skyLight[1], f.skyLight[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.drawCity(f);

    if (f.count === 0) {
      this.drawLights(f);
      this.drawSmoke(f);
      return;
    }
    const floats = f.count * RENDER_STRIDE;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    if (floats > this.capacityFloats) {
      this.capacityFloats = f.buffer.length;
      gl.bufferData(gl.ARRAY_BUFFER, this.capacityFloats * 4, gl.DYNAMIC_DRAW);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, f.buffer, 0, floats);

    gl.useProgram(this.pointProg);
    gl.bindVertexArray(this.vao);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.uniformMatrix4fv(this.u.uViewProj, false, f.viewProj);
    gl.uniform1f(this.u.uPxPerMeter, f.pxPerMeter);
    gl.uniform1f(this.u.uMaxPoint, this.maxPoint);
    gl.uniform3f(this.u.uEye, f.eye[0], f.eye[1], f.eye[2]);
    gl.uniform2f(this.u.uShore, f.shore[0], f.shore[1]);
    gl.uniform1f(this.u.uFog, f.fog ?? 0);

    if (f.reflection) {
      gl.uniform1f(this.u.uMirror, -1);
      gl.uniform1f(this.u.uFade, 0.22);
      gl.drawArrays(gl.POINTS, 0, f.count);
    }
    gl.uniform1f(this.u.uMirror, 1);
    gl.uniform1f(this.u.uFade, 1);
    gl.drawArrays(gl.POINTS, 0, f.count);
    gl.bindVertexArray(null);
    this.drawLights(f);
    this.drawSmoke(f);
  }

  /** 3D 도시: 물에 비친 모습을 먼저, 그 위에 건물·다리. 깊이로 서로 가린다 */
  private drawCity(f: FrameInput): void {
    if (!this.cityCount) return;
    const gl = this.gl;
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.cityProg);
    gl.bindVertexArray(this.cityVao);
    gl.uniformMatrix4fv(this.cu.uViewProj, false, f.viewProj);
    gl.uniform3f(this.cu.uEye, f.eye[0], f.eye[1], f.eye[2]);
    gl.uniform2f(this.cu.uShore, f.shore[0], f.shore[1]);
    gl.uniform1f(this.cu.uFog, f.fog ?? 0);
    gl.uniform3f(this.cu.uSkyLight, f.skyLight[0], f.skyLight[1], f.skyLight[2]);
    gl.uniform1f(this.cu.uWindows, f.windows ?? 0.35);
    if (f.reflection) {
      gl.uniform1f(this.cu.uMirror, -1);
      gl.uniform1f(this.cu.uFade, 0.3);
      gl.drawArrays(gl.TRIANGLES, 0, this.cityCount);
      gl.clear(gl.DEPTH_BUFFER_BIT);
    }
    gl.uniform1f(this.cu.uMirror, 1);
    gl.uniform1f(this.cu.uFade, 1);
    gl.drawArrays(gl.TRIANGLES, 0, this.cityCount);
    gl.bindVertexArray(null);
    gl.disable(gl.DEPTH_TEST);
  }

  /** 다리 가로등·항공등과 차 불빛: 별처럼 빛으로 더하고 물에도 비친다 */
  private drawLights(f: FrameInput): void {
    const gl = this.gl;
    const sets: [WebGLVertexArrayObject, number][] = [];
    if (this.lampCount) sets.push([this.lampVao, this.lampCount]);
    if (f.lights && f.lights.count) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.lightVbo);
      const floats = f.lights.count * RENDER_STRIDE;
      if (floats > this.lightCapacity) {
        this.lightCapacity = f.lights.buffer.length;
        gl.bufferData(gl.ARRAY_BUFFER, this.lightCapacity * 4, gl.DYNAMIC_DRAW);
      }
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, f.lights.buffer, 0, floats);
      sets.push([this.lightVao, f.lights.count]);
    }
    if (!sets.length) return;
    gl.useProgram(this.pointProg);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.uniformMatrix4fv(this.u.uViewProj, false, f.viewProj);
    gl.uniform1f(this.u.uPxPerMeter, f.pxPerMeter);
    gl.uniform1f(this.u.uMaxPoint, this.maxPoint);
    gl.uniform3f(this.u.uEye, f.eye[0], f.eye[1], f.eye[2]);
    gl.uniform2f(this.u.uShore, f.shore[0], f.shore[1]);
    gl.uniform1f(this.u.uFog, f.fog ?? 0);
    for (const [vao, count] of sets) {
      gl.bindVertexArray(vao);
      if (f.reflection) {
        // 물에 비친 불빛은 길게 흔들려 보이니 조금 더 밝게
        gl.uniform1f(this.u.uMirror, -1);
        gl.uniform1f(this.u.uFade, 0.45);
        gl.drawArrays(gl.POINTS, 0, count);
      }
      gl.uniform1f(this.u.uMirror, 1);
      gl.uniform1f(this.u.uFade, 1);
      gl.drawArrays(gl.POINTS, 0, count);
    }
    gl.bindVertexArray(null);
  }

  /** 연기: 별 위에 덮어 그린다 (앞을 조금 가리고, 받은 빛깔로 빛난다) */
  private drawSmoke(f: FrameInput): void {
    const s = f.smoke;
    if (!s || s.count === 0) return;
    const gl = this.gl;
    const floats = s.count * RENDER_STRIDE;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.smokeVbo);
    if (floats > this.smokeCapacity) {
      this.smokeCapacity = s.buffer.length;
      gl.bufferData(gl.ARRAY_BUFFER, this.smokeCapacity * 4, gl.DYNAMIC_DRAW);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, s.buffer, 0, floats);
    gl.useProgram(this.smokeProg);
    gl.bindVertexArray(this.smokeVao);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniformMatrix4fv(this.su.uViewProj, false, f.viewProj);
    gl.uniform1f(this.su.uPxPerMeter, f.pxPerMeter);
    gl.uniform1f(this.su.uMaxPoint, this.maxPoint);
    gl.uniform3f(this.su.uEye, f.eye[0], f.eye[1], f.eye[2]);
    gl.uniform2f(this.su.uShore, f.shore[0], f.shore[1]);
    gl.uniform1f(this.su.uFog, f.fog ?? 0);
    gl.uniform1f(this.su.uMirror, 1);
    gl.uniform1f(this.su.uFade, 1);
    gl.drawArrays(gl.POINTS, 0, s.count);
    gl.bindVertexArray(null);
  }
}
