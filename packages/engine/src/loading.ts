// 장전 계획: 시간표의 불꽃 한 발 한 발을 갑판의 통에 배정한다.
// 전자 점화 쇼는 한 발에 통 하나를 쓰고, 쇼 중에 다시 넣지 않는다.
// 케이크는 상자 하나가 여러 발을 쏘므로 케이크 자리 하나를 쓴다.

import { isShell, typeLabel } from './catalog.ts';
import { RACKS, allTubes, placeRack, type PlacedRack, type RackKind, type Rig, type Tube } from './rig.ts';
import { expandShow, type Cue, type Launch, type Show } from './show.ts';

/** 통 각도와 불꽃 각도가 이만큼 안이면 맞는 통이다(도) */
export const ANGLE_TOLERANCE = 2.5;

export interface LoadRow {
  /** cue 번호와 부채꼴 안의 번호 */
  cueIndex: number;
  sub: number;
  fireAt: number;
  launcher: string;
  label: string;
  size: number;
  angle: number;
  cake: boolean;
  tube: string | null;
  /** 손으로 고른 통인지 */
  manual: boolean;
}

export interface LoadPlan {
  rows: LoadRow[];
  shortages: string[];
  /** 통 id → 장전된 줄 */
  byTube: Map<string, LoadRow>;
}

/** 갑판에서 쏘는 발사들 (케이크는 cue마다 한 줄) */
function bargeLaunches(show: Show): Launch[] {
  const barges = new Set(show.launchers.filter((l) => l.kind === 'barge').map((l) => l.id));
  const out: Launch[] = [];
  const seenCake = new Set<number>();
  for (const l of expandShow(show).launches) {
    const cue = show.cues[l.cueIndex];
    if (!cue || !barges.has(cue.at) || !isShell(l.type)) continue;
    if (l.type === 'cake') {
      if (seenCake.has(l.cueIndex)) continue;
      seenCake.add(l.cueIndex);
    }
    out.push(l);
  }
  return out;
}

export function fits(t: Tube, cue: Cue, l: Launch): boolean {
  if (t.launcher !== cue.at) return false;
  if (l.type === 'cake') return t.kind === 'cake';
  return t.size === l.size && Math.abs(t.angle - l.angle) <= ANGLE_TOLERANCE;
}

/** 장전 계획: 손으로 고른 통을 먼저 지키고, 나머지는 시각 순서대로 맞는 빈 통에 넣는다. */
export function loadPlan(show: Show): LoadPlan {
  const tubes = allTubes(show.rig);
  const byId = new Map(tubes.map((t) => [t.id, t]));
  const used = new Set<string>();
  const launches = bargeLaunches(show);
  const rows: LoadRow[] = launches.map((l) => {
    const cue = show.cues[l.cueIndex];
    return {
      cueIndex: l.cueIndex,
      sub: l.sub,
      fireAt: l.fireAt,
      launcher: cue.at,
      label: typeLabel(cue.type === 'custom' && l.customDef ? 'custom' : cue.type) + (l.customDef ? ` 「${l.customDef.name}」` : ''),
      size: l.size,
      angle: l.angle,
      cake: l.type === 'cake',
      tube: null,
      manual: false,
    };
  });
  // 손으로 고른 통
  rows.forEach((r, i) => {
    const want = show.cues[r.cueIndex].tubes?.[r.cake ? 0 : r.sub];
    const t = want ? byId.get(want) : undefined;
    if (t && !used.has(t.id) && fits(t, show.cues[r.cueIndex], launches[i])) {
      r.tube = t.id;
      r.manual = true;
      used.add(t.id);
    }
  });
  // 나머지: 부채꼴은 같은 랙의 통을 우선한다.
  const lastRack = new Map<number, string>();
  rows.forEach((r, i) => {
    if (r.tube) {
      lastRack.set(r.cueIndex, byId.get(r.tube)!.rack);
      return;
    }
    const cue = show.cues[r.cueIndex];
    const cands = tubes.filter((t) => !used.has(t.id) && fits(t, cue, launches[i]));
    const prefer = lastRack.get(r.cueIndex);
    const t = cands.find((x) => x.rack === prefer) ?? cands[0];
    if (t) {
      r.tube = t.id;
      used.add(t.id);
      lastRack.set(r.cueIndex, t.rack);
    }
  });
  return { rows, shortages: shortages(show, rows), byTube: new Map(rows.filter((r) => r.tube).map((r) => [r.tube!, r])) };
}

