// 연기. 불꽃이 터진 자리에는 연기가 남고, 바람을 따라 흘러가며 옅어진다.
// 바람이 약한 날 같은 자리에서 연달아 쏘면, 뒤에 터진 불꽃이 앞 불꽃의 연기에 가려 흐리게 보인다.
// 계산은 터지는 순서와 바람만으로 정해지므로, 시뮬레이션과 채점이 같은 결과를 쓴다.

import { shellSize } from './catalog.ts';
import { isShellLaunch, type Launch, type Vec3 } from './show.ts';
import { soundSource } from './sound.ts';

/** 연기가 남아 있는 시간(초) */
export const SMOKE_LIFE = 14;

export interface Puff {
  /** 생긴 곳과 시각 */
  pos: Vec3;
  t: number;
  /** 처음 반지름(m) */
  r0: number;
  /** 처음 짙기 (케이크는 연기가 적다) */
  d0: number;
}

export interface SmokeResult {
  puffs: Puff[];
  /** 연기에 가린 발사들 */
  obscured: Set<Launch>;
}

/** 바람이 셀수록 연기가 빨리 흩어진다. 옅어지는 시간 상수(초) */
export function smokeFade(windSpeed: number): number {
  return 5 / (1 + windSpeed);
}

/** t초일 때 puff의 위치, 반지름, 짙기 */
export function puffAt(p: Puff, t: number, wind: Vec3): { pos: Vec3; r: number; density: number } {
  const age = t - p.t;
  const speed = Math.hypot(wind[0], wind[2]);
  return {
    pos: [p.pos[0] + wind[0] * age, p.pos[1] + 1.5 * age, p.pos[2] + wind[2] * age],
    r: p.r0 + 3 * age,
    density: p.d0 * Math.exp(-age / smokeFade(speed)),
  };
}

export function analyzeSmoke(launches: Launch[], wind: Vec3): SmokeResult {
  const bursts = launches.filter(isShellLaunch).sort((a, b) => a.burstAt - b.burstAt);
  const puffs: Puff[] = [];
  const obscured = new Set<Launch>();
  let first = 0;
  for (const l of bursts) {
    const pos = soundSource(l);
    // 앞서 터진 불꽃들의 연기가 이 자리에 얼마나 짙게 남았는지 더한다.
    while (first < puffs.length && l.burstAt - puffs[first].t > SMOKE_LIFE) first++;
    let thick = 0;
    for (let i = first; i < puffs.length; i++) {
      const p = puffs[i];
      if (l.burstAt - p.t < 0.2) continue;
      const now = puffAt(p, l.burstAt, wind);
      if (Math.hypot(pos[0] - now.pos[0], pos[1] - now.pos[1], pos[2] - now.pos[2]) < now.r * 0.9) thick += now.density;
    }
    if (thick > 0.6 && l.type !== 'cake') obscured.add(l);
    const spread = shellSize(l.type, l.size).spread;
    // 연기 양: 케이크는 적고, 내 불꽃은 배합에 따라 다르다.
    const d0 = l.type === 'cake' ? 0.15 : (l.customDef?.smoke ?? 1);
    puffs.push({ pos, t: l.burstAt, r0: spread * 0.25, d0 });
  }
  return { puffs, obscured };
}
