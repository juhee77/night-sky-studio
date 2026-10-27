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
  | { kind: 'suspension'; z: number; deckY: number; x0: number; x1: number; towers: number[]; towerH: number }
  /** 다리 없음 (지도에서 고른 무대) */
  | { kind: 'none'; z: number; deckY: number; x0: number; x1: number };

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
  /** 실전 모드의 허가: 바지선을 묶어 둘 수 있는 물 위 구역 [x0, z0, x1, z1]과 띄울 수 있는 척수 */
  permit: { zones: [number, number, number, number][]; maxBarges: number };
  /** 멀리 둘러싼 산 능선: z 거리와 [x, 높이] 점들 */
  mountains?: { z: number; ridge: [number, number][] }[];
  /** 강을 가로지르는 다리들 (남북 방향, 3D 도시로만 그린다) */
  crossings?: Crossing[];
}

/** 강을 가로지르는 다리: x 자리에서 z0부터 z1까지 */
export interface Crossing {
  name: string;
  x: number;
  z0: number;
  z1: number;
  deckY: number;
  /** girder: 상판과 교각, truss: 철골 트러스(철교), arch: 아치 */
  kind: 'girder' | 'truss' | 'arch';
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
  // 강 가운데, 다리에서 80m 넘게 떨어진 곳
  permit: { zones: [[-900, -450, 900, 180]], maxBarges: 5 },
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
  // 항구 안쪽, 아치 다리 앞
  permit: { zones: [[-1000, -350, 1000, 420]], maxBarges: 6 },
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
  // 모래사장 앞바다, 해상 다리 앞
  permit: { zones: [[-900, -250, 900, 750]], maxBarges: 4 },
};

export const NARROW_RIVER: Venue = {
  id: 'narrow-river',
  label: '좁은 강과 빽빽한 동네',
  place: '도쿄 스미다강',
  // 강폭이 400m뿐이라 관람석이 아주 가깝다. 큰 알은 쏠 수 없다.
  farShoreZ: 160,
  nearShoreZ: -240,
  nearGround: '#05060c',
  buildings: buildSkyline(61, [
    { z: 190, min: 12, max: 40, gap: 3 },
    { z: 320, min: 25, max: 70, gap: 8 },
    { z: 520, min: 40, max: 120, gap: 20, tallChance: 0.12 },
  ]),
  bridge: { kind: 'girder', z: 120, deckY: 12, x0: -900, x1: 900, piers: Array.from({ length: 13 }, (_, i) => -720 + i * 120) },
  seats: {
    'front-near': { label: '강둑 바로 앞', eye: [0, 6, -250], target: [0, 110, -10], fovY: 55 },
    'front-far': { label: '동네 골목 끝', eye: [120, 8, -520], target: [0, 100, -10], fovY: 50 },
    bridge: { label: '다리 위', eye: [-500, 18, 118], target: [0, 100, -20], fovY: 55 },
    top: plan(-200, -20),
  },
  launchers: [
    ...barges([[-160, 0, -40], [160, 0, -40]]),
    { id: 'bridge', kind: 'bridge', pos: [0, 12, 118], from: [-300, 12, 118], to: [300, 12, 118] },
    { id: 'ground', kind: 'frame', pos: [0, 0, -180] },
  ],
  permit: { zones: [[-500, -140, 500, 60]], maxBarges: 2 },
};

export const GRAND_RIVER: Venue = {
  id: 'grand-river',
  label: '넓은 강변 초대형 축제',
  place: '일본 나가오카 시나노강',
  // 강폭이 2km를 넘는다. 바지선을 길게 한 줄로 늘어세우고 아주 큰 알을 쏜다.
  farShoreZ: 1400,
  nearShoreZ: -900,
  nearGround: '#05060c',
  buildings: buildSkyline(73, [
    { z: 1450, min: 10, max: 35, gap: 25 },
    { z: 1800, min: 20, max: 60, gap: 60 },
  ]),
  bridge: { kind: 'girder', z: 900, deckY: 20, x0: -3000, x1: 3000, piers: Array.from({ length: 41 }, (_, i) => -2400 + i * 120) },
  seats: {
    'front-near': { label: '강변 둔치', eye: [0, 8, -910], target: [0, 220, 0], fovY: 55 },
    'front-far': { label: '둑 위 멀리', eye: [0, 18, -1700], target: [0, 200, 0], fovY: 50 },
    bridge: { label: '다리 위', eye: [-1400, 28, 898], target: [0, 220, 0], fovY: 50 },
    tower: { label: '언덕 전망대', eye: [-900, 160, -1900], target: [0, 200, 0], fovY: 50 },
    top: plan(-700, 0),
  },
  launchers: [
    ...barges([[-1000, 0, 0], [-600, 0, 0], [-200, 0, 0], [200, 0, 0], [600, 0, 0], [1000, 0, 0]]),
    { id: 'bridge', kind: 'bridge', pos: [0, 20, 898], from: [-800, 20, 898], to: [800, 20, 898] },
    { id: 'ground', kind: 'frame', pos: [0, 0, -500] },
  ],
  permit: { zones: [[-1600, -350, 1600, 350]], maxBarges: 8 },
};

