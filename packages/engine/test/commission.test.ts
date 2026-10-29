import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cueCost, generateCommissions, isoWeekKey, showCost, tierFor, weeklyChallenge, type Commission } from '../src/commission.ts';
import { scoreShow } from '../src/score.ts';
import { expandShow, type Cue, type Show } from '../src/show.ts';
import { analyzeSmoke } from '../src/smoke.ts';

const BEAT = 60 / 84;
const commission: Commission = {
  id: 'test-0', tier: 0, title: '강변 프러포즈', client: '민준 씨', quote: '',
  music: 'basic-2', budget: 130, reward: 100,
  wind: { dir: 250, speed: 3 }, seat: 'front-near',
  taste: { colors: ['pink', 'white'], style: 'calm' },
  rules: [{ kind: 'include', type: 'heart' }, { kind: 'endColors', seconds: 10, colors: ['gold'] }, { kind: 'maxSize', size: 5 }],
};

function base(cues: Cue[], wind = 3): Show {
  return {
    version: 1, seed: 1,
    music: { id: 'basic-2', title: '느린 강물', bpm: 84, offset: 0, duration: 58.6 },
    venue: { preset: 'river-bridge-city', wind: { dir: 250, speed: wind } },
    launchers: [
      { id: 'barge-1', kind: 'barge', pos: [-220, 0, 0] },
      { id: 'barge-2', kind: 'barge', pos: [0, 0, -80] },
      { id: 'barge-3', kind: 'barge', pos: [220, 0, 60] },
    ],
    cues,
  };
}

/** 박자에 맞춰 고르게 놓은, 조건을 지킨 쇼 */
function goodShow(): Show {
  const cues: Cue[] = [];
  const pads = ['barge-1', 'barge-2', 'barge-3'];
  for (let b = 8, i = 0; b * BEAT < 47; b += 2, i++) {
    cues.push({ t: Math.round(b * BEAT * 1000) / 1000, at: pads[i % 3], type: (['peony', 'willow', 'heart', 'chrysanthemum'] as const)[i % 4], size: 5, colors: [(['pink', 'white'] as const)[i % 2]] });
  }
  for (let b = 66, i = 0; b * BEAT < 57; b += 1, i++) {
    cues.push({ t: Math.round(b * BEAT * 1000) / 1000, at: pads[i % 3], type: 'willow', size: i % 3 ? 3 : 5, colors: ['gold'] });
  }
  return base(cues);
}

test('값: 크기별 원가, 부채꼴은 발 수만큼, 케이크는 발 수에 비례', () => {
  assert.equal(cueCost({ t: 0, at: 'a', type: 'peony', size: 7 }), 8);
  assert.equal(cueCost({ t: 0, at: 'a', type: 'peony', size: 3, fan: { count: 5, spread: 40 } }), 5);
  assert.equal(cueCost({ t: 0, at: 'a', type: 'cake', size: 3, shots: 24 }), 6);
  assert.equal(showCost(base([{ t: 5, at: 'barge-1', type: 'peony', size: 10 }, { t: 6, at: 'barge-1', type: 'peony', size: 5 }])), 23);
});

test('의뢰서는 시드가 같으면 같고, 평판이 오르면 큰 의뢰가 나온다', () => {
  assert.deepEqual(generateCommissions(7, 0), generateCommissions(7, 0));
  assert.ok(generateCommissions(7, 0).every((c) => c.tier === 0));
  assert.equal(tierFor(25), 1);
  const high = Array.from({ length: 10 }, (_, i) => generateCommissions(i, 80)).flat();
  assert.ok(high.some((c) => c.tier === 2));
});

test('조건을 지키고 박자에 맞춘 쇼는 별 두 개 이상을 받는다', () => {
  const r = scoreShow(goodShow(), commission);
  assert.equal(r.failed, false, r.failReason ?? "");
  assert.ok(r.rules.every((x) => x.ok), JSON.stringify(r.rules));
  assert.ok(r.items.find((i) => i.key === 'beat')!.score > 95);
  assert.ok(r.stars >= 2, `총점 ${r.total}: ${r.items.map((i) => `${i.label} ${Math.round(i.score)}`).join(', ')}`);
  assert.ok(r.reward > 0 && r.reputation > 0);
});

test('조건을 둘 이상 어기면 의뢰 실패', () => {
  const show = goodShow();
  show.cues = show.cues.filter((c) => c.type !== 'heart').map((c) => ({ ...c, size: 7 as const }));
  const r = scoreShow(show, { ...commission, budget: 9999 });
  assert.equal(r.failed, true);
  assert.match(r.failReason!, /조건을 \d개/);
  assert.equal(r.reward, 0);
  assert.ok(r.reputation < 0);
});

