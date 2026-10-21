// 의뢰 모드: 의뢰서, 불꽃 값(원가), 해금.
// 의뢰서는 시드로 만들어서, 같은 시드면 같은 의뢰가 나온다.

import { type FireworkType, type Size } from './catalog.ts';
import type { ColorName } from './colors.ts';
import { craftEffect, type CustomShell } from './custom.ts';
import { mulberry32 } from './rng.ts';
import { CAKE_DEFAULTS, LEN_DEFAULTS, type Cue, type Show } from './show.ts';

export type Rule =
  | { kind: 'include'; type: FireworkType }
  | { kind: 'frameText' }
  | { kind: 'colorsOnly'; colors: ColorName[] }
  | { kind: 'endColors'; seconds: number; colors: ColorName[] }
  | { kind: 'finale'; seconds: number }
  | { kind: 'maxSize'; size: Size };

export type Style = 'grand' | 'calm';

export interface Commission {
  id: string;
  /** 0: 동네, 1: 지역, 2: 큰 행사 */
  tier: number;
  title: string;
  client: string;
  quote: string;
  /** 기본 곡 id. 쇼 길이는 곡 길이를 따른다. */
  music: string;
  budget: number;
  reward: number;
  /** 바람이 불어오는 방향(도)과 세기(m/s) */
  wind: { dir: number; speed: number };
  /** 구름 바닥 높이(m). 이보다 높이 터지는 불꽃은 구름에 묻힌다. */
  cloud?: number;
  seat: string;
  taste: { colors: ColorName[]; style: Style };
  rules: Rule[];
  /** 납품한 결과 (납품 전에는 없음) */
  delivered?: { total: number; stars: number; reward: number; at: number };
}

/** 크기별 한 발 값 (기획안의 원가) */
export const SHELL_COST: Record<Size, number> = { 3: 1, 5: 3, 7: 8, 10: 20 };

/** 불꽃 하나(cue)의 값. 내 불꽃은 장인 설정에 따라 값이 달라진다. */
export function cueCost(c: Cue, shells?: Record<string, CustomShell>): number {
  if (c.type === 'niagara') return 1.5 * (c.len ?? LEN_DEFAULTS.niagara);
  if (c.type === 'lancework') return (c.len ?? LEN_DEFAULTS.lancework) + 0.5 * [...(c.text ?? '')].length;
  if (c.type === 'cake') return 0.25 * (c.shots ?? CAKE_DEFAULTS.shots) * (c.size / 3);
  // 내 불꽃은 개발비를 낸 대신 원가가 기본 불꽃보다 싸다.
  if (c.type === 'custom') {
    const def = c.custom ? shells?.[c.custom] : undefined;
    const craft = craftEffect(def?.craft);
    return SHELL_COST[c.size] * 0.8 * craft.cost * (def?.costMul ?? 1) * Math.max(1, c.fan?.count ?? 1);
  }
  return SHELL_COST[c.size] * Math.max(1, c.fan?.count ?? 1);
}

export function showCost(show: Show): number {
  return Math.round(show.cues.reduce((sum, c) => sum + cueCost(c, show.customShells), 0) * 10) / 10;
}

/** 처음부터 쓸 수 있는 불꽃. 나머지는 번 돈으로 해금한다. */
export const STARTER_TYPES: FireworkType[] = ['chrysanthemum', 'peony', 'willow', 'ring', 'heart'];

/** 내 불꽃 하나를 의뢰에 쓰려면 한 번 내는 개발비 */
export const DEVELOP_PRICE = 50;

export const UNLOCK_PRICES: Partial<Record<FireworkType, number>> = {
  star: 40,
  smile: 40,
  palm: 60,
  crossette: 80,
  cake: 100,
  lancework: 120,
  niagara: 150,
};

const TRACKS = { march: 'basic-1', calm: 'basic-2', drive: 'basic-3' } as const;

interface Template {
  tier: number;
  title: string;
  client: string;
  quote: string;
  music: keyof typeof TRACKS;
  seat: string;
  style: Style;
  colors: ColorName[][];
  rules: (pick: <T>(xs: T[]) => T) => Rule[];
}

