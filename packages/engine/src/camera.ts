// 카메라. 2D 정면 화면도 3D 세계를 고정된 카메라로 본 것이다.
// 관람석을 바꾸거나 나중에 3D 카메라를 붙일 때도 이 파일만 쓰면 된다.

import type { Vec3 } from './show.ts';

export type Mat4 = Float32Array;

export interface Camera {
  eye: Vec3;
  target: Vec3;
  /** 세로 시야각(도) */
  fovY: number;
}

export const NEAR = 1;
export const FAR = 6000;

export function perspective(fovYRad: number, aspect: number, near = NEAR, far = FAR): Mat4 {
  const f = 1 / Math.tan(fovYRad / 2);
  const nf = 1 / (near - far);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) * nf;
  m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
}

export function lookAt(eye: Vec3, target: Vec3, up: Vec3 = [0, 1, 0]): Mat4 {
  let zx = eye[0] - target[0];
  let zy = eye[1] - target[1];
  let zz = eye[2] - target[2];
  let len = Math.hypot(zx, zy, zz);
  zx /= len;
  zy /= len;
  zz /= len;
  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  len = Math.hypot(xx, xy, xz);
  xx /= len;
  xy /= len;
  xz /= len;
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  const m = new Float32Array(16);
  m[0] = xx; m[1] = yx; m[2] = zx;
  m[4] = xy; m[5] = yy; m[6] = zy;
  m[8] = xz; m[9] = yz; m[10] = zz;
  m[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  m[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  m[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  m[15] = 1;
  return m;
}

export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

/** 세로 화면에서도 좌우가 잘리지 않도록, 가로 시야가 최소 minHalfX도는 되게 세로 시야각을 넓힌다. */
export function fitFovY(fovY: number, aspect: number, minHalfX = 30): number {
  const needed = (2 * Math.atan(Math.tan((minHalfX * Math.PI) / 180) / aspect) * 180) / Math.PI;
  return Math.min(100, Math.max(fovY, needed));
}

export interface View {
  viewProj: Mat4;
  /** 1m 떨어진 1m 물체가 화면에서 몇 픽셀인지 */
  pxPerMeter: number;
  fovY: number;
}

export function makeView(cam: Camera, width: number, height: number): View {
  const aspect = width / height;
  const portrait = aspect < 1;
  const fovY = fitFovY(cam.fovY, aspect, portrait ? 22 : 30);
  const rad = (fovY * Math.PI) / 180;
  let target = cam.target;
  if (portrait) {
    // 세로 화면은 시야가 위아래로 넓어 빈 하늘이 많아진다.
    // 화면 위 끝이 올려다본 각도 46도(10호가 터지는 높이 조금 위)에 오게 고개를 내리고,
    // 남는 아래쪽은 물에 비친 불꽃으로 채운다.
    const pitch = (46 * Math.PI) / 180 - rad / 2;
    const dx = target[0] - cam.eye[0];
    const dz = target[2] - cam.eye[2];
    target = [target[0], cam.eye[1] + Math.hypot(dx, dz) * Math.tan(pitch), target[2]];
  }
  return {
    viewProj: multiply(perspective(rad, aspect), lookAt(cam.eye, target)),
    pxPerMeter: height / 2 / Math.tan(rad / 2),
    fovY,
  };
}

/** 월드 좌표를 동차 좌표 [x, y, z, w]로 */
export function toClip(m: Mat4, p: Vec3): [number, number, number, number] {
  const [x, y, z] = p;
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
    m[3] * x + m[7] * y + m[11] * z + m[15],
  ];
}
