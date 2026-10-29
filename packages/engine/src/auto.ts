// 자동 연출: 곡의 박자와 세기를 보고 불꽃을 놓는다.
// 곡의 분위기를 이해하는 것은 아니고, 박마다 소리 크기와 센 박만 본다.
// 조용한 곳은 띄엄띄엄 작게, 커지는 곳은 촘촘하고 크게, 끝은 피날레로 채운다.
// 만든 쇼는 출발점이다. 시간표에서 마음대로 고치면 된다.

import { isShell, shellSize, type FireworkType, type RiseEffect, type ShellType, type Size } from './catalog.ts';
import { COLOR_NAMES, type ColorName } from './colors.ts';
import { SHELL_COST, cueCost } from './commission.ts';
import { onsetEnvelope } from './beat.ts';
import { mulberry32 } from './rng.ts';
import type { Tube } from './rig.ts';
import { cueLength, expandShow, windVector, type Cue, type Launcher, type Show } from './show.ts';
import { analyzeSmoke } from './smoke.ts';

/** 박 단위로 본 곡 */
export interface MusicMap {
  bpm: number;
  offset: number;
  /** 한 마디의 박 수 (없으면 4) */
  beatsPerBar?: number;
  duration: number;
  /** 박마다 소리 크기 (0~1, 곡 안에서 상대값) */
  energy: Float32Array;
  /** 박마다 두드러지는 정도 (0~1) */
  accent: Float32Array;
  /** 박마다 높은 소리(쨍한 소리)와 낮은 소리(북·베이스) 세기 (0~1) */
  high?: Float32Array;
  low?: Float32Array;
  /** 곡의 구간 (인트로·벌스·후렴·브릿지·끝) */
  sections?: Section[];
  /** 크게 터지는 순간(드롭)과 조용해지는 순간의 시각(초) */
  drops?: number[];
  hushes?: number[];
}

export type SectionKind = 'intro' | 'verse' | 'chorus' | 'bridge' | 'outro';

export const SECTION_LABEL: Record<SectionKind, string> = {
  intro: '인트로',
  verse: '벌스',
  chorus: '후렴',
  bridge: '브릿지',
  outro: '끝',
};

export interface Section {
  kind: SectionKind;
  /** 시작·끝 시각(초) */
  start: number;
  end: number;
  /** 구간의 평균 소리 크기 (0~1) */
  energy: number;
}

/** 소리 파일 없이(음악 없음) 쓸 때: 천천히 커지는 가상의 곡 */
export function flatMusicMap(duration: number, bpm = 120, offset = 0, beatsPerBar = 4): MusicMap {
  const beat = 60 / bpm;
  const n = Math.max(1, Math.floor((duration - offset) / beat));
  const energy = new Float32Array(n);
  const accent = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    energy[i] = 0.3 + 0.6 * (i / n);
    accent[i] = i % beatsPerBar === 0 ? 1 : 0.3;
  }
  // 곡이 없으면 흔한 짜임으로 가정한다: 인트로 → 벌스 → 후렴 → 끝
  const at = (r: number) => offset + Math.round((n * r) / beatsPerBar) * beatsPerBar * beat;
  const sections: Section[] = [
    { kind: 'intro', start: offset, end: at(0.12), energy: 0.3 },
    { kind: 'verse', start: at(0.12), end: at(0.5), energy: 0.5 },
    { kind: 'chorus', start: at(0.5), end: at(0.88), energy: 0.75 },
    { kind: 'outro', start: at(0.88), end: duration, energy: 0.6 },
  ];
  return { bpm, offset, beatsPerBar, duration, energy, accent, sections, drops: [], hushes: [] };
}

export function analyzeMusic(samples: Float32Array, sampleRate: number, bpm: number, offset: number, beatsPerBar = 4): MusicMap {
  const duration = samples.length / sampleRate;
  const beat = 60 / bpm;
  const n = Math.max(1, Math.floor((duration - offset) / beat));
  const energy = new Float32Array(n);
  const accent = new Float32Array(n);
  const { env, frameRate } = onsetEnvelope(samples, sampleRate);
  const { low, high } = bandEnergy(samples, sampleRate, beat, offset, n);
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
  const raw = Float32Array.from(energy);
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
  const { drops, hushes } = findDrops(raw, accent, beat, offset);
  return {
    bpm, offset, beatsPerBar, duration, energy: smooth, accent, high, low,
    sections: findSections(raw, high, low, beat, offset, duration, beatsPerBar),
    drops, hushes,
  };
}

/** 박마다 낮은 소리(약 200Hz 아래)와 높은 소리(약 2kHz 위) 세기. 한 번 훑으며 한 극 필터로 나눈다. */
function bandEnergy(samples: Float32Array, rate: number, beat: number, offset: number, n: number) {
  const low = new Float32Array(n);
  const high = new Float32Array(n);
  const count = new Float32Array(n);
  const aLow = 1 - Math.exp((-2 * Math.PI * 200) / rate);
  const aHigh = 1 - Math.exp((-2 * Math.PI * 2000) / rate);
  let lp = 0;
  let lp2 = 0;
  const start = Math.max(0, Math.floor(offset * rate));
  const per = beat * rate;
  for (let k = start; k < samples.length; k++) {
    const x = samples[k];
    lp += aLow * (x - lp);
    lp2 += aHigh * (x - lp2);
    const i = Math.floor((k - start) / per);
    if (i >= n) break;
    const h = x - lp2;
    low[i] += lp * lp;
    high[i] += h * h;
    count[i]++;
  }
  for (let i = 0; i < n; i++) {
    low[i] = Math.sqrt(low[i] / Math.max(1, count[i]));
    high[i] = Math.sqrt(high[i] / Math.max(1, count[i]));
  }
  normalize(low);
  normalize(high);
  return { low, high };
}

