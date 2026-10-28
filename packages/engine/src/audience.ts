// 관객 반응: 큰 불꽃이나 촘촘한 순간에 함성, 홀로 크게 피는 불꽃엔 「오~」, 피날레가 시작되면 큰 환호, 쇼가 끝나면 박수.
// 터지는 시각과 크기만 보고 정하므로 같은 쇼면 늘 같은 때에 함성이 나온다.

import { isShell, shellSize } from './catalog.ts';
import { isShellLaunch, windVector, type Launch, type Show, type Vec3 } from './show.ts';
import { analyzeSmoke } from './smoke.ts';
import { soundSource } from './sound.ts';

export interface CrowdCue {
  t: number;
  kind: 'cheer' | 'applause' | 'ooh';
  /** 0~1 */
  level: number;
}

/** 한 발이 분위기를 얼마나 끌어올리는지 */
function weight(l: Launch): number {
  if (l.type === 'niagara' || l.type === 'lancework') return 1.5;
  if (l.type === 'cake') return 0.25;
  return isShell(l.type) ? { 3: 0.4, 5: 0.8, 7: 1.4, 10: 2.5 }[l.size] : 0;
}

export function audienceCues(launches: Launch[]): CrowdCue[] {
  const bursts = [...launches].sort((a, b) => a.burstAt - b.burstAt);
  const out: CrowdCue[] = [];
  let lastCheer = -Infinity;
  let start = 0;
  let sum = 0;
  for (let i = 0; i < bursts.length; i++) {
    const t = bursts[i].burstAt;
    sum += weight(bursts[i]);
    while (bursts[start].burstAt < t - 1.5) sum -= weight(bursts[start++]);
    if (sum >= 2.4 && t - lastCheer > 3) {
      out.push({ t: t + 0.35, kind: 'cheer', level: Math.min(1, sum / 6) });
      lastCheer = t;
    }
  }
  const near = (t: number, gap: number) => out.some((c) => Math.abs(c.t - t) < gap);
  // 홀로 크게 피는 불꽃(7호 넘게)에는 감탄 「오~」
  for (const l of bursts) {
    if (isShell(l.type) && l.type !== 'cake' && l.size >= 7 && l.sub === 0 && !near(l.burstAt + 0.4, 1.5)) {
      out.push({ t: l.burstAt + 0.4, kind: 'ooh', level: l.size >= 10 ? 1 : 0.7 });
    }
  }
  if (bursts.length) {
    // 피날레(마지막 15%)가 시작되면 큰 환호
    const end = bursts[bursts.length - 1].burstAt;
    const fin = bursts.find((l) => l.burstAt >= end * 0.85);
    if (fin && end > 20 && !near(fin.burstAt + 0.35, 3)) out.push({ t: fin.burstAt + 0.35, kind: 'cheer', level: 1 });
    out.push({ t: end + 2.5, kind: 'applause', level: 1 });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** 터지는 순간이 박에 얼마나 붙었는지 0~1 (40ms 안이면 1, 150ms 넘게 어긋나면 0). 점수표 「박자」와 같은 기준 */
export function beatFit(t: number, music: { bpm: number; offset: number }): number {
  const beat = 60 / music.bpm;
  const k = (t - music.offset) / beat;
  const d = Math.abs(k - Math.round(k)) * beat;
  return Math.min(1, Math.max(0, 1 - (d - 0.04) / 0.11));
}

/** 재생 중 띄울 판정: 박자 딱(완벽), 연기에 가림, 구름 위에서 터짐 */
export interface Judgement {
  t: number;
  kind: 'perfect' | 'smoke' | 'cloud';
  /** 터진 자리 (화면에 글자를 띄울 곳) */
  at: Vec3;
}

/** 쇼 한 편의 관객 반응 흐름: 판정, 열기(0~1, 0.1초 간격), 함성 때 */
export interface CrowdTrack {
  marks: Judgement[];
  heat: Float32Array;
  cues: CrowdCue[];
  /** 피날레가 시작되는 때와 쇼가 끝나는 때 (관객이 일어서 있는 구간) */
  finale: [number, number];
}

const HEAT_RATE = 10;

/**
 * 판정은 점수표와 같은 기준이다: 박자는 「박자」 항목(0.8 넘게 맞으면 완벽),
 * 가림은 「연기·구름」 항목. 열기는 한 발의 무게만큼 오르고(박자 딱이면 더, 가리면 덜), 6초 시간 상수로 식는다.
 */
export function crowdTrack(show: Show, launches: Launch[]): CrowdTrack {
  const bursts = [...launches].sort((a, b) => a.burstAt - b.burstAt);
  const smoke = analyzeSmoke(launches, windVector(show));
  const cloud = show.venue.cloud;
  const music = show.music;
  const marks: Judgement[] = [];
  const kick = new Map<number, number>();
  const seen = new Set<string>();
  for (const l of bursts) {
    let w = weight(l);
    const hidden = smoke.obscured.has(l);
    const high = !!cloud && isShellLaunch(l) && l.type !== 'cake' && shellSize(l.type, l.size).height > cloud;
    // 부채꼴·케이크처럼 한 큐에서 여러 발이 나가도 판정 글자는 한 번만
    const key = `${l.cueIndex}`;
    const first = !seen.has(key);
    seen.add(key);
    if (high) {
      w *= 0.3;
      if (first) marks.push({ t: l.burstAt, kind: 'cloud', at: soundSource(l) });
    } else if (hidden) {
      w *= 0.4;
      if (first) marks.push({ t: l.burstAt, kind: 'smoke', at: soundSource(l) });
    } else if (music && l.sub === 0 && beatFit(l.burstAt, music) > 0.8) {
      w *= 1.3;
      if (first && weight(l) >= 0.8) marks.push({ t: l.burstAt, kind: 'perfect', at: soundSource(l) });
    }
    const k = Math.max(0, Math.round(l.burstAt * HEAT_RATE));
    kick.set(k, (kick.get(k) ?? 0) + w);
  }
  const end = bursts.length ? bursts[bursts.length - 1].burstAt + 4 : 0;
  const heat = new Float32Array(Math.ceil(end * HEAT_RATE) + 1);
  const decay = Math.exp(-1 / (6 * HEAT_RATE));
  let h = 0;
  for (let i = 0; i < heat.length; i++) {
    h = Math.min(1, h * decay + (kick.get(i) ?? 0) * 0.09);
    heat[i] = h;
  }
  const last = bursts.length ? bursts[bursts.length - 1].burstAt : 0;
  const fin = bursts.find((l) => l.burstAt >= last * 0.85);
  return {
    marks,
    heat,
    cues: audienceCues(launches),
    finale: fin && last > 20 ? [fin.burstAt, last + 4] : [Infinity, Infinity],
  };
}

/** 그 시각의 관객: 열기, 손을 든 사람의 몫(함성 뒤 2초 동안), 일어섰는지 */
export function crowdAt(track: CrowdTrack, t: number): { heat: number; arms: number; stand: boolean } {
  const i = Math.floor(t * HEAT_RATE);
  const heat = i < 0 ? 0 : i >= track.heat.length ? 0 : track.heat[i];
  let arms = 0;
  for (const c of track.cues) {
    if (c.kind === 'applause') continue;
    const d = t - c.t;
    if (d >= -0.1 && d < 2.2) arms = Math.max(arms, c.level * (d < 1.4 ? 1 : (2.2 - d) / 0.8));
  }
  return { heat, arms, stand: t >= track.finale[0] && t < track.finale[1] };
}
