import assert from 'node:assert/strict';
import { test } from 'node:test';
import { expandShow } from '../src/show.ts';
import { STEP, Simulation } from '../src/sim.ts';
import type { Show } from '../src/show.ts';

const show: Show = {
  version: 1,
  seed: 8231,
  venue: { preset: 'river-bridge-city', wind: { dir: 250, speed: 2.1 } },
  launchers: [
    { id: 'barge-1', kind: 'barge', pos: [-200, 0, 0] },
    { id: 'barge-2', kind: 'barge', pos: [200, 0, 40] },
  ],
  cues: [
    { t: 4.5, at: 'barge-1', type: 'chrysanthemum', size: 5, colors: ['gold'] },
    { t: 5.2, at: 'barge-2', type: 'peony', size: 3, colors: ['red', 'blue'] },
    { t: 7.0, at: 'barge-1', type: 'willow', size: 7 },
    { t: 9.0, at: 'barge-2', type: 'chrysanthemum', size: 3, fan: { count: 5, spread: 40 } },
  ],
};

test('터지는 시각에서 상승 시간을 빼서 발사 시각을 정한다', () => {
  const { launches } = expandShow(show);
  const chrys = launches.find((l) => l.cueIndex === 0)!;
  assert.equal(chrys.burstAt, 4.5);
  assert.equal(chrys.fireAt, 0.5); // 5호 상승 4초
});

test('쇼 시작 전에 쏴야 하는 불꽃은 경고한다', () => {
  const early: Show = { ...show, cues: [{ t: 2, at: 'barge-1', type: 'peony', size: 10 }] };
  const { warnings } = expandShow(early);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0].message, /4\.00초 앞섭니다/);
});

test('부채꼴 묶음은 각도를 고르게 펼친다', () => {
  const fan = expandShow(show).launches.filter((l) => l.cueIndex === 3).map((l) => l.angle);
  assert.deepEqual(fan, [-20, -10, 0, 10, 20]);
});

test('같은 시각까지 계산하면 나눠서 계산해도 결과가 같다', () => {
  const a = new Simulation(show);
  a.advanceTo(12);

  const b = new Simulation(show);
  let t = 0;
  let i = 0;
  while (t < 12) {
    t = Math.min(12, t + [1 / 60, 1 / 144, 0.05, 1 / 30][i++ % 4]);
    b.advanceTo(t);
  }
  assert.equal(a.step, b.step);
  assert.ok(a.pool.count > 1000, `입자가 너무 적다: ${a.pool.count}`);
  assert.equal(a.stateHash(), b.stateHash());
});

test('뒤로 감았다가 다시 와도 같은 화면이 나온다', () => {
  const a = new Simulation(show);
  a.advanceTo(10);
  const before = a.stateHash();
  a.advanceTo(3);
  a.advanceTo(10);
  assert.equal(a.stateHash(), before);
});

test('다른 cue를 지워도 남은 불꽃의 모양은 그대로다', () => {
  const a = new Simulation(show);
  const b = new Simulation({ ...show, cues: show.cues.filter((_, i) => i !== 3) });
  // 지운 부채꼴(9초, 3호)이 쏘아지기 직전. 국화와 모란은 이미 터졌고 버들은 올라가는 중이다.
  const t = 9 - 3 - STEP * 2;
  a.advanceTo(t);
  b.advanceTo(t);
  assert.equal(a.stateHash(), b.stateHash());
});
