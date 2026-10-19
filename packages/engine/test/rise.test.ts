import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { RiseEffect } from '../src/catalog.ts';
import { buildToShell, defaultBuild } from '../src/build.ts';
import { newCustomShell } from '../src/custom.ts';
import { decodeShow, encodeShow } from '../src/share.ts';
import { expandShow, type Show } from '../src/show.ts';
import { Simulation } from '../src/sim.ts';
import { starSounds } from '../src/sound.ts';

const showOf = (rise?: RiseEffect): Show => ({
  version: 1, seed: 9,
  venue: { preset: 'river-bridge-city', wind: { dir: 0, speed: 0 } },
  launchers: [{ id: 'b', kind: 'barge', pos: [0, 0, 0] }],
  cues: [{ t: 6, at: 'b', type: 'peony', size: 5, colors: ['red', 'green'], ...(rise ? { rise } : {}) }],
});

/** 올라가는 도중(터지기 전) 하늘에 있는 입자 */
function midRise(rise?: RiseEffect) {
  const sim = new Simulation(showOf(rise));
  const p = sim.pool;
  let count = 0;
  let bright = 0;
  let wide = 0;
  // 올라가는 동안 여러 번 들여다본다.
  for (const t of [3.6, 4.2, 4.8, 5.4]) {
    sim.advanceTo(t);
    count += p.count;
    for (let i = 0; i < p.count; i++) {
      bright += p.r[i] + p.g[i] + p.b[i];
      if (Math.hypot(p.px[i], p.pz[i]) > 8) wide++;
    }
  }
  return { count, bright, wide };
}

test('같은 알이라도 상승 효과에 따라 올라가는 모습이 달라진다', () => {
  const plain = midRise();
  const gold = midRise('gold');
  assert.ok(gold.count > plain.count * 2, `금빛 ${gold.count}, 기본 ${plain.count}`);
  assert.ok(gold.bright > plain.bright * 3);
  // 상승 꽃과 갈라지는 줄기는 올라가는 길 옆으로 퍼진다.
  assert.ok(midRise('flowers').wide > plain.wide + 10, `${midRise('flowers').wide}`);
  assert.ok(midRise('branches').wide > plain.wide + 2, `${midRise('branches').wide}`);
});

test('휘파람 내며 오르기는 쏘아 올린 때부터 터질 때까지 소리가 난다', () => {
  const l = expandShow(showOf('whistle')).launches[0];
  const s = starSounds(l).find((x) => x.kind === 'rise-whistle')!;
  assert.ok(s);
  assert.equal(l.burstAt + s.start, l.fireAt);
  assert.equal(s.len, 4);
});

test('상승 효과는 공유 링크에 남고, 공방 알에 붙인 효과는 시간표에서 따로 고르지 않아도 쓴다', async () => {
  const back = await decodeShow(await encodeShow(showOf('silver')));
  assert.equal(back.cues[0].rise, 'silver');
  const shell = buildToShell({ ...defaultBuild(), rise: 'flowers' }, newCustomShell('r', '상승 꽃'));
  const show: Show = { ...showOf(), cues: [{ t: 6, at: 'b', type: 'custom', custom: 'r', size: 5 }], customShells: { r: shell } };
  assert.equal(expandShow(show).launches[0].rise, 'flowers');
  // 시간표에서 고른 효과가 우선한다.
  show.cues[0].rise = 'gold';
  assert.equal(expandShow(show).launches[0].rise, 'gold');
});
