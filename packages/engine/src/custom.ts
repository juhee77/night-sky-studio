// 내 불꽃: 불꽃 공작소에서 직접 설계한 불꽃 한 종류.
// 실제 불꽃 알처럼 바깥 층과 안쪽 심(芯)에 별을 채우고, 별마다 모양·색·움직임을 정한다.
// 쇼 파일에 정의를 같이 담아서, 공유 링크로 보내도 받는 사람에게 같은 불꽃이 터진다.

import type { ColorName } from './colors.ts';
import { COLOR_NAMES } from './colors.ts';

export type StarKind = 'tail' | 'dot' | 'glitter' | 'willow';

export type LayerShape =
  | { kind: 'sphere'; count: number }
  | { kind: 'ring'; count: number }
  /** 직접 그린 점들. 좌표는 -1~1, 위쪽이 + */
  | { kind: 'points'; pts: [number, number][] };

export interface ShellLayer {
  role: 'outer' | 'pistil';
  shape: LayerShape;
  star: StarKind;
  /** 처음 색과, 바뀌는 색(선택). at은 별 수명 가운데 바뀌는 때 (0~1) */
  color: ColorName;
  then?: { color: ColorName; at: number };
  /** 바깥 층에 비한 크기 (심은 보통 0.4~0.5) */
  scale: number;
  /** 터지고 나서 이 층이 피어나기까지 기다리는 시간(초) */
  delay: number;
}

export interface CustomShell {
  id: string;
  name: string;
  layers: ShellLayer[];
  motion: {
    /** 퍼지는 속도 배율 (0.5~1.5) */
    speed: number;
    /** 아래로 늘어지는 정도 (0~1) */
    droop: number;
    /** 별이 사는 시간(초) */
    life: number;
    /** 꺼졌다 켜졌다 하며 사라진다 */
    flicker: boolean;
  };
  /** 두 번 터지기: after초 뒤에 십자로 갈라지거나(crossette) 작게 한 번 더 터진다(burst) */
  split?: { after: number; into: 'crossette' | 'burst' };
}

export const MAX_STARS_PER_LAYER = 200;
export const MAX_POINTS = 160;

export function newCustomShell(id: string, name: string): CustomShell {
  return {
    id,
    name,
    layers: [
      { role: 'outer', shape: { kind: 'sphere', count: 90 }, star: 'tail', color: 'pink', then: { color: 'white', at: 0.6 }, scale: 1, delay: 0 },
      { role: 'pistil', shape: { kind: 'sphere', count: 30 }, star: 'dot', color: 'gold', scale: 0.45, delay: 0.15 },
    ],
    motion: { speed: 1, droop: 0.3, life: 2.2, flicker: false },
  };
}

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, Number.isFinite(x) ? x : a));
const color = (c: unknown): ColorName => (COLOR_NAMES.includes(c as ColorName) ? (c as ColorName) : 'gold');

/** 바깥에서 받은 정의(불꽃 코드, 공유 링크)를 안전한 범위로 고친다. */
export function normalizeShell(raw: CustomShell): CustomShell {
  const layers = (raw.layers ?? []).slice(0, 2).map((l, i): ShellLayer => {
    let shape: LayerShape;
    if (l.shape?.kind === 'points') {
      const pts = (l.shape.pts ?? [])
        .slice(0, MAX_POINTS)
        .map(([x, y]) => [clamp(x, -1, 1), clamp(y, -1, 1)] as [number, number]);
      shape = { kind: 'points', pts: pts.length ? pts : [[0, 1], [1, 0], [0, -1], [-1, 0]] };
    } else {
      shape = { kind: l.shape?.kind === 'ring' ? 'ring' : 'sphere', count: Math.round(clamp(l.shape?.count ?? 60, 6, MAX_STARS_PER_LAYER)) };
    }
    const out: ShellLayer = {
      role: i === 0 ? 'outer' : 'pistil',
      shape,
      star: (['tail', 'dot', 'glitter', 'willow'] as const).includes(l.star) ? l.star : 'dot',
      color: color(l.color),
      scale: clamp(l.scale ?? (i === 0 ? 1 : 0.45), 0.2, 1),
      delay: clamp(l.delay ?? 0, 0, 1.5),
    };
    if (l.then) out.then = { color: color(l.then.color), at: clamp(l.then.at, 0.1, 0.9) };
    return out;
  });
  const shell: CustomShell = {
    id: String(raw.id ?? 'x').slice(0, 24),
    name: String(raw.name ?? '내 불꽃').slice(0, 16) || '내 불꽃',
    layers: layers.length ? layers : newCustomShell('x', 'x').layers.slice(0, 1),
    motion: {
      speed: clamp(raw.motion?.speed ?? 1, 0.5, 1.5),
      droop: clamp(raw.motion?.droop ?? 0.3, 0, 1),
      life: clamp(raw.motion?.life ?? 2, 0.8, 5),
      flicker: !!raw.motion?.flicker,
    },
  };
  if (raw.split) shell.split = { after: clamp(raw.split.after, 0.4, 3), into: raw.split.into === 'burst' ? 'burst' : 'crossette' };
  return shell;
}

/** 터진 뒤 눈에 보이는 시간 (시간표 길이) */
export function customLength(s: CustomShell): number {
  const delay = Math.max(0, ...s.layers.map((l) => l.delay));
  return delay + (s.split ? s.split.after + 1.1 : s.motion.life);
}

export function customStarCount(s: CustomShell): number {
  return s.layers.reduce((n, l) => n + (l.shape.kind === 'points' ? l.shape.pts.length : l.shape.count), 0);
}

/** 정의가 바뀌었는지 가리는 짧은 지문 */
export function shellKey(s: CustomShell): string {
  const json = JSON.stringify(s);
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) h = Math.imul(h ^ json.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}
