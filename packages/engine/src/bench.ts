// 작업대: 알 하나를 공정 순서대로 손으로 만든다. 슬라이더가 없고, 손으로 한 결과만 값이 된다.
//   배합 → 별 만들기 → 말리기 → 별 붙이기 → 할약 붓기 → 반구 맞붙이기 → 종이 바르기 → 도화선·발사약 → 시험장
// 여기에는 손동작을 채점하는 함수와, 작업대의 결과를 알 설계(ShellBuild)로 바꾸는 함수가 있다.

import type { Size } from './catalog.ts';
import { defaultBuild, type Dir, type ShellBuild, type StarMethod } from './build.ts';
import type { Colorant, Composition } from './chem.ts';
import type { StarKind } from './custom.ts';

export type BenchStep = 'mix' | 'stars' | 'dry' | 'place' | 'pour' | 'join' | 'paste' | 'fuse' | 'test';

export const BENCH_STEPS: { id: BenchStep; label: string }[] = [
  { id: 'mix', label: '배합' },
  { id: 'stars', label: '별 만들기' },
  { id: 'dry', label: '말리기' },
  { id: 'place', label: '별 붙이기' },
  { id: 'pour', label: '할약 붓기' },
  { id: 'join', label: '반구 맞붙이기' },
  { id: 'paste', label: '종이 바르기' },
  { id: 'fuse', label: '도화선·발사약' },
  { id: 'test', label: '시험장' },
];

/** 배합 그릇에 넣는 성분 (숟가락 수) */
export type Ingredient = 'oxidizer' | 'fuel' | 'colorant' | 'helper' | 'binder';

export interface Bench {
  size: Size;
  starKind: StarKind;
  mix: { scoops: Record<Ingredient, number>; colorant: Colorant; stir: number };
  stars: { method: StarMethod; sizeMm: number; count: number; care: number };
  dryHours: number;
  placed: Dir[];
  pour?: { charge: number; offset: number };
  join?: { angleDeg: number };
  paste?: { layers: number; care: number };
  fuseCm?: number;
  liftG?: number;
}

export function newBench(size: Size = 5): Bench {
  return {
    size,
    starKind: 'tail',
    mix: { scoops: { oxidizer: 0, fuel: 0, colorant: 0, helper: 0, binder: 0 }, colorant: 'red', stir: 0 },
    stars: { method: 'rolled', sizeMm: 12, count: 0, care: 0 },
    dryHours: 0,
    placed: [],
  };
}

/** 알맞은 도화선 길이(cm)와 발사약 무게(g): 알이 클수록 길고 무겁다 */
export const idealFuseCm = (size: Size) => 4 + size * 1.2;
export const idealLiftG = (size: Size) => size * size * 2;

/** 이 공정을 마쳤는지, 못 마쳤으면 무엇이 모자란지 */
export function benchNeed(b: Bench, step: BenchStep): string | null {
  const scoops = Object.values(b.mix.scoops).reduce((s, n) => s + n, 0);
  switch (step) {
    case 'mix':
      if (scoops < 4) return '성분을 더 떠 넣으세요 (적어도 네 숟가락).';
      if (!b.mix.scoops.colorant) return '색 성분을 넣어야 색이 납니다.';
      if (b.mix.stir < 0.2) return '그릇을 저어 섞으세요.';
      return null;
    case 'stars':
      return b.stars.count >= 20 ? null : `별을 더 만드세요 (지금 ${b.stars.count}알, 적어도 20알).`;
    case 'dry':
      return b.dryHours >= 6 ? null : '별을 선반에 펼쳐 말리세요.';
    case 'place':
      return b.placed.length >= 12 ? null : `반구 벽에 별을 더 붙이세요 (지금 ${b.placed.length}알).`;
    case 'pour':
      return b.pour ? null : '할약을 부으세요.';
    case 'join':
      return b.join ? null : '두 반구를 맞붙이세요.';
    case 'paste':
      return b.paste ? null : '종이를 바르세요.';
    case 'fuse':
      if (b.fuseCm === undefined) return '도화선을 잘라 꽂으세요.';
      return b.liftG === undefined ? '발사약을 달아 매다세요.' : null;
    case 'test':
      return null;
  }
}

