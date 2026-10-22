// 발사장 설계: 연출가처럼 평면도에서 바지선·다리·지상 틀 자리를 정한다.
// 크기마다 관람객과 떨어져야 하는 안전거리가 있다 (실제 규정을 단순하게 본뜬 게임용 값).

import { isShell, type Size } from './catalog.ts';
import type { Launcher, Show, Vec3 } from './show.ts';
import { VENUES, waterSpan, type Venue } from './venues.ts';

/** 크기별 관람객 안전거리(m): 대략 알 지름의 크기만큼 */
export const SAFETY_RADIUS: Record<Size, number> = { 3: 100, 5: 170, 7: 220, 10: 280 };

/** 바지선끼리 적어도 이만큼 떨어져야 한다(m) */
export const MIN_BARGE_GAP = 40;

export interface SiteWarning {
  launcher: string;
  level: 'warn' | 'error';
  message: string;
}

/** 이 발사 위치에서 쏘는 가장 큰 알 (없으면 null) */
export function largestSizeAt(show: Show, launcherId: string): Size | null {
  let best: Size | null = null;
  for (const c of show.cues) if (c.at === launcherId && isShell(c.type) && (best === null || c.size > best)) best = c.size;
  return best;
}

const label = (l: Launcher, show: Show) =>
  l.kind === 'barge' ? `바지선 ${l.id.match(/\d+/)?.[0] ?? show.launchers.indexOf(l) + 1}` : l.kind === 'bridge' ? '다리' : '지상 틀';

/** 평면도 점검: 물 위에 있는지, 관람석과 안전거리, 바지선 간격 */
export function siteCheck(show: Show): SiteWarning[] {
  const venue = VENUES[show.venue.preset];
  if (!venue) return [];
  const [near, far] = waterSpan(venue);
  const out: SiteWarning[] = [];
  const barges = show.launchers.filter((l) => l.kind === 'barge');
  for (const l of show.launchers) {
    const name = label(l, show);
    if (l.kind !== 'bridge' && (l.pos[2] < near + 10 || l.pos[2] > far - 10)) {
      out.push({ launcher: l.id, level: 'error', message: `${name}이 물 밖에 있습니다. 물 위로 옮기세요.` });
    }
    if (l.kind !== 'barge') continue;
    const size = largestSizeAt(show, l.id);
    if (size) {
      const r = SAFETY_RADIUS[size];
      const shore = l.pos[2] - near;
      if (shore < r) out.push({ launcher: l.id, level: 'warn', message: `${name}: ${size}호 안전거리 ${r}m인데 관람석 물가까지 ${Math.round(shore)}m입니다.` });
      for (const seat of Object.values(venue.seats)) {
        if (seat.plan) continue;
        const d = Math.hypot(seat.eye[0] - l.pos[0], seat.eye[2] - l.pos[2]);
        if (d < r) out.push({ launcher: l.id, level: 'warn', message: `${name}: 「${seat.label}」 관람석이 ${size}호 안전거리 ${r}m 안(${Math.round(d)}m)에 있습니다.` });
      }
    }
    for (const o of barges) {
      if (o.id <= l.id) continue;
      const d = Math.hypot(o.pos[0] - l.pos[0], o.pos[2] - l.pos[2]);
      if (d < MIN_BARGE_GAP) out.push({ launcher: l.id, level: 'warn', message: `${name}과 ${label(o, show)}이 ${Math.round(d)}m로 너무 가깝습니다 (${MIN_BARGE_GAP}m 이상).` });
    }
  }
  return out;
}

