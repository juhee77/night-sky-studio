// 알의 상승 비행. 중력과 속도 제곱에 비례하는 공기 저항을 받는 공의 운동을 식 그대로 푼다.
// 위로 갈 때 y = (1/k)·ln(cos(w(T-t)) / cos(wT)), 꼭대기를 지나 떨어질 때 y = h - (1/k)·ln(cosh(ws)).
// 알의 지름·무게와 저항 계수의 출처는 catalog.ts의 SHELL_BODIES와 SHELL_CD에 적어 두었다.

import { SHELL_BODIES, SHELL_CD, starScale, type Size } from './catalog.ts';

export const GRAVITY = 9.8;
export const AIR_DENSITY = 1.2;

/** 알의 저항 상수 k = ρ·Cd·A / 2m (1/m) */
export function shellDragK(size: Size, cd = SHELL_CD): number {
  const b = SHELL_BODIES[size];
  return (AIR_DENSITY * cd * Math.PI * b.diameter * b.diameter) / (8 * b.mass);
}

/** 높이 h까지 오르는 비행의 위상 wT (라디안) */
function riseAngle(k: number, h: number): number {
  return Math.atan(Math.sqrt(Math.expm1(2 * k * h)));
}

/** 높이 h의 꼭대기에 닿는 시간(초): 공기 저항만으로 계산한 값 */
export function apexTime(size: Size, h: number, cd = SHELL_CD): number {
  const k = shellDragK(size, cd);
  return riseAngle(k, h) / Math.sqrt(GRAVITY * k);
}

/** 그 높이까지 오르는 데 필요한 발사 속도(m/s) */
export function muzzleSpeed(size: Size, h: number, cd = SHELL_CD): number {
  const k = shellDragK(size, cd);
  return Math.sqrt((GRAVITY * Math.expm1(2 * k * h)) / k);
}

/** 발사약이 적어 높이 h·mul까지만 오를 때 꼭대기에 닿는 시간. 온전한 높이에서 prefire초인 알 기준. */
export function loweredApex(size: Size, h: number, prefire: number, mul: number): number {
  const k = shellDragK(size);
  return (prefire * riseAngle(k, h * mul)) / riseAngle(k, h);
}

/** 발사 후 t초의 높이. h는 꼭대기 높이, apex는 꼭대기에 닿는 시간이다. */
export function shellHeightAt(size: Size, h: number, apex: number, t: number): number {
  const k = shellDragK(size);
  const a = riseAngle(k, h);
  const w = a / apex;
  if (t <= apex) return h * (1 - Math.log(Math.cos(w * (apex - t))) / Math.log(Math.cos(a)));
  return Math.max(0, h - Math.log(Math.cosh(Math.sqrt(GRAVITY * k) * (t - apex))) / k);
}

/** 별의 밀도(kg/m³)와 저항 계수. Ooki 외, Sci. Tech. Energetic Materials 67(1), 2006의 10호용 별 발사 실험값. */
export const STAR_DENSITY = 1510;
export const STAR_CD = 0.5;

/** 같은 논문의 5호용 별 지름(m) */
const STAR_DIAMETER_AT_5 = 0.015;
/** 초속 계산에 쓰는 저항 보정. 별이 타며 가늘어져 처음 지름일 때보다 저항을 더 받는 몫이다. */
const BURN_DRAG = 1.3;
/** 소리보다 빠르게 날아가는 별은 없다 */
const MAX_STAR_SPEED = 340;

/** 공 모양 별의 저항 상수 k = 3ρ·Cd / 4ρs·d (1/m). 지름이 작을수록 크다. */
export function starDragK(diameter: number, density = STAR_DENSITY): number {
  return (3 * AIR_DENSITY * STAR_CD) / (4 * density * diameter);
}

/** 이 호수에 든 보통 별의 지름(m) */
export function starDiameter(size: Size): number {
  return STAR_DIAMETER_AT_5 * starScale(size);
}

/** 늘어짐(0~1)에 따른 저항 배율: 무거운 별(늘어짐 큼)일수록 작다. 기본값 0.3에서 1이다. */
export function droopDrag(droop: number): number {
  return Math.exp(1.2 * (0.3 - droop));
}

/**
 * 타는 동안 radius만큼 날아가는 처음 속도(m/s). 저항만 받을 때 날아간 거리 x = (1/k)·ln(1 + k·v·t)를 v로 푼 식이다.
 * 거리가 길수록 속도가 빠르게 늘어난다: 처음엔 아주 빠르고, 곧 급격히 느려지는 까닭이다.
 */
export function starSpeed(k: number, radius: number, life: number): number {
  const kk = k * BURN_DRAG;
  return Math.min(MAX_STAR_SPEED, Math.expm1(kk * radius) / (kk * life));
}

/** 별이 떨어지는 속도의 끝값(m/s) */
export function terminalSpeed(k: number): number {
  return Math.sqrt(GRAVITY / k);
}
