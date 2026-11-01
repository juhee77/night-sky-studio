// 상품 카탈로그. 실제 연출가가 제조사 카탈로그에서 상품을 고르듯,
// 불꽃의 크기·상승 시간·별 개수 같은 값은 쇼 파일이 아니라 여기에 둔다.

export type Size = 3 | 5 | 7 | 10;

export const SIZES: Size[] = [3, 5, 7, 10];

export interface SizeSpec {
  /** 터지는 높이(m) */
  height: number;
  /** 퍼지는 지름(m) */
  spread: number;
  /** 점화부터 터질 때까지 걸리는 시간(초) */
  prefire: number;
}

// 높이·지름: 일본 연화 호수 표 (ハナビディア 「花火の号数とは」). 나가오카 불꽃 자료의 10호(330m, 약 300m)와
// 포플러사 『花火の図鑑』 표(지름이 이 표보다 조금 작은 150~300m)도 같은 범위다.
// 상승 시간: flight.ts로 계산한 값을 정수 초로 맞췄다 (3.9·5.3·5.9·6.8초). 10호를 재면 5~7초라는 자료와도 맞다.
export const SIZE_SPECS: Record<Size, SizeSpec> = {
  3: { height: 120, spread: 60, prefire: 4 },
  5: { height: 190, spread: 170, prefire: 5 },
  7: { height: 250, spread: 240, prefire: 6 },
  10: { height: 330, spread: 320, prefire: 7 },
};

/** 알의 실제 지름(m)과 무게(kg). 위의 호수 표와 같은 자료. */
export const SHELL_BODIES: Record<Size, { diameter: number; mass: number }> = {
  3: { diameter: 0.085, mass: 0.2 },
  5: { diameter: 0.142, mass: 1.3 },
  7: { diameter: 0.205, mass: 3 },
  10: { diameter: 0.295, mass: 8.5 },
};

/**
 * 알의 저항 계수. Ooki 외, Sci. Tech. Energetic Materials 67(1), 2006의 자유 낙하 실험값(2·4호 0.7, 5호 0.8).
 * 같은 논문의 풍동 실험은 5호에서 0.4가 나와 저자도 어느 쪽이 맞는지 정하지 못했다. 0.4를 쓰면 상승 시간이 0.3~0.6초 길어진다.
 */
export const SHELL_CD = 0.7;

/** 하늘로 쏘아 올려 터지는 불꽃. 케이크는 작은 알 여러 발을 차례로 쏜다. */
export type ShellType =
  | 'chrysanthemum' | 'peony' | 'willow' | 'palm' | 'ring' | 'crossette'
  | 'heart' | 'star' | 'smile' | 'cake' | 'custom'
  | 'crackle' | 'brocade' | 'fish' | 'hummer' | 'leaves' | 'salute' | 'whistle';

/** 시간표에 놓을 수 있는 모든 종류: 하늘 불꽃 + 다리 나이아가라 + 지상 틀불꽃 + 드론 쇼 */
export type FireworkType = ShellType | 'niagara' | 'lancework' | 'drones';

/** 별을 처음에 어떻게 흩뿌리는가 */
export type Pattern = 'sphere' | 'ring' | 'palm' | 'heart' | 'star' | 'smile';

export type Tail = 'none' | 'spark' | 'willow' | 'palm';

/** 알이 올라가는 동안의 모습 */
export type RiseEffect = 'gold' | 'silver' | 'color' | 'flowers' | 'whistle' | 'branches';

/** 공유 링크 번호 순서 (뒤에만 더한다) */
export const RISE_EFFECTS: RiseEffect[] = ['gold', 'silver', 'color', 'flowers', 'whistle', 'branches'];

export const RISE_LABEL: Record<RiseEffect, string> = {
  gold: '금빛 꼬리',
  silver: '은빛 꼬리',
  color: '색 꼬리',
  flowers: '올라가며 꽃 피기',
  whistle: '휘파람 내며 오르기',
  branches: '갈라지는 줄기',
};

/** 별 자체가 내는 소리나 특이한 움직임 */
export type ShellEffect = 'crackle' | 'hummer' | 'fish' | 'leaf' | 'whistle';

