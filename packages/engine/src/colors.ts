// 별 색 8가지. 값은 화면에서 더해질 빛의 세기라 1을 조금 넘어도 된다.

export type ColorName = 'gold' | 'white' | 'red' | 'green' | 'blue' | 'pink' | 'cyan' | 'purple';

export type Rgb = readonly [number, number, number];

export const COLORS: Record<ColorName, Rgb> = {
  gold: [1.0, 0.72, 0.3],
  white: [0.95, 0.93, 1.0],
  red: [1.0, 0.22, 0.18],
  green: [0.35, 1.0, 0.45],
  blue: [0.3, 0.45, 1.0],
  pink: [1.0, 0.45, 0.75],
  cyan: [0.4, 0.9, 1.0],
  purple: [0.7, 0.4, 1.0],
};

export const COLOR_NAMES = Object.keys(COLORS) as ColorName[];
