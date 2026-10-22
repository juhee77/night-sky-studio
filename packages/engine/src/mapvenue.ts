// 지도 무대: 지도에서 고른 실제 장소를 무대로 쓴다. 실제 불꽃 발사 계획용이 아니다.
// 위도·경도를 미터 단위 로컬 좌표로 바꾸되, 첫 관람석에서 발사 위치 가운데를 바라보는 방향이 북(+z)이 되게 돌린다.
// (렌더러는 관람석이 북쪽을 바라본다고 보고 건물 면과 물가를 그리기 때문이다.)

import { mulberry32 } from './rng.ts';
import type { Launcher, Show, Vec3 } from './show.ts';
import { VENUES, type Building, type Seat, type Venue } from './venues.ts';

export const MAP_PRESET = 'map';

export interface MapVenue {
  name: string;
  /** 로컬 좌표 원점 (발사 위치 가운데) */
  lat: number;
  lon: number;
  /** 로컬 +z가 가리키는 방위 (도, 북=0 시계방향) */
  heading: number;
  /** 관람석 쪽 물가 (로컬 z) */
  nearShoreZ: number;
  /** 관람석 (로컬 x, z) */
  seats: { label: string; x: number; z: number }[];
  /** 건물 [x0, x1, z, 높이] (로컬) */
  buildings: [number, number, number, number][];
}

const M_PER_DEG_LAT = 110_540;
const mPerDegLon = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);

/** 위도·경도 → 그 지점의 동·북 미터 (원점 기준) */
export function geoToEN(lat0: number, lon0: number, lat: number, lon: number): [number, number] {
  return [(lon - lon0) * mPerDegLon(lat0), (lat - lat0) * M_PER_DEG_LAT];
}

/** 동·북 미터 → 로컬 x(오른쪽), z(앞쪽): heading만큼 돌린다 */
export function enToLocal(heading: number, e: number, n: number): [number, number] {
  const h = (heading * Math.PI) / 180;
  // 앞쪽 단위 벡터 (동, 북) = (sin h, cos h), 오른쪽 = (cos h, -sin h)
  return [e * Math.cos(h) - n * Math.sin(h), e * Math.sin(h) + n * Math.cos(h)];
}

export function localToEN(heading: number, x: number, z: number): [number, number] {
  const h = (heading * Math.PI) / 180;
  return [x * Math.cos(h) + z * Math.sin(h), -x * Math.sin(h) + z * Math.cos(h)];
}

export function geoToLocal(mv: Pick<MapVenue, 'lat' | 'lon' | 'heading'>, lat: number, lon: number): [number, number] {
  const [e, n] = geoToEN(mv.lat, mv.lon, lat, lon);
  return enToLocal(mv.heading, e, n);
}

export function localToGeo(mv: Pick<MapVenue, 'lat' | 'lon' | 'heading'>, x: number, z: number): [number, number] {
  const [e, n] = localToEN(mv.heading, x, z);
  return [mv.lat + n / M_PER_DEG_LAT, mv.lon + e / mPerDegLon(mv.lat)];
}

/** a에서 b를 바라보는 방위(도) */
export function bearing(a: [number, number], b: [number, number]): number {
  const [e, n] = geoToEN(a[0], a[1], b[0], b[1]);
  return ((Math.atan2(e, n) * 180) / Math.PI + 360) % 360;
}

