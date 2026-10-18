// WebGL2 렌더러. 배경 그림을 깔고, 그 위에 입자를 빛처럼 더해서(가산 혼합) 그린다.
// 물에 비친 불꽃은 입자를 수면 아래로 뒤집어 한 번 더 흐리게 그린다.

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
}

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

  /** preserve: 그린 화면을 다음 프레임까지 남긴다 (사진·영상처럼 그린 뒤 바로 복사할 때) */
  constructor(canvas: HTMLCanvasElement | OffscreenCanvas, options: { preserve?: boolean } = {}) {
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
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

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
  }
}
