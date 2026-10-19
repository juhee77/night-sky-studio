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

/**
 * 장인 모드: 실제 제작처럼 서로 맞바꾸는 선택들.
 * 없으면 이상적인 불꽃(늘 동그랗고 한꺼번에 꺼짐)으로 터진다.
 */
export interface Craft {
  /** 별 크기: 크면 오래 타고 밝지만 알에 들어가는 별이 줄어든다 */
  starSize: 'small' | 'medium' | 'large';
  /** 할약 양 (0~1): 많으면 크게 퍼지지만 모양이 찌그러지기 쉽다 */
  breakCharge: number;
  /** 종이 겹 수 (2~12): 많을수록 알이 단단해 동그랗게 피지만 비싸다 */
  paper: number;
  /** 별 다듬기 (0~1): 높을수록 별이 고르게 타서 한꺼번에 꺼진다. 비싸다 */
  care: number;
  /** 고급 배합: 파랑·보라를 제대로 밝게 낸다. 비싸다 */
  premium: boolean;
}

export const DEFAULT_CRAFT: Craft = { starSize: 'medium', breakCharge: 0.5, paper: 6, care: 0.5, premium: false };

export interface CustomShell {
  id: string;
  name: string;
  layers: ShellLayer[];
  /** 장인 모드 (없으면 이상적인 불꽃) */
  craft?: Craft;
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
  if (raw.craft) {
    shell.craft = {
      starSize: (['small', 'medium', 'large'] as const).includes(raw.craft.starSize) ? raw.craft.starSize : 'medium',
      breakCharge: clamp(raw.craft.breakCharge, 0, 1),
      paper: Math.round(clamp(raw.craft.paper, 2, 12)),
      care: clamp(raw.craft.care, 0, 1),
      premium: !!raw.craft.premium,
    };
  }
  return shell;
}

/** 장인 설정이 불꽃에 주는 효과 (없으면 이상적인 값) */
export interface CraftEffect {
  /** 퍼지는 크기 배율 */
  spread: number;
  /** 찌그러짐 (0.1 매끈 ~ 1.5 크게 찌그러짐). 이상적인 불꽃은 0 */
  asym: number;
  /** 별 수명 배율과 별 수 배율 */
  life: number;
  count: number;
  /** 별마다 수명이 흩어지는 정도 (작을수록 한꺼번에 꺼진다) */
  spreadLife: number;
  /** 파랑·보라의 밝기 배율 */
  coolDim: number;
  /** 한 발 값 배율 */
  cost: number;
}

export function craftEffect(c: Craft | undefined): CraftEffect {
  if (!c) return { spread: 1, asym: 0, life: 1, count: 1, spreadLife: 0.1, coolDim: 1, cost: 1 };
  const size = { small: { life: 0.75, count: 1.25, cost: -0.1 }, medium: { life: 1, count: 1, cost: 0 }, large: { life: 1.35, count: 0.6, cost: 0.15 } }[c.starSize];
  return {
    spread: 0.75 + 0.5 * c.breakCharge,
    asym: clamp(0.35 + 1.4 * c.breakCharge - 0.09 * c.paper, 0.1, 1.5),
    life: size.life,
    count: size.count,
    spreadLife: 0.02 + 0.3 * (1 - c.care),
    coolDim: c.premium ? 1 : 0.62,
    cost: clamp(1 + 0.05 * (c.paper - 6) + 0.4 * c.care + (c.premium ? 0.3 : 0) + size.cost, 0.6, 2),
  };
}

export interface CraftReport {
  /** 둥근 정도, 한꺼번에 꺼짐, 밝기, 심 선명도 (0~100) */
  roundness: number;
  sync: number;
  brightness: number;
  pistil: number;
  /** 세 항목(둥근 정도·한꺼번에 꺼짐·밝기) 평균. 의뢰 채점의 '불꽃 완성도' */
  quality: number;
  /** 한 발 값 배율 */
  cost: number;
}

const COOL: ColorName[] = ['blue', 'purple'];

/** 품평: 일본 불꽃 대회에서 보는 것처럼 둥글게 피는지, 한꺼번에 꺼지는지, 심이 또렷한지 */
export function craftReport(s: CustomShell): CraftReport {
  const e = craftEffect(s.craft);
  const roundness = Math.round(100 * (1 - Math.max(0, e.asym - 0.1) / 1.4));
  const sync = Math.round(100 * (1 - (e.spreadLife - 0.02) / 0.3));
  const colors = s.layers.flatMap((l) => [l.color, ...(l.then ? [l.then.color] : [])]);
  const cool = colors.filter((c) => COOL.includes(c)).length / Math.max(1, colors.length);
  const bright = (1 - cool * (1 - e.coolDim)) * (s.craft?.starSize === 'large' ? 1 : s.craft?.starSize === 'small' ? 0.85 : 0.93);
  const brightness = Math.round(100 * Math.min(1, bright));
  const outer = s.layers[0];
  const pistilLayer = s.layers[1];
  const pistil = pistilLayer
    ? Math.round(50 + (pistilLayer.color !== outer.color ? 25 : 0) + (pistilLayer.delay <= 0.3 ? 25 : 10))
    : 0;
  return { roundness, sync, brightness, pistil, quality: Math.round((roundness + sync + brightness) / 3), cost: e.cost };
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
