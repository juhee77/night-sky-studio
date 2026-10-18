// 무대. 지금은 강변 도시와 다리(서울 한강을 본뜬 곳) 하나다.
// 건물과 다리는 직접 만든 단순한 덩어리이고, 실제 건물을 본뜨지 않는다.

import type { Camera } from './camera.ts';
import { mulberry32 } from './rng.ts';
import type { Vec3 } from './show.ts';

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

export interface Venue {
  id: string;
  label: string;
  /** 건너편 강가 (북쪽) */
  farShoreZ: number;
  /** 관람석 쪽 강가 (남쪽) */
  nearShoreZ: number;
  buildings: Building[];
  bridge: { z: number; deckY: number; deckThickness: number; piers: number[] };
  seats: Record<string, Seat>;
}

function buildSkyline(seed: number): Building[] {
  const rnd = mulberry32(seed);
  const out: Building[] = [];
  // 앞줄은 낮고 촘촘하게, 뒷줄은 높고 드문드문.
  const rows = [
    { z: 880, min: 18, max: 70, gap: 6 },
    { z: 1150, min: 40, max: 160, gap: 30 },
  ];
  for (const row of rows) {
    let x = -2600;
    while (x < 2600) {
      const w = 26 + rnd() * 50;
      const tall = rnd() < 0.08 ? 1.8 : 1;
      const h = (row.min + rnd() * (row.max - row.min)) * tall;
      const windows: [number, number][] = [];
      const lit = Math.floor(rnd() * 6);
      for (let k = 0; k < lit; k++) windows.push([x + 3 + rnd() * (w - 6), 4 + rnd() * (h - 8)]);
      out.push({ x0: x, x1: x + w, z: row.z, height: h, windows });
      x += w + row.gap * (0.3 + rnd());
    }
  }
  return out;
}

const target: Vec3 = [0, 170, 0];

export const RIVER_CITY: Venue = {
  id: 'river-bridge-city',
  label: '강변 도시와 다리',
  farShoreZ: 820,
  // 관람석 바로 앞까지 물이 온다. 그래야 물에 비친 불꽃이 보인다.
  nearShoreZ: -640,
  buildings: buildSkyline(7),
  bridge: {
    z: 260,
    deckY: 18,
    deckThickness: 5,
    piers: Array.from({ length: 31 }, (_, i) => -1800 + i * 120),
  },
  seats: {
    'front-near': { label: '정면 강가', eye: [0, 8, -650], target, fovY: 50 },
    'front-far': { label: '정면 멀리', eye: [0, 8, -1500], target: [0, 150, 0], fovY: 50 },
    bridge: { label: '다리 위', eye: [-900, 26, 250], target: [0, 170, 0], fovY: 50 },
    tower: { label: '높은 전망대', eye: [-350, 230, -1300], target: [0, 150, 0], fovY: 50 },
    top: { label: '위에서 보기', eye: [0, 900, -380], target: [0, 0, 40], fovY: 50, plan: true },
  },
};

export const VENUES: Record<string, Venue> = { [RIVER_CITY.id]: RIVER_CITY };
