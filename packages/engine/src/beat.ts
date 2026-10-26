// 음악에서 박자(BPM)와 첫 박 위치를 찾는다.
// 소리가 갑자기 커지는 순간(온셋)을 모으고, 그 간격이 가장 잘 반복되는 주기를 고른다.
// 두 배·절반으로 잘못 잡는 일이 흔해서, 결과는 편집기에서 직접 고칠 수 있게 한다.

export interface TempoResult {
  bpm: number;
  /** 첫 박이 오는 시각(초), 0 이상 한 박 미만 */
  offset: number;
  /** 0~1. 낮으면 사용자에게 직접 맞춰 달라고 안내한다. */
  confidence: number;
  /** 한 마디의 박 수 (4/4면 4, 3/4면 3) */
  beatsPerBar: 3 | 4;
}

const HOP = 512;
const MIN_BPM = 60;
const MAX_BPM = 180;

/** 프레임마다 소리가 커진 정도. 낮은 소리와 높은 소리를 따로 보고 더한다. */
export function onsetEnvelope(samples: Float32Array, sampleRate: number): { env: Float32Array; frameRate: number } {
  const frames = Math.floor(samples.length / HOP);
  const env = new Float32Array(frames);
  let prevLow = 0;
  let prevHigh = 0;
  let lp = 0;
  const alpha = Math.exp((-2 * Math.PI * 200) / sampleRate); // 200Hz 아래를 저음으로
  let prevSample = 0;
  for (let f = 0; f < frames; f++) {
    let low = 0;
    let high = 0;
    for (let i = f * HOP; i < (f + 1) * HOP; i++) {
      const x = samples[i];
      lp = alpha * lp + (1 - alpha) * x;
      low += lp * lp;
      const d = x - prevSample;
      prevSample = x;
      high += d * d;
    }
    const l = Math.log1p(low * 100);
    const h = Math.log1p(high * 100);
    env[f] = Math.max(0, l - prevLow) + Math.max(0, h - prevHigh);
    prevLow = l;
    prevHigh = h;
  }
  // 천천히 변하는 바닥값을 빼서 박자 순간만 남긴다.
  const out = new Float32Array(frames);
  const win = 16;
  let sum = 0;
  for (let f = 0; f < frames; f++) {
    sum += env[f];
    if (f >= win) sum -= env[f - win];
    const mean = sum / Math.min(f + 1, win);
    out[f] = Math.max(0, env[f] - mean);
  }
  return { env: out, frameRate: sampleRate / HOP };
}

/** 온셋을 앞뒤 몇 프레임으로 퍼뜨린다. 주기가 프레임 사이에 걸려도 잘 겹치게 하려는 것. */
function blur(env: Float32Array): Float32Array {
  let a = env;
  for (let pass = 0; pass < 2; pass++) {
    const b = new Float32Array(a.length);
    for (let i = 0; i < a.length; i++) b[i] = 0.5 * a[i] + 0.25 * ((a[i - 1] ?? 0) + (a[i + 1] ?? 0));
    a = b;
  }
  return a;
}

/** 소수 프레임 위치의 값 (선형 보간) */
function sampleAt(env: Float32Array, x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  return (env[i] ?? 0) * (1 - f) + (env[i + 1] ?? 0) * f;
}

/** period 프레임 간격, phase 위치에 놓은 빗살과 온셋이 겹치는 정도 (박당 평균) */
function combScore(env: Float32Array, period: number, phase: number): number {
  let s = 0;
  let n = 0;
  for (let x = phase; x < env.length - 1; x += period) {
    s += sampleAt(env, x);
    n++;
  }
  return n ? s / n : 0;
}

/**
 * 마디: 박마다 온셋 세기를 모아, 센 박(마디 첫 박)이 세 박마다 도는지 네 박마다 도는지 본다.
 * 박을 3개씩·4개씩 묶어 자리마다 평균을 내면, 맞는 묶음에서만 한 자리가 두드러진다.
 */
function meterOf(env: Float32Array, period: number, phase: number): 3 | 4 {
  const strength: number[] = [];
  for (let x = phase; x < env.length - 2; x += period) {
    const i = Math.round(x);
    strength.push(Math.max(env[i - 1] ?? 0, env[i], env[i + 1] ?? 0, env[i + 2] ?? 0));
  }
  if (strength.length < 12) return 4;
  const contrast = (m: number) => {
    const sums = new Array(m).fill(0);
    const counts = new Array(m).fill(0);
    strength.forEach((v, k) => {
      sums[k % m] += v;
      counts[k % m]++;
    });
    const means = sums.map((v, k) => v / Math.max(1, counts[k])).sort((a, b) => b - a);
    const rest = means.slice(1).reduce((a, b) => a + b, 0) / (m - 1);
    return (means[0] - rest) / Math.max(1e-9, means[0]);
  };
  // 4/4가 흔하므로 3/4는 분명할 때만
  return contrast(3) > contrast(4) * 1.25 ? 3 : 4;
}