test('예산을 10% 넘게 쓰면 의뢰 실패', () => {
  const r = scoreShow(goodShow(), { ...commission, budget: 20 });
  assert.equal(r.failed, true);
  assert.match(r.failReason!, /예산/);
});

test('빈 하늘이 길면 그 구간을 알려 준다', () => {
  const fill: Cue[] = Array.from({ length: 14 }, (_, i) => ({ t: 30 + i * 2, at: 'barge-1', type: 'peony' as const, size: 5 as const }));
  const show = base([{ t: 5, at: 'barge-1', type: 'peony', size: 5 }, ...fill]);
  const gaps = scoreShow(show, commission).items.find((i) => i.key === 'gaps')!;
  assert.ok(gaps.score < 50);
  assert.match(gaps.comment, /0:0\d~0:30/);
});

test('바람이 없는 날 같은 자리에서 연달아 쏘면 연기에 가린다', () => {
  const cues: Cue[] = Array.from({ length: 8 }, (_, i) => ({ t: 6 + i * 0.8, at: 'barge-1', type: 'peony' as const, size: 5 as const }));
  const calm = expandShow(base(cues, 0.2)).launches;
  const windy = expandShow(base(cues, 5)).launches;
  const hiddenCalm = analyzeSmoke(calm, [0, 0, 0.2]).obscured.size;
  const hiddenWindy = analyzeSmoke(windy, [5, 0, 0]).obscured.size;
  assert.ok(hiddenCalm >= 5, `잔잔한 날 ${hiddenCalm}`);
  assert.ok(hiddenWindy < hiddenCalm, `바람 부는 날 ${hiddenWindy}`);
});

test('구름보다 높이 터지는 불꽃은 점수에서 깎인다', () => {
  const show = base([{ t: 8, at: 'barge-1', type: 'peony', size: 10 }, { t: 12, at: 'barge-2', type: 'peony', size: 10 }]);
  const clear = scoreShow(show, commission).items.find((i) => i.key === 'smoke')!;
  const cloudy = scoreShow({ ...show, venue: { ...show.venue, cloud: 250 } }, commission).items.find((i) => i.key === 'smoke')!;
  assert.ok(cloudy.score < clear.score);
  assert.match(cloudy.comment, /구름\(250m\)/);
});

test('큰 불꽃과 촘촘한 순간에 함성, 홀로 큰 불꽃엔 「오~」, 피날레에 환호, 끝에는 박수', async () => {
  const { audienceCues } = await import('../src/audience.ts');
  const quiet = expandShow(base([{ t: 5, at: 'barge-1', type: 'peony', size: 3 }, { t: 9, at: 'barge-1', type: 'peony', size: 3 }])).launches;
  assert.deepEqual(audienceCues(quiet).map((c) => c.kind), ['applause']);
  const big = expandShow(base([
    { t: 10, at: 'barge-1', type: 'chrysanthemum', size: 10 },
    { t: 20, at: 'barge-1', type: 'peony', size: 5, fan: { count: 5, spread: 40 } },
  ])).launches;
  const cues = audienceCues(big);
  assert.deepEqual(cues.map((c) => c.kind), ['cheer', 'cheer', 'applause']);
  assert.ok(Math.abs(cues[0].t - 10.35) < 1e-9);
  // 홀로 크게 피는 7호에는 「오~」, 길게 이어진 쇼의 피날레가 시작되면 큰 환호
  const long = expandShow(base([
    { t: 6, at: 'barge-1', type: 'peony', size: 7 },
    { t: 15, at: 'barge-1', type: 'peony', size: 3 },
    { t: 30, at: 'barge-1', type: 'peony', size: 3 },
    { t: 40, at: 'barge-1', type: 'peony', size: 3 },
  ])).launches;
  const lc = audienceCues(long);
  assert.deepEqual(lc.map((c) => c.kind), ['ooh', 'cheer', 'applause']);
  assert.ok(lc[1].t > lc[0].t);
});

test('불꽃 몇 발만 놓고 곡 대부분을 비우면 별을 받지 못한다', () => {
  const show = base([
    { t: 8, at: 'barge-1', type: 'heart', size: 5, colors: ['pink'] },
    { t: 12, at: 'barge-2', type: 'peony', size: 5, colors: ['white'] },
    { t: 16, at: 'barge-3', type: 'peony', size: 5, colors: ['pink'] },
  ]);
  const r = scoreShow(show, commission);
  assert.equal(r.failed, false);
  assert.ok(r.coverage < 0.3, `coverage ${r.coverage}`);
  assert.equal(r.stars, 0, `총점 ${r.total}`);
});

