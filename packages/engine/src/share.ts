// 공유 링크. 쇼를 짧게 줄여 주소의 # 뒤에 담는다 (# 뒤는 서버로 가지 않는다).
// 줄이는 순서: 같은 종류의 값끼리 모은 표로 바꾸고(시간은 앞 불꽃과의 차이를 ms 정수로),
// JSON으로 만든 뒤 deflate로 압축하고, 주소에 쓸 수 있는 base64로 바꾼다.
// 음악 파일은 넣지 않는다. 곡 이름과 길이만 넣어서 받는 사람이 같은 파일을 고를 수 있게 한다.

import { ALL_TYPES, RISE_EFFECTS, type FireworkType, type Size } from './catalog.ts';
import { COLOR_NAMES, type ColorName } from './colors.ts';
import { normalizeShell, type CustomShell } from './custom.ts';
import type { CakePattern, Cue, Launcher, Show } from './show.ts';
import { SKY_IDS } from './weather.ts';
import { hasRig, normalizeRig, type Rig } from './rig.ts';
import { normalizeMapVenue, type MapVenue } from './mapvenue.ts';
import { artFromString, artToString } from './art.ts';

/** 발사 위치 종류 번호 (뒤에만 더한다) */
const KINDS: Launcher['kind'][] = ['barge', 'bridge', 'frame', 'drone'];
const PATTERNS: CakePattern[] = ['fan', 'zigzag', 'straight'];
/** 색 하나 = 글자 하나 */
const COLOR_CODES = 'abcdefgh';

interface Packed {
  v: 1;
  seed: number;
  ti?: string;
  /** 만든 사람, 원작 [제목, 만든 사람] */
  au?: string;
  rx?: [string, string?];
  /** 곡 [id, 제목, BPM, 첫 박, 길이, 3/4면 3] */
  mu?: [string, string, number, number, number, 3?];
  ve: [string, number?, number?, number?, number?];
  cd?: 1;
  se?: string;
  la: (string | number)[][];
  /** 터지는 시각 차이(ms), 발사 위치 번호, 종류 번호, 크기, 색 글자 */
  dt: number[];
  at: number[];
  ty: number[];
  sz: number[];
  co: string[];
  /** 기본값이 아닌 값만: [불꽃 번호, 이름, 값] */
  ex: [number, string, number | string][];
  /** 이 쇼에 쓴 내 불꽃 정의 */
  cs?: CustomShell[];
  /** 발사장 장비 */
  rg?: Rig;
  /** 지도 무대 */
  vm?: MapVenue;
}

const round = (x: number, d = 3) => Math.round(x * 10 ** d) / 10 ** d;

export function packShow(show: Show): Packed {
  const launcherIndex = new Map(show.launchers.map((l, i) => [l.id, i]));
  const cues = [...show.cues].sort((a, b) => a.t - b.t);
  const p: Packed = {
    v: 1,
    seed: show.seed,
    ve: [show.venue.preset],
    la: show.launchers.map((l) => {
      const row: (string | number)[] = [l.id, KINDS.indexOf(l.kind), ...l.pos.map((x) => round(x, 1))];
      if (l.from && l.to) row.push(...l.from.map((x) => round(x, 1)), ...l.to.map((x) => round(x, 1)));
      return row;
    }),
    dt: [],
    at: [],
    ty: [],
    sz: [],
    co: [],
    ex: [],
  };
  if (show.title) p.ti = show.title;
  if (show.author) p.au = show.author;
  if (show.remixOf) p.rx = show.remixOf.author ? [show.remixOf.title, show.remixOf.author] : [show.remixOf.title];
  if (show.music) {
    const m = show.music;
    p.mu = [m.id, m.title, round(m.bpm, 2), round(m.offset), round(m.duration, 2)];
    if (m.beatsPerBar === 3) p.mu.push(3);
  }
  p.ve.push(round(show.venue.wind?.dir ?? 0, 1), round(show.venue.wind?.speed ?? 0, 2));
  p.ve.push(Math.round(show.venue.cloud ?? 0), Math.max(0, SKY_IDS.indexOf(show.venue.sky ?? 'night')));
  if (show.countdown) p.cd = 1;
  if (show.seat) p.se = show.seat.id;

  let prev = 0;
  cues.forEach((c, i) => {
    const ms = Math.round(c.t * 1000);
    p.dt.push(ms - prev);
    prev = ms;
    p.at.push(launcherIndex.get(c.at) ?? 0);
    p.ty.push(ALL_TYPES.indexOf(c.type));
    p.sz.push(c.size);
    p.co.push((c.colors ?? []).map((n) => COLOR_CODES[COLOR_NAMES.indexOf(n)]).join(''));
    if (c.angle) p.ex.push([i, 'a', c.angle]);
    if (c.fan) p.ex.push([i, 'f', c.fan.count], [i, 's', c.fan.spread]);
    if (c.shots !== undefined) p.ex.push([i, 'n', c.shots]);
    if (c.interval !== undefined) p.ex.push([i, 'i', c.interval]);
    if (c.pattern) p.ex.push([i, 'p', PATTERNS.indexOf(c.pattern)]);
    if (c.len !== undefined) p.ex.push([i, 'l', c.len]);
    if (c.text !== undefined) p.ex.push([i, 't', c.text]);
    if (c.custom !== undefined) p.ex.push([i, 'c', c.custom]);
    if (c.rise) p.ex.push([i, 'r', RISE_EFFECTS.indexOf(c.rise)]);
    if (c.tubes?.length) p.ex.push([i, 'u', c.tubes.join(',')]);
    if (c.art) p.ex.push([i, 'g', artToString(c.art)]);
  });
  // 실제로 쓴 내 불꽃만 담는다.
  const used = new Set(cues.map((c) => c.custom).filter(Boolean));
  const shells = Object.values(show.customShells ?? {}).filter((s) => used.has(s.id));
  if (shells.length) p.cs = shells;
  if (hasRig(show)) p.rg = show.rig;
  if (show.venue.map) p.vm = show.venue.map;
  return p;
}