export interface ShellSpec {
  label: string;
  pattern: Pattern;
  /** 5호 기준 별 개수 */
  starsAt5: number;
  /** 별이 사는 시간(초). 크로세트는 갈라지기까지의 시간 */
  starLife: number;
  /** 5호에 넣는 별의 지름(mm). 작을수록 저항을 많이 받아 빨리 느려지고 천천히 떨어진다. */
  starMm: number;
  /** 별 밀도(kg/m³). 숯이 많은 꼬리 별은 보통 별(1510)보다 푸석해 저항을 더 받는다. 어림한 값이다. */
  starDensity?: number;
  /** 지름을 크기표보다 줄이거나 늘리는 비율 */
  spreadScale: number;
  /** 별 하나의 빛 크기(m) */
  starSize: number;
  tail: Tail;
  /** 끝으로 갈수록 주황빛으로 식는가 */
  ember: boolean;
  /** 사라지기 전에 반짝이는가 */
  glitter: boolean;
  /** 날아가다 십자로 갈라지는가 */
  split: boolean;
  /** 소리·움직임 효과 */
  effect?: ShellEffect;
  /** 살루트: 별 없이 번쩍 하고 크게 쾅 */
  salute?: boolean;
}

// 별 타는 시간(5호 기준)은 Ooki 외 2006의 실측과 같은 범위다: 5호 은빛 별 1.9초, 6호 2.4초, 3호 파란 별 2.9초.
// 별 지름은 모란 별(5호 약 15mm)만 실측이고, 다른 종류는 그 크기를 기준으로 어림한 값이다.
export const SHELLS: Record<ShellType, ShellSpec> = {
  chrysanthemum: {
    label: '국화', pattern: 'sphere', starsAt5: 110, starLife: 2.1, starMm: 15, spreadScale: 1,
    starSize: 5, tail: 'spark', ember: true, glitter: true, split: false,
  },
  peony: {
    label: '모란', pattern: 'sphere', starsAt5: 140, starLife: 1.8, starMm: 15, spreadScale: 0.95,
    starSize: 5.5, tail: 'none', ember: false, glitter: false, split: false,
  },
  willow: {
    label: '버들', pattern: 'sphere', starsAt5: 70, starLife: 6, starMm: 22, starDensity: 700, spreadScale: 0.75,
    starSize: 3.2, tail: 'willow', ember: true, glitter: false, split: false,
  },
  palm: {
    label: '야자', pattern: 'palm', starsAt5: 10, starLife: 2.6, starMm: 30, starDensity: 1000, spreadScale: 0.85,
    starSize: 7, tail: 'palm', ember: true, glitter: false, split: false,
  },
  ring: {
    label: '링', pattern: 'ring', starsAt5: 64, starLife: 1.6, starMm: 15, spreadScale: 0.9,
    starSize: 5.5, tail: 'none', ember: false, glitter: false, split: false,
  },
  crossette: {
    label: '크로세트', pattern: 'sphere', starsAt5: 18, starLife: 0.9, starMm: 20, spreadScale: 0.55,
    starSize: 5, tail: 'spark', ember: false, glitter: false, split: true,
  },
  heart: {
    label: '하트', pattern: 'heart', starsAt5: 52, starLife: 1.7, starMm: 15, spreadScale: 0.8,
    starSize: 5.5, tail: 'none', ember: false, glitter: false, split: false,
  },
  star: {
    label: '별', pattern: 'star', starsAt5: 50, starLife: 1.7, starMm: 15, spreadScale: 0.85,
    starSize: 5.5, tail: 'none', ember: false, glitter: false, split: false,
  },
  smile: {
    label: '웃는 얼굴', pattern: 'smile', starsAt5: 56, starLife: 1.7, starMm: 15, spreadScale: 0.85,
    starSize: 5.5, tail: 'none', ember: false, glitter: false, split: false,
  },
  // 내 불꽃: 실제 모양은 쇼에 담긴 정의(CustomShell)로 정한다. 여기 값은 정의가 없을 때의 기본값이다.
  custom: {
    label: '내 불꽃', pattern: 'sphere', starsAt5: 100, starLife: 2, starMm: 15, spreadScale: 1,
    starSize: 5, tail: 'none', ember: false, glitter: false, split: false,
  },
  crackle: {
    label: '크래클', pattern: 'sphere', starsAt5: 80, starLife: 1.6, starMm: 12, spreadScale: 0.85,
    starSize: 4, tail: 'none', ember: false, glitter: false, split: false, effect: 'crackle',
  },
  brocade: {
    label: '브로케이드', pattern: 'sphere', starsAt5: 90, starLife: 3.2, starMm: 20, starDensity: 800, spreadScale: 0.9,
    starSize: 5.5, tail: 'willow', ember: true, glitter: false, split: false,
  },
  fish: {
    label: '피시', pattern: 'sphere', starsAt5: 40, starLife: 1.8, starMm: 10, spreadScale: 0.7,
    starSize: 3.5, tail: 'none', ember: false, glitter: false, split: false, effect: 'fish',
  },
  hummer: {
    label: '허머', pattern: 'sphere', starsAt5: 24, starLife: 2.0, starMm: 12, spreadScale: 0.7,
    starSize: 4, tail: 'none', ember: false, glitter: false, split: false, effect: 'hummer',
  },
  // 낙엽: 실제로는 얇은 판에 약제를 입힌 것이라 작게 터져 천천히 팔랑이며 떨어진다.
  leaves: {
    label: '낙엽', pattern: 'sphere', starsAt5: 60, starLife: 4.0, starMm: 6, starDensity: 400, spreadScale: 0.25,
    starSize: 4.5, tail: 'none', ember: true, glitter: false, split: false, effect: 'leaf',
  },
  salute: {
    label: '살루트', pattern: 'sphere', starsAt5: 30, starLife: 0.25, starMm: 5, spreadScale: 0.35,
    starSize: 3, tail: 'none', ember: false, glitter: false, split: false, salute: true,
  },
  whistle: {
    label: '휘슬', pattern: 'sphere', starsAt5: 16, starLife: 1.6, starMm: 15, spreadScale: 0.8,
    starSize: 3.5, tail: 'spark', ember: false, glitter: false, split: false, effect: 'whistle',
  },
  // 케이크 한 발. 높이와 지름은 크기표 대신 shellSize()에서 정한다.
  cake: {
    label: '케이크', pattern: 'sphere', starsAt5: 22, starLife: 1.1, starMm: 10, spreadScale: 1,
    starSize: 4, tail: 'spark', ember: true, glitter: false, split: false,
  },
};

