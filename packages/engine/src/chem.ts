// 배합실: 별에 쓸 화약을 성분 비율로 정한다.
// 실제 불꽃의 큰 원리만 따온 게임용 근사다 (실제 제조 비율이나 물질 이름을 알려 주지 않는다).
//   색 성분이 색을 내고, 색 돕는 성분이 색을 선명하게 한다.
//   파랑은 불꽃 온도가 높으면 색이 날아가 하얗게 바래서 가장 어렵다.
//   산화제가 많으면 빨리 타고(짧게), 연료가 많으면 밝지만 연기가 많고 색이 탁해진다.

import type { ColorName, Rgb } from './colors.ts';
import { COLORS } from './colors.ts';

/** 색 성분 (게임용 이름) */
export type Colorant = 'red' | 'green' | 'blue' | 'gold' | 'white';

export const COLORANT_LABEL: Record<Colorant, string> = {
  red: '빨강 성분',
  green: '초록 성분',
  blue: '파랑 성분',
  gold: '숯·쇳가루 (금빛)',
  white: '금속 가루 (흰빛)',
};

export interface Composition {
  name: string;
  /** 각 성분의 양 (0~100, 합은 자유. 비율로 계산한다) */
  oxidizer: number;
  fuel: number;
  colorant: Colorant;
  colorantAmount: number;
  /** 두 번째 색 성분 (섞은 색) */
  colorant2?: Colorant;
  colorant2Amount?: number;
  /** 색 돕는 성분: 색을 선명하게 (비쌈) */
  helper: number;
  /** 접착제: 별을 단단하게. 많으면 연기 */
  binder: number;
  /** 저어 섞은 고르기 (0~1, 작업대). 없으면 잘 섞인 것으로 본다. 덜 섞으면 색이 탁하다 */
  stir?: number;
}

export interface MixResult {
  /** 하늘에서 보일 가장 가까운 색 이름과 실제 빛 */
  color: ColorName;
  rgb: Rgb;
  /** 순도: 낮으면 하얗게·탁하게 바랜다 (0~1) */
  purity: number;
  /** 밝기 (0~1.2) */
  brightness: number;
  /** 타는 빠르기 (0 느림 ~ 1 빠름): 빠르면 별이 짧게 산다 */
  burnRate: number;
  /** 연기 양 (0~1.5) */
  smoke: number;
  /** 한 발 값 배율 */
  cost: number;
  warnings: string[];
}

export function defaultComposition(colorant: Colorant = 'red'): Composition {
  return { name: `${COLORANT_LABEL[colorant]} 기본`, oxidizer: 45, fuel: 20, colorant, colorantAmount: 20, helper: colorant === 'blue' ? 12 : 8, binder: 5 };
}

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, Number.isFinite(x) ? x : a));

/** 두 색 성분을 섞으면 나오는 색 이름 */
function mixedName(a: Colorant, b: Colorant | undefined, share: number): ColorName {
  const single: Record<Colorant, ColorName> = { red: 'red', green: 'green', blue: 'blue', gold: 'gold', white: 'white' };
  if (!b || b === a || share < 0.2) return single[a];
  const pair = [a, b].sort().join('+');
  const mixes: Record<string, ColorName> = {
    'blue+red': 'purple',
    'blue+green': 'cyan',
    'red+white': 'pink',
    'gold+red': 'gold',
    'green+white': 'cyan',
    'blue+white': 'cyan',
  };
  return mixes[pair] ?? single[share > 0.5 ? b : a];
}