/** 처음으로 다 하지 않은 공정 (다 했으면 null) */
export function firstUnfinished(b: Bench): BenchStep | null {
  return BENCH_STEPS.find((s) => s.id !== 'test' && benchNeed(b, s.id))?.id ?? null;
}

const clamp = (x: number, a: number, c: number) => Math.min(c, Math.max(a, Number.isFinite(x) ? x : a));

/** 젓기: 그릇을 여덟 바퀴 저으면 고르게 섞인다 */
export const stirScore = (turns: number) => clamp(turns / 8, 0, 1);

/** 찍기: 일정한 박자로 누를수록 별 크기가 고르다 (누른 사이 시간들, ms) */
export function pumpScore(intervals: number[]): number {
  if (intervals.length < 2) return 0.5;
  const m = intervals.reduce((s, v) => s + v, 0) / intervals.length;
  const sd = Math.sqrt(intervals.reduce((s, v) => s + (v - m) ** 2, 0) / intervals.length);
  return clamp(1 - (sd / m) * 2, 0, 1);
}

/** 자르기: 칼을 곧게 당길수록 별이 고르다 (칼 길의 점들) */
export function cutScore(pts: [number, number][]): number {
  if (pts.length < 2) return 0;
  const [x0, y0] = pts[0];
  const [x1, y1] = pts[pts.length - 1];
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len < 40) return 0;
  let dev = 0;
  for (const [x, y] of pts) dev = Math.max(dev, Math.abs((x1 - x0) * (y0 - y) - (x0 - x) * (y1 - y0)) / len);
  return clamp(1 - (dev / len) * 6, 0, 1);
}

/** 반구 맞붙이기: 이음매 표시가 어긋난 각도 → 정확도 */
export const joinSeam = (angleDeg: number) => clamp(1 - Math.abs(angleDeg) / 20, 0, 1);

/** 별을 한 판 만들 때 쌓는 수와 고르기를 별 상자에 더한다 (고르기는 개수로 가중 평균) */
export function addStars(b: Bench, count: number, care: number): void {
  const total = b.stars.count + count;
  b.stars.care = total ? (b.stars.care * b.stars.count + care * count) / total : 0;
  b.stars.count = total;
}

/** 작업대의 결과 → 알 설계. 아직 안 한 공정은 「서툰 첫 솜씨」 값으로 채운다 (시험해 보면 티가 난다). */
export function benchToBuild(b: Bench): ShellBuild {
  const base = defaultBuild(b.size);
  const s = b.mix.scoops;
  const comp: Composition = {
    name: '작업대 배합',
    oxidizer: s.oxidizer * 5,
    fuel: s.fuel * 5,
    colorant: b.mix.colorant,
    colorantAmount: s.colorant * 5,
    helper: s.helper * 5,
    binder: s.binder * 5,
    stir: b.mix.stir,
  };
  const hasMix = s.oxidizer + s.fuel + s.colorant + s.helper + s.binder > 0;
  const seam = b.join ? joinSeam(b.join.angleDeg) : 0.5;
  return {
    ...base,
    starKind: b.starKind,
    stars: b.placed.map((d) => [...d] as Dir),
    pistil: null,
    ...(hasMix ? { comp } : {}),
    star: { method: b.stars.method, sizeMm: b.stars.sizeMm, dryHours: b.dryHours, handCare: b.stars.care },
    breakCharge: b.pour?.charge ?? 0.3,
    paper: b.paste ? clamp(b.paste.layers, 2, 12) : 3,
    fuse: b.fuseCm !== undefined ? clamp(b.fuseCm / idealFuseCm(b.size), 0.6, 1.5) : 0.8,
    lift: b.liftG !== undefined ? clamp(b.liftG / idealLiftG(b.size), 0.5, 1.4) : 0.8,
    assembly: { chargeOffset: b.pour?.offset ?? 0.3, seam, paste: b.paste?.care ?? 0.4 },
    hand: {
      roll: b.stars.care,
      ...(b.paste ? { paste: b.paste.care } : {}),
      ...(b.pour ? { pour: b.pour.charge } : {}),
    },
  };
}
