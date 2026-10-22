import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ART_PRESETS, artCount, artShape, decodeArt, encodeArt } from '../src/art.ts';
import { buildToShell, defaultBuild } from '../src/build.ts';
import { generateCommissions } from '../src/commission.ts';
import { newCustomShell } from '../src/custom.ts';
import { scoreShow } from '../src/score.ts';
import { decodeShow, encodeShow } from '../src/share.ts';
import type { Show } from '../src/show.ts';
import { FLAG_LANCE, Simulation } from '../src/sim.ts';
import { RIVER_CITY } from '../src/venues.ts';

test('칸 그림은 줄여 담았다가 그대로 풀린다', () => {
  const on = Array.from({ length: 13 * 7 }, (_, i) => (i * 7) % 3 === 0);
  const art = encodeArt(13, 7, on);
  assert.deepEqual(decodeArt(art), on);
  assert.equal(artCount(art), on.filter(Boolean).length);
});

test('틀불꽃에 그림을 세우면 켜진 칸마다 심지가 탄다', async () => {
  const heart = ART_PRESETS['하트']();
  const show: Show = {
    version: 1, seed: 2, venue: { preset: RIVER_CITY.id },
    launchers: structuredClone(RIVER_CITY.launchers),
    cues: [{ t: 3, at: 'ground', type: 'lancework', size: 3, len: 8, text: '무시', art: heart }],
  };
  const sim = new Simulation(show);
  sim.advanceTo(5);
  let lances = 0;
  for (let i = 0; i < sim.pool.count; i++) if (sim.pool.flags[i] & FLAG_LANCE) lances++;
  assert.equal(lances, artCount(heart));
  // 그림 모양: 하트는 위가 넓고 아래가 뾰족하다
  const pts = artShape(heart).points;
  const top = pts.filter(([, y]) => y > 0.8).length;
  const bottom = pts.filter(([, y]) => y < 0.2).length;
  assert.ok(top >= bottom * 3, `위 ${top}, 아래 ${bottom}`);
  const back = await decodeShow(await encodeShow(show));
  assert.deepEqual(back.cues[0].art, heart);
});

test('맞춤 의뢰는 틀 그림과 공방 불꽃이 있어야 조건을 채운다', () => {
  const c = generateCommissions(7, 100, 20).find((x) => x.custom && x.rules.some((r) => r.kind === 'workshopShell'));
  assert.ok(c, '맞춤 의뢰가 게시판에 나온다');
  const shell = buildToShell(defaultBuild(), newCustomShell('mine', '은하 불꽃'));
  const show: Show = {
    version: 1, seed: 1, venue: { preset: RIVER_CITY.id }, commission: c,
    music: { id: c.music, title: 'x', bpm: 120, offset: 0, duration: 30 },
    launchers: structuredClone(RIVER_CITY.launchers),
    cues: [{ t: 6, at: 'ground', type: 'lancework', size: 3, len: 8, text: '은하 제과' }],
  };
  const rule = (k: string) => scoreShow(show, c).rules.find((r) => r.rule.kind === k)!;
  assert.equal(rule('frameArt').ok, false);
  assert.equal(rule('workshopShell').ok, false);
  show.cues[0].art = ART_PRESETS['별']();
  show.cues.push({ t: 8, at: 'barge-1', type: 'custom', custom: 'mine', size: 5 });
  show.customShells = { mine: shell };
  assert.equal(rule('frameArt').ok, true);
  assert.equal(rule('workshopShell').ok, true);
  // 빠른 설계로 만든 불꽃(공방 구조 없음)은 공방 불꽃으로 치지 않는다
  show.customShells = { mine: newCustomShell('mine', '빠른 설계') };
  assert.equal(rule('workshopShell').ok, false);
});
