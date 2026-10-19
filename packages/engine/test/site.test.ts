import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeShow, encodeShow } from '../src/share.ts';
import type { Show } from '../src/show.ts';
import { Simulation } from '../src/sim.ts';
import { addBarge, moveLauncher, removeBarge, resetSite, siteCheck } from '../src/site.ts';
import { RIVER_CITY } from '../src/venues.ts';

const base = (): Show => ({
  version: 1, seed: 1,
  venue: { preset: RIVER_CITY.id },
  launchers: structuredClone(RIVER_CITY.launchers),
  cues: [
    { t: 6, at: 'barge-1', type: 'peony', size: 10 },
    { t: 7, at: 'barge-2', type: 'peony', size: 3 },
  ],
});

test('바지선을 옮기면 그 자리에서 쏘아 올린다', () => {
  const show = base();
  moveLauncher(show, 'barge-1', 400, 300);
  assert.deepEqual(show.launchers[0].pos, [400, 0, 300]);
  const sim = new Simulation(show);
  sim.advanceTo(4);
  assert.deepEqual(sim.launches.find((l) => l.cueIndex === 0)!.origin, [400, 0, 300]);
});

test('물 밖으로는 끌어도 물가에서 멈추고, 다리 나이아가라는 다리를 따라 옆으로만 움직인다', () => {
  const show = base();
  moveLauncher(show, 'barge-1', 0, -2000);
  assert.ok(show.launchers[0].pos[2] > RIVER_CITY.nearShoreZ);
  moveLauncher(show, 'bridge', 300, -100);
  const b = show.launchers.find((l) => l.id === 'bridge')!;
  assert.deepEqual(b.pos, [300, 18, 258]);
  assert.deepEqual(b.from, [-200, 18, 258]);
  assert.deepEqual(b.to, [800, 18, 258]);
});

test('큰 알을 관람석 가까이에서 쏘면 안전거리 경고가 나온다', () => {
  const show = base();
  assert.equal(siteCheck(show).filter((w) => w.launcher === 'barge-2').length, 0);
  moveLauncher(show, 'barge-1', -220, -500);
  const w = siteCheck(show).filter((x) => x.launcher === 'barge-1');
  assert.ok(w.some((x) => x.message.includes('10호 안전거리 280m')), w.map((x) => x.message).join('\n'));
  moveLauncher(show, 'barge-2', -210, -480);
  assert.ok(siteCheck(show).some((x) => x.message.includes('너무 가깝습니다')));
});

test('바지선을 더하고 빼면 줄이 생기고, 빠진 바지선의 불꽃은 가까운 바지선으로 간다', () => {
  const show = base();
  const id = addBarge(show);
  assert.equal(id, 'barge-4');
  assert.equal(show.launchers.filter((l) => l.kind === 'barge').length, 4);
  // 바지선 줄은 다리·지상 틀 앞에 모인다
  assert.deepEqual(show.launchers.map((l) => l.kind), ['barge', 'barge', 'barge', 'barge', 'bridge', 'frame']);
  assert.ok(removeBarge(show, 'barge-1'));
  assert.equal(show.cues[0].at, 'barge-2');
  removeBarge(show, 'barge-2');
  removeBarge(show, 'barge-3');
  assert.equal(removeBarge(show, 'barge-4'), false, '마지막 바지선은 뺄 수 없다');
});

test('발사장 배치는 공유 링크에 담기고, 기본 위치로 되돌릴 수 있다', async () => {
  const show = base();
  addBarge(show);
  moveLauncher(show, 'barge-4', 500, 100);
  show.cues.push({ t: 8, at: 'barge-4', type: 'ring', size: 5 });
  const back = await decodeShow(await encodeShow(show));
  assert.deepEqual(back.launchers.find((l) => l.id === 'barge-4')!.pos, [500, 0, 100]);
  resetSite(back);
  assert.equal(back.launchers.length, RIVER_CITY.launchers.length);
  assert.equal(back.cues[2].at, 'barge-1');
});
