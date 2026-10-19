import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeMusic, autoChoreograph, type Mood } from '../src/auto.ts';
import { loadPlan, rigForShow } from '../src/loading.ts';
import { allTubes } from '../src/rig.ts';
import { expandShow, type Cue, type Show } from '../src/show.ts';
import { RIVER_CITY } from '../src/venues.ts';
import { BPM, RATE, song } from './songs.ts';

const map = analyzeMusic(song(), RATE, BPM, 0);
const launchers = structuredClone(RIVER_CITY.launchers);
const make = (mood: Mood, extra: Partial<Parameters<typeof autoChoreograph>[2]> = {}) =>
  autoChoreograph(map, launchers, { seed: 4, style: 'grand', mood, density: 0.8, ...extra });
const showOf = (cues: Cue[]): Show => ({
  version: 1, seed: 1, music: { id: 'x', title: 'x', bpm: BPM, offset: 0, duration: 80 },
  venue: { preset: RIVER_CITY.id }, launchers, cues,
});

const share = (cues: Cue[], f: (c: Cue) => boolean) => cues.filter(f).length / Math.max(1, cues.length);

test('같은 곡이라도 분위기에 따라 확연히 다른 쇼가 나온다', () => {
  const festive = make('festive');
  const romantic = make('romantic');
  const dramatic = make('dramatic');
  const calm = make('calm');
  // 축제는 촘촘하고, 차분하게·로맨틱은 성기다
  assert.ok(festive.length > calm.length * 1.3, `축제 ${festive.length}, 차분 ${calm.length}`);
  // 로맨틱은 분홍·보라와 하트·버들이 많다
  const warm = (c: Cue) => (c.colors ?? []).some((x) => x === 'pink' || x === 'purple');
  assert.ok(share(romantic, warm) > 0.5 && share(festive, warm) < 0.4, `로맨틱 ${share(romantic, warm)}, 축제 ${share(festive, warm)}`);
  assert.ok(share(romantic, (c) => c.type === 'heart' || c.type === 'willow') > 0.35);
  // 드라마틱은 벌스가 조용하고 후렴이 크다: 크기 대비가 가장 크다
  const avgSize = (cs: Cue[], t0: number, t1: number) => {
    const xs = cs.filter((c) => c.t >= t0 && c.t < t1 && c.type !== 'cake');
    return xs.reduce((s, c) => s + c.size, 0) / Math.max(1, xs.length);
  };
  // 드롭 박(16·32초)의 큰 한 방은 빼고 본다
  const contrast = (cs: Cue[]) => avgSize(cs, 34, 48) - avgSize(cs, 18, 32);
  assert.ok(contrast(dramatic) > contrast(calm), `드라마틱 ${contrast(dramatic)}, 차분 ${contrast(calm)}`);
  // 네 쇼가 서로 다르다
  const keys = [festive, romantic, dramatic, calm].map((cs) => JSON.stringify(cs));
  assert.equal(new Set(keys).size, 4);
});

test('드롭에는 모든 바지선에서 큰 한 방, 조용해진 뒤 한 마디는 비운다', () => {
  for (const mood of ['festive', 'dramatic'] as Mood[]) {
    const cues = make(mood);
    for (const d of map.drops!) {
      const hit = cues.filter((c) => Math.abs(c.t - d) < 0.01 && c.at.startsWith('barge'));
      assert.equal(hit.length, 3, `${mood} 드롭 ${d}초: ${hit.length}발`);
      assert.ok(hit.every((c) => c.size >= 7));
    }
    // 피날레(끝 무렵)는 조용해짐보다 피날레가 먼저다
    for (const h of map.hushes!.filter((x) => x < 64)) {
      const after = cues.filter((c) => c.t > h + 0.01 && c.t < h + 2 - 0.01);
      assert.equal(after.length, 0, `${mood} 조용해진 ${h}초 뒤에 ${after.length}발`);
    }
  }
});

test('특수 효과와 내 불꽃을 섞을 수 있고, 끄면 쓰지 않는다', () => {
  const plain = make('dramatic');
  const fx = make('dramatic', { effects: true, customs: [{ id: 'mine', size: 5 }] });
  const effectTypes = ['crackle', 'brocade', 'fish', 'hummer', 'leaves', 'salute', 'whistle'];
  assert.ok(!plain.some((c) => effectTypes.includes(c.type) || c.rise || c.type === 'custom'));
  assert.ok(fx.some((c) => effectTypes.includes(c.type)));
  assert.ok(fx.some((c) => c.rise));
  assert.ok(fx.some((c) => c.type === 'custom' && c.custom === 'mine'));
});

test('실전 모드면 갑판에 실린 통 안에서만 만든다', () => {
  const s = showOf(make('festive'));
  const rig = rigForShow(s).rig;
  // 실린 랙의 절반만 남긴다
  for (const id of Object.keys(rig.decks)) rig.decks[id] = rig.decks[id].filter((_, k) => k % 2 === 0);
  const tubes = allTubes(rig);
  const cues = make('festive', { tubes });
  const live: Show = { ...showOf(cues), rig };
  assert.deepEqual(loadPlan(live).shortages, []);
  assert.ok(cues.length > 10);
  const shells = expandShow(live).launches.filter((l) => l.origin === launchers[0].pos || l.origin === launchers[1].pos || l.origin === launchers[2].pos);
  assert.ok(shells.length <= tubes.length + 24 * 4, '통 수보다 많이 쏘지 않는다 (케이크는 자리 하나에 여러 발)');
});

test('고른 구간만 다시 만든다', () => {
  const cues = make('festive', { range: { from: 20, to: 40 } });
  assert.ok(cues.length > 3);
  assert.ok(cues.every((c) => c.t >= 20 && c.t < 40));
});
