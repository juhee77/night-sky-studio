import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildToShell, defaultBuild } from '../src/build.ts';
import { defaultComposition, evaluateMix, isDangerous, type Composition } from '../src/chem.ts';
import { cueCost } from '../src/commission.ts';
import { newCustomShell } from '../src/custom.ts';
import { expandShow, type Show } from '../src/show.ts';
import { analyzeSmoke } from '../src/smoke.ts';

test('파랑은 너무 뜨겁게 타면 하얗게 바랜다', () => {
  const cool: Composition = { ...defaultComposition('blue'), oxidizer: 40, fuel: 12 };
  const hot: Composition = { ...defaultComposition('blue'), oxidizer: 60, fuel: 30 };
  const a = evaluateMix(cool);
  const b = evaluateMix(hot);
  assert.equal(a.color, 'blue');
  assert.ok(a.purity > b.purity + 0.15, `${a.purity} > ${b.purity}`);
  assert.ok(b.warnings.some((w) => w.includes('파랑이 하얗게')));
});

test('색 돕는 성분은 색을 선명하게 하지만 비싸다', () => {
  const plain = evaluateMix({ ...defaultComposition('red'), helper: 0 });
  const rich = evaluateMix({ ...defaultComposition('red'), helper: 15 });
  assert.ok(rich.purity > plain.purity);
  assert.ok(rich.cost > plain.cost);
});

test('두 색 성분을 섞으면 섞인 색이 나온다', () => {
  assert.equal(evaluateMix({ ...defaultComposition('red'), colorant2: 'blue', colorant2Amount: 20 }).color, 'purple');
  assert.equal(evaluateMix({ ...defaultComposition('blue'), colorant2: 'green', colorant2Amount: 20 }).color, 'cyan');
});

test('산화제가 많으면 빨리 타서 별이 짧게 살고, 지나치면 위험한 배합이다', () => {
  const base = newCustomShell('m', '배합 시험');
  const slow = buildToShell({ ...defaultBuild(), comp: { ...defaultComposition('red'), oxidizer: 30 } }, base);
  const fast = buildToShell({ ...defaultBuild(), comp: { ...defaultComposition('red'), oxidizer: 65 } }, base);
  assert.ok(slow.motion.life > fast.motion.life, `${slow.motion.life} > ${fast.motion.life}`);
  assert.equal(isDangerous({ ...defaultComposition('red'), oxidizer: 400 }), true);
  assert.equal(isDangerous(defaultComposition('red')), false);
});

test('연료와 접착제가 많은 배합은 연기가 많아 뒤 불꽃을 더 가린다', () => {
  const base = newCustomShell('s', '연기 시험');
  const smoky = buildToShell({ ...defaultBuild(), comp: { ...defaultComposition('red'), fuel: 45, binder: 15 } }, base);
  const clean = buildToShell({ ...defaultBuild(), comp: { ...defaultComposition('red'), fuel: 10, binder: 2 } }, base);
  const show = (shell: typeof smoky): Show => ({
    version: 1, seed: 1, venue: { preset: 'river-bridge-city', wind: { dir: 0, speed: 0.3 } },
    launchers: [{ id: 'barge-1', kind: 'barge', pos: [0, 0, 0] }],
    cues: Array.from({ length: 6 }, (_, i) => ({ t: 6 + i * 0.9, at: 'barge-1', type: 'custom' as const, custom: shell.id, size: 5 as const })),
    customShells: { [shell.id]: shell },
  });
  const hidden = (shell: typeof smoky) => analyzeSmoke(expandShow(show(shell)).launches, [0, 0, 0.3]).obscured.size;
  assert.ok(smoky.smoke! > clean.smoke!);
  assert.ok(hidden(smoky) >= hidden(clean), `${hidden(smoky)} >= ${hidden(clean)}`);
  // 값도 배합을 따른다
  const cost = (shell: typeof smoky) => cueCost({ t: 5, at: 'barge-1', type: 'custom', custom: shell.id, size: 5 }, { [shell.id]: shell });
  const blue = buildToShell({ ...defaultBuild(), comp: { ...defaultComposition('blue'), helper: 20 } }, base);
  assert.ok(cost(blue) > cost(clean));
});
