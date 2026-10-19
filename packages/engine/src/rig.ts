// 바지선 갑판 배치: 발사 기술자처럼 갑판 위에 랙(발사통 묶음)을 놓는다.
// 작은 알은 통 여러 개를 묶은 랙에, 큰 알은 모래 드럼에 묻은 단통에 넣는다.
// 부채꼴 랙은 만들 때 통 각도를 고정한다. 갑판의 넓이·무게 한도와 통 사이 안전 간격을 지켜야 한다.
// 실제 장비를 단순하게 본뜬 게임용 값이다.

import type { Size } from './catalog.ts';
import type { Show, Vec3 } from './show.ts';

export type RackKind = 'r3x10' | 'r5x5' | 'fan5' | 'single7' | 'single10' | 'cake';

export interface RackSpec {
  label: string;
  /** 넣는 알 크기 (케이크 자리는 null) */
  size: Size | null;
  tubes: number;
  /** 갑판 위 크기(m): 길이 × 폭 */
  len: number;
  wid: number;
  /** 무게(kg): 통·틀·모래 */
  kg: number;
  /** 다른 랙과 떨어져야 하는 거리(m) */
  gap: number;
}

export const RACKS: Record<RackKind, RackSpec> = {
  r3x10: { label: '3호 10연발 랙', size: 3, tubes: 10, len: 1.6, wid: 0.7, kg: 120, gap: 0.6 },
  r5x5: { label: '5호 5연발 랙', size: 5, tubes: 5, len: 1.8, wid: 0.6, kg: 200, gap: 0.6 },
  fan5: { label: '5호 부채꼴 랙 (각도 고정)', size: 5, tubes: 5, len: 2.0, wid: 0.8, kg: 220, gap: 0.6 },
  single7: { label: '7호 단통 (모래 드럼)', size: 7, tubes: 1, len: 0.9, wid: 0.9, kg: 400, gap: 2 },
  single10: { label: '10호 단통 (모래 드럼)', size: 10, tubes: 1, len: 1.2, wid: 1.2, kg: 800, gap: 2.5 },
  cake: { label: '케이크 자리', size: null, tubes: 1, len: 0.8, wid: 0.8, kg: 60, gap: 0.6 },
};

export const RACK_KINDS = Object.keys(RACKS) as RackKind[];

/** 바지선 갑판: 길이(동서) × 폭(남북), 실을 수 있는 무게 */
export const DECK = { len: 24, wid: 8, kg: 6000 };

export interface PlacedRack {
  id: string;
  kind: RackKind;
  /** 갑판 가운데를 0으로 한 자리(m): x 동서, y 남북 */
  x: number;
  y: number;
  /** 90이면 갑판 위에서 세로로 놓는다 */
  rot: 0 | 90;
  /** 랙 전체 기울기(도, 동쪽 +) */
  tilt: number;
  /** 부채꼴 랙의 펼침(도) */
  spread?: number;
}

/** 쇼의 장비: 바지선마다 갑판 위 랙 */
export interface Rig {
  decks: Record<string, PlacedRack[]>;
  /** 점화 모듈 하나의 핀 수 (기본 18) */
  pins?: number;
  /** 같은 때 같은 불꽃(부채꼴)은 한 핀에 묶는다 (기본 켬) */
  chain?: boolean;
  /** 회로 점검을 했는지, 고친 핀 ("모듈-핀") */
  checked?: boolean;
  fixed?: string[];
}

export interface Tube {
  /** 바지선 id + '/' + 랙 id + '.' + 통 번호 (쇼 전체에서 하나뿐) */
  id: string;
  launcher: string;
  rack: string;
  kind: RackKind;
  size: Size | null;
  /** 기울기(도) */
  angle: number;
  /** 갑판 위 자리(m) */
  x: number;
  y: number;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, Number.isFinite(v) ? v : a));

/** 갑판 위에서 차지하는 반 길이 [동서, 남북] */
export function footprint(r: PlacedRack): [number, number] {
  const s = RACKS[r.kind];
  return r.rot === 90 ? [s.wid / 2, s.len / 2] : [s.len / 2, s.wid / 2];
}

/** 랙의 통 하나하나: 자리와 각도 */
export function rackTubes(launcher: string, r: PlacedRack): Tube[] {
  const s = RACKS[r.kind];
  const out: Tube[] = [];
  const cols = r.kind === 'r3x10' ? 5 : s.tubes;
  const rows = r.kind === 'r3x10' ? 2 : 1;
  for (let k = 0; k < s.tubes; k++) {
    const c = k % cols;
    const row = Math.floor(k / cols);
    const along = cols > 1 ? -s.len / 2 + 0.2 + ((s.len - 0.4) * c) / (cols - 1) : 0;
    const across = rows > 1 ? (row - 0.5) * (s.wid / 2) : 0;
    const [dx, dy] = r.rot === 90 ? [across, along] : [along, across];
    const fan = r.kind === 'fan5' ? -(r.spread ?? 40) / 2 + ((r.spread ?? 40) * k) / (s.tubes - 1) : 0;
    out.push({
      id: `${launcher}/${r.id}.${k + 1}`,
      launcher,
      rack: r.id,
      kind: r.kind,
      size: s.size,
      angle: Math.round((r.tilt + fan) * 10) / 10,
      x: r.x + dx,
      y: r.y + dy,
    });
  }
  return out;
}

/** 화면에 보일 통 이름: 랙과 통 번호 (바지선은 따로 보인다) */
export function tubeLabel(id: string): string {
  return id.slice(id.indexOf('/') + 1);
}