export function unpackShow(p: Packed): Show {
  if (p?.v !== 1 || !Array.isArray(p.dt)) throw new Error('쇼 데이터가 아닙니다.');
  const launchers: Launcher[] = p.la.map((row) => {
    const n = row as number[];
    const l: Launcher = { id: String(row[0]), kind: KINDS[n[1]] ?? 'barge', pos: [n[2], n[3], n[4]] };
    if (row.length >= 11) {
      l.from = [n[5], n[6], n[7]];
      l.to = [n[8], n[9], n[10]];
    }
    return l;
  });
  const cues: Cue[] = [];
  let ms = 0;
  for (let i = 0; i < p.dt.length; i++) {
    ms += p.dt[i];
    const type = ALL_TYPES[p.ty[i]] as FireworkType | undefined;
    if (!type) throw new Error('알 수 없는 불꽃 종류입니다.');
    const colors = [...(p.co[i] ?? '')]
      .map((ch) => COLOR_NAMES[COLOR_CODES.indexOf(ch)])
      .filter(Boolean) as ColorName[];
    const cue: Cue = { t: ms / 1000, at: launchers[p.at[i]]?.id ?? launchers[0]?.id, type, size: p.sz[i] as Size };
    if (colors.length) cue.colors = colors;
    cues.push(cue);
  }
  for (const [i, key, value] of p.ex) {
    const c = cues[i];
    if (!c) continue;
    const num = Number(value);
    if (key === 'a') c.angle = num;
    else if (key === 'f') c.fan = { count: num, spread: c.fan?.spread ?? 40 };
    else if (key === 's') c.fan = { count: c.fan?.count ?? 1, spread: num };
    else if (key === 'n') c.shots = num;
    else if (key === 'i') c.interval = num;
    else if (key === 'p') c.pattern = PATTERNS[num];
    else if (key === 'l') c.len = num;
    else if (key === 't') c.text = String(value).slice(0, 24);
    else if (key === 'c') c.custom = String(value).slice(0, 24);
    else if (key === 'r' && RISE_EFFECTS[num]) c.rise = RISE_EFFECTS[num];
    else if (key === 'g') {
      const art = artFromString(String(value));
      if (art) c.art = art;
    } else if (key === 'u') c.tubes = String(value).split(',').slice(0, 8).map((x) => x.slice(0, 32));
  }
  const show: Show = {
    version: 1,
    seed: p.seed >>> 0,
    venue: { preset: p.ve[0] },
    launchers,
    cues,
  };
  if (p.ti) show.title = p.ti.slice(0, 60);
  if (p.au) show.author = String(p.au).slice(0, 24);
  if (Array.isArray(p.rx) && p.rx[0]) {
    show.remixOf = { title: String(p.rx[0]).slice(0, 60) };
    if (p.rx[1]) show.remixOf.author = String(p.rx[1]).slice(0, 24);
  }
  if (p.mu) {
    const [id, title, bpm, offset, duration, per] = p.mu;
    show.music = { id, title, bpm, offset, duration };
    if (per === 3) show.music.beatsPerBar = 3;
  }
  if (p.ve[1] !== undefined && p.ve[2] !== undefined && (p.ve[1] || p.ve[2])) show.venue.wind = { dir: p.ve[1], speed: p.ve[2] };
  if (p.ve[3]) show.venue.cloud = p.ve[3];
  if (p.ve[4]) show.venue.sky = SKY_IDS[p.ve[4]];
  if (p.cd) show.countdown = true;
  if (p.se) show.seat = { id: p.se };
  if (p.cs?.length) show.customShells = Object.fromEntries(p.cs.map((s) => [s.id, normalizeShell(s)]));
  if (p.vm) show.venue.map = normalizeMapVenue(p.vm);
  if (p.rg) show.rig = normalizeRig(p.rg, launchers.map((l) => l.id));
  return show;
}

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([data as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 불꽃 코드: 내 불꽃 하나를 친구에게 보낼 수 있는 글자. 앞에 NSS1- 이 붙는다. */
export async function encodeShellCode(shell: CustomShell): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(shell));
  return `NSS1-${toBase64Url(await pipe(json, new CompressionStream('deflate-raw')))}`;
}

export async function decodeShellCode(code: string): Promise<CustomShell> {
  const body = code.trim().replace(/^NSS1-/, '');
  try {
    const json = new TextDecoder().decode(await pipe(fromBase64Url(body), new DecompressionStream('deflate-raw')));
    return normalizeShell(JSON.parse(json));
  } catch {
    throw new Error('불꽃 코드가 아니거나 잘렸습니다.');
  }
}

/** 쇼 → 링크에 넣을 글자 */
export async function encodeShow(show: Show): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(packShow(show)));
  return toBase64Url(await pipe(json, new CompressionStream('deflate-raw')));
}

/** 링크의 글자 → 쇼. 잘렸거나 망가진 링크면 오류를 던진다. */
export async function decodeShow(code: string): Promise<Show> {
  let json: string;
  try {
    json = new TextDecoder().decode(await pipe(fromBase64Url(code), new DecompressionStream('deflate-raw')));
  } catch {
    throw new Error('링크가 잘렸거나 손상됐습니다.');
  }
  return unpackShow(JSON.parse(json));
}
