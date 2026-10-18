import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cueCost } from '../src/commission.ts';
import { customLength, newCustomShell, normalizeShell, type CustomShell } from '../src/custom.ts';
import { decodeShellCode, decodeShow, encodeShellCode, encodeShow } from '../src/share.ts';
import { cueLength, expandShow, type Show } from '../src/show.ts';
import { RENDER_EXTRA, Simulation } from '../src/sim.ts';

const candy: CustomShell = {
  id: 'c1',
  name: '별사탕',
  layers: [
    { role: 'outer', shape: { kind: 'points', pts: [[0, 1], [0.95, 0.31], [0.59, -0.81], [-0.59, -0.81], [-0.95, 0.31]] }, star: 'tail', color: 'pink', then: { color: 'white', at: 0.5 }, scale: 1, delay: 0 },
    { role: 'pistil', shape: { kind: 'sphere', count: 30 }, star: 'dot', color: 'gold', scale: 0.45, delay: 0.3 },
  ],
  motion: { speed: 1, droop: 0.3, life: 2.4, flicker: false },
};

const showWith = (shells: Record<string, CustomShell> | undefined, extra: Partial<Show['cues'][number]> = {}): Show => ({
  version: 1, seed: 7,
  venue: { preset: 'river-bridge-city', wind: { dir: 250, speed: 3 } },
  launchers: [{ id: 'barge-1', kind: 'barge', pos: [-200, 0, 0] }],
  cues: [{ t: 5, at: 'barge-1', type: 'custom', custom: 'c1', size: 5, ...extra }],
  customShells: shells,
});

test('내 불꽃은 쇼에 담긴 설계대로 터지고, 설계가 없으면 경고한다', () => {
  const ok = expandShow(showWith({ c1: candy }));
  assert.equal(ok.warnings.length, 0);
  assert.equal(ok.launches[0].customDef?.name, '별사탕');
  const missing = expandShow(showWith(undefined));
  assert.equal(missing.launches.length, 0);
  assert.match(missing.warnings[0].message, /설계가 이 쇼에 없습니다/);
});

test('늦게 피는 심은 그때까지 보이지 않고, 별 수는 층마다 정한 만큼', () => {
  const s = new Simulation(showWith({ c1: candy }));
  const out = new Float32Array((s.pool.capacity + RENDER_EXTRA) * 8);
  s.advanceTo(5.1); // 터진 직후: 바깥 층 5개는 보이고 심 30개는 아직
  const n = s.writeRender(out);
  let visible = 0;
  for (let i = 0; i < n; i++) if (out[i * 8 + 7] > 0 && out[i * 8 + 3] >= 4.5 && out[i * 8 + 3] <= 5.5) visible++;
  assert.equal(visible, 5, `보이는 별 ${visible}`);
  s.advanceTo(5.5);
  const m = s.writeRender(out);
  let later = 0;
  for (let i = 0; i < m; i++) if (out[i * 8 + 7] > 0 && out[i * 8 + 3] >= 4.5 && out[i * 8 + 3] <= 5.5) later++;
  assert.ok(later >= 30, `심이 핀 뒤 ${later}`);
});

test('색이 바뀌는 별은 수명 절반쯤에서 다른 색이 된다', () => {
  const one: CustomShell = { ...candy, layers: [{ ...candy.layers[0], star: 'dot' }] };
  const s = new Simulation(showWith({ c1: one }));
  const out = new Float32Array((s.pool.capacity + RENDER_EXTRA) * 8);
  s.advanceTo(5.2);
  s.writeRender(out);
  const early = [out[4], out[5], out[6]];
  s.advanceTo(5 + 2.4 * 0.8);
  s.writeRender(out);
  const late = [out[4], out[5], out[6]];
  assert.ok(early[1] < 0.6 && late[1] > 0.85, `분홍 ${early} → 흰색 ${late}`);
});

test('두 번 터지기: 갈라질 때 작은 별이 생긴다', () => {
  const burst: CustomShell = { ...candy, split: { after: 1, into: 'burst' } };
  const s = new Simulation(showWith({ c1: burst }));
  s.advanceTo(5.95);
  const before = s.pool.count;
  s.advanceTo(6.3);
  assert.ok(s.pool.count > before, `${before} → ${s.pool.count}`);
});

test('공유 링크와 불꽃 코드로 보내도 같은 불꽃이 된다', async () => {
  const show = showWith({ c1: candy, unused: { ...candy, id: 'unused' } });
  const back = await decodeShow(await encodeShow(show));
  assert.deepEqual(Object.keys(back.customShells ?? {}), ['c1']);
  assert.deepEqual(back.customShells!.c1, normalizeShell(candy));
  assert.equal(back.cues[0].custom, 'c1');
  const a = new Simulation(show);
  const b = new Simulation(back);
  a.advanceTo(7);
  b.advanceTo(7);
  assert.equal(a.stateHash(), b.stateHash());

  const code = await encodeShellCode(candy);
  assert.match(code, /^NSS1-/);
  assert.deepEqual(await decodeShellCode(code), normalizeShell(candy));
  await assert.rejects(decodeShellCode('NSS1-abc'), /불꽃 코드가 아니거나/);
});

test('바깥에서 온 설계는 안전한 범위로 고친다', () => {
  const wild = normalizeShell({
    ...newCustomShell('w', 'x'.repeat(40)),
    layers: [{ role: 'outer', shape: { kind: 'sphere', count: 99999 }, star: 'tail', color: 'nope' as never, scale: 9, delay: -3 }],
    motion: { speed: 99, droop: -1, life: 0, flicker: true },
  });
  assert.equal((wild.layers[0].shape as { count: number }).count, 200);
  assert.equal(wild.layers[0].color, 'gold');
  assert.equal(wild.layers[0].scale, 1);
  assert.equal(wild.layers[0].delay, 0);
  assert.equal(wild.motion.speed, 1.5);
  assert.equal(wild.name.length, 16);
});

test('시간표 길이와 원가', () => {
  const show = showWith({ c1: candy });
  assert.equal(cueLength(show.cues[0], show.customShells), customLength(candy));
  assert.equal(customLength(candy), 0.3 + 2.4);
  assert.equal(cueCost(show.cues[0]), 3 * 0.8);
});