/** 바지선 하나를 더한다. 다른 바지선과 겹치지 않는 물 위 자리에 놓는다. */
export function addBarge(show: Show): string {
  const venue = VENUES[show.venue.preset];
  const used = new Set(show.launchers.map((l) => l.id));
  let n = 1;
  while (used.has(`barge-${n}`)) n++;
  const id = `barge-${n}`;
  const barges = show.launchers.filter((l) => l.kind === 'barge');
  const z = barges.length ? barges.reduce((s, l) => s + l.pos[2], 0) / barges.length : 0;
  // 가장 오른쪽 바지선 옆, 없으면 가운데
  const x = barges.length ? Math.max(...barges.map((l) => l.pos[0])) + 180 : 0;
  const pos = clampToWater(venue, [x, 0, z]);
  // 바지선 줄은 다리·지상 틀 줄보다 위에 모아 둔다.
  const at = show.launchers.findIndex((l) => l.kind !== 'barge');
  const l: Launcher = { id, kind: 'barge', pos };
  if (at < 0) show.launchers.push(l);
  else show.launchers.splice(at, 0, l);
  return id;
}

/** 바지선을 뺀다. 거기 놓인 불꽃은 가장 가까운 다른 바지선으로 옮긴다. 마지막 하나는 뺄 수 없다. */
export function removeBarge(show: Show, id: string): boolean {
  const l = show.launchers.find((x) => x.id === id && x.kind === 'barge');
  const others = show.launchers.filter((x) => x.kind === 'barge' && x.id !== id);
  if (!l || !others.length) return false;
  const nearest = others.reduce((a, b) => (Math.hypot(a.pos[0] - l.pos[0], a.pos[2] - l.pos[2]) <= Math.hypot(b.pos[0] - l.pos[0], b.pos[2] - l.pos[2]) ? a : b));
  for (const c of show.cues) if (c.at === id) c.at = nearest.id;
  show.launchers = show.launchers.filter((x) => x !== l);
  if (show.rig) delete show.rig.decks[id];
  return true;
}

function clampToWater(venue: Venue | undefined, p: Vec3): Vec3 {
  if (!venue) return p;
  const [near, far] = waterSpan(venue);
  return [Math.max(-1600, Math.min(1600, p[0])), p[1], Math.max(near + 30, Math.min(Math.min(far, 2400) - 30, p[2]))];
}

/** 발사 위치를 평면도의 (x, z)로 옮긴다. 다리 나이아가라는 다리를 따라 옆으로만 움직인다. */
export function moveLauncher(show: Show, id: string, x: number, z: number): void {
  const l = show.launchers.find((s) => s.id === id);
  if (!l) return;
  const venue = VENUES[show.venue.preset];
  const r = (v: number) => Math.round(v);
  if (l.kind === 'bridge') {
    const dx = r(x) - l.pos[0];
    const b = venue?.bridge;
    const half = l.from && l.to ? (l.to[0] - l.from[0]) / 2 : 0;
    const lo = (b?.x0 ?? -2000) + half;
    const hi = (b?.x1 ?? 2000) - half;
    const nx = Math.max(lo, Math.min(hi, l.pos[0] + dx));
    const shift = nx - l.pos[0];
    l.pos = [nx, l.pos[1], l.pos[2]];
    if (l.from) l.from = [l.from[0] + shift, l.from[1], l.from[2]];
    if (l.to) l.to = [l.to[0] + shift, l.to[1], l.to[2]];
    return;
  }
  const p = clampToWater(venue, [x, l.pos[1], z]);
  l.pos = [r(p[0]), p[1], r(p[2])];
}

/** 무대의 기본 발사 위치로 되돌린다 (없어진 바지선의 불꽃은 가까운 바지선으로) */
export function resetSite(show: Show): void {
  const venue = VENUES[show.venue.preset];
  if (!venue) return;
  show.launchers = structuredClone(venue.launchers);
  const ids = new Set(show.launchers.map((l) => l.id));
  const first = show.launchers.find((l) => l.kind === 'barge')!;
  for (const c of show.cues) if (!ids.has(c.at)) c.at = first.id;
  if (show.rig) for (const id of Object.keys(show.rig.decks)) if (!ids.has(id)) delete show.rig.decks[id];
}
