// 기본 곡 3개. 음원 파일을 싣지 않고 브라우저 안에서 합성한다.
// 저작권 걱정이 없고, 박자와 첫 박 위치를 정확히 알고 있어서 박자 찾기가 필요 없다.

import { mulberry32 } from '@nss/engine';

type Style = 'march' | 'calm' | 'drive';

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
];

export function trackDuration(t: BasicTrack): number {
  return (t.bars * 4 * 60) / t.bpm + 1.5;
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

  const barsPerChord = t.style === 'calm' ? 2 : 1;
  for (let bar = 0; bar < t.bars; bar++) {
    const barStart = bar * 4 * beat;
    const chord = PROGRESSION[Math.floor(bar / barsPerChord) % 4];
    const intro = bar < 2;
    const finale = bar >= t.bars - 4;

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
}

const cache = new Map<string, Promise<AudioBuffer>>();

export function loadBasicTrack(id: string): Promise<AudioBuffer> | null {
  const t = BASIC_TRACKS.find((x) => x.id === id);
  if (!t) return null;
  if (!cache.has(id)) cache.set(id, renderTrack(t));
  return cache.get(id)!;
}
