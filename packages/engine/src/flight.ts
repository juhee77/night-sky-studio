// 알의 상승 비행. 중력과 속도 제곱에 비례하는 공기 저항을 받는 공의 운동을 식 그대로 푼다.
// 위로 갈 때 y = (1/k)·ln(cos(w(T-t)) / cos(wT)), 꼭대기를 지나 떨어질 때 y = h - (1/k)·ln(cosh(ws)).
// 알의 지름·무게와 저항 계수의 출처는 catalog.ts의 SHELL_BODIES와 SHELL_CD에 적어 두었다.

import { SHELL_BODIES, SHELL_CD, type Size } from './catalog.ts';

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
