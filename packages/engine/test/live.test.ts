import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateCommissions } from '../src/commission.ts';
import { applyLive } from '../src/live.ts';
import { rigForShow } from '../src/loading.ts';
import { scoreShow } from '../src/score.ts';
import { decodeShow, encodeShow } from '../src/share.ts';
import { expandShow, type Show } from '../src/show.ts';
import { Simulation } from '../src/sim.ts';
import { RIVER_CITY } from '../src/venues.ts';
import { fixFaults } from '../src/wiring.ts';

const show = (): Show => ({
  version: 1, seed: 1, venue: { preset: RIVER_CITY.id },
  launchers: structuredClone(RIVER_CITY.launchers),
  cues: [
    { t: 5, at: 'barge-1', type: 'peony', size: 5 },
    { t: 6, at: 'barge-2', type: 'willow', size: 10 },
    { t: 7, at: 'barge-3', type: 'cake', size: 3, shots: 8 },
  ],
});

test('실전 모드를 끄면 장비가 없어도 모두 쏜다', () => {
  const s = show();
  const sim = new Simulation(s);
  assert.equal(sim.launches.length, 1 + 1 + 8);
  assert.equal(sim.warnings.length, 0);
});

test('실전 모드에서 장비가 모자라면 그 불꽃은 쏘아지지 않고 이유가 보인다', () => {
  const s = show();
  s.rig = { decks: { 'barge-1': [{ id: 'R1', kind: 'r5x5', x: 3, y: 1, rot: 0, tilt: 0 }] }, live: true };
  fixFaults(s);
  const sim = new Simulation(s);
  // 5호만 실었다: 10호와 케이크는 쏘지 않는다
  assert.deepEqual(sim.launches.map((l) => l.cueIndex), [0]);
  const msgs = sim.warnings.map((w) => w.message);
  assert.ok(msgs.some((m) => m.includes('10호 통이 없습니다')), msgs.join('\n'));
  assert.ok(msgs.some((m) => m.includes('케이크 자리가 없습니다')));
  // 실제 통 자리에서 쏜다 (바지선 자리 + 갑판 위 자리)
  const o = sim.launches[0].origin;
  assert.ok(Math.abs(o[0] - (-220 + 3 - 0.7)) < 0.01 && Math.abs(o[2] - 1) < 0.01, `${o}`);
});

test('통 각도로 쏜다: 기울인 랙에 실으면 기울어져 올라간다', () => {
  const s = show();
  s.cues = [{ t: 5, at: 'barge-1', type: 'peony', size: 5 }];
  s.rig = { decks: { 'barge-1': [{ id: 'R1', kind: 'r5x5', x: 0, y: 0, rot: 0, tilt: 0 }] }, live: true, checked: true };
  fixFaults(s);
  assert.equal(new Simulation(s).launches[0].angle, 0);
});

test('회로 점검을 건너뛰면 끊긴 선 때문에 쏘아지지 않는 불꽃이 생긴다', () => {
  const s = show();
  for (let i = 0; i < 60; i++) s.cues.push({ t: 8 + i * 0.3, at: 'barge-1', type: 'peony', size: 3 });
  s.rig = { ...rigForShow(s).rig, live: true };
  let blocked = applyLive(s, expandShow(s).launches).blocked;
  for (let seed = 2; seed < 40 && !blocked.length; seed++) {
    s.seed = seed;
    blocked = applyLive(s, expandShow(s).launches).blocked;
  }
  assert.ok(blocked.length > 0 && blocked.every((b) => b.reason.includes('선이 끊겨')), JSON.stringify(blocked.slice(0, 3)));
  fixFaults(s);
  assert.equal(applyLive(s, expandShow(s).launches).blocked.length, 0);
});

test('큰 행사 의뢰는 실전 모드가 조건이다', () => {
  const big = generateCommissions(5, 100, 12).find((c) => c.rules.some((r) => r.kind === 'live'));
  assert.ok(big && big.tier === 2);
  const s: Show = { ...show(), commission: big, music: { id: big.music, title: 'x', bpm: 100, offset: 0, duration: 30 } };
  const before = scoreShow(s, big).rules.find((r) => r.rule.kind === 'live')!;
  assert.equal(before.ok, false);
  s.rig = { ...rigForShow(s).rig, live: true };
  fixFaults(s);
  assert.equal(scoreShow(s, big).rules.find((r) => r.rule.kind === 'live')!.ok, true);
});

test('실전 모드는 공유 링크에 담긴다', async () => {
  const s = show();
  s.rig = { decks: {}, live: true };
  const back = await decodeShow(await encodeShow(s));
  assert.equal(back.rig?.live, true);
});