const mean = (a: ArrayLike<number>, from: number, to: number) => {
  let s = 0;
  let c = 0;
  for (let i = Math.max(0, from); i < Math.min(a.length, to); i++) {
    s += a[i];
    c++;
  }
  return c ? s / c : 0;
};

/** 크게 터지는 순간: 앞 한 마디보다 뒤 한 마디가 훨씬 크고 그 박이 두드러진다. 조용해지는 순간은 그 반대. */
function findDrops(energy: Float32Array, accent: Float32Array, beat: number, offset: number) {
  const n = energy.length;
  const rise: number[] = [];
  const fall: number[] = [];
  for (let i = 4; i < n - 4; i++) {
    const d = mean(energy, i, i + 4) - mean(energy, i - 4, i);
    rise.push(d > 0.3 && accent[i] > 0.4 ? d : 0);
    fall.push(d < -0.3 ? -d : 0);
  }
  // 두 마디 안에서 가장 센 곳 하나만
  const peaks = (score: number[]) => {
    const out: number[] = [];
    for (let k = 0; k < score.length; k++) {
      if (!score[k]) continue;
      let best = true;
      for (let j = Math.max(0, k - 8); j <= Math.min(score.length - 1, k + 8); j++) if (score[j] > score[k] || (score[j] === score[k] && j < k)) best = false;
      if (best) out.push(Math.round((offset + (k + 4) * beat) * 1000) / 1000);
    }
    return out;
  };
  return { drops: peaks(rise), hushes: peaks(fall) };
}

/**
 * 구간 찾기: 마디마다 [크기, 높은 소리, 낮은 소리]를 보고, 앞 두 마디와 뒤 두 마디가 크게 달라지는 곳을 경계로 삼는다.
 * 이름은 크기로 붙인다: 처음·끝의 조용한 구간은 인트로·끝, 큰 구간은 후렴, 후렴 뒤의 조용한 구간은 브릿지, 나머지는 벌스.
 */
