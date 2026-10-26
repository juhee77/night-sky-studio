import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectTempo, tapTempo } from '../src/beat.ts';
import { mulberry32 } from '../src/rng.ts';

const RATE = 22050;

/** bpm 박자마다 북소리가 나는 시험용 음원. 박 사이에는 약한 잡음과 엇박 하이햇. */
function drumTrack(bpm: number, offset: number, seconds: number): Float32Array {
  const out = new Float32Array(Math.floor(RATE * seconds));
  const rnd = mulberry32(1);
  for (let i = 0; i < out.length; i++) out[i] = (rnd() - 0.5) * 0.02;
  const beat = 60 / bpm;
  for (let t = offset; t < seconds; t += beat) {
    const start = Math.floor(t * RATE);
    for (let i = 0; i < RATE * 0.15 && start + i < out.length; i++) {
      const env = Math.exp(-i / (RATE * 0.04));
      out[start + i] += Math.sin((2 * Math.PI * 60 * i) / RATE) * env * 0.8;
    }
    const hat = Math.floor((t + beat / 2) * RATE);
    for (let i = 0; i < RATE * 0.03 && hat + i < out.length; i++) {
      out[hat + i] += (rnd() - 0.5) * 0.25 * Math.exp(-i / (RATE * 0.008));
    }
  }
  return out;
}

for (const [bpm, offset] of [[112, 0.3], [84, 0.1], [132, 0.42]] as const) {
  test(`${bpm} BPM, 첫 박 ${offset}초를 찾는다`, () => {
    const r = detectTempo(drumTrack(bpm, offset, 30), RATE);
    assert.ok(Math.abs(r.bpm - bpm) < 1.5, `bpm ${r.bpm}`);
    const beat = 60 / bpm;
    const diff = Math.abs(((r.offset - offset + beat / 2) % beat + beat) % beat - beat / 2);
    assert.ok(diff < 0.04, `offset ${r.offset.toFixed(3)} (기대 ${offset})`);
    assert.ok(r.confidence > 0.3, `confidence ${r.confidence}`);
  });
}

test('조용한 음원은 믿을 수 없다고 알린다', () => {
  assert.equal(detectTempo(new Float32Array(RATE * 10), RATE).confidence, 0);
});

test('두드린 시각으로 박자를 정한다', () => {
  const taps = [1.02, 1.55, 2.09, 2.63, 3.16, 3.7];
  const r = tapTempo(taps)!;
  assert.ok(Math.abs(r.bpm - 112) < 1.5, `bpm ${r.bpm}`);
  assert.ok(r.offset < 60 / 112);
  assert.equal(tapTempo([1, 1.5]), null);
});

test('두드리다 한 번 튀거나, 한 박을 건너뛰거나, 두 번 눌러도 박자가 맞다', () => {
  const beat = 60 / 120;
  const clean = Array.from({ length: 10 }, (_, k) => 2.25 + k * beat);
  // 한 번 크게 튀고(0.2초 늦게), 한 박 건너뛰고, 한 번은 거의 같은 때 두 번
  const messy = [...clean.slice(0, 3), clean[3] + 0.2, clean[4], clean[6], clean[7], clean[7] + 0.03, clean[8], clean[9]];
  for (const taps of [clean, messy]) {
    const r = tapTempo(taps)!;
    assert.ok(Math.abs(r.bpm - 120) < 1, `bpm ${r.bpm}`);
    // 첫 박: 2.25초의 박들은 0.25초에서 시작하는 눈금 위에 있다
    assert.ok(Math.abs(r.offset - 0.25) < 0.03, `offset ${r.offset}`);
  }
  assert.ok(tapTempo(messy)!.used < messy.length);
});
