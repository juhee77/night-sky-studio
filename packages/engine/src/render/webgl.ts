// WebGL2 렌더러. 배경 그림을 깔고, 그 위에 입자를 빛처럼 더해서(가산 혼합) 그린다.
// 물에 비친 불꽃은 입자를 수면 아래로 뒤집어 한 번 더 흐리게 그린다.
// 화질이 「높음·보통」이면 밝기 범위가 넓은 화면(HDR, 반정밀도 실수)에 그린 뒤
// 밝은 부분만 뽑아 반씩 줄여 가며 번지게(블룸) 하고, 밝은 쪽만 부드럽게 눌러(톤 매핑) 화면에 낸다.
// 실수 화면을 못 쓰는 기기는 예전처럼 바로 그린다.

import type { Mat4 } from '../camera.ts';
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

  private makeTarget(w: number, h: number): Target {
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
      this.scene = this.makeTarget(w, h);
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

    if (f.count === 0) return;
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
    this.drawSmoke(f);
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
