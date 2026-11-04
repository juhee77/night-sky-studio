import assert from 'node:assert/strict';
import { test } from 'node:test';
import { flatMusicMap } from '../src/auto.ts';
import { cleanGreeting, isNewYearSeason, newYearOf, newYearShow } from '../src/newyear.ts';
import { decodeShow, encodeShow } from '../src/share.ts';
import { expandShow, type Show } from '../src/show.ts';

const base: Show = {
  version: 1, seed: 1, title: '예시', music: { id: 'basic-1', title: '밤하늘 행진', bpm: 112, offset: 0, duration: 60 },
  venue: { preset: 'river-bridge-city' },
  launchers: [
    { id: 'barge-1', kind: 'barge', pos: [-220, 0, 0] },
    { id: 'barge-2', kind: 'barge', pos: [0, 0, -80] },
    { id: 'ground', kind: 'frame', pos: [0, 0, -330] },
  ],
  cues: [],
  commission: { id: 'c1' } as Show['commission'],
};

test('새해 쇼를 권하는 때와 맞이할 해', () => {
  assert.equal(isNewYearSeason(new Date(2026, 10, 4)), true);
  assert.equal(isNewYearSeason(new Date(2027, 0, 20)), true);
  assert.equal(isNewYearSeason(new Date(2027, 5, 1)), false);
  assert.equal(newYearOf(new Date(2026, 11, 31)), 2027);
  assert.equal(newYearOf(new Date(2027, 0, 1)), 2027);
});

test('받는 사람 이름이 없으면 만들지 않고, 길면 자른다', () => {
  assert.equal(cleanGreeting('  ', '안녕'), null);
  assert.deepEqual(cleanGreeting(' 지수 ', ''), { to: '지수' });
  const g = cleanGreeting('가'.repeat(40), '나'.repeat(100))!;
  assert.equal(g.to.length, 24);
  assert.equal(g.message!.length, 60);
});

test('새해 쇼: 카운트다운, 인사, 지상 틀의 연도, 의뢰는 뗀다', () => {
  const s = newYearShow(base, flatMusicMap(60, 112), { to: '지수', message: '새해 복 많이 받아!' }, 2027, 5);
  assert.equal(s.countdown, true);
  assert.equal(s.title, '지수님께 보내는 2027 새해 불꽃');
  assert.equal(s.commission, undefined);
  assert.ok(s.cues.length > 10);
  assert.ok(s.cues.some((c) => c.at === 'ground' && c.text === '2027'));
  assert.equal(expandShow(s).warnings.length, 0);
});

test('받는 사람과 인사가 링크에 함께 간다', async () => {
  const s = newYearShow(base, flatMusicMap(60, 112), { to: '지수', message: '새해 복 많이 받아!' }, 2027, 5);
  const back = await decodeShow(await encodeShow(s));
  assert.deepEqual(back.greeting, { to: '지수', message: '새해 복 많이 받아!' });
  assert.equal(back.countdown, true);
  const plain = await decodeShow(await encodeShow(base));
  assert.equal(plain.greeting, undefined);
});