export function detectTempo(samples: Float32Array, sampleRate: number): TempoResult {
  const raw = onsetEnvelope(samples, sampleRate);
  const frameRate = raw.frameRate;
  const env = blur(raw.env);
  const minLag = Math.floor((60 / MAX_BPM) * frameRate);
  const maxLag = Math.ceil((60 / MIN_BPM) * frameRate);
  if (env.length < maxLag * 4) return { bpm: 120, offset: 0, confidence: 0, beatsPerBar: 4 };

  let energy = 0;
  for (const v of env) energy += v * v;
  if (energy === 0) return { bpm: 120, offset: 0, confidence: 0, beatsPerBar: 4 };

  // 자기 자신과 겹쳐 보기 (마디 길이까지: 한 박의 네 배)
  const corr = new Float32Array(maxLag * 4 + 2);
  for (let lag = minLag; lag < corr.length && lag < env.length; lag++) {
    let s = 0;
    for (let i = lag; i < env.length; i++) s += env[i] * env[i - lag];
    corr[lag] = s / energy / (1 - lag / env.length);
  }
  const at = (lag: number) => {
    const i = Math.floor(lag);
    return (corr[i] ?? 0) + ((corr[i + 1] ?? 0) - (corr[i] ?? 0)) * (lag - i);
  };
  // 한 박 주기가 맞으면 두 박(4/4 반 마디)이나 세 박(3/4 한 마디) 주기에서도 맞는다.
  // 8분음표 반주처럼 빠른 주기만 맞는 것보다, 박과 마디가 함께 맞는 주기를 믿는다.
  // 120 BPM 근처를 조금 더 믿는다 (두 배·절반 오류 줄이기).
  const score = (lag: number) => at(lag) + 0.6 * Math.max(at(2 * lag), at(3 * lag)) + 0.3 * at(4 * lag);
  let bestLag = minLag;
  let best = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpm = (60 * frameRate) / lag;
    const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 110) / 0.9, 2));
    const s = score(lag) * prior;
    if (s > best) {
      best = s;
      bestLag = lag;
    }
  }

  // 대강 고른 주기 근처에서 주기와 첫 박 위치를 함께 다듬는다.
  // 주기가 조금만 틀려도 곡 뒤쪽으로 갈수록 박이 밀리므로, 곡 전체에 빗살을 대어 본다.
  let period = bestLag;
  let phase = 0;
  let best2 = -Infinity;
  let meanScore = 0;
  let count = 0;
  for (let p = bestLag * 0.97; p <= bestLag * 1.03; p += 0.02) {
    for (let ph = 0; ph < p; ph += 0.25) {
      const s = combScore(env, p, ph);
      meanScore += s;
      count++;
      if (s > best2) {
        best2 = s;
        period = p;
        phase = ph;
      }
    }
  }
  meanScore /= count;
  const bpm = (60 * frameRate) / period;
  const confidence = Math.max(0, Math.min(1, (best2 / meanScore - 1) / 3));
  // 프레임 f의 온셋은 그 프레임 구간 안에서 일어났으므로 구간 가운데를 시각으로 본다.
  const offset = ((phase + 0.5) / frameRate) % (60 / bpm);
  const beatsPerBar = meterOf(raw.env, period, phase);
  return { bpm: Math.round(bpm * 10) / 10, offset, confidence, beatsPerBar };
}

/**
 * 손으로 두드린 시각들로 박자를 정한다. 4번 이상 두드려야 한다.
 * 사람 손은 한 번씩 튀므로: 간격의 가운데 값으로 두드림마다 몇 번째 박인지 정하고(한 박 건너뛴 것도 맞춘다),
 * 그 박에서 많이 벗어난 두드림과 같은 박을 두 번 누른 것은 빼고 직선을 맞춘다.
 */
export function tapTempo(taps: number[]): { bpm: number; offset: number; used: number } | null {
  if (taps.length < 4) return null;
  const recent = taps.slice(-16);
  const gaps = recent.slice(1).map((t, k) => t - recent[k]).sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];
  if (!(median > 60 / 260 && median < 60 / 35)) return null;
  // 기준 두드림 하나로 박 번호를 매기고 박에서 많이 벗어난 것은 뺀다.
  // 기준이 튄 두드림이면 안 되므로, 가장 많은 두드림이 맞는 기준을 고른다 (같으면 나중 것).
  const fit = (anchor: number): [number, number][] => {
    const points: [number, number][] = [];
    const seen = new Set<number>();
    for (let i = recent.length - 1; i >= 0; i--) {
      const k = Math.round((recent[i] - anchor) / median);
      if (seen.has(k) || Math.abs(recent[i] - (anchor + k * median)) > median * 0.3) continue;
      seen.add(k);
      points.push([k, recent[i]]);
    }
    return points;
  };
  let points: [number, number][] = [];
  for (let i = recent.length - 1; i >= 0; i--) {
    const p = fit(recent[i]);
    if (p.length > points.length) points = p;
  }
  const n = points.length;
  if (n < 4) return null;
  // 두드린 시각에 직선을 맞춘다: tap ≈ first + k·period
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (const [k, t] of points) {
    sx += k;
    sy += t;
    sxx += k * k;
    sxy += k * t;
  }
  const period = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  if (!(period > 60 / 240 && period < 60 / 40)) return null;
  const first = (sy - period * sx) / n;
  const offset = ((first % period) + period) % period;
  return { bpm: Math.round((60 / period) * 10) / 10, offset, used: n };
}
