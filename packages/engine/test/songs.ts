// 테스트용 합성 곡
import { mulberry32 } from '../src/rng.ts';

export const RATE = 11025;
export const BPM = 120;
export const BAR = (4 * 60) / BPM;

/**
 * 시험 곡 (120 BPM, 한 마디 2초, 40마디):
 *   인트로 0~16초 작은 북, 벌스 16~32초 중간 북, 후렴 32~48초 큰 북 + 하이햇,
 *   브릿지 48~56초 높은 소리만 조용히, 후렴 56~72초, 끝 72~80초 작은 북
 */
export function song(): Float32Array {
  const out = new Float32Array(RATE * 80);
  const rnd = mulberry32(5);
  const kick = (t: number, amp: number) => {
    const s = Math.floor(t * RATE);
    for (let i = 0; i < RATE * 0.15 && s + i < out.length; i++) out[s + i] += Math.sin((2 * Math.PI * 60 * i) / RATE) * Math.exp(-i / (RATE * 0.05)) * amp;
  };
  const hat = (t: number, amp: number) => {
    const s = Math.floor(t * RATE);
    for (let i = 0; i < RATE * 0.04 && s + i < out.length; i++) out[s + i] += (rnd() * 2 - 1) * Math.exp(-i / (RATE * 0.01)) * amp;
  };
  for (let bar = 0; bar < 40; bar++) {
    for (let b = 0; b < 4; b++) {
      const t = bar * BAR + b * 0.5;
      if (bar < 8 || bar >= 36) kick(t, 0.15);
      else if (bar < 16) kick(t, 0.45);
      else if (bar < 24 || bar >= 28) {
        kick(t, 0.9);
        hat(t + 0.25, 0.45);
        hat(t, 0.3);
      }
    }
    if (bar >= 24 && bar < 28) {
      // 브릿지: 높은 소리가 조용히 길게
      for (let i = Math.floor(bar * BAR * RATE); i < (bar + 1) * BAR * RATE; i++) out[i] += Math.sin((2 * Math.PI * 3000 * i) / RATE) * 0.12;
    }
  }
  return out;
}

