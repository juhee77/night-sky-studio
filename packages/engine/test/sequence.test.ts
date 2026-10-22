import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildToShell, defaultBuild, normalizeBuild } from '../src/build.ts';
import { newCustomShell, normalizeShell, type CustomShell, type Sequence } from '../src/custom.ts';
import { decodeShow, encodeShow } from '../src/share.ts';
import type { Show } from '../src/show.ts';
import { Simulation } from '../src/sim.ts';

const showOf = (shell: CustomShell): Show => ({
  version: 1, seed: 5,
  venue: { preset: 'river-bridge-city', wind: { dir: 0, speed: 0 } },
  launchers: [{ id: 'b', kind: 'barge', pos: [0, 0, 0] }],
  cues: [{ t: 5, at: 'b', type: 'custom', custom: shell.id, size: 5 }],
  customShells: { [shell.id]: shell },
});

const seqShell = (sequence: Sequence): CustomShell => {
  const s = newCustomShell('q', '순서');
  s.layers = [{ role: 'outer', shape: { kind: 'sphere', count: 120 }, star: 'dot', color: 'white', scale: 1, delay: 0, sequence }];
  return s;
};

/** 보이는 별과 아직 어두운 별의 평균 높이 */
function litVsDark(shell: CustomShell, t: number) {
  const sim = new Simulation(showOf(shell));
  sim.advanceTo(t);
  const out = new Float32Array((sim.pool.count + 2000) * 8);
  const n = sim.writeRender(out);
  const lit: number[] = [];
  const dark: number[] = [];
  for (let i = 0; i < Math.min(n, sim.pool.count); i++) {
    if (out[i * 8 + 3] !== 5.5) continue;
    (out[i * 8 + 7] > 0 ? lit : dark).push(out[i * 8 + 1]);
  }
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  return { lit: lit.length, dark: dark.length, litY: avg(lit), darkY: avg(dark) };
}

test('위에서 아래로: 반쯤 지났을 때 켜진 별이 아직 어두운 별보다 위에 있다', () => {
  const r = litVsDark(seqShell({ order: 'down', span: 1.2, mode: 'light' }), 5 + 0.25 + 0.6);
  assert.ok(r.lit > 20 && r.dark > 20, `켜짐 ${r.lit}, 어두움 ${r.dark}`);
  assert.ok(r.litY > r.darkY + 30, `켜진 별 ${r.litY.toFixed(0)}m, 어두운 별 ${r.darkY.toFixed(0)}m`);
});

test('아래에서 위로는 반대 순서다', () => {
  const r = litVsDark(seqShell({ order: 'up', span: 1.2, mode: 'light' }), 5 + 0.25 + 0.6);
  assert.ok(r.litY < r.darkY - 30);
});

test('터지자마자는 모두 어둡고, 다 지나면 모두 켜져 있다 (계속 타는 별)', () => {
  const shell = seqShell({ order: 'random', span: 1, mode: 'light' });
  assert.equal(litVsDark(shell, 5.1).lit, 0);
  const end = litVsDark(shell, 5 + 0.25 + 1.05);
  assert.ok(end.dark < 5, `${end.dark}`);
});

test('반짝 터지는 별은 켜지고 곧 꺼진다', () => {
  const shell = seqShell({ order: 'down', span: 1.5, mode: 'sparkle' });
  const mid = litVsDark(shell, 5 + 0.25 + 0.75);
  // 지금 반짝이는 별은 일부뿐: 위쪽은 이미 꺼졌고 아래쪽은 아직이다.
  assert.ok(mid.lit > 0 && mid.lit < 60, `${mid.lit}`);
});

test('켜지는 순서는 제작 공방과 공유 링크를 지나도 남는다', async () => {
  const shell = buildToShell(normalizeBuild({ ...defaultBuild(), sequence: { order: 'sweep', span: 9, mode: 'sparkle' } }), newCustomShell('w', '물결'));
  assert.deepEqual(shell.layers[0].sequence, { order: 'sweep', span: 3, mode: 'sparkle' });
  const back = await decodeShow(await encodeShow(showOf(shell)));
  assert.deepEqual(normalizeShell(back.customShells!.w).layers[0].sequence, shell.layers[0].sequence);
});