test('이번 주 도전: 주차 이름과, 같은 주는 같은 도전', () => {
  assert.equal(isoWeekKey(new Date(2026, 9, 26)), '2026-W44');
  assert.equal(isoWeekKey(new Date(2026, 10, 1)), '2026-W44'); // 일요일까지 같은 주
  assert.equal(isoWeekKey(new Date(2027, 0, 1)), '2026-W53'); // 금요일: 지난해 마지막 주
  assert.equal(isoWeekKey(new Date(2026, 0, 1)), '2026-W01'); // 목요일
  const a = weeklyChallenge('2026-W44');
  assert.deepEqual(weeklyChallenge('2026-W44'), a);
  assert.equal(a.challenge, '2026-W44');
  // 여러 주를 돌려 봐도 장비·공방이 필요한 조건은 없고, 주마다 바뀐다
  const weeks = Array.from({ length: 20 }, (_, i) => weeklyChallenge(`2026-W${String(i + 1).padStart(2, '0')}`));
  for (const c of weeks) {
    assert.ok(c.rules.length >= 1);
    assert.ok(!c.rules.some((r) => ['live', 'workshopShell', 'frameArt', 'outerPop', 'kamuroFinish'].includes(r.kind)), c.title);
  }
  assert.ok(new Set(weeks.map((c) => `${c.title}|${c.budget}|${JSON.stringify(c.rules)}`)).size > 10);
});

test('재생 중 판정은 점수표와 같은 기준: 박자 딱이면 완벽, 연기·구름에 가리면 그 글자, 열기는 오르고 식는다', async () => {
  const { crowdTrack, crowdAt } = await import('../src/audience.ts');
  const beat = 60 / 84;
  // 박에 맞은 7호, 박에서 0.3초 어긋난 7호, 바람 없는 날 같은 자리 연달아 (연기에 가림), 구름 위 10호
  const show = base([
    { t: beat * 8, at: 'barge-1', type: 'peony', size: 7 },
    { t: beat * 16 + 0.3, at: 'barge-2', type: 'peony', size: 7 },
    ...Array.from({ length: 6 }, (_, k) => ({ t: beat * (24 + k), at: 'barge-3', type: 'chrysanthemum' as const, size: 5 as const })),
    { t: beat * 40, at: 'barge-1', type: 'peony', size: 10 },
  ], 0);
  show.venue.cloud = 250;
  const { launches } = expandShow(show);
  const track = crowdTrack(show, launches);
  const kinds = (from: number, to: number) => track.marks.filter((m) => m.t >= from && m.t < to).map((m) => m.kind);
  assert.deepEqual(kinds(0, beat * 9), ['perfect']);
  assert.deepEqual(kinds(beat * 15, beat * 17), []);
  const hidden = kinds(beat * 23, beat * 31).filter((k) => k === 'smoke').length;
  const score = scoreShow(show, generateCommissions(1, 0, 3)[0]).items.find((i) => i.key === 'smoke')!;
  assert.ok(hidden > 0 && score.comment.includes(`연기에 가린 불꽃 ${hidden}발`), `${hidden} / ${score.comment}`);
  assert.ok(kinds(beat * 39, beat * 41).includes('cloud'));
  // 열기: 연달아 쏜 뒤가 가장 뜨겁고, 한참 지나면 식는다
  const hot = crowdAt(track, beat * 30).heat;
  assert.ok(hot > crowdAt(track, beat * 9).heat && hot > crowdAt(track, beat * 38).heat * 1.5);
});

test('성적표: 등급은 점수대로, 아쉬운 순간은 빈 하늘 → 가림 → 박자 순서로 고른다', async () => {
  const { gradeOf, showMoments } = await import('../src/score.ts');
  assert.equal(gradeOf({ total: 95, failed: false }), 'S');
  assert.equal(gradeOf({ total: 86, failed: false }), 'A');
  assert.equal(gradeOf({ total: 60, failed: false }), 'C');
  assert.equal(gradeOf({ total: 95, failed: true }), 'F');
  const beat = 60 / 84;
  const cues = (from: number, to: number) => Array.from({ length: to - from }, (_, k) => ({ t: beat * (from + k * 2), at: k % 2 ? 'barge-1' : 'barge-3', type: 'peony' as const, size: 5 as const }));
  // 20초 비운 쇼: 그 빈 곳이 아쉬운 순간
  const gappy = showMoments(base([...cues(8, 14), ...cues(50, 60)]));
  assert.match(gappy.worst!.text, /하늘이 비었어요/);
  assert.ok(gappy.best && gappy.best.t >= 0);
  // 고르게 채웠지만 하나가 박에서 크게 어긋난 쇼
  const off = showMoments(base([...cues(8, 50), { t: beat * 30 + beat / 2, at: 'barge-2', type: 'ring', size: 5 }]));
  assert.match(off.worst!.text, /박자에서 어긋났어요/);
});