/** 기본 상품 (내 불꽃 제외) */
export const SHELL_TYPES = (Object.keys(SHELLS) as ShellType[]).filter((t) => t !== 'custom');

/** 팔레트에 보여 줄 순서 */
export const FIREWORK_TYPES: FireworkType[] = [...SHELL_TYPES, 'niagara', 'lancework', 'drones'];

/** 쇼 파일에 쓸 수 있는 모든 종류 (공유 링크의 번호 순서. 뒤에만 더한다) */
export const ALL_TYPES: FireworkType[] = [
  'chrysanthemum', 'peony', 'willow', 'palm', 'ring', 'crossette', 'heart', 'star', 'smile', 'cake',
  'niagara', 'lancework', 'custom',
  'crackle', 'brocade', 'fish', 'hummer', 'leaves', 'salute', 'whistle',
  'drones',
];

const SPECIAL_LABEL = { niagara: '나이아가라', lancework: '지상 틀불꽃', drones: '드론 쇼' } as const;

export function typeLabel(t: FireworkType): string {
  return t === 'niagara' || t === 'lancework' || t === 'drones' ? SPECIAL_LABEL[t] : SHELLS[t].label;
}

export function isShell(t: FireworkType): t is ShellType {
  return t !== 'niagara' && t !== 'lancework' && t !== 'drones';
}

// 케이크 한 발. 실제 케이크 통은 굵어야 지름 10cm 안쪽이라 3호까지만 있다. 예전 쇼에 저장된 큰 호수도 3호로 쏜다.
// 상승 시간은 3호 알이 이 높이까지 오르는 계산값(flight.ts)이다. 실측 자료는 찾지 못했다.
export const CAKE_SIZE: Size = 3;
const CAKE_SPEC: SizeSpec = { height: 62, spread: 41, prefire: 3 };

/** 불꽃 종류와 크기에 맞는 높이·지름·상승 시간. 케이크는 낮게 터진다. */
export function shellSize(type: ShellType, size: Size): SizeSpec {
  if (type === 'cake') return CAKE_SPEC;
  return SIZE_SPECS[size];
}

export function starCount(type: ShellType, size: Size): number {
  const exp = SHELLS[type].pattern === 'sphere' ? 1.1 : 0.5;
  return Math.max(6, Math.round(SHELLS[type].starsAt5 * Math.pow(size / 5, exp)));
}

/** 같은 종류의 별이 호수에 따라 커지는 비율 (5호가 1). 같은 논문의 호수별 별 지름 3호 12·5호 15·10호 22mm, 7호는 그 사이 값. */
export function starScale(size: Size): number {
  return { 3: 12 / 15, 5: 1, 7: 18 / 15, 10: 22 / 15 }[size];
}

/** 이 호수에 든 별이 타는 시간(초). 타는 시간은 별 지름에 비례한다 (같은 논문). */
export function starLifeOf(type: ShellType, size: Size): number {
  return SHELLS[type].starLife * starScale(type === 'cake' ? CAKE_SIZE : size);
}

/** 하늘 불꽃 한 발이 터진 뒤 눈에 보이는 시간(초) */
export function visibleLength(type: ShellType, size: Size = 5): number {
  const life = starLifeOf(type, size);
  return SHELLS[type].split ? life + 1.1 : life;
}
