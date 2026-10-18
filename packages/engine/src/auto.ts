// 자동 연출: 곡의 박자와 세기를 보고 불꽃을 놓는다.
// 곡의 분위기를 이해하는 것은 아니고, 박마다 소리 크기와 센 박만 본다.
// 조용한 곳은 띄엄띄엄 작게, 커지는 곳은 촘촘하고 크게, 끝은 피날레로 채운다.
// 만든 쇼는 출발점이다. 시간표에서 마음대로 고치면 된다.

import { isShell, shellSize, type FireworkType, type ShellType, type Size } from './catalog.ts';
import { COLOR_NAMES, type ColorName } from './colors.ts';
import { cueCost } from './commission.ts';
import { onsetEnvelope } from './beat.ts';
import { mulberry32 } from './rng.ts';
import type { Cue, Launcher } from './show.ts';

/** 박 단위로 본 곡 */
export interface MusicMap {
  bpm: number;
  offset: number;
  duration: number;
  /** 박마다 소리 크기 (0~1, 곡 안에서 상대값) */
  energy: Float32Array;
  /** 박마다 두드러지는 정도 (0~1) */
  accent: Float32Array;
}

/** 소리 파일 없이(음악 없음) 쓸 때: 천천히 커지는 가상의 곡 */
export function flatMusicMap(duration: number, bpm = 120, offset = 0): MusicMap {
  const beat = 60 / bpm;
  const n = Math.max(1, Math.floor((duration - offset) / beat));
  const energy = new Float32Array(n);
  const accent = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    energy[i] = 0.3 + 0.6 * (i / n);
    accent[i] = i % 4 === 0 ? 1 : 0.3;
  }
  return { bpm, offset, duration, energy, accent };
}

export function analyzeMusic(samples: Float32Array, sampleRate: number, bpm: number, offset: number): MusicMap {
  const duration = samples.length / sampleRate;
  const beat = 60 / bpm;
  const n = Math.max(1, Math.floor((duration - offset) / beat));
  const energy = new Float32Array(n);
  const accent = new Float32Array(n);
  const { env, frameRate } = onsetEnvelope(samples, sampleRate);
  for (let i = 0; i < n; i++) {
    const a = Math.floor((offset + i * beat) * sampleRate);
    const b = Math.min(samples.length, Math.floor((offset + (i + 1) * beat) * sampleRate));
    let sum = 0;
    for (let k = a; k < b; k += 4) sum += samples[k] * samples[k];
    energy[i] = Math.sqrt(sum / Math.max(1, (b - a) / 4));
    // 박 바로 앞뒤의 온셋 세기
    const f = Math.round((offset + i * beat) * frameRate);
    let on = 0;
    for (let k = f - 2; k <= f + 2; k++) on = Math.max(on, env[k] ?? 0);
    accent[i] = on;
  }
  normalize(energy);
  normalize(accent);
  // 소리 크기는 한 마디쯤으로 부드럽게 (한 박의 튀는 값에 흔들리지 않게)
  const smooth = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    let w = 0;
    for (let k = -3; k <= 3; k++) {
      const v = energy[i + k];
      if (v === undefined) continue;
      const wk = 4 - Math.abs(k);
      s += v * wk;
      w += wk;
    }
    smooth[i] = s / w;
  }
  normalize(smooth);
  return { bpm, offset, duration, energy: smooth, accent };
}

function normalize(a: Float32Array): void {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of a) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  const span = hi - lo || 1;
  for (let i = 0; i < a.length; i++) a[i] = (a[i] - lo) / span;
}

export interface AutoOptions {
  seed: number;
  style: 'grand' | 'calm';
  /** 0.3~1. 얼마나 촘촘하게 놓을지 */
  density: number;
  /** 쓸 수 있는 종류 (의뢰 쇼에서 해금한 것만) */
  allowed?: FireworkType[];
  /** 이보다 큰 불꽃은 쓰지 않는다 (안전거리) */
  maxSize?: Size;
  /** 이 색만 쓴다 */
  colors?: ColorName[];
  /** 꼭 넣을 종류 */
  include?: FireworkType[];
  /** 마지막 몇 초는 이 색만 */
  endColors?: { seconds: number; colors: ColorName[] };
  /** 지상 틀에 띄울 글자 (없으면 틀불꽃을 쓰지 않는다) */
  text?: string;
  /** 쓸 수 있는 값의 상한 */
  budget?: number;
}

const THEMES: ColorName[][] = [
  ['gold', 'white'], ['pink', 'white'], ['cyan', 'blue'], ['red', 'gold'],
  ['purple', 'pink'], ['green', 'gold'], ['blue', 'white'], ['gold', 'red'],
];

