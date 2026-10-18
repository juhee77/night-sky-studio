// 무대. 세계의 불꽃축제 장소를 본뜬 세 곳:
//   강변 도시와 다리 (서울 한강), 항구와 아치 다리 (시드니 항구), 해변과 바다 위 다리 (부산 광안리)
// 건물과 다리는 직접 만든 단순한 덩어리이고, 실제 건물이나 축제의 모습을 그대로 본뜨지 않는다.

import type { Camera } from './camera.ts';
import { mulberry32 } from './rng.ts';
import type { Launcher, Vec3 } from './show.ts';

export interface Building {
  x0: number;
  x1: number;
  z: number;
  height: number;
  /** 불 켜진 창문 [x, y] */
  windows: [number, number][];
}

export interface Seat extends Camera {
  label: string;
  /** 위에서 내려다보는 평면도 (소리 지연 없음, 발사 위치 표시) */
  plan?: boolean;
}

/** 다리 모양: 교각 위 상판, 강철 아치, 주탑과 늘어진 케이블 */
export type BridgeShape =
  | { kind: 'girder'; z: number; deckY: number; x0: number; x1: number; piers: number[] }
  | { kind: 'arch'; z: number; deckY: number; x0: number; x1: number; span: number; rise: number }
  | { kind: 'suspension'; z: number; deckY: number; x0: number; x1: number; towers: number[]; towerH: number };

export interface Venue {
  id: string;
  label: string;
  /** 본뜬 곳 */
  place: string;
  /** 건너편 물가 (북쪽). null이면 수평선까지 바다 */
  farShoreZ: number | null;
  /** 관람석 쪽 물가 (남쪽) */
  nearShoreZ: number;
  /** 관람석 쪽 땅 색 (해변은 모래색) */
  nearGround: string;
  buildings: Building[];
  bridge: BridgeShape;
  seats: Record<string, Seat>;
  /** 새 쇼를 만들 때 놓는 발사 위치 */
  launchers: Launcher[];
}

interface Row {
  z: number;
  min: number;
  max: number;
  gap: number;
  /** 이 x 범위에만 건물을 세운다 */
  from?: number;
  to?: number;
  tallChance?: number;
}

function buildSkyline(seed: number, rows: Row[]): Building[] {
  const rnd = mulberry32(seed);
  const out: Building[] = [];
  for (const row of rows) {
    let x = row.from ?? -2600;
    while (x < (row.to ?? 2600)) {
      const w = 26 + rnd() * 50;
      const tall = rnd() < (row.tallChance ?? 0.08) ? 1.8 : 1;
      const h = (row.min + rnd() * (row.max - row.min)) * tall;
      const windows: [number, number][] = [];
      const lit = Math.floor(rnd() * (6 + h / 40));
      for (let k = 0; k < lit; k++) windows.push([x + 3 + rnd() * (w - 6), 4 + rnd() * (h - 8)]);
      out.push({ x0: x, x1: x + w, z: row.z, height: h, windows });
      x += w + row.gap * (0.3 + rnd());
    }
  }
  return out;
}

const plan = (eyeZ: number, targetZ: number): Seat => ({
  label: '위에서 보기', eye: [0, 900, eyeZ], target: [0, 0, targetZ], fovY: 50, plan: true,
});

const barges = (pos: Vec3[]): Launcher[] => pos.map((p, i) => ({ id: `barge-${i + 1}`, kind: 'barge', pos: p }));

export const RIVER_CITY: Venue = {
  id: 'river-bridge-city',
  label: '강변 도시와 다리',
  place: '서울 한강',
  farShoreZ: 820,
  // 관람석 바로 앞까지 물이 온다. 그래야 물에 비친 불꽃이 보인다.
  nearShoreZ: -640,
  nearGround: '#04050b',
  buildings: buildSkyline(7, [
    { z: 880, min: 18, max: 70, gap: 6 },
    { z: 1150, min: 40, max: 160, gap: 30 },
  ]),
  bridge: { kind: 'girder', z: 260, deckY: 18, x0: -2000, x1: 2000, piers: Array.from({ length: 31 }, (_, i) => -1800 + i * 120) },
  seats: {
    'front-near': { label: '정면 강가', eye: [0, 8, -650], target: [0, 170, 0], fovY: 50 },
    'front-far': { label: '정면 멀리', eye: [0, 8, -1500], target: [0, 150, 0], fovY: 50 },
    bridge: { label: '다리 위', eye: [-900, 26, 250], target: [0, 170, 0], fovY: 50 },
    tower: { label: '높은 전망대', eye: [-350, 230, -1300], target: [0, 150, 0], fovY: 50 },
    top: plan(-380, 40),
  },
  launchers: [
    ...barges([[-220, 0, 0], [0, 0, -80], [220, 0, 60]]),
    { id: 'bridge', kind: 'bridge', pos: [0, 18, 258], from: [-500, 18, 258], to: [500, 18, 258] },
    { id: 'ground', kind: 'frame', pos: [0, 0, -330] },
  ],
};

