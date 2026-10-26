// 기본 곡 다섯 개. 음원 파일을 싣지 않고 브라우저 안에서 합성한다.
// 저작권 걱정이 없고, 박자와 첫 박 위치를 정확히 알고 있어서 박자 찾기가 필요 없다.

import { mulberry32, type MusicRef } from '@nss/engine';

type Style = 'march' | 'calm' | 'drive' | 'waltz' | 'epic';

export interface BasicTrack {
  id: string;
  title: string;
  bpm: number;
  bars: number;
  /** 으뜸음 주파수(Hz) */
  root: number;
  style: Style;
}

export const BASIC_TRACKS: BasicTrack[] = [
  { id: 'basic-1', title: '밤하늘 행진', bpm: 112, bars: 28, root: 220, style: 'march' },
  { id: 'basic-2', title: '느린 강물', bpm: 84, bars: 20, root: 196, style: 'calm' },
  { id: 'basic-3', title: '피날레 질주', bpm: 132, bars: 32, root: 233.08, style: 'drive' },
  { id: 'basic-4', title: '별빛 왈츠', bpm: 108, bars: 40, root: 261.63, style: 'waltz' },
  { id: 'basic-5', title: '긴 여름밤', bpm: 104, bars: 56, root: 207.65, style: 'epic' },
];

/** 한 마디의 박 수 (왈츠는 3박자) */
const beatsPerBar = (t: BasicTrack) => (t.style === 'waltz' ? 3 : 4);

/** 기본 곡의 곡 정보: 빠르기·첫 박·박자표를 알고 있으므로 찾지 않고 그대로 쓴다. */
export function trackRef(t: BasicTrack, duration = trackDuration(t)): MusicRef {
  const ref: MusicRef = { id: t.id, title: t.title, bpm: t.bpm, offset: 0, duration: Math.round(duration * 1000) / 1000 };
  if (beatsPerBar(t) === 3) ref.beatsPerBar = 3;
  return ref;
}

/** 긴 여름밤의 짜임: 인트로 → 벌스 → 후렴 → 브릿지 → 후렴 → 끝 (자동 연출의 구간 찾기가 알아보기 좋게) */
function epicPart(bar: number): 'intro' | 'verse' | 'chorus' | 'bridge' | 'outro' {
  if (bar < 4) return 'intro';
  if (bar < 16) return 'verse';
  if (bar < 28) return 'chorus';
  if (bar < 34) return 'bridge';
  if (bar < 48) return 'chorus';
  return 'outro';
}

export function trackDuration(t: BasicTrack): number {
  return (t.bars * beatsPerBar(t) * 60) / t.bpm + 1.5;
}

const RATE = 32000;
// I – V – vi – IV
const PROGRESSION = [
  [0, 4, 7],
  [7, 11, 14],
  [9, 12, 16],
  [5, 9, 12],
];

const semi = (root: number, n: number) => root * Math.pow(2, n / 12);

