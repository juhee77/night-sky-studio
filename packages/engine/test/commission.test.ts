import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cueCost, generateCommissions, showCost, tierFor, type Commission } from '../src/commission.ts';
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

test('큰 불꽃과 촘촘한 순간에 함성, 끝에는 박수', async () => {
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