export const HARBOUR: Venue = {
  id: 'harbour-arch',
  label: '항구와 아치 다리',
  place: '시드니 항구',
  farShoreZ: 1100,
  nearShoreZ: -700,
  nearGround: '#05060c',
  // 건너편 도심: 가운데 왼쪽에 높은 건물이 몰려 있다.
  buildings: buildSkyline(23, [
    { z: 1160, min: 20, max: 60, gap: 10 },
    { z: 1400, min: 60, max: 220, gap: 26, from: -1600, to: 200, tallChance: 0.2 },
    { z: 1500, min: 30, max: 90, gap: 40, from: 200, to: 2600 },
  ]),
  // 크게 휜 강철 아치. 새해 쇼에서 다리 위 나이아가라가 흘러내린다.
  bridge: { kind: 'arch', z: 520, deckY: 50, x0: -1100, x1: 900, span: 500, rise: 85 },
  seats: {
    'front-near': { label: '정면 물가', eye: [0, 10, -710], target: [0, 170, 80], fovY: 50 },
    'front-far': { label: '정면 멀리', eye: [0, 10, -1600], target: [0, 150, 80], fovY: 50 },
    bridge: { label: '다리 위', eye: [-950, 58, 518], target: [0, 160, 100], fovY: 50 },
    tower: { label: '높은 전망대', eye: [600, 250, -1400], target: [0, 150, 100], fovY: 50 },
    top: plan(-400, 120),
  },
  launchers: [
    ...barges([[-380, 0, 120], [-120, 0, 40], [120, 0, 40], [380, 0, 120]]),
    { id: 'bridge', kind: 'bridge', pos: [0, 50, 518], from: [-250, 50, 518], to: [250, 50, 518] },
    { id: 'ground', kind: 'frame', pos: [0, 0, -380] },
  ],
};

export const BEACH: Venue = {
  id: 'beach-bridge',
  label: '해변과 바다 위 다리',
  place: '부산 광안리',
  farShoreZ: null,
  nearShoreZ: -620,
  nearGround: '#16130e',
  // 멀리 양옆 해안에 높은 건물들. 가운데는 수평선까지 바다다.
  buildings: buildSkyline(41, [
    { z: 2600, min: 60, max: 260, gap: 30, from: -3400, to: -1300, tallChance: 0.25 },
    { z: 2900, min: 50, max: 200, gap: 40, from: 1200, to: 3400, tallChance: 0.2 },
  ]),
  // 바다를 가로지르는 현수교: 주탑 두 개와 늘어진 케이블.
  bridge: { kind: 'suspension', z: 900, deckY: 30, x0: -2600, x1: 2600, towers: [-450, 450], towerH: 110 },
  seats: {
    'front-near': { label: '모래사장', eye: [0, 3, -640], target: [0, 170, 120], fovY: 50 },
    'front-far': { label: '해변 뒤 거리', eye: [0, 12, -1300], target: [0, 150, 120], fovY: 50 },
    tower: { label: '해변 앞 높은 건물', eye: [-500, 180, -1100], target: [0, 150, 150], fovY: 50 },
    top: plan(-420, 160),
  },
  launchers: [
    ...barges([[-300, 0, 150], [0, 0, 80], [300, 0, 150]]),
    { id: 'bridge', kind: 'bridge', pos: [0, 30, 898], from: [-420, 30, 898], to: [420, 30, 898] },
    { id: 'ground', kind: 'frame', pos: [0, 0, -280] },
  ],
};

export const VENUES: Record<string, Venue> = {
  [RIVER_CITY.id]: RIVER_CITY,
  [HARBOUR.id]: HARBOUR,
  [BEACH.id]: BEACH,
};

/** 물이 있는 북쪽 범위 [가까운 물가, 먼 물가] (바다면 아주 멀리까지) */
export function waterSpan(v: Venue): [number, number] {
  return [v.nearShoreZ, v.farShoreZ ?? 9000];
}
