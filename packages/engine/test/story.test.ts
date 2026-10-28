import assert from 'node:assert/strict';
import { test } from 'node:test';
import { autoChoreograph, flatMusicMap } from '../src/auto.ts';
import { FIREWORK_TYPES } from '../src/catalog.ts';
import { commissionAutoOptions } from '../src/autorules.ts';
import { generateCommissions, TIER_VENUE } from '../src/commission.ts';
import { scoreShow } from '../src/score.ts';
import type { Show } from '../src/show.ts';
import { RIVALS, STORY, contestCommission, contestRanking, storyStage } from '../src/story.ts';
import { VENUES } from '../src/venues.ts';

test('경력 이야기: 별을 모을수록 동네 축제 → 지방 축제 → 강변 대축제 → 한강 대회', () => {
  assert.deepEqual(STORY.map((s) => s.title), ['동네 축제', '지방 축제', '강변 대축제', '한강 세계불꽃축제']);
  assert.equal(storyStage(0), 0);
  assert.equal(storyStage(5), 1);
  assert.equal(storyStage(11), 1);
  assert.equal(storyStage(12), 2);
  assert.equal(storyStage(40), 3);
});

test('의뢰 등급이 오를수록 큰 무대: 등급마다 있는 무대이고, 관람석이 없으면 첫 관람석을 쓴다', () => {
  assert.deepEqual([...TIER_VENUE], ['mountain-lake', 'river-bridge-city', 'grand-river']);
  for (const id of TIER_VENUE) assert.ok(VENUES[id], id);
  for (const c of generateCommissions(42, 100, 3)) assert.equal(c.venue, TIER_VENUE[c.tier]);
});

test('한강 대회: 원효대교 나이아가라를 걸 수 있고, 자동 연출로 조건을 지키며, 순위표에 내 팀이 들어간다', () => {
  const c = contestCommission();
  const venue = VENUES[c.venue!];
  assert.equal(venue.id, 'hangang');
  assert.ok(venue.launchers.some((l) => l.kind === 'bridge'));
  const show: Show = {
    version: 1, seed: 1, venue: { preset: venue.id, wind: c.wind }, commission: c,
    music: { id: c.music, title: 'x', bpm: 120, offset: 0, duration: 70 },
    launchers: structuredClone(venue.launchers), cues: [],
  };
  const rules = commissionAutoOptions(c, show, [...FIREWORK_TYPES], []);
  show.cues = autoChoreograph(flatMusicMap(70, 120), show.launchers, { seed: 3, style: 'grand', density: 0.8, ...rules.options });
  const r = scoreShow(show, c);
  assert.ok(r.rules.every((x) => x.ok), r.rules.filter((x) => !x.ok).map((x) => x.label).join());
  const table = contestRanking(85);
  assert.equal(table.length, RIVALS.length + 1);
  assert.equal(table.findIndex((x) => x.mine), 1);
  assert.equal(contestRanking(95)[0].mine, true);
});
