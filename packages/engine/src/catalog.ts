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

// 기획안의 참고값. 화면에서 보기 좋게 조정할 수 있다.
export const SIZE_SPECS: Record<Size, SizeSpec> = {
  3: { height: 120, spread: 60, prefire: 3 },
  5: { height: 190, spread: 170, prefire: 4 },
  7: { height: 250, spread: 240, prefire: 5 },
  10: { height: 330, spread: 320, prefire: 6 },
};

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
  /** 공기 저항(1/s). 클수록 빨리 멈추고 천천히 떨어진다. */
  drag: number;
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

export const SHELLS: Record<ShellType, ShellSpec> = {
  chrysanthemum: {
    label: '국화', pattern: 'sphere', starsAt5: 110, starLife: 2.1, drag: 1.6, spreadScale: 1,
    starSize: 5, tail: 'spark', ember: true, glitter: true, split: false,
  },
  peony: {
    label: '모란', pattern: 'sphere', starsAt5: 140, starLife: 1.8, drag: 1.8, spreadScale: 0.95,
    starSize: 5.5, tail: 'none', ember: false, glitter: false, split: false,
  },
  willow: {
    label: '버들', pattern: 'sphere', starsAt5: 70, starLife: 4.5, drag: 0.9, spreadScale: 0.75,
    starSize: 3.2, tail: 'willow', ember: true, glitter: false, split: false,
  },
  palm: {
    label: '야자', pattern: 'palm', starsAt5: 10, starLife: 2.6, drag: 1.0, spreadScale: 0.85,
    starSize: 7, tail: 'palm', ember: true, glitter: false, split: false,
  },
  ring: {
    label: '링', pattern: 'ring', starsAt5: 64, starLife: 1.6, drag: 1.8, spreadScale: 0.9,
    starSize: 5.5, tail: 'none', ember: false, glitter: false, split: false,
  },
  crossette: {
    label: '크로세트', pattern: 'sphere', starsAt5: 18, starLife: 0.9, drag: 1.2, spreadScale: 0.55,
    starSize: 5, tail: 'spark', ember: false, glitter: false, split: true,
  },
  heart: {
    label: '하트', pattern: 'heart', starsAt5: 52, starLife: 1.7, drag: 1.8, spreadScale: 0.8,
    starSize: 5.5, tail: 'none', ember: false, glitter: false, split: false,
  },
  star: {
    label: '별', pattern: 'star', starsAt5: 50, starLife: 1.7, drag: 1.8, spreadScale: 0.85,
    starSize: 5.5, tail: 'none', ember: false, glitter: false, split: false,
  },
  smile: {
    label: '웃는 얼굴', pattern: 'smile', starsAt5: 56, starLife: 1.7, drag: 1.8, spreadScale: 0.85,
    starSize: 5.5, tail: 'none', ember: false, glitter: false, split: false,
  },
  // 내 불꽃: 실제 모양은 쇼에 담긴 정의(CustomShell)로 정한다. 여기 값은 정의가 없을 때의 기본값이다.
  custom: {
    label: '내 불꽃', pattern: 'sphere', starsAt5: 100, starLife: 2, drag: 1.6, spreadScale: 1,
    starSize: 5, tail: 'none', ember: false, glitter: false, split: false,
  },
  crackle: {
    label: '크래클', pattern: 'sphere', starsAt5: 80, starLife: 1.6, drag: 1.7, spreadScale: 0.85,
    starSize: 4, tail: 'none', ember: false, glitter: false, split: false, effect: 'crackle',
  },
  brocade: {
    label: '브로케이드', pattern: 'sphere', starsAt5: 90, starLife: 3.2, drag: 1.1, spreadScale: 0.9,
    starSize: 5.5, tail: 'willow', ember: true, glitter: false, split: false,
  },
  fish: {
    label: '피시', pattern: 'sphere', starsAt5: 40, starLife: 1.8, drag: 1.5, spreadScale: 0.7,
    starSize: 3.5, tail: 'none', ember: false, glitter: false, split: false, effect: 'fish',
  },
  hummer: {
    label: '허머', pattern: 'sphere', starsAt5: 24, starLife: 2.0, drag: 1.4, spreadScale: 0.7,
    starSize: 4, tail: 'none', ember: false, glitter: false, split: false, effect: 'hummer',
  },
  leaves: {
    label: '낙엽', pattern: 'sphere', starsAt5: 60, starLife: 4.0, drag: 2.6, spreadScale: 0.65,
    starSize: 4.5, tail: 'none', ember: true, glitter: false, split: false, effect: 'leaf',
  },
  salute: {
    label: '살루트', pattern: 'sphere', starsAt5: 30, starLife: 0.25, drag: 3, spreadScale: 0.35,
    starSize: 3, tail: 'none', ember: false, glitter: false, split: false, salute: true,
  },
  whistle: {
    label: '휘슬', pattern: 'sphere', starsAt5: 16, starLife: 1.6, drag: 1.0, spreadScale: 0.8,
    starSize: 3.5, tail: 'spark', ember: false, glitter: false, split: false, effect: 'whistle',
  },
  // 케이크 한 발. 높이와 지름은 크기표 대신 shellSize()에서 정한다.
  cake: {
    label: '케이크', pattern: 'sphere', starsAt5: 22, starLife: 1.1, drag: 2.2, spreadScale: 1,
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

/** 불꽃 종류와 크기에 맞는 높이·지름·상승 시간. 케이크는 낮게, 빨리 터진다. */
export function shellSize(type: ShellType, size: Size): SizeSpec {
  if (type === 'cake') return { height: 50 + size * 4, spread: 26 + size * 5, prefire: 1.5 };
  return SIZE_SPECS[size];
}

export function starCount(type: ShellType, size: Size): number {
  const exp = SHELLS[type].pattern === 'sphere' ? 1.1 : 0.5;
  return Math.max(6, Math.round(SHELLS[type].starsAt5 * Math.pow(size / 5, exp)));
}

/** 하늘 불꽃 한 발이 터진 뒤 눈에 보이는 시간(초) */
export function visibleLength(type: ShellType): number {
  const s = SHELLS[type];
  return s.split ? s.starLife + 1.1 : s.starLife;
}
