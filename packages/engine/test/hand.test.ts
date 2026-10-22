import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildToShell, defaultBuild, starEffect } from '../src/build.ts';
import { newCustomShell } from '../src/custom.ts';
import { ROLL_TURNS, pasteScore, pourResult, rollScore } from '../src/hand.ts';
import { testFire } from '../src/testfire.ts';

/** 바퀴마다 반지름이 wobble만큼 흔들리는 원 */
const circle = (turns: number, wobble: number) =>
  Array.from({ length: Math.round(turns * 60) }, (_, i) => {
    const a = (i / 60) * Math.PI * 2;
    const r = 50 * (1 + wobble * Math.sin(i * 1.7));
    return [100 + Math.cos(a) * r, 80 + Math.sin(a) * r] as [number, number];
  });

test('별 굴리기: 바퀴를 다 돌아야 끝나고, 원이 고를수록 점수가 높다', () => {
  assert.equal(rollScore(circle(2, 0), 100, 80).done, false);
  const neat = rollScore(circle(ROLL_TURNS + 0.2, 0.02), 100, 80);
  const sloppy = rollScore(circle(ROLL_TURNS + 0.2, 0.35), 100, 80);
  assert.ok(neat.done && sloppy.done);
  assert.ok(neat.evenness > 0.85, `${neat.evenness}`);
  assert.ok(sloppy.evenness < 0.4, `${sloppy.evenness}`);
});

test('종이 바르기: 다 덮은 횟수가 겹 수, 고르게 문지를수록 정성이 높다', () => {
  const even = pasteScore(Array(40).fill(5));
  assert.equal(even.layers, 5);
  assert.ok(even.evenness > 0.95);
  const patchy = pasteScore([...Array(30).fill(9), ...Array(10).fill(1)]);
  assert.equal(patchy.layers, 1);
  assert.ok(patchy.evenness < 0.5);
});

test('할약 붓기: 오래 부을수록 많고, 가운데서 벗어나 부으면 치우친다', () => {
  assert.deepEqual(pourResult(1.5, 0), { breakCharge: 0.5, chargeOffset: 0 });
  assert.equal(pourResult(5, 0).breakCharge, 1);
  assert.ok(pourResult(1.5, 0.5).chargeOffset > 0.6);
});

test('손으로 고르게 굴린 별은 같이 꺼지고, 들쭉날쭉 굴린 별은 제각각 꺼진다', () => {
  const star = { method: 'rolled' as const, sizeMm: 12, dryHours: 48 };
  assert.ok(starEffect({ ...star, handCare: 1 }).care > starEffect({ ...star, handCare: 0 }).care + 0.4);
  const base = newCustomShell('h', '손');
  const neat = testFire(buildToShell({ ...defaultBuild(), pistil: null, star: { ...star, handCare: 1 } }, base), 2);
  const sloppy = testFire(buildToShell({ ...defaultBuild(), pistil: null, star: { ...star, handCare: 0 } }, base), 2);
  assert.ok(neat.sync > sloppy.sync + 10, `고르게 ${neat.sync}, 들쭉날쭉 ${sloppy.sync}`);
});
