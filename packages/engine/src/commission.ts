// 의뢰 모드: 의뢰서, 불꽃 값(원가), 해금.
// 의뢰서는 시드로 만들어서, 같은 시드면 같은 의뢰가 나온다.

import { type FireworkType, type Size } from './catalog.ts';
import type { ColorName } from './colors.ts';
import { craftEffect, type CustomShell } from './custom.ts';
import { mulberry32 } from './rng.ts';
import { CAKE_DEFAULTS, LEN_DEFAULTS, type Cue, type Show } from './show.ts';
import { BARGE_RENT } from './site.ts';

export type Rule =
  | { kind: 'include'; type: FireworkType }
  | { kind: 'frameText' }
  | { kind: 'colorsOnly'; colors: ColorName[] }
  | { kind: 'endColors'; seconds: number; colors: ColorName[] }
  | { kind: 'finale'; seconds: number }
  | { kind: 'maxSize'; size: Size }
  /** 큰 행사: 실전 모드로 장비까지 맞추기 */
  | { kind: 'live' }
  /** 맞춤 의뢰: 지상 틀에 그림(로고)을 세우기 */
  | { kind: 'frameArt'; subject: string }
  /** 맞춤 의뢰: 제작 공방에서 만든 우리만의 불꽃 쓰기 */
  | { kind: 'workshopShell' }
  /** 마지막 몇 초를 긴 버들(카무로)로 마무리 */
  | { kind: 'kamuroFinish'; seconds: number }
  /** 바깥 층이 차례로 작게 터지는 내 불꽃 넣기 */
  | { kind: 'outerPop' };

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
  /** 맞춤 의뢰 */
  custom?: true;
  /** 이번 주 도전이면 주차 (예: 2026-W44). 모든 불꽃을 쓸 수 있고, 몇 번이든 다시 낸다. */
  challenge?: string;
  /** 납품한 결과 (납품 전에는 없음) */
  delivered?: { total: number; stars: number; reward: number; at: number };
}

/** 크기별 한 발 값 (기획안의 원가) */
export const SHELL_COST: Record<Size, number> = { 3: 1, 5: 3, 7: 8, 10: 20 };

/** 불꽃 하나(cue)의 값. 내 불꽃은 장인 설정에 따라 값이 달라진다. */
export function cueCost(c: Cue, shells?: Record<string, CustomShell>): number {
  if (c.type === 'niagara') return 1.5 * (c.len ?? LEN_DEFAULTS.niagara);
  if (c.type === 'lancework') return (c.len ?? LEN_DEFAULTS.lancework) + 0.5 * [...(c.text ?? '')].length;
  // 드론은 빌려 쓰는 비용이 크고, 오래 띄울수록 더 든다.
  if (c.type === 'drones') return 15 + 0.8 * (c.len ?? LEN_DEFAULTS.drones);
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
  let total = show.cues.reduce((sum, c) => sum + cueCost(c, show.customShells), 0);
  // 실전 모드: 바지선 한 척마다 임대·예인 비용
  if (show.rig?.live) total += BARGE_RENT * show.launchers.filter((l) => l.kind === 'barge').length;
  return Math.round(total * 10) / 10;
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
  brocade: 60,
  crackle: 70,
  leaves: 70,
  fish: 80,
  hummer: 80,
  whistle: 80,
  salute: 90,
  drones: 200,
};

