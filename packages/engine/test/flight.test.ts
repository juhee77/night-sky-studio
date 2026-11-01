import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SIZES, SIZE_SPECS } from '../src/catalog.ts';
import { apexTime, loweredApex, muzzleSpeed, shellHeightAt } from '../src/flight.ts';
import { soundDelay, soundFade } from '../src/sound.ts';
import { expandShow, type Launch } from '../src/show.ts';

test('호수별 상승 시간은 무게·지름과 공기 저항으로 계산한 값과 맞는다', () => {
  for (const s of SIZES) {
    const spec = SIZE_SPECS[s];
    const t = apexTime(s, spec.height);
    assert.ok(Math.abs(t - spec.prefire) < 0.35, `${s}호 계산 ${t.toFixed(2)}초, 표 ${spec.prefire}초`);
    // 저항 계수를 자료의 범위(0.4~0.8) 어디로 잡아도 표에서 1초 넘게 벗어나지 않는다
    for (const cd of [0.4, 0.8]) assert.ok(Math.abs(apexTime(s, spec.height, cd) - spec.prefire) < 1, `${s}호 Cd ${cd}`);
  }
});

test('발사 속도는 저항 없는 계산보다 크고 현실적인 범위다', () => {
  for (const s of SIZES) {
    const v = muzzleSpeed(s, SIZE_SPECS[s].height);
    assert.ok(v > Math.sqrt(2 * 9.8 * SIZE_SPECS[s].height), `${s}호 ${v}`);
    assert.ok(v > 60 && v < 200, `${s}호 ${v}`);
  }
});

test('알은 꼭대기에 정확히 닿고, 처음에 가장 빠르며, 지나면 떨어진다', () => {
  for (const s of SIZES) {
    const { height: h, prefire: T } = SIZE_SPECS[s];
    assert.equal(shellHeightAt(s, h, T, 0), 0);
    assert.ok(Math.abs(shellHeightAt(s, h, T, T) - h) < 1e-6);
    // 앞쪽 절반 시간에 절반보다 훨씬 많이 오른다
    assert.ok(shellHeightAt(s, h, T, T / 2) > h * 0.75, `${s}호 ${shellHeightAt(s, h, T, T / 2)}`);
    let last = 0;
    let lastV = Infinity;
    for (let t = 0.1; t <= T; t += 0.1) {
      const y = shellHeightAt(s, h, T, t);
      assert.ok(y - last < lastV + 1e-9, '느려지기만 한다');
      lastV = y - last;
      last = y;
    }
    assert.ok(shellHeightAt(s, h, T, T + 2) < h);
    assert.ok(shellHeightAt(s, h, T, T + 2) > h - 0.5 * 9.8 * 4 - 1e-9, '자유 낙하보다 빠르지 않다');
  }
});

test('발사약이 적으면 꼭대기에 더 일찍 닿는다', () => {
  const { height: h, prefire: T } = SIZE_SPECS[5];
  assert.equal(loweredApex(5, h, T, 1), T);
  assert.ok(loweredApex(5, h, T, 0.6) < T);
});

test('발사음은 발사통에서, 터지는 소리는 하늘에서 온다', () => {
  const { launches } = expandShow({
    version: 1, title: '', seed: 1, duration: 30,
    launchers: [{ id: 'b', kind: 'barge', label: '', pos: [0, 0, 0] }],
    cues: [{ t: 10, at: 'b', type: 'peony', size: 10, colors: ['red'] }],
  } as never);
  const l = launches[0] as Launch;
  const ear: [number, number, number] = [0, 0, -343];
  assert.ok(Math.abs(soundDelay(ear, l, true) - 1) < 1e-9);
  assert.ok(Math.abs(soundDelay(ear, l) - Math.hypot(330, 343) / 343) < 1e-9);
});

test('소리 크기는 거리에 반비례한다', () => {
  assert.equal(soundFade(0), 1);
  assert.equal(soundFade(1), 1);
  assert.equal(soundFade(3), 1 / 3);
});
