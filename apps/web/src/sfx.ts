// 효과음 합성: 발사음, 폭발음, 나이아가라·틀불꽃 소리, 관객 함성과 박수.
// 실시간 재생(AudioContext)과 영상 만들기(OfflineAudioContext)가 같은 소리를 쓴다.

import { mulberry32, starSounds, type CrowdCue, type Launch, type Size, type StarSound } from '@nss/engine';

export interface Scheduled {
  node: AudioScheduledSourceNode;
  end: number;
}

export class Sfx {
  readonly ctx: BaseAudioContext;
  private out: GainNode;
  private noise: AudioBuffer;

  constructor(ctx: BaseAudioContext, dest: AudioNode) {
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.connect(dest);
    this.out = ctx.createGain();
    this.out.gain.value = 0.9;
    this.out.connect(comp);
    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    const rnd = mulberry32(99);
    for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1;
    this.noise = noise;
  }

  /** 실시간 재생에서 이미 지난 시각이면 건너뛴다 (영상 만들기는 0초부터라 늘 그린다). */
  private late(when: number): boolean {
    return when < this.ctx.currentTime;
  }

  boom(when: number, size: Size, count: number, scale = 1): Scheduled | null {
    if (this.late(when)) return null;
    const ctx = this.ctx;
    const big = size / 10;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(2200 - big * 1400, when);
    f.frequency.exponentialRampToValueAtTime(90, when + 0.5 + big * 0.6);
    const g = ctx.createGain();
    const peak = Math.min(1, (0.35 + big * 0.5) * (1 + 0.15 * (count - 1)) * scale);
    const tail = 0.8 + big * 1.2;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, when + tail);
    src.connect(f).connect(g).connect(this.out);
    src.start(when, (when * 7.3) % 1);
    src.stop(when + tail + 0.05);
    return { node: src, end: when + tail };
  }

  thump(when: number, count: number, scale = 1): Scheduled | null {
    if (this.late(when)) return null;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(110, when);
    o.frequency.exponentialRampToValueAtTime(40, when + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(Math.min(0.4, 0.15 * (1 + 0.2 * (count - 1)) * scale), when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.16);
    o.connect(g).connect(this.out);
    o.start(when);
    o.stop(when + 0.18);
    return { node: o, end: when + 0.18 };
  }

  /** 크래클: 아주 짧은 '탁' 소리를 촘촘하게 무작위로 */
  crackle(when: number, len: number, level: number): Scheduled | null {
    if (this.late(when)) return null;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    const rnd = mulberry32(Math.floor(when * 977));
    for (let t = 0; t < len; t += 0.006 + rnd() * 0.022) {
      const fade = t > len * 0.6 ? (len - t) / (len * 0.4) : 1;
      g.gain.setValueAtTime(0.35 * level * fade * (0.3 + rnd() * 0.7), when + t);
      g.gain.setValueAtTime(0, when + t + 0.003);
    }
    src.connect(f).connect(g).connect(this.out);
    src.start(when, (when * 5.1) % 1);
    src.stop(when + len + 0.05);
    return { node: src, end: when + len };
  }

  /** 휘슬: 높은 휘파람 소리가 떨리며 내려간다 (별 여러 개라 조금씩 어긋난 셋) */
  whistle(when: number, len: number, level: number, rising = false): Scheduled | null {
    if (this.late(when)) return null;
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.09 * level, when + 0.08);
    g.gain.setValueAtTime(0.09 * level, when + len * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, when + len);
    g.connect(this.out);
    let last: OscillatorNode | null = null;
    for (const [k, detune] of [[0, 0], [1, 1.07], [2, 0.94]] as const) {
      // 별 휘슬은 셋이 내려가고, 올라가는 알의 휘슬은 한 줄기로 올라간다.
      if (rising && k > 0) continue;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime((rising ? 900 : 2900) * (detune || 1), when + k * 0.05);
      o.frequency.exponentialRampToValueAtTime((rising ? 2700 : 1300) * (detune || 1), when + len);
      const vib = ctx.createOscillator();
      vib.frequency.value = 23 + k * 3;
      const vg = ctx.createGain();
      vg.gain.value = 40;
      vib.connect(vg).connect(o.frequency);
      o.connect(g);
      o.start(when + k * 0.05);
      vib.start(when + k * 0.05);
      o.stop(when + len + 0.05);
      vib.stop(when + len + 0.05);
      last = o;
    }
    return last && { node: last, end: when + len };
  }

  /** 허머: 낮게 윙윙 떨리는 소리 */
  hum(when: number, len: number, level: number): Scheduled | null {
    if (this.late(when)) return null;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 170;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 9;
    const lg = ctx.createGain();
    lg.gain.value = 45;
    lfo.connect(lg).connect(o.frequency);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.1 * level, when + 0.1);
    g.gain.setValueAtTime(0.1 * level, when + len * 0.75);
    g.gain.exponentialRampToValueAtTime(0.0001, when + len);
    o.connect(f).connect(g).connect(this.out);
    o.start(when);
    lfo.start(when);
    o.stop(when + len + 0.05);
    lfo.stop(when + len + 0.05);
    return { node: o, end: when + len };
  }

  /** 살루트: 날카로운 '딱'과 아주 큰 '쾅' */
  salute(when: number, level: number): Scheduled | null {
    if (this.late(when)) return null;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(Math.min(1, 0.9 * level), when + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.12);
    src.connect(f).connect(g).connect(this.out);
    src.start(when, (when * 2.7) % 1);
    src.stop(when + 0.15);
    this.boom(when, 10, 3, 1.6 * level);
    return { node: src, end: when + 0.15 };
  }

  /** 별 소리 하나를 건다 */
  star(when: number, s: StarSound, level: number): Scheduled | null {
    if (s.kind === 'crackle') return this.crackle(when, s.len, level);
    if (s.kind === 'whistle') return this.whistle(when, s.len, level);
    if (s.kind === 'rise-whistle') return this.whistle(when, s.len, level * 0.8, true);
    if (s.kind === 'hummer') return this.hum(when, s.len, level);
    return this.salute(when, level);
  }

  /** 카운트다운 소리: 짧은 삐 소리 (마지막은 높고 길게) */
  beep(when: number, last = false): void {
    const o = this.ctx.createOscillator();
    o.frequency.value = last ? 1320 : 880;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.25, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, when + (last ? 0.6 : 0.15));
    o.connect(g).connect(this.out);
    o.start(when);
    o.stop(when + 0.7);
  }

  /** 관객 함성: 사람 목소리 높이의 잡음이 부풀었다 가라앉는다. */
  cheer(when: number, level: number): Scheduled | null {
    if (this.late(when)) return null;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const low = ctx.createBiquadFilter();
    low.type = 'bandpass';
    low.frequency.value = 650;
    low.Q.value = 1.2;
    const high = ctx.createBiquadFilter();
    high.type = 'bandpass';
    high.frequency.value = 1500;
    high.Q.value = 1.4;
    const g = ctx.createGain();
    const peak = 0.05 + 0.13 * level;
    const len = 1.6 + level;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(peak, when + 0.35);
    g.gain.setTargetAtTime(0.0001, when + 0.6, len / 3);
    src.connect(low).connect(g);
    src.connect(high).connect(g);
    g.connect(this.out);
    src.start(when, (when * 3.1) % 1);
    src.stop(when + len + 1);
    return { node: src, end: when + len + 1 };
  }

  /** 박수: 짧은 손뼉 소리를 무작위 간격으로 4초 동안 */
  applause(when: number): Scheduled | null {
    if (this.late(when)) return null;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2200;
    f.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    const rnd = mulberry32(Math.floor(when * 1000));
    for (let t = 0; t < 4; t += 0.02 + rnd() * 0.03) {
      const fade = t < 0.5 ? t / 0.5 : t > 3 ? 4 - t : 1;
      g.gain.setValueAtTime(0.16 * fade * (0.4 + rnd() * 0.6), when + t);
      g.gain.setValueAtTime(0.0, when + t + 0.012);
    }
    src.connect(f).connect(g).connect(this.out);
    src.start(when);
    src.stop(when + 4.1);
    return { node: src, end: when + 4.1 };
  }

  /** 나이아가라는 쏴아 하는 소리, 틀불꽃은 타닥거리는 소리를 len초 동안 낸다. */
  hiss(when: number, len: number, kind: 'niagara' | 'lance'): Scheduled | null {
    const ctx = this.ctx;
    if (when + len < ctx.currentTime) return null;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = kind === 'niagara' ? 2500 : 4200;
    f.Q.value = kind === 'niagara' ? 0.6 : 1.5;
    const g = ctx.createGain();
    const level = kind === 'niagara' ? 0.12 : 0.06;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(level, when + 0.6);
    g.gain.setValueAtTime(level, when + Math.max(0.6, len - 0.8));
    g.gain.linearRampToValueAtTime(0.0001, when + len);
    src.connect(f).connect(g).connect(this.out);
    src.start(Math.max(when, ctx.currentTime));
    src.stop(when + len + 0.05);
    return { node: src, end: when + len };
  }
}