function shortages(show: Show, rows: LoadRow[]): string[] {
  const groups = new Map<string, number>();
  for (const r of rows) {
    if (r.tube) continue;
    const name = barge(show, r.launcher);
    const cue = show.cues[r.cueIndex];
    let key: string;
    if (r.cake) key = `${name}: 케이크 자리`;
    else if (cue.fan && cue.fan.count > 1) key = `${name}: ${r.size}호 부채꼴 ${cue.fan.spread}도 랙`;
    else if (r.angle) key = `${name}: 기울기 ${r.angle}도 ${r.size}호 통`;
    else key = `${name}: ${r.size}호 통`;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  return [...groups].map(([k, n]) => (k.endsWith('랙') ? `${k} 없음 (${n}발)` : `${k} ${n}개 부족`));
}

const barge = (_show: Show, id: string) => `바지선 ${id.match(/\d+/)?.[0] ?? id}`;

/** 쇼에 맞게 랙을 채운다: 바지선마다 크기·각도별로 필요한 만큼. 자리가 모자라면 못 실은 랙을 알려 준다. */
export function rigForShow(show: Show): { rig: Rig; missing: string[] } {
  const rig: Rig = { decks: {} };
  const missing: string[] = [];
  const need = new Map<string, { launcher: string; kind: RackKind; tilt: number; spread?: number; count: number }>();
  for (const l of bargeLaunches(show)) {
    const cue = show.cues[l.cueIndex];
    let kind: RackKind;
    let tilt = Math.round(cue.angle ?? 0);
    let spread: number | undefined;
    if (l.type === 'cake') kind = 'cake';
    else if (l.size === 3) kind = 'r3x10';
    else if (l.size === 5 && cue.fan && cue.fan.count > 1) {
      // 부채꼴은 cue마다 따로 랙 하나 (각도가 다르면 다른 랙)
      kind = 'fan5';
      spread = cue.fan.spread;
      if (l.sub > 0) continue;
      const key = `${cue.at}|fan|${tilt}|${spread}|${l.cueIndex}`;
      need.set(key, { launcher: cue.at, kind, tilt, spread, count: 5 });
      continue;
    } else if (l.size === 5) kind = 'r5x5';
    else if (l.size === 7) kind = 'single7';
    else kind = 'single10';
    if (kind !== 'cake' && l.angle !== (cue.angle ?? 0)) tilt = Math.round(l.angle);
    const key = `${cue.at}|${kind}|${tilt}`;
    const cur = need.get(key) ?? { launcher: cue.at, kind, tilt, count: 0 };
    cur.count++;
    need.set(key, cur);
  }
  // 같은 부채꼴(같은 기울기·펼침)은 한 랙을 여러 cue가 나눠 쓸 수 없다: cue마다 랙 하나 (위에서 이미 그렇게 셌다)
  const order: RackKind[] = ['single10', 'single7', 'fan5', 'r5x5', 'r3x10', 'cake'];
  const items = [...need.values()].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  for (const n of items) {
    const deck = (rig.decks[n.launcher] ??= []);
    const per = n.kind === 'fan5' ? n.count : RACKS[n.kind].tubes;
    const racks = n.kind === 'fan5' ? 1 : Math.ceil(n.count / per);
    for (let k = 0; k < racks; k++) {
      const r: PlacedRack | null = placeRack(deck, n.kind, n.tilt, n.spread);
      if (!r) {
        missing.push(`${barge(show, n.launcher)}: ${RACKS[n.kind].label}${n.tilt ? ` (기울기 ${n.tilt}도)` : ''} ${racks - k}개를 실을 자리가 없습니다.`);
        break;
      }
      deck.push(r);
    }
  }
  return { rig, missing };
}
