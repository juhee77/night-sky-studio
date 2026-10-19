import assert from 'node:assert/strict';
import { test } from 'node:test';
import { showCost } from '../src/commission.ts';
import { applyLive } from '../src/live.ts';
import { rigForShow } from '../src/loading.ts';
import { expandShow, type Show } from '../src/show.ts';
import { addBarge, allowedSizeAt, bargeGap, moveLauncher, siteBlock, siteCheck } from '../src/site.ts';
import { RIVER_CITY } from '../src/venues.ts';
import { fixFaults } from '../src/wiring.ts';

const show = (): Show => ({
  version: 1, seed: 1, venue: { preset: RIVER_CITY.id },
  launchers: structuredClone(RIVER_CITY.launchers),
  cues: [
    { t: 6, at: 'barge-1', type: 'peony', size: 10 },
    { t: 7, at: 'barge-2', type: 'peony', size: 5 },
    { t: 8, at: 'barge-3', type: 'peony', size: 3 },
  ],
});

/** 실전 모드로 장비를 다 갖춘 쇼 */
const live = (s: Show) => {
  s.rig = { ...rigForShow(s).rig, live: true };
  fixFaults(s);
  return applyLive(s, expandShow(s).launches);
};

test('자리마다 쏠 수 있는 크기는 관람석까지 거리로 정해진다', () => {
  const s = show();
  assert.equal(allowedSizeAt(s, s.launchers[0]), 10);
  moveLauncher(s, 'barge-1', -220, -450);
  // 관람석 물가(-640)까지 190m → 5호까지
  assert.equal(allowedSizeAt(s, s.launchers[0]), 5);
  assert.match(siteBlock(s, 'barge-1', 10)!, /5호까지/);
  assert.equal(siteBlock(s, 'barge-1', 5), null);
});

test('큰 알을 쏘는 바지선일수록 더 띄워야 한다', () => {
  assert.equal(bargeGap(3, 3), 40);
  assert.equal(bargeGap(3, 10), 120);
});

test('자유 모드에서는 모두 쏘고 경고만, 실전 모드에서는 허가 구역 밖·척수 초과·안전거리 위반이 쏘아지지 않는다', () => {
  const s = show();
  // 허가 구역 밖 (다리 쪽으로 너무 가까이)
  moveLauncher(s, 'barge-2', 0, 230);
  // 바지선을 허가 척수(5척)보다 많이
  for (let i = 0; i < 3; i++) addBarge(s);
  moveLauncher(s, 'barge-6', 700, -100);
  s.cues.push({ t: 9, at: 'barge-6', type: 'peony', size: 3 });
  // 관람석 가까이에서 10호
  moveLauncher(s, 'barge-1', -220, -450);
  const warnings = siteCheck(s).map((w) => w.message).join('\n');
  assert.match(warnings, /허가 구역/);
  assert.match(warnings, /5척까지/);
  assert.equal(new Set(expandShow(s).launches.map((l) => l.cueIndex)).size, 4, '자유 모드는 다 쏜다');
  const { launches, blocked } = live(s);
  const reasons = blocked.map((b) => b.reason).join('\n');
  assert.match(reasons, /허가 구역 밖/);
  assert.match(reasons, /허가 척수\(5척\)/);
  assert.match(reasons, /5호까지/);
  assert.deepEqual(launches.map((l) => s.cues[l.cueIndex].at), ['barge-3']);
});

test('실전 모드에서는 바지선 임대료가 값에 들어간다', () => {
  const s = show();
  const free = showCost(s);
  s.rig = { decks: {}, live: true };
  assert.equal(showCost(s), Math.round((free + 12 * 3) * 10) / 10);
});
