import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildToShell, defaultBuild, normalizeBuild } from '../src/build.ts';
import { newCustomShell, normalizeSequence, type CustomShell } from '../src/custom.ts';
import type { Show } from '../src/show.ts';
import { Simulation } from '../src/sim.ts';

/** 심은 그대로, 바깥 층은 위에서 아래로 차례로 작게 터지는 알 */
const popShell = (): CustomShell => {
  const s = newCustomShell('p', '차례로 터짐');
  s.layers = [
    { role: 'outer', shape: { kind: 'sphere', count: 80 }, star: 'dot', color: 'gold', scale: 1, delay: 0, sequence: { order: 'down', span: 1.6, mode: 'pop' } },
    { role: 'pistil', shape: { kind: 'sphere', count: 30 }, star: 'dot', color: 'cyan', scale: 0.45, delay: 0 },
  ];
  return s;
};

function look(t: number) {
  const s = popShell();
  const show: Show = {
    version: 1, seed: 6, venue: { preset: 'river-bridge-city', wind: { dir: 0, speed: 0 } },
    launchers: [{ id: 'b', kind: 'barge', pos: [0, 0, 0] }],
    cues: [{ t: 5, at: 'b', type: 'custom', custom: 'p', size: 5 }], customShells: { p: s },
  };
  const sim = new Simulation(show);
  sim.advanceTo(t);
  const out = new Float32Array((sim.pool.count + 2000) * 8);
  const n = sim.writeRender(out);
  const pops: number[] = [];
  const waiting: number[] = [];
  let pistil = 0;
  for (let i = 0; i < n; i++) {
    const size = out[i * 8 + 3];
    const a = out[i * 8 + 7];
    const y = out[i * 8 + 1];
    if (Math.abs(size - 3.2) < 0.01 && a > 0) pops.push(y);
    if (size === 5.5 && a === 0) waiting.push(y);
    if (size === 5.5 && a > 0) pistil++;
  }
  return { pops, waiting, pistil };
}

const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);

test('심은 한꺼번에 피고, 바깥 층은 위에서 아래로 차례로 작게 터진다', () => {
  const early = look(5.15);
  assert.ok(early.pistil > 20, `심 ${early.pistil}`);
  assert.equal(early.pops.length, 0, '터지자마자는 바깥 층이 아직 터지지 않았다');
  const mid = look(5 + 0.25 + 0.8);
  assert.ok(mid.pops.length > 30 && mid.waiting.length > 10, `터짐 ${mid.pops.length}, 기다림 ${mid.waiting.length}`);
  // 먼저 터진 작은 불꽃은 아직 기다리는 별보다 위에 있다
  assert.ok(avg(mid.pops) > avg(mid.waiting) + 30, `${avg(mid.pops)} vs ${avg(mid.waiting)}`);
});

test('「작게 터지며 켜짐」은 정규화와 제작 공방을 지나도 남는다', () => {
  assert.equal(normalizeSequence({ order: 'down', span: 1, mode: 'pop' }).mode, 'pop');
  const b = normalizeBuild({ ...defaultBuild(), sequence: { order: 'down', span: 1.2, mode: 'pop' } });
  assert.equal(buildToShell(b, newCustomShell('x', 'x')).layers[0].sequence?.mode, 'pop');
});