const TRACKS = { march: 'basic-1', calm: 'basic-2', drive: 'basic-3', waltz: 'basic-4', epic: 'basic-5' } as const;

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
  /** 맞춤 의뢰 (공방·틀 그림이 있어야 납품할 수 있다) */
  custom?: true;
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
      { kind: 'live' },
    ],
  },
  {
    tier: 2, title: '강변 불꽃 대회 본선', client: '대회 심사위원회',
    quote: '심사위원은 다리 위에서 봅니다. 나이아가라를 꼭 넣고, 박자와 피날레를 중요하게 봐요.',
    music: 'march', seat: 'bridge', style: 'grand', colors: [['gold', 'white'], ['cyan', 'purple']],
    rules: () => [{ kind: 'include', type: 'niagara' }, { kind: 'finale', seconds: 15 }, { kind: 'live' }],
  },
  {
    tier: 0, title: '호숫가 별빛 결혼식', client: '하은·지호 부부',
    quote: '왈츠에 맞춰 차분하게 해 주세요. 마지막은 금빛 버들이 하늘에 오래 늘어지게요. 하객이 가까이 앉아서 큰 불꽃은 안 돼요.',
    music: 'waltz', seat: 'front-near', style: 'calm', colors: [['pink', 'white', 'gold'], ['white', 'gold']],
    rules: () => [{ kind: 'kamuroFinish', seconds: 12 }, { kind: 'maxSize', size: 5 }],
  },
  {
    tier: 1, title: '불꽃 장인 경연', client: '연화 협회',
    quote: '심사위원은 장인의 솜씨를 봅니다. 직접 만든 불꽃으로, 바깥 층이 위에서 아래로 차례로 터지는 것을 꼭 보여 주세요.',
    music: 'march', seat: 'front-far', style: 'grand', colors: [['gold', 'white'], ['cyan', 'gold']],
    rules: () => [{ kind: 'workshopShell' }, { kind: 'outerPop' }],
  },
  {
    tier: 2, title: '여름밤 대축제', client: '시 축제 조직위원회',
    quote: '2분이 넘는 긴 곡이에요. 후렴마다 크게, 브릿지는 잔잔하게, 마지막 20초는 꽉 채워 주세요. 실제 장비와 허가까지 맞춘 계획이 필요해요.',
    music: 'epic', seat: 'front-far', style: 'grand', colors: [['gold', 'red'], ['blue', 'white', 'gold']],
    rules: () => [{ kind: 'finale', seconds: 20 }, { kind: 'include', type: 'niagara' }, { kind: 'live' }],
  },
  // 맞춤 의뢰: 공방과 틀 그림으로 직접 만들어야 받을 수 있다.
  {
    tier: 1, title: '카페 개업 축하', client: '별빛 카페 사장님',
    quote: '우리 카페 로고를 물 위 틀불꽃으로 세워 주세요. 별 모양 로고예요. 색은 금색과 흰색으로요.',
    music: 'calm', seat: 'front-near', style: 'calm', colors: [['gold', 'white']], custom: true,
    rules: () => [{ kind: 'frameArt', subject: '별 모양 카페 로고' }, { kind: 'colorsOnly', colors: ['gold', 'white'] }],
  },
  {
    tier: 2, title: '브랜드 전용 불꽃', client: '은하 제과 마케팅팀',
    quote: '회사 로고를 틀불꽃으로 세우고, 우리 회사만의 불꽃을 직접 만들어 하늘에 띄워 주세요. 다른 데서 본 불꽃은 싫어요.',
    music: 'drive', seat: 'front-far', style: 'grand', colors: [['red', 'gold'], ['blue', 'white']], custom: true,
    rules: () => [{ kind: 'frameArt', subject: '회사 로고' }, { kind: 'workshopShell' }, { kind: 'finale', seconds: 12 }],
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
      ...(t.custom ? { custom: true as const } : {}),
    };
    if (cloud) c.cloud = cloud;
    out.push(c);
  }
  return out;
}

/** ISO 주차 이름 (월요일 시작, 1월 4일이 든 주가 1주): 2026-W44 */
export function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dow = d.getUTCDay() || 7;
  // 그 주의 목요일이 든 해가 주차의 해다.
  d.setUTCDate(d.getUTCDate() + 4 - dow);
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** 도전에서 뺄 조건: 장비·공방(내 불꽃)·틀 그림까지 갖춘 사람만 할 수 있는 것 */
const HARD_RULES: Rule['kind'][] = ['live', 'workshopShell', 'frameArt', 'outerPop', 'kamuroFinish'];

/** 이번 주 도전: 같은 주차면 누가 열어도 같은 곡·예산·조건이 나온다. */
export function weeklyChallenge(week: string): Commission {
  let h = 2166136261;
  for (const ch of week) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rnd = mulberry32(h >>> 0);
  const pick = <T>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)];
  const t = pick(TEMPLATES.filter((x) => !x.custom));
  const rules = t.rules(pick).filter((r) => !HARD_RULES.includes(r.kind));
  // 한 가지 더: 주마다 다른 숙제 (같은 종류 조건은 겹치지 않게)
  const twists: Rule[] = [
    { kind: 'finale', seconds: 12 },
    { kind: 'endColors', seconds: 10, colors: [pick<ColorName>(['gold', 'white', 'pink', 'cyan'])] },
    { kind: 'include', type: pick<FireworkType>(['willow', 'palm', 'crossette', 'ring', 'heart', 'star', 'crackle', 'brocade']) },
    { kind: 'maxSize', size: 5 },
  ].filter((x) => !rules.some((r) => r.kind === x.kind)) as Rule[];
  if (twists.length) rules.push(pick(twists));
  const calm = rnd() < 0.4;
  const c: Commission = {
    id: `wk-${week}`,
    tier: 1,
    title: `이번 주 도전 · ${t.title}`,
    client: t.client,
    quote: t.quote,
    music: TRACKS[t.music],
    budget: 160 + Math.round(rnd() * 8) * 10,
    reward: 0,
    wind: { dir: Math.round(rnd() * 360), speed: Math.round((calm ? 0.3 + rnd() * 0.7 : 1.5 + rnd() * 3) * 10) / 10 },
    seat: t.seat,
    taste: { colors: pick(t.colors), style: t.style },
    rules,
    challenge: week,
  };
  if (rnd() < 0.2) c.cloud = Math.round(220 + rnd() * 70);
  return c;
}

export const COLOR_LABEL: Record<ColorName, string> = {
  gold: '금색', white: '흰색', red: '빨강', green: '초록', blue: '파랑', pink: '분홍', cyan: '하늘색', purple: '보라',
};

export function colorList(colors: ColorName[]): string {
  return colors.map((c) => COLOR_LABEL[c]).join('·');
}