export function evaluateMix(c: Composition): MixResult {
  const ox = clamp(c.oxidizer, 0, 100);
  const fuel = clamp(c.fuel, 0, 100);
  const col1 = clamp(c.colorantAmount, 0, 100);
  const col2 = c.colorant2 ? clamp(c.colorant2Amount ?? 0, 0, 100) : 0;
  const helper = clamp(c.helper, 0, 100);
  const binder = clamp(c.binder, 0, 100);
  const total = Math.max(1, ox + fuel + col1 + col2 + helper + binder);
  const p = { ox: ox / total, fuel: fuel / total, col: (col1 + col2) / total, helper: helper / total, binder: binder / total };
  const share2 = col2 / Math.max(1, col1 + col2);
  const color = mixedName(c.colorant, c.colorant2, share2);

  // 불꽃 온도: 산화제와 연료가 고루 많을수록 높다. 파랑은 너무 뜨거우면 바랜다.
  const balance = 1 - Math.abs(p.ox / Math.max(0.01, p.ox + p.fuel) - 0.68) * 2.2;
  const heat = clamp((p.ox + p.fuel) * 1.4 * (0.6 + 0.4 * balance), 0, 1.2);
  const hasBlue = c.colorant === 'blue' || c.colorant2 === 'blue';
  const metal = (c.colorant === 'white' ? col1 : 0) + (c.colorant2 === 'white' ? col2 : 0);

  let purity = 0.45 + Math.min(0.3, p.col * 1.2) + Math.min(0.3, p.helper * 2.5) - p.fuel * 0.5 - p.binder * 0.8;
  if (hasBlue) purity -= Math.max(0, heat - 0.75) * 1.4; // 뜨거우면 파랑이 날아간다
  if (c.stir !== undefined) purity *= 0.55 + 0.45 * clamp(c.stir, 0, 1);
  purity = clamp(purity, 0.15, 1);

  let brightness = 0.35 + heat * 0.6 + (metal / total) * 1.2;
  if (hasBlue) brightness *= 0.75;
  brightness = clamp(brightness, 0.2, 1.2);

  const burnRate = clamp(0.1 + p.ox * 1.0 - p.binder * 1.5, 0, 1);
  const smoke = clamp(0.4 + p.fuel * 2 + p.binder * 3, 0.2, 1.5);
  const cost = clamp(
    0.8 + p.helper * 3 + (hasBlue ? 0.35 : 0) + (metal / total) * 0.8 + (c.colorant2 ? 0.1 : 0),
    0.6,
    2.5,
  );

  // 실제 빛: 이름 색을 순도만큼 남기고 나머지는 하얗게 바랜다.
  const base = COLORS[color];
  const rgb = base.map((v) => (v * purity + 0.85 * (1 - purity)) * brightness) as unknown as Rgb;

  const warnings: string[] = [];
  if (p.col < 0.08) warnings.push('색 성분이 적어 색이 거의 나지 않습니다.');
  if (hasBlue && heat > 0.8) warnings.push('너무 뜨겁게 타서 파랑이 하얗게 바랩니다. 연료나 산화제를 줄이세요.');
  if (p.ox > 0.7) warnings.push('산화제가 지나치게 많아 너무 빨리 타고 불안정합니다. 게임 안에서도 「위험한 배합」으로 칩니다.');
  if (p.fuel > 0.45) warnings.push('연료가 많아 연기가 많고 색이 탁해집니다.');
  if (p.binder > 0.2) warnings.push('접착제가 많아 잘 타지 않고 연기가 많습니다.');
  return { color, rgb, purity, brightness, burnRate, smoke, cost, warnings };
}

/** 위험한 배합인지 (게임 안 규칙: 산화제가 지나치게 많으면 저장·사용 불가) */
export function isDangerous(c: Composition): boolean {
  const total = Math.max(1, c.oxidizer + c.fuel + c.colorantAmount + (c.colorant2Amount ?? 0) + c.helper + c.binder);
  return c.oxidizer / total > 0.7;
}

export function normalizeComposition(raw: Composition): Composition {
  const colorants: Colorant[] = ['red', 'green', 'blue', 'gold', 'white'];
  const out: Composition = {
    name: String(raw.name ?? '배합').slice(0, 20),
    oxidizer: clamp(raw.oxidizer, 0, 100),
    fuel: clamp(raw.fuel, 0, 100),
    colorant: colorants.includes(raw.colorant) ? raw.colorant : 'red',
    colorantAmount: clamp(raw.colorantAmount, 0, 100),
    helper: clamp(raw.helper, 0, 100),
    binder: clamp(raw.binder, 0, 100),
  };
  if (raw.stir !== undefined) out.stir = clamp(raw.stir, 0, 1);
  if (raw.colorant2 && colorants.includes(raw.colorant2)) {
    out.colorant2 = raw.colorant2;
    out.colorant2Amount = clamp(raw.colorant2Amount ?? 0, 0, 100);
  }
  return out;
}