const round3 = (x: number) => Math.round(x * 1000) / 1000;

interface Placed extends Cue {
  /** 예산을 넘을 때 덜 중요한 것부터 뺀다 */
  importance: number;
}

export function autoChoreograph(music: MusicMap, launchers: Launcher[], o: AutoOptions): Cue[] {
  const rnd = mulberry32(o.seed);
  const pick = <T>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)];
  const can = (t: FireworkType) => !o.allowed || o.allowed.includes(t);
  const sizeCap = (s: Size): Size => (o.maxSize && s > o.maxSize ? o.maxSize : s);
  const barges = launchers.filter((l) => l.kind === 'barge').sort((a, b) => a.pos[0] - b.pos[0]);
  const bridge = launchers.find((l) => l.kind === 'bridge');
  const frame = launchers.find((l) => l.kind === 'frame');
  if (!barges.length) return [];

  const beat = 60 / music.bpm;
  const n = music.energy.length;
  const end = music.duration - 1.5;
  const finaleStart = Math.max(end * 0.86, end - 14);
  const center = barges[Math.floor(barges.length / 2)];
  const left = barges[0];
  const right = barges[barges.length - 1];
  const colorsOk = (cs: ColorName[]) => (o.colors ? cs.filter((c) => o.colors!.includes(c)) : cs);
  const pool = o.colors?.length ? o.colors : COLOR_NAMES;

  // 구간(8마디)마다 색 조합을 바꾼다.
  const themeFor = (i: number): ColorName[] => {
    const theme = colorsOk(THEMES[(Math.floor(i / 32) + o.seed) % THEMES.length]);
    return theme.length ? theme : [pool[Math.floor(i / 32) % pool.length]];
  };

  const out: Placed[] = [];
  const lastAt = new Map<string, number>();
  const place = (c: Omit<Cue, 'colors'> & { colors?: ColorName[] }, importance: number) => {
    if (!can(c.type)) return false;
    if (c.t < (isShell(c.type) ? shellSize(c.type as ShellType, c.size).prefire + 0.2 : 0)) return false;
    const prev = lastAt.get(c.at) ?? -Infinity;
    if (c.t - prev < 0.45 && c.type !== 'niagara' && c.type !== 'lancework') return false;
    lastAt.set(c.at, c.t);
    out.push({ ...c, t: round3(c.t), colors: c.colors && c.colors.length ? c.colors : [pool[0]], importance });
    return true;
  };

  // 기본 흐름: 박마다 놓을지 정한다.
  const calm = o.style === 'calm';
  for (let i = 0; i < n; i++) {
    const t = music.offset + i * beat;
    if (t >= finaleStart) break;
    const e = music.energy[i];
    const downbeat = i % 4 === 0;
    const strong = downbeat || music.accent[i] > 0.7;
    let p = (calm ? 0.12 + 0.3 * e : 0.2 + 0.5 * e) * o.density;
    if (downbeat) p += 0.25;
    if (!strong) p *= 0.6;
    if (rnd() > p) continue;

    const theme = themeFor(i);
    const color = [theme[i % theme.length]];
    let size: Size = e < 0.3 ? 3 : e < 0.6 ? 5 : e < 0.85 || !downbeat ? 7 : 10;
    if (calm && size > 5 && rnd() < 0.6) size = 5;
    size = sizeCap(size);

    let type: ShellType;
    if (e < 0.35) type = pick<ShellType>(calm ? ['willow', 'peony', 'ring'] : ['peony', 'ring', 'chrysanthemum']);
    else if (e < 0.7) type = pick<ShellType>(calm ? ['peony', 'willow', 'heart', 'chrysanthemum'] : ['chrysanthemum', 'peony', 'crossette', 'star']);
    else type = pick<ShellType>(downbeat ? ['chrysanthemum', 'palm', 'willow'] : ['peony', 'crossette', 'chrysanthemum']);
    if (!can(type)) type = can('peony') ? 'peony' : 'chrysanthemum';

    if (downbeat && e > 0.65 && i % 8 === 0) {
      // 큰 마디 첫 박: 양쪽 바지선에서 같은 불꽃을 마주 보게
      place({ t, at: left.id, type, size, colors: color, angle: -10 }, 3);
      place({ t, at: right.id, type, size, colors: color, angle: 10 }, 3);
    } else if (downbeat && e > 0.5 && rnd() < 0.35) {
      place({ t, at: center.id, type: can('chrysanthemum') ? 'chrysanthemum' : type, size: sizeCap(3), colors: color, fan: { count: 5, spread: 50 } }, 2);
    } else {
      const at = barges[(i + Math.floor(rnd() * 2)) % barges.length];
      place({ t, at: at.id, type, size, colors: color, angle: at === left ? -6 : at === right ? 6 : 0 }, downbeat ? 2 : 1);
    }
  }

  // 꼭 넣어야 하는 모양 불꽃: 조용한 박 가운데 고른다.
  for (const want of o.include ?? []) {
    if (out.some((c) => c.type === want) || !isShell(want) || want === 'cake') continue;
    const quiet = [...Array(n).keys()]
      .filter((i) => i % 4 === 0 && music.offset + i * beat < finaleStart && music.offset + i * beat > 6)
      .sort((a, b) => music.energy[a] - music.energy[b]);
    for (const i of quiet.slice(0, 2)) {
      place({ t: music.offset + i * beat, at: center.id, type: want, size: sizeCap(5), colors: [themeFor(i)[0]] }, 4);
    }
  }

  // 틀불꽃: 곡 가운데쯤 잔잔한 곳에서 글자를 띄운다.
  if (frame && o.text && can('lancework')) {
    const mid = Math.floor(n * 0.45);
    let best = mid;
    for (let i = mid - 8; i < mid + 8; i++) if (i > 0 && i < n && music.energy[i] < music.energy[best]) best = i;
    const t = music.offset + Math.max(0, best - (best % 4)) * beat;
    if (t < finaleStart - 4) place({ t, at: frame.id, type: 'lancework', size: 5, colors: [themeFor(best)[0]], text: o.text, len: 10 }, 4);
  }

  // 피날레: 반 박마다 양쪽을 번갈아, 케이크와 나이아가라를 깔고, 마지막은 큰 버들로 덮는다.
  const fb = Math.ceil((finaleStart - music.offset) / beat);
  const lastBeat = Math.floor((end - music.offset) / beat) - 1;
  if (bridge && can('niagara')) {
    place({ t: music.offset + fb * beat, at: bridge.id, type: 'niagara', size: 5, colors: ['white'], len: Math.min(14, end - finaleStart) }, 3);
  }
  if (can('cake')) {
    const theme = themeFor(fb);
    place({ t: music.offset + (fb + 2) * beat, at: left.id, type: 'cake', size: sizeCap(5), colors: theme, shots: 24, interval: 0.15, pattern: 'fan' }, 3);
    place({ t: music.offset + (fb + 2) * beat, at: right.id, type: 'cake', size: sizeCap(5), colors: theme, shots: 24, interval: 0.15, pattern: 'fan' }, 3);
  }
  for (let h = fb * 2; h < (lastBeat - 1) * 2; h++) {
    const t = music.offset + (h / 2) * beat;
    if (rnd() > (calm ? 0.55 : 0.85) * Math.max(0.6, o.density)) continue;
    const at = barges[h % barges.length];
    const theme = themeFor(Math.floor(h / 2));
    const finaleType: ShellType = h % 4 === 0 ? 'chrysanthemum' : h % 4 === 2 ? 'crossette' : 'peony';
    place({ t, at: at.id, type: can(finaleType) ? finaleType : 'peony', size: sizeCap(h % 8 === 0 ? 7 : 5), colors: [theme[h % theme.length]] }, 2);
  }
  const closeT = music.offset + lastBeat * beat;
  for (const at of barges) place({ t: closeT, at: at.id, type: can('willow') ? 'willow' : 'chrysanthemum', size: sizeCap(10), colors: colorsOk(['gold']).length ? ['gold'] : [pool[0]] }, 5);

  // 마지막 몇 초 색 조건
  if (o.endColors) {
    const from = music.duration - o.endColors.seconds;
    for (const c of out) if (c.t >= from) c.colors = [o.endColors.colors[0]];
  }

  // 예산: 넘치면 덜 중요하고 비싼 것부터 뺀다.
  if (o.budget !== undefined) {
    const limit = o.budget * 0.95;
    let total = out.reduce((s, c) => s + cueCost(c), 0);
    const order = [...out].sort((a, b) => a.importance - b.importance || cueCost(b) - cueCost(a));
    for (const c of order) {
      if (total <= limit) break;
      if (c.importance >= 4) continue;
      total -= cueCost(c);
      out.splice(out.indexOf(c), 1);
    }
  }

  return out
    .sort((a, b) => a.t - b.t)
    .map(({ importance: _, ...c }) => c);
}
