import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addStars, benchNeed, benchToBuild, cutScore, firstUnfinished, idealFuseCm, idealLiftG, joinSeam, newBench, pumpScore, stirScore, type Bench } from '../src/bench.ts';
import { buildReport, evenStars, methodShare, starEffect } from '../src/build.ts';
import { evaluateMix } from '../src/chem.ts';
import { buildToShell } from '../src/build.ts';
import { newCustomShell } from '../src/custom.ts';
import { testFire } from '../src/testfire.ts';

/** 공정을 모두 마친 작업대. neat이면 고르게, 아니면 서툴게 */
function finished(neat: boolean): Bench {
  const b = newBench(5);
  b.mix.scoops = { oxidizer: 9, fuel: 4, colorant: 4, helper: 2, binder: 1 };
  b.mix.stir = neat ? 1 : 0.25;
  addStars(b, 90, neat ? 0.95 : 0.15);
  b.dryHours = neat ? 48 : 12;
  b.placed = neat ? evenStars(90) : evenStars(90).filter(([, y]) => y > -0.2);
  b.pour = neat ? { charge: 0.5, offset: 0 } : { charge: 0.9, offset: 0.7 };
  b.join = { angleDeg: neat ? 1 : 15 };
  b.paste = neat ? { layers: 6, care: 0.95 } : { layers: 2, care: 0.3 };
  b.fuseCm = neat ? idealFuseCm(5) : idealFuseCm(5) * 0.7;
  b.liftG = neat ? idealLiftG(5) : idealLiftG(5) * 0.6;
  return b;
}

test('손동작 채점: 젓기·찍기 박자·칼 곧기·이음매', () => {
  assert.equal(stirScore(8), 1);
  assert.equal(stirScore(4), 0.5);
  assert.ok(pumpScore([500, 510, 495, 505]) > 0.9);
  assert.ok(pumpScore([300, 900, 200, 1200]) < 0.3);
  assert.ok(cutScore([[0, 0], [100, 1], [200, 0]]) > 0.9);
  assert.ok(cutScore([[0, 0], [100, 40], [200, 0]]) < 0.1);
  assert.equal(joinSeam(0), 1);
  assert.equal(joinSeam(20), 0);
});

test('공정을 차례로 하지 않으면 무엇이 모자란지 알려 준다', () => {
  const b = newBench();
  assert.equal(firstUnfinished(b), 'mix');
  assert.match(benchNeed(b, 'mix')!, /숟가락/);
  b.mix.scoops = { oxidizer: 3, fuel: 1, colorant: 1, helper: 0, binder: 0 };
  assert.match(benchNeed(b, 'mix')!, /저어/);
  b.mix.stir = 0.5;
  assert.equal(firstUnfinished(b), 'stars');
  assert.equal(firstUnfinished(finished(true)), null);
});

test('덜 저으면 색이 탁하다', () => {
  const b = finished(true);
  const neat = evaluateMix(benchToBuild(b).comp!).purity;
  b.mix.stir = 0.1;
  assert.ok(evaluateMix(benchToBuild(b).comp!).purity < neat * 0.7);
});

test('손이 고를수록 시험장 결과가 좋다', () => {
  const base = newCustomShell('w', '작업대');
  const neat = testFire(buildToShell(benchToBuild(finished(true)), base), 4);
  const sloppy = testFire(buildToShell(benchToBuild(finished(false)), base), 4);
  // 서툰 알은 불발일 수도 있다. 터졌다면 고른 알보다 둥근 정도·같이 꺼짐이 나쁘다.
  assert.ok(neat.burst && neat.roundness > 70 && neat.sync > 50, JSON.stringify(neat));
  if (sloppy.burst) {
    assert.ok(sloppy.roundness < neat.roundness - 15, `${sloppy.roundness} vs ${neat.roundness}`);
    assert.ok(sloppy.sync < neat.sync, `${sloppy.sync} vs ${neat.sync}`);
    assert.ok(sloppy.lit < neat.lit, '덜 마른 별은 불이 덜 붙는다');
  }
  const b = benchToBuild(finished(true));
  assert.ok(Math.abs(b.fuse - 1) < 1e-9 && Math.abs(b.lift - 1) < 1e-9);
  assert.equal(b.stars.length, 90);
});

test('방식을 섞어 만든 별: 가장 많은 방식으로 보고, 진단은 섞인 몫을 말한다', () => {
  const b = newBench(5);
  addStars(b, 30, 0.9, 'rolled');
  addStars(b, 10, 0.9, 'cut');
  // 마지막에 자르기를 골라 두었어도 굴린 별이 많으면 굴린 별로 본다
  b.stars.method = 'cut';
  const build = benchToBuild(b);
  assert.equal(build.star?.method, 'rolled');
  assert.deepEqual(build.star?.mix, { rolled: 30, cut: 10 });
  assert.equal(methodShare(build.star!, 'cut'), 0.25);
  // 고르기는 굴린 별만 쓴 것과 자른 별만 쓴 것 사이
  const only = (m: 'rolled' | 'cut') => starEffect({ ...build.star!, method: m, mix: undefined }).care;
  const mixed = starEffect(build.star!).care;
  assert.ok(mixed < only('rolled') && mixed > only('cut'), `${only('cut')} < ${mixed} < ${only('rolled')}`);
  assert.ok(buildReport(build).warnings.some((w) => w.includes('25% 섞여')), buildReport(build).warnings.join(' / '));
  // 한 방식만 쓰면 mix가 없다
  const one = newBench(5);
  addStars(one, 20, 0.8, 'pumped');
  assert.equal(benchToBuild(one).star?.mix, undefined);
});