/** 쇼의 모든 통 */
export function allTubes(rig: Rig | undefined): Tube[] {
  if (!rig) return [];
  return Object.entries(rig.decks).flatMap(([launcher, racks]) => racks.flatMap((r) => rackTubes(launcher, r)));
}

/** 통이 실제로 있는 세계 자리: 바지선 자리 + 갑판 위 자리 */
export function tubeWorldPos(bargePos: Vec3, t: Tube): Vec3 {
  return [bargePos[0] + t.x, bargePos[1] + 1, bargePos[2] + t.y];
}

export interface DeckReport {
  kg: number;
  area: number;
  tubes: Partial<Record<Size | 'cake', number>>;
  problems: { rack: string; message: string }[];
}

/** 갑판 점검: 갑판 밖, 너무 가까운 랙, 무게 초과 */
export function deckCheck(racks: PlacedRack[]): DeckReport {
  const problems: DeckReport['problems'] = [];
  let kg = 0;
  let area = 0;
  const tubes: DeckReport['tubes'] = {};
  for (const r of racks) {
    const s = RACKS[r.kind];
    kg += s.kg;
    area += s.len * s.wid;
    const key = s.size ?? 'cake';
    tubes[key] = (tubes[key] ?? 0) + s.tubes;
    const [hx, hy] = footprint(r);
    if (Math.abs(r.x) + hx > DECK.len / 2 || Math.abs(r.y) + hy > DECK.wid / 2) {
      problems.push({ rack: r.id, message: `${s.label}이 갑판 밖으로 나갔습니다.` });
    }
  }
  for (let i = 0; i < racks.length; i++) {
    for (let j = i + 1; j < racks.length; j++) {
      const a = racks[i];
      const b = racks[j];
      const [ax, ay] = footprint(a);
      const [bx, by] = footprint(b);
      // 두 사각형 사이의 빈틈
      const gx = Math.abs(a.x - b.x) - ax - bx;
      const gy = Math.abs(a.y - b.y) - ay - by;
      const gap = Math.max(gx, gy);
      const need = Math.max(RACKS[a.kind].gap, RACKS[b.kind].gap);
      if (gap < need) {
        problems.push({
          rack: b.id,
          message: gap < 0
            ? `${RACKS[b.kind].label}이 ${RACKS[a.kind].label}과 겹칩니다.`
            : `${RACKS[b.kind].label}과 ${RACKS[a.kind].label} 사이가 ${gap.toFixed(1)}m입니다 (${need}m 이상 띄우기).`,
        });
      }
    }
  }
  if (kg > DECK.kg) problems.push({ rack: '', message: `갑판 무게 ${kg}kg가 한도 ${DECK.kg}kg를 넘습니다.` });
  return { kg, area: Math.round(area * 10) / 10, tubes, problems };
}

/** 갑판의 빈 자리에 랙을 놓는다. 자리가 없으면 null */
export function placeRack(racks: PlacedRack[], kind: RackKind, tilt = 0, spread?: number): PlacedRack | null {
  const used = new Set(racks.map((r) => r.id));
  let n = 1;
  while (used.has(`R${n}`)) n++;
  const base: PlacedRack = { id: `R${n}`, kind, x: 0, y: 0, rot: 0, tilt, ...(kind === 'fan5' ? { spread: spread ?? 40 } : {}) };
  // 서쪽 위에서부터 0.5m 간격으로 빈 자리를 찾는다.
  for (let y = -DECK.wid / 2 + 0.6; y <= DECK.wid / 2 - 0.6; y += 0.5) {
    for (let x = -DECK.len / 2 + 0.6; x <= DECK.len / 2 - 0.6; x += 0.5) {
      const cand = { ...base, x, y };
      if (!deckCheck([...racks, cand]).problems.some((p) => p.rack === cand.id || p.rack === '')) return cand;
    }
  }
  return null;
}

/** 바깥에서 온 장비를 안전한 범위로 고친다. */
export function normalizeRig(raw: Rig, launcherIds: string[]): Rig {
  const decks: Rig['decks'] = {};
  for (const id of launcherIds) {
    const list = raw?.decks?.[id];
    if (!Array.isArray(list)) continue;
    decks[id] = list.slice(0, 80).filter((r) => RACKS[r.kind]).map((r) => ({
      id: String(r.id).slice(0, 8),
      kind: r.kind,
      x: Math.round(clamp(r.x, -DECK.len, DECK.len) * 10) / 10,
      y: Math.round(clamp(r.y, -DECK.wid, DECK.wid) * 10) / 10,
      rot: r.rot === 90 ? 90 : 0,
      tilt: clamp(r.tilt, -30, 30),
      ...(r.kind === 'fan5' ? { spread: clamp(r.spread ?? 40, 10, 80) } : {}),
    }));
  }
  const out: Rig = { decks };
  if (raw?.pins) out.pins = [12, 18, 32].includes(raw.pins) ? raw.pins : 18;
  if (raw?.chain === false) out.chain = false;
  if (raw?.checked) out.checked = true;
  if (Array.isArray(raw?.fixed)) out.fixed = raw.fixed.slice(0, 400).map((x) => String(x).slice(0, 8));
  return out;
}

/** 쇼에 장비가 있는지 (갑판에 랙이 하나라도) */
export function hasRig(show: Show): boolean {
  return !!show.rig && Object.values(show.rig.decks).some((d) => d.length > 0);
}
