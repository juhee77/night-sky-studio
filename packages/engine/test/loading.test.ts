import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadPlan, rigForShow } from '../src/loading.ts';
import type { PlacedRack } from '../src/rig.ts';
import { decodeShow, encodeShow } from '../src/share.ts';
import type { Show } from '../src/show.ts';
import { RIVER_CITY } from '../src/venues.ts';

const rack = (p: Partial<PlacedRack> & Pick<PlacedRack, 'id' | 'kind'>): PlacedRack => ({ x: 0, y: 0, rot: 0, tilt: 0, ...p });

const show = (): Show => ({
  version: 1, seed: 1, venue: { preset: RIVER_CITY.id },
  launchers: structuredClone(RIVER_CITY.launchers),
  cues: [
    { t: 5, at: 'barge-1', type: 'peony', size: 5 },
    { t: 6, at: 'barge-1', type: 'peony', size: 5, fan: { count: 5, spread: 40 } },
    { t: 7, at: 'barge-1', type: 'willow', size: 10 },
    { t: 8, at: 'barge-1', type: 'cake', size: 3 },
    { t: 9, at: 'bridge', type: 'niagara', size: 3, len: 5 },
  ],
});

test('크기와 각도가 맞는 빈 통에 한 발씩 넣고, 부채꼴은 같은 랙을 쓴다', () => {
  const s = show();
  s.rig = { decks: { 'barge-1': [
    rack({ id: 'R1', kind: 'r5x5' }),
    rack({ id: 'R2', kind: 'fan5', spread: 40, x: 4 }),
    rack({ id: 'R3', kind: 'single10', x: -6 }),
    rack({ id: 'R4', kind: 'cake', x: 8 }),
  ] } };
  const plan = loadPlan(s);
  // 나이아가라는 갑판에 싣지 않는다
  assert.equal(plan.rows.length, 1 + 5 + 1 + 1);
  assert.deepEqual(plan.shortages, []);
  const fan = plan.rows.filter((r) => r.cueIndex === 1);
  assert.ok(fan.every((r) => r.tube!.startsWith('barge-1/R2.')));
  assert.equal(plan.rows.find((r) => r.cueIndex === 0)!.tube, 'barge-1/R1.1');
  assert.equal(plan.rows.find((r) => r.cueIndex === 2)!.tube, 'barge-1/R3.1');
  assert.equal(plan.rows.find((r) => r.cake)!.tube, 'barge-1/R4.1');
  // 한 통에 두 발은 없다
  assert.equal(new Set(plan.rows.map((r) => r.tube)).size, plan.rows.length);
});

test('모자라면 무엇이 몇 개 부족한지 알려 준다', () => {
  const s = show();
  s.rig = { decks: { 'barge-1': [rack({ id: 'R1', kind: 'r5x5' })] } };
  const plan = loadPlan(s);
  // 부채꼴 다섯 발 중 기울기 0도인 가운데 발은 일반 5연발 통에 들어갈 수 있다.
  assert.deepEqual(plan.shortages.sort(), [
    '바지선 1: 10호 통 1개 부족',
    '바지선 1: 5호 부채꼴 40도 랙 없음 (4발)',
    '바지선 1: 케이크 자리 1개 부족',
  ]);
});

test('손으로 고른 통을 지키고, 맞지 않는 통은 무시한다', () => {
  const s = show();
  s.rig = { decks: { 'barge-1': [rack({ id: 'R1', kind: 'r5x5' }), rack({ id: 'R3', kind: 'single10', x: -6 })] } };
  s.cues[0].tubes = ['barge-1/R1.4'];
  s.cues[2].tubes = ['barge-1/R1.2'];
  const plan = loadPlan(s);
  const first = plan.rows.find((r) => r.cueIndex === 0)!;
  assert.equal(first.tube, 'barge-1/R1.4');
  assert.ok(first.manual);
  const big = plan.rows.find((r) => r.cueIndex === 2)!;
  assert.equal(big.tube, 'barge-1/R3.1');
  assert.equal(big.manual, false);
});

test('쇼에 맞게 랙을 채우면 부족한 통이 없다', () => {
  const s = show();
  const { rig, missing } = rigForShow(s);
  assert.deepEqual(missing, []);
  s.rig = rig;
  assert.deepEqual(loadPlan(s).shortages, []);
});

test('손으로 고른 통은 공유 링크를 지나도 그 불꽃에 붙어 있다 (불꽃 순서가 바뀌어도)', async () => {
  const s = show();
  s.cues.reverse();
  s.cues.find((c) => c.type === 'peony' && !c.fan)!.tubes = ['barge-1/R1.3'];
  const back = await decodeShow(await encodeShow(s));
  assert.deepEqual(back.cues.find((c) => c.type === 'peony' && !c.fan)!.tubes, ['barge-1/R1.3']);
});

test('바지선마다 랙 번호가 같아도 통은 서로 다르다', () => {
  const s = show();
  s.cues.push({ t: 10, at: 'barge-2', type: 'peony', size: 10 }, { t: 11, at: 'barge-3', type: 'peony', size: 10 });
  s.rig = rigForShow(s).rig;
  const plan = loadPlan(s);
  assert.deepEqual(plan.shortages, []);
  const big = plan.rows.filter((r) => r.size === 10).map((r) => r.tube);
  assert.equal(new Set(big).size, 3);
});