function findSections(energy: Float32Array, high: Float32Array, low: Float32Array, beat: number, offset: number, duration: number, per: number): Section[] {
  const bars = Math.floor(energy.length / per);
  if (bars < 4) return [{ kind: 'verse', start: offset, end: duration, energy: mean(energy, 0, energy.length) }];
  const bar = (a: Float32Array) => Array.from({ length: bars }, (_, b) => mean(a, b * per, b * per + per));
  const E = bar(energy);
  const H = bar(high);
  const L = bar(low);
  const nov: number[] = new Array(bars).fill(0);
  for (let b = 2; b < bars - 1; b++) {
    const d = (a: number[]) => Math.abs(mean(a, b, b + 2) - mean(a, b - 2, b));
    nov[b] = d(E) + 0.7 * d(H) + 0.7 * d(L);
  }
  // 가장 큰 변화의 3할이 넘는 봉우리만 경계로 본다.
  const cut = Math.max(0.15, 0.3 * Math.max(...nov));
  const peak = (b: number) => nov[b] >= (nov[b - 1] ?? 0) && nov[b] >= (nov[b + 1] ?? 0);
  // 센 경계부터 고르되, 서로 네 마디 이상 떨어지게
  const cand = nov.map((v, b) => [v, b] as const).filter(([v, b]) => v > cut && peak(b)).sort((x, y) => y[0] - x[0]);
  const bounds: number[] = [];
  for (const [, b] of cand) if (bounds.every((x) => Math.abs(x - b) >= 4)) bounds.push(b);
  bounds.sort((x, y) => x - y);
  const edges = [0, ...bounds, bars];
  // 소리 빛깔: 높은 소리가 많으면 +, 낮은 소리가 많으면 -
  const secs = edges.slice(0, -1).map((b0, k) => ({ b0, b1: edges[k + 1], e: mean(E, b0, edges[k + 1]), tilt: mean(H, b0, edges[k + 1]) - mean(L, b0, edges[k + 1]) }));
  const sorted = secs.map((x) => x.e).sort((x, y) => x - y);
  const med = sorted[Math.floor(sorted.length / 2)];
  const top = sorted[sorted.length - 1];
  let seenChorus = false;
  let verseTilt: number | null = null;
  const out: Section[] = secs.map((x, k) => {
    let kind: SectionKind;
    if (k === 0 && x.e < med) kind = 'intro';
    else if (k === secs.length - 1 && secs.length > 1 && x.e < med) kind = 'outro';
    else if (x.e >= Math.max(med, top * 0.8)) kind = 'chorus';
    // 후렴 뒤에 나오는 덜 큰 구간: 벌스와 소리 빛깔이 다르면 브릿지, 비슷하면 다음 벌스
    else if (seenChorus && (verseTilt === null || Math.abs(x.tilt - verseTilt) > 0.25 || x.e < med)) kind = 'bridge';
    else kind = 'verse';
    if (kind === 'chorus') seenChorus = true;
    if (kind === 'verse' && verseTilt === null) verseTilt = x.tilt;
    const start = k === 0 ? offset : offset + x.b0 * per * beat;
    const end = k === secs.length - 1 ? duration : offset + x.b1 * per * beat;
    return { kind, start: Math.round(start * 1000) / 1000, end: Math.round(end * 1000) / 1000, energy: Math.round(x.e * 100) / 100 };
  });
  return out;
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

/** 분위기: 같은 곡이라도 분위기마다 확연히 다른 쇼가 나온다 */
export type Mood = 'festive' | 'romantic' | 'dramatic' | 'calm';

export const MOOD_LABEL: Record<Mood, string> = {
  festive: '축제',
  romantic: '로맨틱',
  dramatic: '드라마틱',
  calm: '차분하게',
};

export interface AutoOptions {
  seed: number;
  style: 'grand' | 'calm';
  /** 분위기 (없으면 style을 따른다: grand → 축제, calm → 차분하게) */
  mood?: Mood;
  /** 0.3~1. 얼마나 촘촘하게 놓을지 */
  density: number;
  /** 쓸 수 있는 종류 (의뢰 쇼에서 해금한 것만) */
  allowed?: FireworkType[];
  /** 이보다 큰 불꽃은 쓰지 않는다 (안전거리) */
  maxSize?: Size;
  /** 이 색만 쓴다 */
  colors?: ColorName[];
  /** 의뢰인이 좋아하는 색: 색 조합마다 앞에 둔다 */
  liked?: ColorName[];
  /** 바람 (연기에 가리지 않게 자리를 고를 때 쓴다) */
  wind?: { dir: number; speed: number };
  /** 꼭 넣을 종류 */
  include?: FireworkType[];
  /** 마지막 몇 초는 이 색만 */
  endColors?: { seconds: number; colors: ColorName[] };
  /** 지상 틀에 띄울 글자 (없으면 틀불꽃을 쓰지 않는다) */
  text?: string;
  /** 쓸 수 있는 값의 상한 */
  budget?: number;
  /** 섞어 쓸 내 불꽃 (서랍의 설계 id와 크기) */
  customs?: { id: string; size: Size }[];
  /** 꼭 한 번은 넣을 내 불꽃 (의뢰 조건: 공방 불꽃, 차례로 터지는 불꽃) */
  mustCustoms?: { id: string; size: Size }[];
  /** 마지막을 덮을 내 불꽃 (의뢰 조건: 긴 버들 마무리) */
  closeCustom?: { id: string; size: Size };
  /** 피날레를 적어도 이만큼(초) 꽉 채운다 (의뢰 조건) */
  finaleSeconds?: number;
  /** 특수 효과(크래클·허머·상승 효과 등)를 섞는다 */
  effects?: boolean;
  /** 실전 모드: 갑판에 실린 통 안에서만 만든다 */
  tubes?: Tube[];
  /** 이 시각 범위 안에만 만든다 (시간표에서 고른 구간 다시 만들기) */
  range?: { from: number; to: number };
}

interface MoodProfile {
  /** 박마다 놓을 확률의 바탕과 소리 크기에 따른 몫 */
  base: number;
  gain: number;
  themes: ColorName[][];
  /** 소리 크기 단계별 종류 [조용, 중간, 큼] */
  types: ShellType[][];
  /** 높은 소리가 두드러질 때 (높이 터지는 반짝이는 불꽃) */
  bright: ShellType[];
  /** 브릿지 같은 조용한 구간의 특수 효과 */
  effects: ShellType[];
  rises: RiseEffect[];
  /** 크기를 한 단계 올리는 확률, 부채꼴 확률 */
  sizeUp: number;
  fan: number;
  /** 드롭의 큰 한 방 */
  hit: ShellType[];
  hitSize: Size;
  /** 구간별 촘촘함 */
  sections: Record<SectionKind, number>;
  finale: number;
}

const MOODS: Record<Mood, MoodProfile> = {
  festive: {
    base: 0.22, gain: 0.5,
    themes: [['gold', 'white'], ['red', 'gold'], ['cyan', 'blue'], ['green', 'gold'], ['pink', 'white'], ['purple', 'pink'], ['blue', 'white'], ['gold', 'red']],
    types: [['peony', 'ring', 'chrysanthemum', 'smile'], ['chrysanthemum', 'peony', 'crossette', 'star'], ['chrysanthemum', 'crossette', 'palm', 'peony']],
    bright: ['crackle', 'crossette', 'chrysanthemum'],
    effects: ['crackle', 'fish', 'hummer', 'whistle'],
    rises: ['gold', 'color', 'flowers'],
    sizeUp: 0.25, fan: 0.4,
    hit: ['chrysanthemum', 'crossette'], hitSize: 7,
    sections: { intro: 0.6, verse: 0.9, chorus: 1.35, bridge: 0.5, outro: 1 },
    finale: 0.85,
  },
  romantic: {
    base: 0.13, gain: 0.3,
    themes: [['pink', 'white'], ['purple', 'pink'], ['pink', 'gold'], ['white', 'gold'], ['purple', 'white']],
    types: [['heart', 'willow', 'ring'], ['peony', 'heart', 'willow', 'ring'], ['willow', 'peony', 'heart']],
    bright: ['ring', 'peony'],
    effects: ['leaves', 'brocade'],
    rises: ['flowers', 'silver'],
    sizeUp: 0.1, fan: 0.12,
    hit: ['willow', 'heart'], hitSize: 7,
    sections: { intro: 0.5, verse: 0.8, chorus: 1.15, bridge: 0.45, outro: 0.9 },
    finale: 0.5,
  },
  dramatic: {
    base: 0.1, gain: 0.45,
    themes: [['gold', 'white'], ['red', 'gold'], ['white', 'blue'], ['gold', 'red']],
    types: [['willow', 'peony'], ['brocade', 'willow', 'palm', 'chrysanthemum'], ['palm', 'brocade', 'chrysanthemum', 'salute']],
    bright: ['salute', 'crackle'],
    effects: ['brocade', 'whistle', 'hummer'],
    rises: ['whistle', 'branches', 'gold'],
    sizeUp: 0.45, fan: 0.2,
    hit: ['brocade', 'willow', 'palm'], hitSize: 10,
    sections: { intro: 0.3, verse: 0.5, chorus: 1.5, bridge: 0.15, outro: 1 },
    finale: 0.9,
  },
  calm: {
    base: 0.12, gain: 0.3,
    themes: [['gold', 'white'], ['cyan', 'blue'], ['white', 'cyan'], ['gold', 'green']],
    types: [['willow', 'peony', 'ring'], ['peony', 'willow', 'heart', 'chrysanthemum'], ['willow', 'chrysanthemum', 'peony']],
    bright: ['ring', 'peony'],
    effects: ['leaves', 'brocade'],
    rises: ['silver'],
    sizeUp: 0.05, fan: 0.15,
    hit: ['willow'], hitSize: 7,
    sections: { intro: 0.6, verse: 0.85, chorus: 1.1, bridge: 0.6, outro: 1 },
    finale: 0.55,
  },
};

const round3 = (x: number) => Math.round(x * 1000) / 1000;
const SIZE_STEPS: Size[] = [3, 5, 7, 10];
const stepSize = (s: Size, d: number): Size => SIZE_STEPS[Math.max(0, Math.min(3, SIZE_STEPS.indexOf(s) + d))];
/** 효과 종류 (팔레트에 새로 들어온 것): 효과를 끄면 쓰지 않는다 */
const EFFECT_TYPES: FireworkType[] = ['crackle', 'brocade', 'fish', 'hummer', 'leaves', 'salute', 'whistle'];
const FALLBACK: Partial<Record<ShellType, ShellType>> = {
  brocade: 'willow', leaves: 'willow', salute: 'chrysanthemum', crackle: 'chrysanthemum',
  fish: 'peony', hummer: 'peony', whistle: 'chrysanthemum', heart: 'peony', smile: 'peony', star: 'peony', palm: 'chrysanthemum', crossette: 'chrysanthemum',
};

interface Placed extends Cue {
  /** 예산을 넘을 때 덜 중요한 것부터 뺀다 */
  importance: number;
}

/** 면에 그린 모양 불꽃: 방향을 정할 수 없어 여러 발을 함께 쏜다 */
const PATTERN_TYPES: FireworkType[] = ['heart', 'star', 'smile'];

export function autoChoreograph(music: MusicMap, launchers: Launcher[], o: AutoOptions): Cue[] {
  const rnd = mulberry32(o.seed);
  const pick = <T>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)];
  const mood: Mood = o.mood ?? (o.style === 'calm' ? 'calm' : 'festive');
  const P = MOODS[mood];
  // 내 불꽃은 쓸 수 있는 것(개발한 것)만 넘겨받으므로 따로 막지 않는다.
  const can = (t: FireworkType) => t === 'custom' || ((!o.allowed || o.allowed.includes(t)) && (o.effects || !EFFECT_TYPES.includes(t)));
  const sizeCap = (s: Size): Size => (o.maxSize && s > o.maxSize ? o.maxSize : s);
  const barges = launchers.filter((l) => l.kind === 'barge').sort((a, b) => a.pos[0] - b.pos[0]);
  const bridge = launchers.find((l) => l.kind === 'bridge');
  const frame = launchers.find((l) => l.kind === 'frame');
  if (!barges.length) return [];

  const beat = 60 / music.bpm;
  /** 한 마디의 박 수 (마디 첫 박에 크게) */
  const bar = music.beatsPerBar ?? 4;
  const n = music.energy.length;
  const end = music.duration - 1.5;
  // 의뢰가 피날레 길이를 정했으면 그만큼(채점이 보는 여유 2초 포함) 앞당긴다.
  const finaleStart = Math.min(Math.max(end * 0.86, end - 14), o.finaleSeconds ? music.duration - o.finaleSeconds - 2 : Infinity);
  const center = barges[Math.floor(barges.length / 2)];
  const left = barges[0];
  const right = barges[barges.length - 1];
  const colorsOk = (cs: ColorName[]) => (o.colors ? cs.filter((c) => o.colors!.includes(c)) : cs);
  const pool = o.colors?.length ? o.colors : COLOR_NAMES;
  // 흰빛 불꽃(나이아가라·살루트)도 색 조건을 따른다.
  const white: ColorName[] = colorsOk(['white']).length ? ['white'] : [pool[0]];
  const inRange = (t: number) => !o.range || (t >= o.range.from && t < o.range.to);
  const sectionAt = (t: number): SectionKind => music.sections?.find((s) => t >= s.start && t < s.end)?.kind ?? 'verse';
  // 쓸 수 없는 종류는 비슷한 기본 불꽃으로 바꾼다.
  const typeOk = (t: ShellType): ShellType => {
    if (can(t)) return t;
    const near = FALLBACK[t];
    if (near && can(near)) return near;
    return can('peony') ? 'peony' : 'chrysanthemum';
  };

  // 구간마다 색 조합을 바꾼다 (구간 정보가 없으면 8마디마다).
  const sectionIndex = (i: number) => {
    const t = music.offset + i * beat;
    const k = music.sections?.findIndex((s) => t >= s.start && t < s.end) ?? -1;
    return k >= 0 ? k : Math.floor(i / 32);
  };
  const liked = colorsOk(o.liked ?? []);
  const themeFor = (i: number): ColorName[] => {
    // 좋아하는 색을 앞에 두고 분위기 색을 섞는다 (세 가지까지).
    const theme = [...new Set([...liked, ...colorsOk(P.themes[(sectionIndex(i) + o.seed) % P.themes.length])])].slice(0, Math.max(3, liked.length));
    return theme.length ? theme : [pool[sectionIndex(i) % pool.length]];
  };

  // 실전 모드: 실린 통만 쓴다. 바지선마다 크기·각도가 맞는 빈 통을 하나씩 쓴다.
  const freeTubes = o.tubes ? [...o.tubes] : null;
  const takeTube = (at: string, size: Size, angle: number, cake: boolean): boolean => {
    if (!freeTubes) return true;
    const k = freeTubes.findIndex((t) => t.launcher === at && (cake ? t.kind === 'cake' : t.size === size && Math.abs(t.angle - angle) <= 2.5));
    if (k < 0) return false;
    freeTubes.splice(k, 1);
    return true;
  };
  const fanAngles = (c: { angle?: number; fan?: { count: number; spread: number } }) => {
    const count = c.fan?.count ?? 1;
    const spread = c.fan?.spread ?? 0;
    return Array.from({ length: count }, (_, k) => (c.angle ?? 0) + (count > 1 ? -spread / 2 + (spread * k) / (count - 1) : 0));
  };

  const out: Placed[] = [];
  // 같은 발사 위치에서 0.45초 안에 또 쏘지 않는다 (나중에 앞 시각에 끼워 넣는 꼭 넣을 불꽃도 앞뒤를 본다).
  const busy = (at: string, t: number) => out.some((x) => x.at === at && Math.abs(x.t - t) < 0.45);
  const place = (c: Omit<Cue, 'colors'> & { colors?: ColorName[] }, importance: number) => {
    if (!can(c.type) || !inRange(c.t)) return false;
    // 모양 불꽃은 아무 방향으로 서므로, 실제 연출처럼 세 발을 함께 쏴 하나라도 제대로 보이게 한다.
    if (PATTERN_TYPES.includes(c.type) && !c.fan) c = { ...c, fan: { count: 3, spread: 16 } };
    if (c.t < (isShell(c.type) ? shellSize(c.type as ShellType, c.size).prefire + 0.2 : 0)) return false;
    if (busy(c.at, c.t) && c.type !== 'niagara' && c.type !== 'lancework') return false;
    if (freeTubes && barges.some((b) => b.id === c.at)) {
      // 맞는 통이 없으면 다른 바지선, 그래도 없으면 부채꼴을 한 발로 줄여 본다.
      const tryAt = (cue: typeof c) => {
        const want = cue.type === 'cake' ? [0] : fanAngles(cue);
        const saved = [...freeTubes];
        for (const a of want) {
          if (!takeTube(cue.at, cue.size, a, cue.type === 'cake')) {
            freeTubes.splice(0, freeTubes.length, ...saved);
            return false;
          }
        }
        return true;
      };
      const options = [c, ...barges.filter((b) => b.id !== c.at).map((b) => ({ ...c, at: b.id, angle: 0 }))];
      if (c.fan) options.push(...options.map((x) => ({ ...x, fan: undefined })));
      const ok = options.find((x) => !busy(x.at, x.t) && tryAt(x));
      if (!ok) return false;
      c = ok;
      if (!c.fan) delete c.fan;
      if (!c.angle) delete c.angle;
    }
    out.push({ ...c, t: round3(c.t), colors: c.colors && c.colors.length ? c.colors : [pool[0]], importance });
    return true;
  };

  // 드롭과 조용해지는 순간 (박 번호)
  const dropBeats = new Set((music.drops ?? []).map((t) => Math.round((t - music.offset) / beat)));
  const hushBeats = (music.hushes ?? []).map((t) => Math.round((t - music.offset) / beat));
  const hushed = (i: number) => hushBeats.some((h) => i >= h && i < h + 4);

  // 기본 흐름: 박마다 놓을지 정한다.
  for (let i = 0; i < n; i++) {
    const t = music.offset + i * beat;
    if (t >= finaleStart) break;
    const e = music.energy[i];
    const downbeat = i % bar === 0;
    const theme = themeFor(i);
    const color = [theme[i % theme.length]];

    // 드롭: 모든 바지선에서 큰 한 방
    if (dropBeats.has(i)) {
      const type = typeOk(pick(P.hit));
      const size = sizeCap(P.hitSize);
      for (const b of barges) place({ t, at: b.id, type, size, colors: theme, angle: b === left ? -8 : b === right ? 8 : 0 }, 4);
      if (o.effects && (mood === 'dramatic' || mood === 'festive') && can('salute')) place({ t: t + beat / 2, at: center.id, type: 'salute', size: sizeCap(5), colors: white }, 3);
      continue;
    }
    // 조용해진 뒤 한 마디는 비운다 (첫 박에 작게 하나만)
    if (hushed(i)) {
      if (hushBeats.includes(i)) place({ t, at: center.id, type: typeOk(mood === 'dramatic' ? 'willow' : 'peony'), size: sizeCap(3), colors: color }, 2);
      continue;
    }

    const kind = sectionAt(t);
    const strong = downbeat || music.accent[i] > 0.7;
    let p = (P.base + P.gain * e) * o.density * P.sections[kind];
    if (downbeat) p += 0.2 * P.sections[kind];
    if (!strong) p *= 0.6;
    if (rnd() > p) continue;

    const tier = e < 0.35 ? 0 : e < 0.7 ? 1 : 2;
    let size: Size = e < 0.3 ? 3 : e < 0.6 ? 5 : e < 0.85 || !downbeat ? 7 : 10;
    if (rnd() < P.sizeUp) size = stepSize(size, 1);
    if (mood === 'calm' && size > 5 && rnd() < 0.6) size = 5;
    let type: ShellType = pick(P.types[tier]);

    // 높은 소리는 높이(반짝이는 불꽃을 크게 올리고), 낮은 소리는 낮고 크게(작은 알 굵은 불꽃·케이크)
    const hi = music.high?.[i] ?? 0;
    const lo = music.low?.[i] ?? 0;
    let cake = false;
    if (hi - lo > 0.25) {
      type = pick(P.bright);
      size = stepSize(size, 1);
    } else if (lo - hi > 0.25) {
      size = stepSize(size, -1);
      cake = downbeat && rnd() < 0.3 && can('cake');
    }
    // 브릿지에는 특수 효과
    if (o.effects && kind === 'bridge' && rnd() < 0.6) type = pick(P.effects);
    type = typeOk(type);
    size = sizeCap(size);
    const rise = o.effects && kind === 'chorus' && downbeat && rnd() < 0.35 ? { rise: pick(P.rises) } : {};

    // 후렴 첫 박에 내 불꽃
    if (o.customs?.length && (kind === 'chorus' || kind === 'bridge') && downbeat && rnd() < 0.3) {
      const c = pick(o.customs);
      if (place({ t, at: center.id, type: 'custom', custom: c.id, size: sizeCap(c.size), colors: color }, 3)) continue;
    }

    if (cake) {
      place({ t, at: pick(barges).id, type: 'cake', size: sizeCap(3), colors: theme, shots: 12, interval: 0.12, pattern: pick(['fan', 'zigzag'] as const) }, 2);
    } else if (downbeat && e > 0.65 && i % (2 * bar) === 0) {
      // 큰 마디 첫 박: 양쪽 바지선에서 같은 불꽃을 마주 보게
      place({ t, at: left.id, type, size, colors: color, angle: -10, ...rise }, 3);
      place({ t, at: right.id, type, size, colors: color, angle: 10, ...rise }, 3);
    } else if (downbeat && e > 0.5 && rnd() < P.fan) {
      place({ t, at: center.id, type: typeOk('chrysanthemum'), size: sizeCap(3), colors: color, fan: { count: 5, spread: 50 } }, 2);
    } else {
      const at = barges[(i + Math.floor(rnd() * 2)) % barges.length];
      place({ t, at: at.id, type, size, colors: color, angle: at === left ? -6 : at === right ? 6 : 0, ...rise }, downbeat ? 2 : 1);
    }
  }

  // 꼭 넣어야 하는 불꽃: 조용한 첫 박부터, 가운데·양쪽 바지선과 반 박 뒤까지 차례로 찾아 놓일 때까지 (두 번).
  const quiet = [...Array(n).keys()]
    .filter((i) => i % bar === 0 && music.offset + i * beat < finaleStart && music.offset + i * beat > 6)
    .sort((a, b) => music.energy[a] - music.energy[b]);
  const placeQuietly = (make: (t: number, at: string, i: number) => Omit<Cue, 'colors'> & { colors?: ColorName[] }, times: number) => {
    let done = 0;
    // 박 위를 먼저 (모든 바지선), 자리가 없을 때만 반 박 뒤에
    for (const shift of [0, 0.5]) {
      for (const i of quiet) {
        if (done >= times) return;
        for (const at of [center, left, right]) {
          if (place(make(music.offset + (i + shift) * beat, at.id, i), 4)) {
            done++;
            break;
          }
        }
      }
    }
  };
  // 이미 흐름 속에 있으면 예산을 줄일 때 빠지지 않게 중요도만 올린다.
  const keep = (found: Placed | undefined) => (found ? ((found.importance = Math.max(found.importance, 4)), true) : false);
  for (const want of o.include ?? []) {
    if (keep(out.find((c) => c.type === want)) || !isShell(want) || want === 'cake' || !can(want)) continue;
    placeQuietly((t, at, i) => ({ t, at, type: want, size: sizeCap(5), colors: [themeFor(i)[0]] }), 2);
  }
  for (const c of o.mustCustoms ?? []) {
    if (keep(out.find((x) => x.custom === c.id))) continue;
    placeQuietly((t, at, i) => ({ t, at, type: 'custom', custom: c.id, size: sizeCap(c.size), colors: [themeFor(i)[0]] }), 1);
  }

  // 틀불꽃: 곡 가운데쯤 잔잔한 곳에서 글자를 띄운다.
  if (frame && o.text && can('lancework')) {
    const mid = Math.floor(n * 0.45);
    let best = mid;
    for (let i = mid - 8; i < mid + 8; i++) if (i > 0 && i < n && music.energy[i] < music.energy[best]) best = i;
    const t = music.offset + Math.max(0, best - (best % bar)) * beat;
    if (t < finaleStart - 4) place({ t, at: frame.id, type: 'lancework', size: 5, colors: [themeFor(best)[0]], text: o.text, len: 10 }, 4);
  }

  // 피날레: 반 박마다 양쪽을 번갈아, 케이크와 나이아가라를 깔고, 마지막은 큰 버들로 덮는다.
  const fb = Math.ceil((finaleStart - music.offset) / beat);
  const lastBeat = Math.floor((end - music.offset) / beat) - 1;
  if (bridge && can('niagara')) {
    // 의뢰가 나이아가라를 요구하면 예산을 줄일 때도 남긴다.
    const must = o.include?.includes('niagara') ? 4 : 3;
    place({ t: music.offset + fb * beat, at: bridge.id, type: 'niagara', size: 5, colors: white, len: Math.min(14, end - finaleStart) }, must);
  }
  if (can('cake')) {
    const theme = themeFor(fb);
    place({ t: music.offset + (fb + 2) * beat, at: left.id, type: 'cake', size: sizeCap(5), colors: theme, shots: 24, interval: 0.15, pattern: 'fan' }, 3);
    place({ t: music.offset + (fb + 2) * beat, at: right.id, type: 'cake', size: sizeCap(5), colors: theme, shots: 24, interval: 0.15, pattern: 'fan' }, 3);
  }
  // 박마다 두 바지선이 함께 쏜다 (반 박에 쏘면 박자가 어긋나 보인다).
  for (let h = fb * 2; h < (lastBeat - 1) * 2; h++) {
    const t = music.offset + Math.floor(h / 2) * beat;
    // 의뢰가 피날레를 요구하면 빠짐없이
    if (!o.finaleSeconds && rnd() > P.finale * Math.max(0.6, o.density)) continue;
    const at = barges[(h + Math.floor(h / 2)) % barges.length];
    const theme = themeFor(Math.floor(h / 2));
    const finaleType: ShellType = mood === 'romantic' ? (h % 4 === 0 ? 'heart' : 'peony') : h % 4 === 0 ? 'chrysanthemum' : h % 4 === 2 ? 'crossette' : 'peony';
    // 의뢰가 피날레를 요구하면 작은 알로 촘촘히 채우고, 예산을 줄일 때 피날레는 나중에 뺀다.
    const size: Size = o.finaleSeconds ? (h % 8 === 0 ? 5 : 3) : h % 8 === 0 ? 7 : 5;
    place({ t, at: at.id, type: typeOk(finaleType), size: sizeCap(size), colors: [theme[h % theme.length]] }, o.finaleSeconds ? 3.5 : 2);
  }
  const closeT = music.offset + lastBeat * beat;
  const closeType: ShellType = o.effects && mood === 'dramatic' && can('brocade') ? 'brocade' : can('willow') ? 'willow' : 'chrysanthemum';
  const closeColors = colorsOk(['gold']).length ? (['gold'] as ColorName[]) : [pool[0]];
  // 마지막 큰 버들은 예산의 4분의 1을 넘지 않는 크기로 (작은 예산을 마지막 한 방에 다 쓰지 않게)
  let closeSize = sizeCap(10);
  while (o.budget !== undefined && closeSize > 3 && barges.length * SHELL_COST[closeSize] > o.budget * 0.25) closeSize = stepSize(closeSize, -1);
  for (const at of barges) {
    // 긴 버들 마무리: 마지막을 내 불꽃(카무로)으로 덮는다.
    const mine = o.closeCustom;
    if (mine && place({ t: closeT, at: at.id, type: 'custom', custom: mine.id, size: sizeCap(mine.size), colors: closeColors }, 5)) continue;
    place({ t: closeT, at: at.id, type: closeType, size: closeSize, colors: closeColors }, 5);
  }

  // 예산: 넘치면 먼저 덜 중요한 알부터 한 단계씩 작게 (하늘은 채운 채로), 그래도 넘치면 덜 중요하고 비싼 것부터 뺀다.
  if (o.budget !== undefined) {
    const limit = o.budget * 0.95;
    let total = out.reduce((s, c) => s + cueCost(c), 0);
    const shrinkable = out
      .filter((c) => c.importance < 4 && isShell(c.type) && c.type !== 'cake' && c.type !== 'custom' && c.size > 3)
      .sort((a, b) => a.importance - b.importance || b.size - a.size);
    for (const c of shrinkable) {
      if (total <= limit) break;
      while (total > limit && c.size > 3) {
        const before = cueCost(c);
        c.size = stepSize(c.size, -1);
        total += cueCost(c) - before;
      }
    }
    const order = [...out].sort((a, b) => a.importance - b.importance || cueCost(b) - cueCost(a));
    for (const c of order) {
      if (total <= limit) break;
      if (c.importance >= 4) continue;
      total -= cueCost(c);
      out.splice(out.indexOf(c), 1);
    }
  }

  // 빈 하늘 메우기: 오래 비는 곳(차분할수록 조금 더 길게 둔다)에 작은 알을 박에 맞춰 넣는다.
  // 조용해진 뒤 일부러 비운 한 마디는 그대로 두고, 예산이 모자라면 붐비는 곳(1.5초 안에 다른 불꽃이 있는 곳)의 덜 중요한 불꽃을 덜어 낸다.
  {
    const maxGap = mood === 'calm' ? 4.5 : mood === 'romantic' ? 4 : 3.5;
    const rest = (t: number) => hushBeats.some((h) => t >= music.offset + (h - 0.5) * beat && t < music.offset + (h + bar + 0.5) * beat);
    const limit = o.budget !== undefined ? o.budget * 0.95 : Infinity;
    let spent = out.reduce((sum, c) => sum + cueCost(c), 0);
    const fillTypes = [...new Set((['peony', 'chrysanthemum', 'ring', 'willow', 'palm', 'crossette'] as ShellType[]).map(typeOk))];
    const lastT = Math.min(finaleStart, end - 2);
    const crowded = (c: Placed) => c.importance <= 2 && out.some((x) => x !== c && Math.abs(x.t - c.t) < 1.5);
    let from = 4;
    for (let k = 0; k < 400 && from < lastT; k++) {
      // from 뒤의 첫 빈 구간
      let cursor = from;
      let gap: [number, number] | null = null;
      for (const c of [...out].sort((a, b) => a.t - b.t)) {
        if (c.t - cursor > maxGap) {
          gap = [cursor, Math.min(c.t, lastT)];
          break;
        }
        cursor = Math.max(cursor, c.t + cueLength(c as Cue));
      }
      if (!gap && lastT - cursor > maxGap) gap = [cursor, lastT];
      if (!gap || gap[1] - gap[0] <= maxGap) break;
      let b = Math.round((gap[0] + 2 - music.offset) / beat);
      // 쉬는 마디 안이면 그 마디가 끝난 뒤로
      while (rest(music.offset + b * beat) && music.offset + b * beat < gap[1]) b++;
      const t = music.offset + b * beat;
      const cue = { t, at: barges[k % barges.length].id, type: fillTypes[k % fillTypes.length], size: 3 as Size, colors: [themeFor(b)[k % themeFor(b).length]] };
      // 예산: 붐비는 곳에서 덜어 내 자리를 만든다.
      while (spent + cueCost(cue) > limit) {
        const spare = out.filter(crowded).sort((x, y) => cueCost(y) - cueCost(x))[0];
        if (!spare) break;
        spent -= cueCost(spare);
        out.splice(out.indexOf(spare), 1);
      }
      if (spent + cueCost(cue) > limit) break;
      const ok = barges.some((at) => place({ ...cue, at: at.id }, 3));
      if (ok) spent += cueCost(cue);
      // 놓지 못한 빈 구간은 건너뛴다.
      else from = gap[0] + maxGap;
    }
  }

  // 연기 피하기: 앞 불꽃 연기에 가리는 불꽃은 다른 바지선으로 옮기거나(앞 두 번),
  // 크기를 한 단계 바꿔 다른 높이에서 터뜨리고(다음 두 번), 그래도 가리면 붐비는 곳의 덜 중요한 것은 뺀다.
  // 실전 모드(실린 통)는 자리와 크기를 바꿀 수 없어 건너뛴다. 바람을 모르면(쇼에 날씨가 없으면) 하지 않는다.
  if (!freeTubes && o.wind) {
    const show: Show = { version: 1, seed: o.seed, venue: { preset: 'river-bridge-city', wind: o.wind }, launchers, cues: out as Cue[] };
    const freeAt = (at: string, c: Placed) => !out.some((x) => x !== c && x.at === at && Math.abs(x.t - c.t) < 0.45);
    const limit = o.budget !== undefined ? o.budget * 0.95 : Infinity;
    let spent = out.reduce((sum, c) => sum + cueCost(c), 0);
    // 바람이 불어오는 쪽 바지선일수록 앞 연기가 덜 흘러온다 (옮길 곳은 바람 위쪽부터 고른다).
    const wv = windVector(show);
    const upwind = [...barges].sort((a, b) => a.pos[0] * wv[0] + a.pos[2] * wv[2] - (b.pos[0] * wv[0] + b.pos[2] * wv[2]));
    for (let pass = 0; pass < 8; pass++) {
      const { obscured } = analyzeSmoke(expandShow(show).launches, wv);
      if (!obscured.size) break;
      const drop = new Set<Placed>();
      for (const idx of new Set([...obscured].map((l) => l.cueIndex))) {
        const c = out[idx];
        // 드롭의 큰 한 방, 꼭 넣을 것, 마지막 한 방은 그대로 둔다.
        if (c.importance >= 4) continue;
        // 짝수 번째는 다른 바지선(바람 위쪽부터)으로, 홀수 번째는 높이를 바꾸고, 마지막엔 붐비는 곳이면 뺀다.
        const other = pass % 2 === 0 && pass < 6 ? upwind.find((b) => b.id !== c.at && freeAt(b.id, c)) : undefined;
        const resizable = isShell(c.type) && c.type !== 'cake' && c.type !== 'custom';
        if (other) {
          c.at = other.id;
          if (c.angle) c.angle = other === left ? -Math.abs(c.angle) : other === right ? Math.abs(c.angle) : 0;
        } else if (pass < 7 && resizable) {
          // 낮게 터지면 앞 연기 밑으로, 예산·크기 제한 안에서는 높게
          const down = stepSize(c.size, -1);
          const up = sizeCap(stepSize(c.size, 1));
          const extra = cueCost({ ...c, size: up }) - cueCost(c);
          const before = cueCost(c);
          c.size = (pass + idx) % 2 === 0 && down !== c.size ? down : up !== c.size && extra <= 2 && spent + extra <= limit ? up : down;
          spent += cueCost(c) - before;
        } else if (pass === 7 && crowdedForSmoke(c)) drop.add(c);
      }
      for (const c of drop) {
        spent -= cueCost(c);
        out.splice(out.indexOf(c), 1);
      }
      show.cues = out as Cue[];
    }
  }

  // 마지막 몇 초 색 조건 (메운 불꽃까지)
  if (o.endColors) {
    const from = music.duration - o.endColors.seconds;
    // 케이크는 마지막 발이 터지는 때까지 본다 (앞서 시작해도 끝이 그 안에 들면).
    const lastBurst = (c: Placed) => c.t + (c.type === 'cake' ? ((c.shots ?? 1) - 1) * (c.interval ?? 0) : 0);
    for (const c of out) if (lastBurst(c) >= from - 0.01) c.colors = [o.endColors.colors[0]];
  }

  return out
    .sort((a, b) => a.t - b.t)
    .map(({ importance: _, ...c }) => c);

  /** 빼도 하늘이 비지 않는 덜 중요한 불꽃 */
  function crowdedForSmoke(c: Placed): boolean {
    return c.importance <= 2 && out.some((x) => x !== c && Math.abs(x.t - c.t) < 1.5);
  }
}