const TEMPLATES: Template[] = [
  {
    tier: 0, title: '강변 프러포즈', client: '민준 씨',
    quote: '여자친구에게 강가에서 고백하려고 해요. 하트는 꼭 넣어 주시고, 마지막은 금빛으로 부탁해요. 관람석이 가까워서 큰 불꽃은 안 된대요.',
    music: 'calm', seat: 'front-near', style: 'calm', colors: [['pink', 'white'], ['pink', 'gold']],
    rules: () => [{ kind: 'include', type: 'heart' }, { kind: 'endColors', seconds: 10, colors: ['gold'] }, { kind: 'maxSize', size: 5 }],
  },
  {
    tier: 0, title: '동네 여름밤', client: '강변 마을 상인회',
    quote: '예산은 적지만 동네 사람들이 다 같이 즐길 수 있게 해 주세요. 관람석이 가까워서 큰 불꽃은 안 돼요.',
    music: 'march', seat: 'front-near', style: 'grand', colors: [['gold', 'red'], ['cyan', 'gold']],
    rules: () => [{ kind: 'maxSize', size: 5 }, { kind: 'include', type: 'ring' }],
  },
  {
    tier: 0, title: '결혼식 피로연', client: '서연·도윤 부부',
    quote: '하객들이 강가 테라스에서 봐요. 흰색, 금색, 분홍만 써 주세요. 차분하고 예쁘게요.',
    music: 'calm', seat: 'front-near', style: 'calm', colors: [['white', 'gold'], ['pink', 'white']],
    rules: () => [{ kind: 'colorsOnly', colors: ['white', 'gold', 'pink'] }, { kind: 'include', type: 'heart' }],
  },
  {
    tier: 1, title: '지역 가을 축제', client: '구청 문화과',
    quote: '가족 단위 관람객이 멀리서도 봐요. 마지막 15초는 하늘이 꽉 차게 터뜨려 주세요.',
    music: 'march', seat: 'front-far', style: 'grand', colors: [['gold', 'red'], ['gold', 'white']],
    rules: () => [{ kind: 'finale', seconds: 15 }, { kind: 'include', type: 'willow' }],
  },
  {
    tier: 1, title: '졸업 축하 불꽃', client: '강변고 졸업 준비위원회',
    quote: '우리 학교 색으로만 해 주세요. 별 모양 불꽃이 있으면 좋겠어요.',
    music: 'drive', seat: 'front-near', style: 'grand', colors: [['blue', 'white'], ['green', 'gold']],
    rules: (pick) => [
      { kind: 'colorsOnly', colors: pick([['blue', 'white', 'gold'], ['green', 'gold', 'white']] as ColorName[][]) },
      { kind: 'include', type: 'star' },
    ],
  },
  {
    tier: 2, title: '회사 창립 20주년', client: '한빛전자 홍보팀',
    quote: '회사 색 두 가지로만 해 주세요. 회사 이름도 물 위에 크게 띄워 주시고, 마지막은 화려하게요.',
    music: 'drive', seat: 'tower', style: 'grand', colors: [['blue', 'white'], ['red', 'white']],
    rules: (pick) => [
      { kind: 'colorsOnly', colors: pick([['blue', 'white'], ['red', 'white'], ['purple', 'gold']] as ColorName[][]) },
      { kind: 'frameText' },
      { kind: 'finale', seconds: 12 },
    ],
  },
  {
    tier: 2, title: '강변 불꽃 대회 본선', client: '대회 심사위원회',
    quote: '심사위원은 다리 위에서 봅니다. 나이아가라를 꼭 넣고, 박자와 피날레를 중요하게 봐요.',
    music: 'march', seat: 'bridge', style: 'grand', colors: [['gold', 'white'], ['cyan', 'purple']],
    rules: () => [{ kind: 'include', type: 'niagara' }, { kind: 'finale', seconds: 15 }],
  },
];

/** 평판으로 받을 수 있는 의뢰 등급 */
export function tierFor(reputation: number): number {
  return reputation >= 60 ? 2 : reputation >= 20 ? 1 : 0;
}

/** 의뢰 게시판에 올라올 의뢰들. 같은 시드와 평판이면 같은 의뢰가 나온다. */
export function generateCommissions(seed: number, reputation: number, count = 3): Commission[] {
  const rnd = mulberry32(seed);
  const pick = <T>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)];
  const maxTier = tierFor(reputation);
  const pool = TEMPLATES.filter((t) => t.tier <= maxTier);
  const out: Commission[] = [];
  const used = new Set<number>();
  for (let k = 0; k < count && used.size < pool.length; k++) {
    // 높은 등급 의뢰가 조금 더 자주 나오게 한다.
    let idx = 0;
    do idx = Math.floor(Math.pow(rnd(), 0.7) * pool.length);
    while (used.has(idx));
    used.add(idx);
    const t = pool[pool.length - 1 - idx];
    const budget = Math.round((100 + t.tier * 80) * (0.85 + rnd() * 0.3));
    // 높은 등급일수록 날씨가 까다롭다.
    const calmDay = rnd() < 0.25 + t.tier * 0.1;
    const wind = { dir: Math.round(rnd() * 360), speed: Math.round((calmDay ? 0.2 + rnd() * 0.8 : 1.5 + rnd() * 3.5) * 10) / 10 };
    const cloud = rnd() < 0.2 + t.tier * 0.1 ? Math.round(200 + rnd() * 90) : undefined;
    const c: Commission = {
      id: `${seed.toString(36)}-${k}`,
      tier: t.tier,
      title: t.title,
      client: t.client,
      quote: t.quote,
      music: TRACKS[t.music],
      budget,
      reward: Math.round(budget * 0.8 + 30 + t.tier * 40),
      wind,
      seat: t.seat,
      taste: { colors: pick(t.colors), style: t.style },
      rules: t.rules(pick),
    };
    if (cloud) c.cloud = cloud;
    out.push(c);
  }
  return out;
}

export const COLOR_LABEL: Record<ColorName, string> = {
  gold: '금색', white: '흰색', red: '빨강', green: '초록', blue: '파랑', pink: '분홍', cyan: '하늘색', purple: '보라',
};

export function colorList(colors: ColorName[]): string {
  return colors.map((c) => COLOR_LABEL[c]).join('·');
}

