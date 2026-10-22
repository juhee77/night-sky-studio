import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DECK, RACKS, deckCheck, placeRack, rackTubes, type PlacedRack } from '../src/rig.ts';
import { decodeShow, encodeShow } from '../src/share.ts';
import type { Show } from '../src/show.ts';
import { removeBarge } from '../src/site.ts';
import { RIVER_CITY } from '../src/venues.ts';

const rack = (p: Partial<PlacedRack> & Pick<PlacedRack, 'id' | 'kind'>): PlacedRack => ({ x: 0, y: 0, rot: 0, tilt: 0, ...p });

test('부채꼴 랙은 통 각도가 고정되어 있고, 단통은 하나다', () => {
  const fan = rackTubes('barge-1', rack({ id: 'R1', kind: 'fan5', spread: 60, tilt: 10 }));
  assert.deepEqual(fan.map((t) => t.angle), [-20, -5, 10, 25, 40]);
  assert.equal(rackTubes('barge-1', rack({ id: 'R2', kind: 'single10' })).length, 1);
  const ten = rackTubes('barge-1', rack({ id: 'R3', kind: 'r3x10', x: 2, y: 1 }));
  assert.equal(ten.length, 10);
  assert.equal(new Set(ten.map((t) => `${t.x.toFixed(2)},${t.y.toFixed(2)}`)).size, 10, '통마다 자리가 다르다');
  assert.ok(ten.every((t) => t.size === 3 && Math.abs(t.x - 2) < 1 && Math.abs(t.y - 1) < 0.5));
});

test('갑판 밖, 겹침, 단통 안전 간격, 무게 초과를 이유와 함께 알려 준다', () => {
  assert.equal(deckCheck([rack({ id: 'R1', kind: 'r5x5' })]).problems.length, 0);
  assert.match(deckCheck([rack({ id: 'R1', kind: 'r5x5', x: DECK.len / 2 })]).problems[0].message, /갑판 밖/);
  assert.match(deckCheck([rack({ id: 'R1', kind: 'r5x5' }), rack({ id: 'R2', kind: 'r5x5', x: 0.5 })]).problems[0].message, /겹칩니다/);
  // 10호 단통은 2.5m를 띄워야 한다
  const near = deckCheck([rack({ id: 'R1', kind: 'single10' }), rack({ id: 'R2', kind: 'r3x10', x: 2.2 })]);
  assert.match(near.problems[0].message, /2.5m 이상/);
  const heavy = Array.from({ length: 8 }, (_, i) => rack({ id: `R${i}`, kind: 'single10', x: -10 + i * 3 }));
  assert.ok(deckCheck(heavy).problems.some((p) => p.message.includes('한도')));
});

test('빈 자리에 랙을 놓고, 갑판이 차면 더 놓지 못한다', () => {
  const racks: PlacedRack[] = [];
  let placed = 0;
  for (;;) {
    const r = placeRack(racks, 'single10');
    if (!r) break;
    racks.push(r);
    placed++;
  }
  // 무게 한도 6000kg / 800kg → 7개까지
  assert.equal(placed, Math.floor(DECK.kg / RACKS.single10.kg));
  assert.equal(deckCheck(racks).problems.length, 0);
  assert.ok(placeRack([], 'r3x10'));
});

test('갑판 배치는 공유 링크에 담기고, 바지선을 빼면 그 갑판도 사라진다', async () => {
  const show: Show = {
    version: 1, seed: 1, venue: { preset: RIVER_CITY.id },
    launchers: structuredClone(RIVER_CITY.launchers),
    cues: [{ t: 5, at: 'barge-1', type: 'peony', size: 5 }],
    rig: { decks: { 'barge-1': [rack({ id: 'R1', kind: 'fan5', spread: 50, x: 3.2, tilt: 5 })], 'barge-2': [rack({ id: 'R1', kind: 'single7' })] } },
  };
  const back = await decodeShow(await encodeShow(show));
  assert.deepEqual(back.rig, show.rig);
  removeBarge(back, 'barge-2');
  assert.equal(back.rig!.decks['barge-2'], undefined);
});
