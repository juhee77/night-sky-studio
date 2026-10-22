// 지상 틀 그림: 글자 대신 칸 그림(로고)을 틀불꽃 심지로 세운다.
// 그림은 w×h 칸의 켜짐/꺼짐이고, 공유 링크에는 칸을 비트로 줄여 담는다.

import type { TextShape } from './text.ts';

export interface FrameArt {
  w: number;
  h: number;
  /** 칸마다 켜짐(1)/꺼짐(0)을 위에서부터 한 줄씩, base64url로 줄인 것 */
  cells: string;
}

export const ART_MAX_W = 48;
export const ART_MAX_H = 24;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** 칸 배열(위에서부터 줄마다) → 그림 */
export function encodeArt(w: number, h: number, on: boolean[]): FrameArt {
  let cells = '';
  for (let i = 0; i < w * h; i += 6) {
    let v = 0;
    for (let k = 0; k < 6; k++) if (on[i + k]) v |= 1 << (5 - k);
    cells += B64[v];
  }
  return { w, h, cells };
}

export function decodeArt(a: FrameArt): boolean[] {
  const out: boolean[] = new Array(a.w * a.h).fill(false);
  for (let c = 0; c < a.cells.length; c++) {
    const v = B64.indexOf(a.cells[c]);
    if (v < 0) continue;
    for (let k = 0; k < 6; k++) {
      const i = c * 6 + k;
      if (i < out.length) out[i] = !!(v & (1 << (5 - k)));
    }
  }
  return out;
}

export function artCount(a: FrameArt): number {
  return decodeArt(a).filter(Boolean).length;
}

/** 틀불꽃 심지 자리: 높이를 1로 두고 y는 위쪽이 + (글자와 같은 모양) */
export function artShape(a: FrameArt): TextShape {
  const on = decodeArt(a);
  const points: [number, number][] = [];
  for (let r = 0; r < a.h; r++) for (let c = 0; c < a.w; c++) if (on[r * a.w + c]) points.push([c / (a.h - 1 || 1), (a.h - 1 - r) / (a.h - 1 || 1)]);
  return { points, width: (a.w - 1) / (a.h - 1 || 1) };
}

export function normalizeArt(raw: FrameArt): FrameArt | undefined {
  const w = Math.round(Math.min(ART_MAX_W, Math.max(2, Number(raw?.w) || 0)));
  const h = Math.round(Math.min(ART_MAX_H, Math.max(2, Number(raw?.h) || 0)));
  const cells = String(raw?.cells ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, Math.ceil((w * h) / 6));
  return cells ? { w, h, cells } : undefined;
}

/** 공유 링크용 한 줄: "w×h:칸" */
export const artToString = (a: FrameArt) => `${a.w}x${a.h}:${a.cells}`;
export function artFromString(s: string): FrameArt | undefined {
  const m = /^(\d+)x(\d+):([A-Za-z0-9_-]*)$/.exec(s);
  return m ? normalizeArt({ w: Number(m[1]), h: Number(m[2]), cells: m[3] }) : undefined;
}

/** 시작용 그림 */
export const ART_PRESETS: Record<string, () => FrameArt> = {
  하트: () => fromRows([
    '..XX...XX..',
    '.XXXX.XXXX.',
    'XXXXXXXXXXX',
    'XXXXXXXXXXX',
    '.XXXXXXXXX.',
    '..XXXXXXX..',
    '...XXXXX...',
    '....XXX....',
    '.....X.....',
  ]),
  별: () => fromRows([
    '.....X.....',
    '....XXX....',
    'XXXXXXXXXXX',
    '.XXXXXXXXX.',
    '..XXXXXXX..',
    '..XXX.XXX..',
    '.XX.....XX.',
  ]),
  '웃는 얼굴': () => fromRows([
    '...XXXXX...',
    '.XX.....XX.',
    'X..X...X..X',
    'X.........X',
    'X.X.....X.X',
    'X..XXXXX..X',
    '.XX.....XX.',
    '...XXXXX...',
  ]),
};

function fromRows(rows: string[]): FrameArt {
  const w = rows[0].length;
  return encodeArt(w, rows.length, rows.join('').split('').map((c) => c === 'X'));
}
