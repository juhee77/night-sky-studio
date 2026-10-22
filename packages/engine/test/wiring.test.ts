import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rigForShow } from '../src/loading.ts';
import { decodeShow, encodeShow } from '../src/share.ts';
import { expandShow, type Show } from '../src/show.ts';
import { RIVER_CITY } from '../src/venues.ts';
import { FAULT_RATE, fireScript, fixFaults, wirePlan } from '../src/wiring.ts';

const show = (): Show => {
  const s: Show = {
    version: 1, seed: 1, venue: { preset: RIVER_CITY.id },
    launchers: structuredClone(RIVER_CITY.launchers),
    cues: [
      { t: 5, at: 'barge-1', type: 'peony', size: 5 },
      { t: 6, at: 'barge-1', type: 'peony', size: 5, fan: { count: 5, spread: 40 } },
      { t: 7, at: 'barge-2', type: 'willow', size: 10 },
      { t: 8, at: 'barge-3', type: 'cake', size: 3, shots: 12 },
      { t: 9, at: 'bridge', type: 'niagara', size: 3, len: 5 },
      { t: 10, at: 'ground', type: 'lancework', size: 3, len: 6, text: '안녕, "밤"' },
    ],
  };
  for (let i = 0; i < 40; i++) s.cues.push({ t: 11 + i * 0.5, at: 'barge-1', type: 'chrysanthemum', size: 3 });
  s.rig = rigForShow(s).rig;
  return s;
};

test('통마다 모듈과 핀이 이어지고, 부채꼴 다섯 발은 한 핀에 묶인다', () => {
  const s = show();
  const w = wirePlan(s);
  assert.ok(w.fires.every((f) => f.module && f.pin));
  const fan = w.fires.filter((f) => f.cueIndex === 1);
  assert.equal(new Set(fan.map((f) => `${f.module}-${f.pin}`)).size, 1);
  assert.equal(w.chained, 1);
  // 한 모듈에 18핀까지: 바지선 1은 42발(부채꼴 묶음 하나)이라 모듈 셋
  assert.equal(w.modules.filter((m) => m.launcher === 'barge-1').length, 3);
  assert.ok(w.modules.every((m) => m.used <= 18));
  // 묶기를 끄면 핀을 따로 쓴다
  s.rig!.chain = false;
  assert.equal(new Set(wirePlan(s).fires.filter((f) => f.cueIndex === 1).map((f) => f.pin)).size, 5);
});

test('발사 스크립트 CSV는 쇼의 모든 발사를 빠짐없이 담는다 (케이크는 상자 한 번)', () => {
  const s = show();
  const csv = fireScript(s);
  assert.ok(csv.startsWith('﻿시각(초),모듈,핀'));
  const lines = csv.trim().split('\n').slice(1);
  const launches = expandShow(s).launches.filter((l) => !(l.type === 'cake' && l.sub > 0));
  assert.equal(lines.length, launches.length);
  // 쉼표·따옴표가 든 글자도 칸이 어긋나지 않는다
  assert.ok(lines.some((l) => l.includes('"지상 틀 불꽃 ""안녕, ""밤""""') || l.includes('""밤""')));
  // 통이 없는 발사도 빠지지 않고 "연결 안 됨"으로 남는다
  delete s.rig;
  const bare = fireScript(s).trim().split('\n').slice(1);
  assert.equal(bare.length, launches.length);
  assert.ok(bare.some((l) => l.includes('연결 안 됨')));
});

test('회로 점검으로 끊긴 선을 찾고 고치면 남지 않는다', () => {
  const s = show();
  let found = 0;
  for (let seed = 1; seed < 30 && !found; seed++) {
    s.seed = seed;
    found = wirePlan(s).faults.length;
  }
  assert.ok(found > 0, '끊긴 선이 있는 쇼를 찾는다');
  const pins = wirePlan(s).modules.reduce((n, m) => n + m.used, 0);
  assert.ok(found < pins * FAULT_RATE * 4);
  fixFaults(s);
  assert.equal(wirePlan(s).faults.length, 0);
  assert.ok(s.rig!.checked);
});

test('배선 설정과 점검 결과는 공유 링크에 담긴다', async () => {
  const s = show();
  s.rig!.pins = 32;
  s.rig!.chain = false;
  fixFaults(s);
  const back = await decodeShow(await encodeShow(s));
  assert.equal(back.rig!.pins, 32);
  assert.equal(back.rig!.chain, false);
  assert.deepEqual(back.rig!.fixed, s.rig!.fixed);
});