export const SKYSCRAPER: Venue = {
  id: 'skyscraper-bay',
  label: '초고층 빌딩',
  place: '두바이·타이베이',
  // 가운데 뒤로 아주 높은 탑과 빽빽한 고층 건물. 불꽃이 건물 높이와 겨룬다.
  farShoreZ: 700,
  nearShoreZ: -520,
  nearGround: '#05060c',
  buildings: [
    ...buildSkyline(89, [
      { z: 760, min: 40, max: 140, gap: 14, tallChance: 0.25 },
      { z: 980, min: 90, max: 260, gap: 30, from: -1400, to: 1400, tallChance: 0.3 },
    ]),
    // 하늘을 찌르는 탑 (단순한 기둥 세 단)
    { x0: -30, x1: 30, z: 900, height: 520, windows: Array.from({ length: 40 }, (_, k): [number, number] => [-26 + (k % 8) * 7, 20 + Math.floor(k / 8) * 95]) },
    { x0: -14, x1: 14, z: 899, height: 720, windows: [] },
    { x0: -4, x1: 4, z: 898, height: 830, windows: [] },
  ],
  bridge: { kind: 'girder', z: 450, deckY: 16, x0: -1400, x1: 1400, piers: Array.from({ length: 21 }, (_, i) => -1200 + i * 120) },
  seats: {
    'front-near': { label: '수변 산책로', eye: [0, 6, -530], target: [0, 230, 300], fovY: 55 },
    'front-far': { label: '공원 언덕', eye: [0, 30, -1300], target: [0, 230, 300], fovY: 50 },
    tower: { label: '호텔 꼭대기', eye: [-700, 260, -800], target: [0, 200, 200], fovY: 50 },
    top: plan(-350, 150),
  },
  launchers: [
    ...barges([[-260, 0, 100], [0, 0, 60], [260, 0, 100]]),
    { id: 'bridge', kind: 'bridge', pos: [0, 16, 448], from: [-300, 16, 448], to: [300, 16, 448] },
    { id: 'ground', kind: 'frame', pos: [0, 0, -300] },
  ],
  permit: { zones: [[-800, -260, 800, 380]], maxBarges: 4 },
};

export const MOUNTAIN_LAKE: Venue = {
  id: 'mountain-lake',
  label: '산으로 둘러싼 호수',
  place: '여러 호수 축제',
  // 다리 대신 산 능선. 물결 없는 호수에 불꽃이 또렷하게 비친다.
  farShoreZ: 1600,
  nearShoreZ: -500,
  nearGround: '#06070a',
  buildings: buildSkyline(97, [{ z: 1650, min: 6, max: 18, gap: 120, from: -1500, to: 1500 }]),
  bridge: { kind: 'none', z: 0, deckY: 0, x0: 0, x1: 0 },
  mountains: [
    { z: 2600, ridge: [[-6000, 120], [-3600, 420], [-2400, 260], [-1200, 640], [-200, 380], [900, 720], [2100, 330], [3300, 560], [6000, 160]] },
    { z: 4200, ridge: [[-8000, 300], [-4200, 900], [-1800, 620], [600, 1100], [2600, 700], [5200, 980], [8000, 280]] },
  ],
  seats: {
    'front-near': { label: '호숫가 잔디밭', eye: [0, 5, -510], target: [0, 170, 100], fovY: 55 },
    'front-far': { label: '호숫가 마을', eye: [200, 12, -1100], target: [0, 160, 100], fovY: 50 },
    tower: { label: '산 중턱 쉼터', eye: [-900, 220, -1300], target: [0, 150, 100], fovY: 50 },
    top: plan(-350, 150),
  },
  launchers: [
    ...barges([[-220, 0, 120], [220, 0, 120]]),
    { id: 'ground', kind: 'frame', pos: [0, 0, -260] },
  ],
  permit: { zones: [[-900, -200, 900, 800]], maxBarges: 3 },
};

/**
 * 한강 (여의도): 서울세계불꽃축제처럼 여의도 한강공원에서 북쪽 강 건너(이촌·용산)를 바라본다.
 * 바지선은 원효대교와 한강철교 사이 강 위, 나이아가라는 원효대교에 건다.
 * 실제 자리를 손으로 줄여 옮긴 것이다 (동쪽 +x, 북쪽 +z, 여의도 한강공원 앞 강가가 z −500).
 */
