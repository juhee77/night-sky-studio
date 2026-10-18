// 관객 반응: 큰 불꽃이나 촘촘한 순간에 함성, 쇼가 끝나면 박수.
// 터지는 시각과 크기만 보고 정하므로 같은 쇼면 늘 같은 때에 함성이 나온다.

import { isShell } from './catalog.ts';
import type { Launch } from './show.ts';

export interface CrowdCue {
  t: number;
  kind: 'cheer' | 'applause';
  /** 0~1 */
  level: number;
}

/** 한 발이 분위기를 얼마나 끌어올리는지 */
function weight(l: Launch): number {
  if (l.type === 'niagara' || l.type === 'lancework') return 1.5;
  if (l.type === 'cake') return 0.25;
  return isShell(l.type) ? { 3: 0.4, 5: 0.8, 7: 1.4, 10: 2.5 }[l.size] : 0;
}

export function audienceCues(launches: Launch[]): CrowdCue[] {
  const bursts = [...launches].sort((a, b) => a.burstAt - b.burstAt);
  const out: CrowdCue[] = [];
  let lastCheer = -Infinity;
  let start = 0;
  let sum = 0;
  for (let i = 0; i < bursts.length; i++) {
    const t = bursts[i].burstAt;
    sum += weight(bursts[i]);
    while (bursts[start].burstAt < t - 1.5) sum -= weight(bursts[start++]);
    if (sum >= 2.4 && t - lastCheer > 3) {
      out.push({ t: t + 0.35, kind: 'cheer', level: Math.min(1, sum / 6) });
      lastCheer = t;
    }
  }
  if (bursts.length) out.push({ t: bursts[bursts.length - 1].burstAt + 2.5, kind: 'applause', level: 1 });
  return out;
}