export async function renderTrack(t: BasicTrack): Promise<AudioBuffer> {
  const duration = trackDuration(t);
  const ctx = new OfflineAudioContext(1, Math.ceil(duration * RATE), RATE);
  const beat = 60 / t.bpm;
  const rnd = mulberry32(t.bpm);

  const master = ctx.createDynamicsCompressor();
  master.threshold.value = -14;
  master.connect(ctx.destination);
  const out = ctx.createGain();
  out.gain.value = 0.8;
  out.connect(master);

  const noise = ctx.createBuffer(1, RATE, RATE);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = rnd() * 2 - 1;

  const padFilter = ctx.createBiquadFilter();
  padFilter.type = 'lowpass';
  padFilter.frequency.value = t.style === 'calm' ? 900 : 1400;
  padFilter.connect(out);
  const bassFilter = ctx.createBiquadFilter();
  bassFilter.type = 'lowpass';
  bassFilter.frequency.value = 500;
  bassFilter.connect(out);

  const note = (type: OscillatorType, freq: number, start: number, len: number, gain: number, dest: AudioNode, attack = 0.01) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(gain, start + attack);
    g.gain.setTargetAtTime(0, start + len - 0.05, 0.08);
    o.connect(g).connect(dest);
    o.start(start);
    o.stop(start + len + 0.5);
  };

  const kick = (at: number, gain = 0.9) => {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(150, at);
    o.frequency.exponentialRampToValueAtTime(45, at + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.32);
    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + 0.35);
  };

  const hat = (at: number, gain = 0.12) => {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.05);
    s.connect(f).connect(g).connect(out);
    s.start(at, rnd() * 0.5);
    s.stop(at + 0.06);
  };

  const barsPerChord = t.style === 'calm' || t.style === 'waltz' ? 2 : 1;
  const per = beatsPerBar(t);
  for (let bar = 0; bar < t.bars; bar++) {
    const barStart = bar * per * beat;
    const chord = PROGRESSION[Math.floor(bar / barsPerChord) % 4];
    const intro = bar < 2;
    const finale = bar >= t.bars - 4;

    if (t.style === 'waltz') {
      waltzBar(bar, barStart, chord);
      continue;
    }
    if (t.style === 'epic') {
      epicBar(epicPart(bar), barStart, chord, finale);
      continue;
    }
    if (bar % barsPerChord === 0) {
      const len = barsPerChord * 4 * beat;
      for (const n of chord) note('triangle', semi(t.root, n), barStart, len, 0.07, padFilter, 0.3);
    }

    for (let b = 0; b < 4; b++) {
      const at = barStart + b * beat;
      const bassLen = t.style === 'calm' ? beat * 2 : beat * 0.8;
      if (t.style !== 'calm' || b % 2 === 0) note('sawtooth', semi(t.root / 2, chord[0]), at, bassLen, intro ? 0.06 : 0.14, bassFilter);

      if (intro) continue;
      if (t.style === 'march') {
        kick(at);
        hat(at + beat / 2);
        if (b === 1 || b === 3) hat(at, 0.06);
      } else if (t.style === 'calm') {
        if (bar >= 8 && (b === 0 || b === 2)) kick(at, 0.6);
        if (bar >= 8) hat(at + beat / 2, 0.06);
      } else {
        kick(at);
        hat(at + beat / 4, 0.07);
        hat(at + beat / 2);
        hat(at + (3 * beat) / 4, 0.07);
      }

      // 가락: 화음 음을 8분음표로 오르내린다. 마지막 네 마디는 한 옥타브 위에서.
      if (t.style !== 'calm' || bar >= 4) {
        const up = finale ? 24 : 12;
        for (let e = 0; e < 2; e++) {
          const n = chord[(b * 2 + e) % 3] + up;
          note('square', semi(t.root, n), at + (e * beat) / 2, beat * 0.4, t.style === 'calm' ? 0.025 : 0.035, padFilter);
        }
      }
    }
  }

  return ctx.startRendering();

  /** 왈츠: 첫 박에 낮은 음, 둘째·셋째 박에 화음 (쿵짝짝) */
  function waltzBar(bar: number, barStart: number, chord: number[]): void {
    if (bar % barsPerChord === 0) for (const n of chord) note('triangle', semi(t.root, n), barStart, barsPerChord * 3 * beat, 0.05, padFilter, 0.4);
    note('sawtooth', semi(t.root / 2, chord[0]), barStart, beat * 0.9, bar < 2 ? 0.07 : 0.13, bassFilter);
    if (bar >= 2) {
      kick(barStart, 0.5);
      for (const b of [1, 2]) for (const n of chord) note('triangle', semi(t.root, n + 12), barStart + b * beat, beat * 0.5, 0.03, padFilter);
    }
    if (bar >= 6) {
      // 가락: 한 마디에 세 음
      for (let b = 0; b < 3; b++) note('sine', semi(t.root, chord[(bar + b) % 3] + 24), barStart + b * beat, beat * 0.9, 0.04, padFilter, 0.05);
    }
  }

  /** 긴 여름밤: 구간마다 세기와 악기를 바꾼다 */
  function epicBar(part: ReturnType<typeof epicPart>, barStart: number, chord: number[], finale: boolean): void {
    const big = part === 'chorus';
    for (const n of chord) note('triangle', semi(t.root, n), barStart, 4 * beat, part === 'bridge' ? 0.05 : 0.07, padFilter, part === 'intro' ? 0.8 : 0.3);
    for (let b = 0; b < 4; b++) {
      const at = barStart + b * beat;
      if (part !== 'bridge') note('sawtooth', semi(t.root / 2, chord[0]), at, beat * 0.8, part === 'intro' || part === 'outro' ? 0.05 : big ? 0.16 : 0.11, bassFilter);
      if (part === 'verse') {
        if (b % 2 === 0) kick(at, 0.7);
        hat(at + beat / 2, 0.06);
      } else if (big) {
        kick(at);
        hat(at + beat / 4, 0.08);
        hat(at + beat / 2);
        hat(at + (3 * beat) / 4, 0.08);
        for (let e = 0; e < 2; e++) note('square', semi(t.root, chord[(b * 2 + e) % 3] + (finale ? 24 : 12)), at + (e * beat) / 2, beat * 0.4, 0.04, padFilter);
      } else if (part === 'bridge') {
        // 브릿지: 북 없이 높은 소리만
        note('sine', semi(t.root, chord[b % 3] + 24), at, beat * 0.9, 0.05, padFilter, 0.1);
      } else if (part === 'outro' && b === 0) {
        kick(at, 0.4);
      }
    }
  }
}

const cache = new Map<string, Promise<AudioBuffer>>();

export function loadBasicTrack(id: string): Promise<AudioBuffer> | null {
  const t = BASIC_TRACKS.find((x) => x.id === id);
  if (!t) return null;
  if (!cache.has(id)) cache.set(id, renderTrack(t));
  return cache.get(id)!;
}
