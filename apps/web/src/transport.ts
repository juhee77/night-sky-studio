// 재생 시계와 소리. 화면의 시각은 오디오 시계를 따른다.
// 그래야 음악과 불꽃이 어긋나지 않는다 (블루투스 이어폰 지연도 빼서 맞춘다).

import type { CrowdCue, Launch } from '@nss/engine';
import { Sfx, scheduleSounds, type Scheduled } from './sfx.ts';

const LOOKAHEAD = 0.25;

export class Transport {
  ctx: AudioContext | null = null;
  private music: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private musicGain: GainNode | null = null;
  private sfx: Sfx | null = null;
  private scheduled: Scheduled[] = [];
  private scheduledUntil = 0;

  playing = false;
  soundOn = true;
  /** 관람석 거리만큼 소리를 늦춘다 (감상할 때만). null이면 늦추지 않는다. */
  delayFor: ((l: Launch) => number) | null = null;
  /** 관객 함성과 박수 (감상할 때만). null이면 내지 않는다. */
  crowd: CrowdCue[] | null = null;
  /** 재생을 시작한 오디오 시계 시각 */
  private startCtx = 0;
  /** 재생을 시작한 쇼 시각 */
  private startAt = 0;
  private position = 0;

  /** 사용자가 버튼을 누른 순간에 불러야 소리가 난다. */
  ensureContext(): AudioContext {
    if (!this.ctx) {
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      this.musicGain = ctx.createGain();
      this.musicGain.gain.value = 0.8;
      this.musicGain.connect(ctx.destination);
      this.sfx = new Sfx(ctx, ctx.destination);
      this.ctx = ctx;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  get musicBuffer(): AudioBuffer | null {
    return this.music;
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
    if (!this.playing || !this.ctx || !this.sfx || !this.soundOn) return;
    const from = this.scheduledUntil;
    const to = this.time + LOOKAHEAD;
    if (to <= from) return;
    scheduleSounds(
      this.sfx, launches, from, to,
      (t) => this.startCtx + (t - this.startAt),
      { delayFor: this.delayFor, crowd: this.crowd, fanCount },
      (s) => this.scheduled.push(s),
    );
    this.scheduledUntil = to;
    const now = this.ctx.currentTime;
    this.scheduled = this.scheduled.filter((s) => s.end > now);
  }

  /** 카운트다운 소리 */
  beep(last = false): void {
    const ctx = this.ensureContext();
    this.sfx!.beep(ctx.currentTime + 0.01, last);
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
