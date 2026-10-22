import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ALL_TYPES } from '../src/catalog.ts';
import { ART_PRESETS, artCount } from '../src/art.ts';
import { decodeShow, encodeShow } from '../src/share.ts';
import { expandShow, type Show } from '../src/show.ts';
import { FLAG_LANCE, Simulation } from '../src/sim.ts';
import { addDronePad, removeDronePad } from '../src/site.ts';
import { RIVER_CITY } from '../src/venues.ts';

const show = (): Show => {
  const s: Show = { version: 1, seed: 2, venue: { preset: RIVER_CITY.id }, launchers: structuredClone(RIVER_CITY.launchers), cues: [] };
  addDronePad(s);
  s.cues.push({ t: 2, at: 'drone', type: 'drones', size: 3, len: 30, art: ART_PRESETS['하트'](), colors: ['pink', 'white'] });
  return s;
};

/** 드론 불빛 수와 평균 높이 */
function lights(s: Show, t: number) {
  const sim = new Simulation(s);
  sim.advanceTo(t);
  let n = 0;
  let y = 0;
  for (let i = 0; i < sim.pool.count; i++) if (sim.pool.flags[i] & FLAG_LANCE) {
    n++;
    y += sim.pool.py[i];
  }
  return { n, y: n ? y / n : 0 };
}

test('드론이 이륙장에서 떠올라 하늘에 모양을 만들고, 머물렀다가 돌아온다', () => {
  const s = show();
  const heart = artCount(ART_PRESETS['하트']());
  const start = lights(s, 2.1);
  const hold = lights(s, 2 + 15);
  const back = lights(s, 2 + 29.9);
  assert.equal(hold.n, heart, '켜진 칸마다 드론 한 대');
  assert.ok(start.y < 20, `이륙 직후 ${start.y}`);
  assert.ok(hold.y > 150 && hold.y < 260, `모양 높이 ${hold.y}`);
  assert.ok(back.y < 30, `돌아옴 ${back.y}`);
  assert.equal(lights(s, 2 + 31).n, 0, '끝나면 꺼짐');
});

test('드론 쇼는 드론 이륙장에만 놓이고, 이륙장을 빼면 함께 빠진다', () => {
  const s = show();
  assert.equal(expandShow(s).warnings.length, 0);
  s.cues.push({ t: 5, at: 'barge-1', type: 'drones', size: 3 });
  assert.equal(expandShow(s).warnings.length, 1);
  removeDronePad(s);
  assert.ok(!s.cues.some((c) => c.at === 'drone'));
});

test('드론 쇼는 공유 링크에 담기고, 예전 링크의 번호는 그대로다', async () => {
  assert.equal(ALL_TYPES[ALL_TYPES.length - 1], 'drones');
  assert.equal(ALL_TYPES.indexOf('custom'), 12);
  const s = show();
  s.cues[0].text = '안녕';
  const back = await decodeShow(await encodeShow(s));
  assert.equal(back.launchers.find((l) => l.id === 'drone')?.kind, 'drone');
  assert.equal(back.cues[0].type, 'drones');
  assert.deepEqual(back.cues[0].art, s.cues[0].art);
});
