import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeMusic, flatMusicMap } from '../src/auto.ts';
import { mulberry32 } from '../src/rng.ts';

const RATE = 11025;
const BPM = 120;
const BAR = (4 * 60) / BPM;

/**
 * 시험 곡 (120 BPM, 한 마디 2초, 40마디):
 *   인트로 0~16초 작은 북, 벌스 16~32초 중간 북, 후렴 32~48초 큰 북 + 하이햇,
 *   브릿지 48~56초 높은 소리만 조용히, 후렴 56~72초, 끝 72~80초 작은 북
 */
function song(): Float32Array {
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

const near = (xs: number[], t: number, tol = BAR) => xs.some((x) => Math.abs(x - t) <= tol);

test('시험 곡에서 구간 경계를 찾고 이름을 붙인다', () => {
  const map = analyzeMusic(song(), RATE, BPM, 0);
  const secs = map.sections!;
  const starts = secs.slice(1).map((s) => s.start);
  for (const b of [16, 32, 48, 56, 72]) assert.ok(near(starts, b), `경계 ${b}초를 못 찾음: ${starts.join(', ')}`);
  const kindAt = (t: number) => secs.find((s) => s.start <= t && t < s.end)!.kind;
  assert.equal(kindAt(8), 'intro');
  assert.equal(kindAt(24), 'verse');
  assert.equal(kindAt(40), 'chorus');
  assert.equal(kindAt(52), 'bridge');
  assert.equal(kindAt(64), 'chorus');
  assert.equal(kindAt(76), 'outro');
});

test('크게 터지는 순간(드롭)과 조용해지는 순간을 찾는다', () => {
  const map = analyzeMusic(song(), RATE, BPM, 0);
  assert.ok(near(map.drops!, 32), `드롭 ${map.drops}`);
  assert.ok(near(map.drops!, 56), `드롭 ${map.drops}`);
  assert.ok(near(map.hushes!, 48), `조용해짐 ${map.hushes}`);
  assert.ok(!near(map.drops!, 8, 2), '조용한 인트로에는 드롭이 없다');
});

test('높은 소리와 낮은 소리 세기를 따로 잰다', () => {
  const map = analyzeMusic(song(), RATE, BPM, 0);
  const avg = (a: Float32Array, t0: number, t1: number) => {
    const i0 = Math.floor(t0 / 0.5);
    const i1 = Math.floor(t1 / 0.5);
    let s = 0;
    for (let i = i0; i < i1; i++) s += a[i];
    return s / (i1 - i0);
  };
  // 브릿지는 낮은 소리가 거의 없고 높은 소리가 있다. 후렴은 둘 다 크다.
  assert.ok(avg(map.low!, 48, 56) < avg(map.low!, 32, 48) * 0.3);
  assert.ok(avg(map.high!, 48, 56) > avg(map.high!, 16, 32));
  assert.ok(avg(map.high!, 32, 48) > avg(map.high!, 16, 32));
});

test('곡이 없을 때도 흔한 짜임의 구간을 준다', () => {
  const map = flatMusicMap(60, 120, 0);
  assert.deepEqual(map.sections!.map((s) => s.kind), ['intro', 'verse', 'chorus', 'outro']);
  assert.equal(map.sections![0].start, 0);
  assert.equal(map.sections![3].end, 60);
});
