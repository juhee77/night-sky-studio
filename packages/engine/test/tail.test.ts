import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildToShell, defaultBuild, normalizeBuild } from '../src/build.ts';
import { newCustomShell, normalizeShell, type CustomShell, type StarKind, type TailLength } from '../src/custom.ts';
import type { Show } from '../src/show.ts';
import { FLAG_SPARK, Simulation } from '../src/sim.ts';

const shell = (star: StarKind, tail?: TailLength, life = 3): CustomShell => {
  const s = newCustomShell('w', '버들');
  s.layers = [{ role: 'outer', shape: { kind: 'sphere', count: 60 }, star, color: 'gold', scale: 1, delay: 0, ...(tail ? { tail } : {}) }];
  s.motion = { speed: 1, droop: 0.6, life, flicker: false };
  return s;
};

/** 터지고 2초 뒤 하늘에 남은 꼬리 불티의 수와 가장 긴 수명 */
function sparks(s: CustomShell) {
  const show: Show = {
    version: 1, seed: 3, venue: { preset: 'river-bridge-city', wind: { dir: 0, speed: 0 } },
    launchers: [{ id: 'b', kind: 'barge', pos: [0, 0, 0] }],
    cues: [{ t: 5, at: 'b', type: 'custom', custom: s.id, size: 5 }], customShells: { [s.id]: s },
  };
  const sim = new Simulation(show);
  sim.advanceTo(7);
  let n = 0;
  let maxLife = 0;
  for (let i = 0; i < sim.pool.count; i++) {
    if (!(sim.pool.flags[i] & FLAG_SPARK)) continue;
    n++;
    maxLife = Math.max(maxLife, sim.pool.life[i]);
  }
  return { n, maxLife };
}

test('꼬리 길이에 따라 남는 불티의 수명과 양이 확연히 다르다', () => {
  const short = sparks(shell('willow', 'short'));
  const normal = sparks(shell('willow'));
  const long = sparks(shell('willow', 'long'));
  assert.ok(short.maxLife < normal.maxLife * 0.6 && long.maxLife > normal.maxLife * 1.8, `${short.maxLife} ${normal.maxLife} ${long.maxLife}`);
  assert.ok(long.n > normal.n * 1.5 && normal.n > short.n * 1.5, `${short.n} ${normal.n} ${long.n}`);
});

test('긴 버들(카무로)은 길게 늘인 버들보다도 촘촘하고 오래 남는다', () => {
  const long = sparks(shell('willow', 'long'));
  const kamuro = sparks(shell('kamuro', undefined, 6));
  assert.ok(kamuro.n > long.n && kamuro.maxLife > long.maxLife, `${long.n}/${long.maxLife} vs ${kamuro.n}/${kamuro.maxLife}`);
});

test('꼬리 길이와 8초까지의 사라지는 시간은 정규화와 제작 공방을 지나도 남는다', () => {
  const s = normalizeShell({ ...shell('kamuro', 'long', 7.5) });
  assert.equal(s.layers[0].star, 'kamuro');
  assert.equal(s.layers[0].tail, 'long');
  assert.equal(s.motion.life, 7.5);
  const built = buildToShell(normalizeBuild({ ...defaultBuild(), tail: 'short' }), newCustomShell('b', '공방'));
  assert.equal(built.layers[0].tail, 'short');
});
