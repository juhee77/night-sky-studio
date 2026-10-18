// 음악에서 박자(BPM)와 첫 박 위치를 찾는다.
// 소리가 갑자기 커지는 순간(온셋)을 모으고, 그 간격이 가장 잘 반복되는 주기를 고른다.
// 두 배·절반으로 잘못 잡는 일이 흔해서, 결과는 편집기에서 직접 고칠 수 있게 한다.

export interface TempoResult {
  bpm: number;
  /** 첫 박이 오는 시각(초), 0 이상 한 박 미만 */
  offset: number;
  /** 0~1. 낮으면 사용자에게 직접 맞춰 달라고 안내한다. */
  confidence: number;
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

export function detectTempo(samples: Float32Array, sampleRate: number): TempoResult {
  const raw = onsetEnvelope(samples, sampleRate);
  const frameRate = raw.frameRate;
  const env = blur(raw.env);
  const minLag = Math.floor((60 / MAX_BPM) * frameRate);
  const maxLag = Math.ceil((60 / MIN_BPM) * frameRate);
  if (env.length < maxLag * 4) return { bpm: 120, offset: 0, confidence: 0 };

  let energy = 0;
  for (const v of env) energy += v * v;
  if (energy === 0) return { bpm: 120, offset: 0, confidence: 0 };

  // 주기마다 자기 자신과 겹쳐 본다. 120 BPM 근처를 조금 더 믿는다 (두 배·절반 오류 줄이기).
  const scores = new Float32Array(maxLag + 2);
  let bestLag = minLag;
  let best = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = lag; i < env.length; i++) s += env[i] * env[i - lag];
    // 두 배 주기에서도 맞으면 더 믿는다.
    for (let i = 2 * lag; i < env.length; i += 1) s += 0.5 * env[i] * env[i - 2 * lag];
    s /= energy;
    scores[lag] = s;
    const bpm = (60 * frameRate) / lag;
    const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.9, 2));
    if (s * prior > best) {
      best = s * prior;
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
  return { bpm: Math.round(bpm * 10) / 10, offset, confidence };
}

/** 손으로 두드린 시각들로 박자를 정한다. 4번 이상 두드려야 한다. */
export function tapTempo(taps: number[]): { bpm: number; offset: number } | null {
  if (taps.length < 4) return null;
  const recent = taps.slice(-12);
  const n = recent.length;
  // 두드린 시각에 직선을 맞춘다: tap_k ≈ offset + k·period
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (let k = 0; k < n; k++) {
    sx += k;
    sy += recent[k];
    sxx += k * k;
    sxy += k * recent[k];
  }
  const period = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  if (!(period > 60 / 240 && period < 60 / 40)) return null;
  const first = (sy - period * sx) / n;
  const offset = ((first % period) + period) % period;
  return { bpm: Math.round((60 / period) * 10) / 10, offset };
}
