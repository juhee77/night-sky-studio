// 계절과 시간대: 하늘 색, 별, 눈, 안개.
// 모두 시각만으로 정해지므로 같은 쇼는 언제 틀어도 같게 보인다.

import { hash32, rand01 } from './rng.ts';
import type { Vec3 } from './show.ts';

export type Sky = 'night' | 'dusk' | 'winter' | 'snow' | 'fog';

export interface SkyLook {
  label: string;
  top: string;
  horizon: string;
  water: string;
  /** 하늘에 보이는 별 수 */
  stars: number;
  /** 창문 불빛 세기 (해 질 녘엔 더 많이 켜져 있다) */
  windows: number;
  /** 안개: 이 거리(m)마다 빛이 1/e로 줄어든다. 0이면 안개 없음 */
  fog: number;
  snow: boolean;
}

export const SKIES: Record<Sky, SkyLook> = {
  night: { label: '맑은 밤', top: '#03040c', horizon: '#161a3e', water: '#080b20', stars: 160, windows: 0.35, fog: 0, snow: false },
  dusk: { label: '해 질 녘', top: '#141a44', horizon: '#7a4a6e', water: '#1a1838', stars: 25, windows: 0.55, fog: 0, snow: false },
  winter: { label: '한겨울 맑은 밤', top: '#010208', horizon: '#0f1838', water: '#060a1c', stars: 320, windows: 0.35, fog: 0, snow: false },
  snow: { label: '눈 오는 밤', top: '#0e101c', horizon: '#2a2d44', water: '#0d0f1e', stars: 0, windows: 0.45, fog: 1800, snow: true },
  fog: { label: '안개 낀 밤', top: '#161826', horizon: '#2e3144', water: '#121422', stars: 0, windows: 0.25, fog: 700, snow: false },
};

export const SKY_IDS = Object.keys(SKIES) as Sky[];

const FLAKES = 500;

/**
 * 눈송이를 렌더 버퍼에 쓴다. 카메라 바로 앞(6~300m)에서 천천히 떨어지고 바람에 흔들린다.
 * 가까운 눈송이일수록 크고 빠르게 지나가 보인다. 쓴 개수를 돌려준다.
 * light는 불꽃이 하늘을 밝히는 정도 (눈송이도 같이 밝아진다).
 */
export function writeSnow(out: Float32Array, start: number, t: number, eye: Vec3, light: number): number {
  let k = start * 8;
  for (let i = 0; i < FLAKES; i++) {
    const s = hash32(i, 911);
    const r = rand01(s, 3);
    const z0 = 6 + r * r * 300;
    // 거리가 멀수록 보이는 폭과 높이도 넓다 (시야 안에 고르게 흩어지게)
    const halfW = z0 * 1.1;
    const halfH = z0 * 0.8;
    const speed = 0.8 + rand01(s, 1) * 0.9;
    const fall = (rand01(s, 4) * 2 * halfH + t * speed) % (2 * halfH);
    const sway = Math.sin(t * (0.4 + rand01(s, 5) * 0.5) + i) * Math.min(3, z0 * 0.05);
    out[k++] = eye[0] + (rand01(s, 2) - 0.5) * 2 * halfW + sway;
    out[k++] = eye[1] + halfH - fall;
    out[k++] = eye[2] + z0;
    out[k++] = 0.06 + rand01(s, 6) * 0.08;
    const c = 0.7 + Math.min(0.6, light);
    out[k++] = c * 0.92;
    out[k++] = c * 0.95;
    out[k++] = c;
    out[k++] = 0.55;
  }
  return FLAKES;
}
