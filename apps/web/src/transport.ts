// 재생 시계와 소리. 화면의 시각은 오디오 시계를 따른다.
// 그래야 음악과 불꽃이 어긋나지 않는다 (블루투스 이어폰 지연도 빼서 맞춘다).

import { SIZE_SPECS, mulberry32, type Launch } from '@nss/engine';

const LOOKAHEAD = 0.25;

export class Transport {
  ctx: AudioContext | null = null;
  private music: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private musicGain: GainNode | null = null;
  private sfx: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private scheduled: { node: AudioScheduledSourceNode; end: number }[] = [];
  private scheduledUntil = 0;

  playing = false;
  soundOn = true;
  /** 재생을 시작한 오디오 시계 시각 */
  private startCtx = 0;
  /** 재생을 시작한 쇼 시각 */
  private startAt = 0;
  private position = 0;

  /** 사용자가 버튼을 누른 순간에 불러야 소리가 난다. */
  ensureContext(): AudioContext {
    if (!this.ctx) {
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -10;
      comp.connect(ctx.destination);
      this.musicGain = ctx.createGain();
      this.musicGain.gain.value = 0.8;
      this.musicGain.connect(ctx.destination);
      this.sfx = ctx.createGain();
      this.sfx.gain.value = 0.9;
      this.sfx.connect(comp);
      const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noise.getChannelData(0);
      const rnd = mulberry32(99);
      for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1;
      this.noise = noise;
      this.ctx = ctx;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  setMusic(buffer: AudioBuffer | null): void {
    const was = this.playing;
    if (was) this.pause();
    this.music = buffer;
    if (was) this.play();
  }

  private get latency(): number {
    const c = this.ctx;
    if (!c) return 0;
    return (c.outputLatency || 0) + (c.baseLatency || 0);
  }

  /** 지금 보여 줄 쇼 시각(초) */
  get time(): number {
    if (!this.playing || !this.ctx) return this.position;
    return Math.max(this.startAt, this.ctx.currentTime - this.latency - this.startCtx + this.startAt);
  }

  play(): void {
    const ctx = this.ensureContext();
    this.startAt = this.position;
    this.startCtx = ctx.currentTime + 0.03;
    this.scheduledUntil = this.startAt;
    if (this.music && this.startAt < this.music.duration) {
      const src = ctx.createBufferSource();
      src.buffer = this.music;
      src.connect(this.musicGain!);
      src.start(this.startCtx, this.startAt);
      this.source = src;
    }
    this.playing = true;
  }

  pause(): void {
    this.position = this.time;
    this.playing = false;
    this.source?.stop();
    this.source = null;
    for (const { node } of this.scheduled) {
      try {
        node.stop();
      } catch {
        // 이미 끝난 소리
      }
    }
    this.scheduled = [];
  }

  seek(t: number): void {
    const was = this.playing;
    if (was) this.pause();
    this.position = Math.max(0, t);
    if (was) this.play();
  }

  /** 앞으로 LOOKAHEAD초 안에 날 발사음과 폭발음을 미리 걸어 둔다. */
  schedule(launches: Launch[], fanCount: (l: Launch) => number): void {
    if (!this.playing || !this.ctx || !this.soundOn) return;
    const from = this.scheduledUntil;
    const to = this.time + LOOKAHEAD;
    if (to <= from) return;
    for (const l of launches) {
      if (l.sub !== 0) continue;
      const count = fanCount(l);
      if (l.burstAt >= from && l.burstAt < to) this.boom(this.toCtx(l.burstAt), l.size, count);
      if (l.fireAt >= from && l.fireAt < to) this.thump(this.toCtx(l.fireAt), count);
    }
    this.scheduledUntil = to;
    const now = this.ctx.currentTime;
    this.scheduled = this.scheduled.filter((s) => s.end > now);
  }

  private toCtx(showTime: number): number {
    return this.startCtx + (showTime - this.startAt);
  }

  private track(node: AudioScheduledSourceNode, end: number): void {
    this.scheduled.push({ node, end });
  }

  private boom(when: number, size: keyof typeof SIZE_SPECS, count: number): void {
    const ctx = this.ctx!;
    if (when < ctx.currentTime) return;
    const big = size / 10;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(2200 - big * 1400, when);
    f.frequency.exponentialRampToValueAtTime(90, when + 0.5 + big * 0.6);
    const g = ctx.createGain();
    const peak = Math.min(1, (0.35 + big * 0.5) * (1 + 0.15 * (count - 1)));
    const tail = 0.8 + big * 1.2;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, when + tail);
    src.connect(f).connect(g).connect(this.sfx!);
    src.start(when, (when * 7.3) % 1);
    src.stop(when + tail + 0.05);
    this.track(src, when + tail);
  }

  private thump(when: number, count: number): void {
    const ctx = this.ctx!;
    if (when < ctx.currentTime) return;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(110, when);
    o.frequency.exponentialRampToValueAtTime(40, when + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(Math.min(0.4, 0.15 * (1 + 0.2 * (count - 1))), when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.16);
    o.connect(g).connect(this.sfx!);
    o.start(when);
    o.stop(when + 0.18);
    this.track(o, when + 0.18);
  }
}

/** 시간표에 그릴 음악 파형: 구간마다 가장 큰 소리 크기 */
export function waveformPeaks(buffer: AudioBuffer, buckets = 4000): Float32Array {
  const data = buffer.getChannelData(0);
  const out = new Float32Array(buckets);
  const per = data.length / buckets;
  for (let b = 0; b < buckets; b++) {
    let m = 0;
    const end = Math.min(data.length, Math.floor((b + 1) * per));
    for (let i = Math.floor(b * per); i < end; i += 4) {
      const v = Math.abs(data[i]);
      if (v > m) m = v;
    }
    out[b] = m;
  }
  let max = 0;
  for (const v of out) max = Math.max(max, v);
  if (max > 0) for (let b = 0; b < buckets; b++) out[b] /= max;
  return out;
}
