// 상품 카탈로그. 실제 연출가가 제조사 카탈로그에서 상품을 고르듯,
// 불꽃의 크기·상승 시간·별 개수 같은 값은 쇼 파일이 아니라 여기에 둔다.

export type Size = 3 | 5 | 7 | 10;

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

export type ShellType = 'chrysanthemum' | 'peony' | 'willow';

export type Tail = 'none' | 'spark' | 'willow';

export interface ShellSpec {
  label: string;
  /** 5호 기준 별 개수 */
  starsAt5: number;
  /** 별이 사는 시간(초) */
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
}

export const SHELLS: Record<ShellType, ShellSpec> = {
  chrysanthemum: {
    label: '국화',
    starsAt5: 110,
    starLife: 2.1,
    drag: 1.6,
    spreadScale: 1,
    starSize: 5,
    tail: 'spark',
    ember: true,
    glitter: true,
  },
  peony: {
    label: '모란',
    starsAt5: 140,
    starLife: 1.5,
    drag: 1.8,
    spreadScale: 0.95,
    starSize: 5.5,
    tail: 'none',
    ember: false,
    glitter: false,
  },
  willow: {
    label: '버들',
    starsAt5: 70,
    starLife: 4.5,
    drag: 0.9,
    spreadScale: 0.75,
    starSize: 3.2,
    tail: 'willow',
    ember: true,
    glitter: false,
  },
};

export function starCount(type: ShellType, size: Size): number {
  return Math.round(SHELLS[type].starsAt5 * Math.pow(size / 5, 1.1));
}