export interface MapPick {
  name: string;
  /** [위도, 경도] */
  barges: [number, number][];
  seats: { label: string; at: [number, number] }[];
  frame?: [number, number];
  /** 지도에서 읽은 건물: 꼭짓점들([위도, 경도])과 높이 */
  buildings: { ring: [number, number][]; height: number }[];
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/** 지도에서 찍은 것으로 무대와 발사 위치를 만든다. */
export function buildMapVenue(pick: MapPick): { venue: MapVenue; launchers: Launcher[] } {
  if (!pick.barges.length) throw new Error('바지선 자리를 하나 이상 찍어 주세요.');
  if (!pick.seats.length) throw new Error('관람석을 하나 이상 찍어 주세요.');
  const lat = pick.barges.reduce((s, b) => s + b[0], 0) / pick.barges.length;
  const lon = pick.barges.reduce((s, b) => s + b[1], 0) / pick.barges.length;
  const heading = Math.round(bearing(pick.seats[0].at, [lat, lon]));
  const base = { lat, lon, heading };
  const seats = pick.seats.slice(0, 6).map((s) => {
    const [x, z] = geoToLocal(base, s.at[0], s.at[1]);
    return { label: s.label.slice(0, 16), x: r1(x), z: r1(z) };
  });
  const launchers: Launcher[] = pick.barges.slice(0, 12).map((b, i) => {
    const [x, z] = geoToLocal(base, b[0], b[1]);
    return { id: `barge-${i + 1}`, kind: 'barge', pos: [r1(x), 0, r1(z)] };
  });
  if (pick.frame) {
    const [x, z] = geoToLocal(base, pick.frame[0], pick.frame[1]);
    launchers.push({ id: 'ground', kind: 'frame', pos: [r1(x), 0, r1(z)] });
  }
  // 물가: 첫 관람석 바로 앞
  const nearShoreZ = r1(seats[0].z + 15);
  // 건물: 관람석에서 보아 발사 위치 너머에 있는 것만 스카이라인으로 쓴다
  // (관람석 옆 건물은 너무 가까워 화면을 가린다). 바라보는 방향의 너비와 깊이 가운데로 줄인다.
  const beyond = Math.min(...launchers.filter((l) => l.kind === 'barge').map((l) => l.pos[2])) + 40;
  const buildings: MapVenue['buildings'] = [];
  for (const b of pick.buildings) {
    if (!b.ring.length || !(b.height > 0)) continue;
    const pts = b.ring.map(([la, lo]) => geoToLocal(base, la, lo));
    const xs = pts.map((p) => p[0]);
    const zs = pts.map((p) => p[1]);
    const z = zs.reduce((s, v) => s + v, 0) / zs.length;
    if (z < beyond || Math.hypot(Math.max(...xs), z) > 6000) continue;
    buildings.push([r1(Math.min(...xs)), r1(Math.max(...xs)), r1(z), r1(Math.min(400, b.height))]);
  }
  buildings.sort((a, b) => b[3] - a[3]);
  return {
    venue: { name: pick.name.slice(0, 30) || '지도에서 고른 곳', lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6, heading, nearShoreZ, seats, buildings: buildings.slice(0, 600) },
    launchers,
  };
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, Number.isFinite(v) ? v : a));

export function normalizeMapVenue(raw: MapVenue): MapVenue {
  return {
    name: String(raw.name ?? '지도에서 고른 곳').slice(0, 30),
    lat: clamp(raw.lat, -85, 85),
    lon: clamp(raw.lon, -180, 180),
    heading: clamp(raw.heading, 0, 360),
    nearShoreZ: clamp(raw.nearShoreZ, -5000, 5000),
    seats: (raw.seats ?? []).slice(0, 6).map((s) => ({ label: String(s.label).slice(0, 16), x: clamp(s.x, -5000, 5000), z: clamp(s.z, -5000, 5000) })),
    buildings: (raw.buildings ?? []).slice(0, 600).filter((b) => Array.isArray(b) && b.length === 4).map((b) => b.map((v) => clamp(v, -8000, 8000)) as MapVenue['buildings'][number]),
  };
}

const venueCache = new WeakMap<MapVenue, Venue>();

/** 지도 무대를 렌더러가 쓰는 무대로 */
export function mapToVenue(mv: MapVenue): Venue {
  const hit = venueCache.get(mv);
  if (hit) return hit;
  const rnd = mulberry32(Math.round(mv.lat * 1000 + mv.lon * 1000));
  const buildings: Building[] = mv.buildings.map(([x0, x1, z, height]) => {
    const w = Math.max(6, x1 - x0);
    const windows: [number, number][] = [];
    const lit = Math.floor(rnd() * (4 + height / 30));
    for (let k = 0; k < lit; k++) windows.push([x0 + 2 + rnd() * Math.max(1, w - 4), 3 + rnd() * Math.max(1, height - 6)]);
    return { x0, x1: x0 + w, z, height, windows };
  });
  const target: Vec3 = [0, 160, 0];
  const seats: Record<string, Seat> = {};
  mv.seats.forEach((s, i) => {
    seats[i === 0 ? 'front-near' : `seat-${i + 1}`] = { label: s.label || `관람석 ${i + 1}`, eye: [s.x, 6, s.z], target, fovY: 50 };
  });
  const zs = mv.seats.map((s) => s.z);
  seats.top = { label: '위에서 보기', eye: [0, 900, Math.min(...zs) * 0.6], target: [0, 0, 0], fovY: 50, plan: true };
  const venue: Venue = {
    id: MAP_PRESET,
    label: mv.name,
    place: '지도에서 고른 곳',
    farShoreZ: null,
    nearShoreZ: mv.nearShoreZ,
    nearGround: '#05060c',
    buildings,
    bridge: { kind: 'none', z: 0, deckY: 0, x0: 0, x1: 0 },
    seats,
    launchers: [],
    // 지도 무대는 물길을 모르므로, 관람석 앞 물가에서 조금 떨어진 넓은 띠를 허가 구역으로 본다.
    permit: { zones: [[-1500, mv.nearShoreZ + 80, 1500, mv.nearShoreZ + 3000]], maxBarges: 4 },
  };
  venueCache.set(mv, venue);
  return venue;
}

/** 쇼의 무대: 지도 무대면 지도에서 만든 무대, 아니면 정해 둔 무대 */
export function venueOf(show: Show): Venue | undefined {
  if (show.venue.preset === MAP_PRESET && show.venue.map) return mapToVenue(show.venue.map);
  return VENUES[show.venue.preset];
}
