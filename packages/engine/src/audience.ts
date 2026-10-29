// 관객 반응: 큰 불꽃이나 촘촘한 순간에 함성, 홀로 크게 피는 불꽃엔 「오~」, 피날레가 시작되면 큰 환호, 쇼가 끝나면 박수.
// 터지는 시각과 크기만 보고 정하므로 같은 쇼면 늘 같은 때에 함성이 나온다.

import { isShell } from './catalog.ts';
import type { Launch } from './show.ts';

export interface CrowdCue {
  t: number;
  kind: 'cheer' | 'applause' | 'ooh';
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
  const near = (t: number, gap: number) => out.some((c) => Math.abs(c.t - t) < gap);
  // 홀로 크게 피는 불꽃(7호 넘게)에는 감탄 「오~」
  for (const l of bursts) {
    if (isShell(l.type) && l.type !== 'cake' && l.size >= 7 && l.sub === 0 && !near(l.burstAt + 0.4, 1.5)) {
      out.push({ t: l.burstAt + 0.4, kind: 'ooh', level: l.size >= 10 ? 1 : 0.7 });
    }
  }
  if (bursts.length) {
    // 피날레(마지막 15%)가 시작되면 큰 환호
    const end = bursts[bursts.length - 1].burstAt;
    const fin = bursts.find((l) => l.burstAt >= end * 0.85);
    if (fin && end > 20 && !near(fin.burstAt + 0.35, 3)) out.push({ t: fin.burstAt + 0.35, kind: 'cheer', level: 1 });
    out.push({ t: end + 2.5, kind: 'applause', level: 1 });
  }
  return out.sort((a, b) => a.t - b.t);
}
