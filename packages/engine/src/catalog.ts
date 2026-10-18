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

export type ShellType = 'chrysanthemum' | 'peony' | 'willow' | 'palm' | 'ring' | 'crossette' | 'heart';

/** 별을 처음에 어떻게 흩뿌리는가 */
export type Pattern = 'sphere' | 'ring' | 'palm' | 'heart';

export type Tail = 'none' | 'spark' | 'willow' | 'palm';

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
}

export const SHELLS: Record<ShellType, ShellSpec> = {
  chrysanthemum: {
    label: '국화', pattern: 'sphere', starsAt5: 110, starLife: 2.1, drag: 1.6, spreadScale: 1,
    starSize: 5, tail: 'spark', ember: true, glitter: true, split: false,
  },
  peony: {
    label: '모란', pattern: 'sphere', starsAt5: 140, starLife: 1.5, drag: 1.8, spreadScale: 0.95,
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
};

export const SHELL_TYPES = Object.keys(SHELLS) as ShellType[];

export function starCount(type: ShellType, size: Size): number {
  const exp = SHELLS[type].pattern === 'sphere' ? 1.1 : 0.5;
  return Math.max(6, Math.round(SHELLS[type].starsAt5 * Math.pow(size / 5, exp)));
}

/** 시간표에 그릴 불꽃 길이(초): 터진 뒤 눈에 보이는 시간 */
export function visibleLength(type: ShellType): number {
  const s = SHELLS[type];
  return s.split ? s.starLife + 1.1 : s.starLife;
}