export const HANGANG: Venue = {
  id: 'hangang',
  label: '한강 (여의도)',
  place: '서울 여의도 한강공원',
  farShoreZ: 560,
  nearShoreZ: -500,
  nearGround: '#04050b',
  buildings: [
    // 강 건너 이촌동 아파트, 그 뒤 용산 고층 건물, 더 뒤 도심
    ...buildSkyline(31, [
      { z: 660, min: 45, max: 95, gap: 18, from: -1600, to: 2600 },
      { z: 1500, min: 90, max: 200, gap: 40, from: -300, to: 1400, tallChance: 0.25 },
      { z: 2400, min: 40, max: 120, gap: 20, from: -3000, to: 3500 },
    ]),
    // 여의도 (관람석 뒤): 파크원·IFC·63빌딩과 아파트
    ...buildSkyline(37, [{ z: -1450, min: 40, max: 110, gap: 25, from: -1800, to: 700 }]),
    { x0: -540, x1: -490, z: -1560, height: 333, windows: [] },
    { x0: -460, x1: -420, z: -1520, height: 300, windows: [] },
    { x0: -940, x1: -895, z: -1380, height: 284, windows: [] },
    { x0: 860, x1: 925, z: -1040, height: 249, windows: [] },
    // 남산 위 N서울타워 (산 높이 + 탑)
    { x0: 1496, x1: 1504, z: 3590, height: 480, windows: [] },
  ],
  bridge: { kind: 'none', z: 0, deckY: 18, x0: 0, x1: 0 },
  crossings: [
    { name: '마포대교', x: -1400, z0: -520, z1: 580, deckY: 18, kind: 'girder' },
    { name: '원효대교', x: 1000, z0: -520, z1: 580, deckY: 18, kind: 'girder' },
    { name: '한강철교', x: 1750, z0: -520, z1: 580, deckY: 14, kind: 'truss' },
    { name: '한강대교', x: 2500, z0: -520, z1: 580, deckY: 16, kind: 'arch' },
  ],
  mountains: [
    { z: 3600, ridge: [[200, 30], [900, 140], [1300, 225], [1500, 240], [1750, 220], [2300, 120], [3000, 30]] },
    { z: 9000, ridge: [[-6000, 200], [-3500, 520], [-2000, 760], [-800, 640], [600, 830], [2200, 600], [4000, 700], [6500, 300]] },
  ],
  seats: {
    'front-near': { label: '여의도 한강공원', eye: [0, 8, -560], target: [150, 170, 0], fovY: 50 },
    'front-far': { label: '여의도 공원 안쪽', eye: [-200, 8, -950], target: [150, 150, 0], fovY: 50 },
    ichon: { label: '이촌 한강공원', eye: [600, 8, 585], target: [0, 170, 0], fovY: 50 },
    bridge: { label: '원효대교 위', eye: [1000, 34, -150], target: [0, 160, 0], fovY: 50 },
    // 63빌딩 북쪽 벽 바로 바깥, 전망대 높이
    tower: { label: '63빌딩 전망대', eye: [892, 240, -985], target: [0, 140, 0], fovY: 50 },
    top: plan(-300, 0),
  },
  launchers: [
    ...barges([[-220, 0, 0], [220, 0, 40], [0, 0, -60]]),
    { id: 'bridge', kind: 'bridge', pos: [1000, 18, 0], from: [1000, 18, -420], to: [1000, 18, 420] },
    { id: 'ground', kind: 'frame', pos: [0, 0, -440] },
  ],
  // 원효대교 서쪽 강 가운데 (다리에서 80m 넘게)
  permit: { zones: [[-700, -380, 880, 400]], maxBarges: 5 },
};

export const VENUES: Record<string, Venue> = {
  [HANGANG.id]: HANGANG,
  [RIVER_CITY.id]: RIVER_CITY,
  [HARBOUR.id]: HARBOUR,
  [BEACH.id]: BEACH,
  [NARROW_RIVER.id]: NARROW_RIVER,
  [GRAND_RIVER.id]: GRAND_RIVER,
  [SKYSCRAPER.id]: SKYSCRAPER,
  [MOUNTAIN_LAKE.id]: MOUNTAIN_LAKE,
};

/** 물이 있는 북쪽 범위 [가까운 물가, 먼 물가] (바다면 아주 멀리까지) */
export function waterSpan(v: Venue): [number, number] {
  return [v.nearShoreZ, v.farShoreZ ?? 9000];
}
