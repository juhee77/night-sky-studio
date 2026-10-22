import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateCommissions, type Commission } from '../src/commission.ts';
import { newCustomShell, type CustomShell } from '../src/custom.ts';
import { scoreShow } from '../src/score.ts';
import type { Show } from '../src/show.ts';
import { RIVER_CITY } from '../src/venues.ts';

const all = (): Commission[] => {
  const seen = new Map<string, Commission>();
  for (let seed = 1; seed < 400 && seen.size < 20; seed++) for (const c of generateCommissions(seed, 100, 6)) seen.set(c.title, c);
  return [...seen.values()];
};

const showFor = (c: Commission, shells: Record<string, CustomShell>, cues: Show['cues']): Show => ({
  version: 1, seed: 1, venue: { preset: RIVER_CITY.id }, commission: c,
  music: { id: c.music, title: 'x', bpm: 108, offset: 0, duration: 60 },
  launchers: structuredClone(RIVER_CITY.launchers), cues, customShells: shells,
});

test('새 곡을 쓰는 의뢰가 게시판에 나온다', () => {
  const titles = all().map((c) => `${c.title}:${c.music}`);
  assert.ok(titles.includes('호숫가 별빛 결혼식:basic-4'), titles.join(', '));
  assert.ok(titles.includes('여름밤 대축제:basic-5'));
  assert.ok(titles.some((t) => t.startsWith('불꽃 장인 경연')));
});

test('긴 버들로 마무리: 마지막 구간에 카무로 내 불꽃이 있어야 한다', () => {
  const c = all().find((x) => x.title === '호숫가 별빛 결혼식')!;
  const willow = newCustomShell('k', '금빛 커튼');
  willow.layers[0].star = 'willow';
  const rule = (s: Show) => scoreShow(s, c).rules.find((r) => r.rule.kind === 'kamuroFinish')!;
  const s = showFor(c, { k: willow }, [{ t: 55, at: 'barge-1', type: 'custom', custom: 'k', size: 5 }]);
  assert.equal(rule(s).ok, false, '보통 버들은 아니다');
  willow.layers[0].tail = 'long';
  assert.equal(rule(s).ok, true, '꼬리를 길게 늘인 버들');
  willow.layers[0] = { ...willow.layers[0], star: 'kamuro', tail: undefined };
  assert.equal(rule(s).ok, true, '카무로');
  s.cues[0].t = 20;
  assert.equal(rule(s).ok, false, '마지막 구간이 아니면 안 된다');
});

test('장인 경연: 바깥 층이 차례로 터지는 내 불꽃이 있어야 한다', () => {
  const c = all().find((x) => x.title === '불꽃 장인 경연')!;
  const pop = newCustomShell('p', '차례로');
  const s = showFor(c, { p: pop }, [{ t: 10, at: 'barge-1', type: 'custom', custom: 'p', size: 5 }]);
  const rule = () => scoreShow(s, c).rules.find((r) => r.rule.kind === 'outerPop')!;
  assert.equal(rule().ok, false);
  pop.layers[0].sequence = { order: 'down', span: 1.4, mode: 'pop' };
  assert.equal(rule().ok, true);
});