export interface SoundPlan {
  /** 관람석 거리만큼 소리를 늦춘다. null이면 늦추지 않는다. */
  delayFor: ((l: Launch) => number) | null;
  /** 관객 함성과 박수. null이면 내지 않는다. */
  crowd: CrowdCue[] | null;
  fanCount: (l: Launch) => number;
}

/**
 * 쇼 시각 [from, to) 안에 들리는 소리를 건다. toCtx는 쇼 시각을 오디오 시계 시각으로 바꾼다.
 * 걸어 둔 소리는 keep에 넘겨, 일시정지할 때 멈출 수 있게 한다.
 */
export function scheduleSounds(
  sfx: Sfx,
  launches: Launch[],
  from: number,
  to: number,
  toCtx: (t: number) => number,
  plan: SoundPlan,
  keep: (s: Scheduled) => void = () => {},
): void {
  const add = (s: Scheduled | null) => s && keep(s);
  for (const l of launches) {
    // 소리가 늦게 오면, 그만큼 늦은 시각에 들리는 소리로 친다.
    const d = plan.delayFor ? plan.delayFor(l) : 0;
    const fires = l.fireAt + d >= from && l.fireAt + d < to;
    const bursts = l.burstAt + d >= from && l.burstAt + d < to;
    if (l.type === 'niagara' || l.type === 'lancework') {
      if (fires) add(sfx.hiss(toCtx(l.fireAt + d), l.len ?? 8, l.type === 'niagara' ? 'niagara' : 'lance'));
    } else if (l.type === 'cake') {
      // 케이크는 한 발마다 작게 터진다.
      if (bursts) add(sfx.boom(toCtx(l.burstAt + d), 3, 1, 0.45));
      if (fires) add(sfx.thump(toCtx(l.fireAt + d), 1, 0.5));
    } else if (l.sub === 0) {
      const count = plan.fanCount(l);
      // 멀리서 들으면 소리가 작아진다.
      const fade = d > 0 ? Math.min(1, 2 / (1 + d)) : 1;
      const sounds = starSounds(l);
      // 살루트는 보통 폭발음 대신 더 큰 소리를 낸다.
      if (bursts && !sounds.some((x) => x.kind === 'salute')) add(sfx.boom(toCtx(l.burstAt + d), l.size, count, fade));
      if (fires) add(sfx.thump(toCtx(l.fireAt + d), count, fade));
      for (const snd of sounds) {
        const at = l.burstAt + d + snd.start;
        if (at >= from && at < to) add(sfx.star(toCtx(at), snd, fade));
      }
    }
  }
  for (const c of plan.crowd ?? []) {
    if (c.t >= from && c.t < to) add(c.kind === 'cheer' ? sfx.cheer(toCtx(c.t), c.level) : sfx.applause(toCtx(c.t)));
  }
}
