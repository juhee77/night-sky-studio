// 실전 모드: 켜면 하드웨어까지 맞춰야 쏠 수 있다. 끄면 지금처럼 자유롭게 연출한다.
//   장전되지 않은 불꽃은 쏘지 않고, 선이 끊긴 핀의 불꽃도 나가지 않는다 (회로 점검으로 고칠 수 있다).
//   장전된 불꽃은 갑판 위 실제 통 자리에서, 통 각도로 쏘아 올린다.

import { loadPlan } from './loading.ts';
import { allTubes, tubeWorldPos } from './rig.ts';
import type { Launch, Show, ShowWarning } from './show.ts';
import { wirePlan } from './wiring.ts';
import { siteBlock } from './site.ts';

export interface Blocked {
  cueIndex: number;
  sub: number;
  reason: string;
}

export function isLive(show: Show): boolean {
  return !!show.rig?.live;
}

/** 실전 모드에서 실제로 쏘아지는 발사와, 쏘아지지 않는 발사와 그 이유 */
export function applyLive(show: Show, launches: Launch[]): { launches: Launch[]; blocked: Blocked[] } {
  if (!isLive(show)) return { launches, blocked: [] };
  const plan = loadPlan(show);
  const wiring = wirePlan(show, plan);
  const tubes = new Map(allTubes(show.rig).map((t) => [t.id, t]));
  const rows = new Map(plan.rows.map((r) => [`${r.cueIndex}:${r.sub}`, r]));
  const fires = new Map(wiring.fires.map((f) => [`${f.cueIndex}:${f.sub}`, f]));
  const faults = new Set(wiring.faults.map((f) => `${f.module}-${f.pin}`));
  const barges = new Map(show.launchers.filter((l) => l.kind === 'barge').map((l) => [l.id, l]));
  const out: Launch[] = [];
  const blocked: Blocked[] = [];
  for (const l of launches) {
    const cue = show.cues[l.cueIndex];
    // 케이크는 상자 하나: 첫 발의 통과 핀을 따른다.
    const key = `${l.cueIndex}:${l.type === 'cake' ? 0 : l.sub}`;
    const barge = cue ? barges.get(cue.at) : undefined;
    let next = l;
    if (barge) {
      // 허가·안전거리·간격을 어긴 바지선의 불꽃은 쏘지 않는다.
      const why = siteBlock(show, barge.id, l.type === 'cake' ? null : l.size);
      if (why) {
        blocked.push({ cueIndex: l.cueIndex, sub: l.sub, reason: why });
        continue;
      }
      const row = rows.get(key);
      const tube = row?.tube ? tubes.get(row.tube) : undefined;
      if (!tube) {
        blocked.push({ cueIndex: l.cueIndex, sub: l.sub, reason: l.type === 'cake' ? '케이크 자리가 없습니다' : `맞는 ${l.size}호 통이 없습니다` });
        continue;
      }
      next = {
        ...l,
        origin: tubeWorldPos(barge.pos, tube),
        ...(l.type === 'cake' ? {} : { angle: tube.angle }),
      };
    }
    const fire = fires.get(key);
    if (fire?.module && faults.has(`${fire.module}-${fire.pin}`)) {
      blocked.push({ cueIndex: l.cueIndex, sub: l.sub, reason: `모듈 ${fire.module} 핀 ${fire.pin} 선이 끊겨 불이 붙지 않습니다` });
      continue;
    }
    out.push(next);
  }
  return { launches: out, blocked };
}

/** 쏘아지지 않는 불꽃을 시간표 경고로 (불꽃마다 한 번) */
export function liveWarnings(blocked: Blocked[]): ShowWarning[] {
  const seen = new Set<number>();
  const out: ShowWarning[] = [];
  for (const b of blocked) {
    if (seen.has(b.cueIndex)) continue;
    seen.add(b.cueIndex);
    const n = blocked.filter((x) => x.cueIndex === b.cueIndex).length;
    out.push({ cueIndex: b.cueIndex, message: `실전 모드: ${b.reason}${n > 1 ? ` (${n}발)` : ''}.` });
  }
  return out;
}
