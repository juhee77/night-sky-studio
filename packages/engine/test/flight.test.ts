import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SIZES, SIZE_SPECS, starLifeOf, type Size } from '../src/catalog.ts';
import { apexTime, droopDrag, loweredApex, muzzleSpeed, shellHeightAt, starDiameter, starDragK, starSpeed, terminalSpeed } from '../src/flight.ts';
import { Simulation } from '../src/sim.ts';
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

/** 모란 한 발을 터뜨리고 t초 뒤 별들의 평균 거리·속도와 가장 먼 거리 */
function peonyAt(size: Size, t: number, wind = 0) {
  const burst = SIZE_SPECS[size].prefire + 0.5;
  const sim = new Simulation({
    version: 1, seed: 3, venue: { preset: 'river-bridge-city', wind: { dir: 270, speed: wind } },
    launchers: [{ id: 'b', kind: 'barge', pos: [0, 0, 0] }],
    cues: [{ t: burst, at: 'b', type: 'peony', size, colors: ['gold'] }],
  } as never);
  sim.advanceTo(burst + t);
  const p = sim.pool;
  const h = SIZE_SPECS[size].height;
  let n = 0, far = 0, speed = 0, x = 0, vy = 0;
  for (let i = 0; i < p.count; i++) {
    if (p.flags[i] & (16 | 32)) continue;
    n++;
    far = Math.max(far, Math.sqrt(p.px[i] ** 2 + (p.py[i] - h) ** 2 + p.pz[i] ** 2));
    speed += Math.sqrt(p.vx[i] ** 2 + p.vy[i] ** 2 + p.vz[i] ** 2);
    x += p.px[i];
    vy += p.vy[i];
  }
  return { n, far, speed: speed / n, x: x / n, vy: vy / n };
}

test('호수별 퍼짐 지름은 크기표에서 크게 벗어나지 않는다', () => {
  for (const s of SIZES) {
    const want = (SIZE_SPECS[s].spread / 2) * 0.95;
    const { far } = peonyAt(s, starLifeOf('peony', s) * 0.74);
    assert.ok(far > want * 0.8 && far < want * 1.25, `${s}호 ${Math.round(far)}m, 표 ${Math.round(want)}m`);
  }
});

test('별은 처음에 가장 빠르고 금방 급격히 느려진다', () => {
  const start = peonyAt(10, 0.05).speed;
  const quarter = peonyAt(10, starLifeOf('peony', 10) * 0.25).speed;
  assert.ok(start > 150, `처음 ${start}`);
  assert.ok(quarter < start * 0.4, `처음 ${start}, 1/4 지점 ${quarter}`);
});

test('별이 떨어지는 끝 속도는 크기를 따른다: 큰 별일수록 빠르다', () => {
  const v = SIZES.map((s) => terminalSpeed(starDragK(starDiameter(s))));
  for (let i = 1; i < v.length; i++) assert.ok(v[i] > v[i - 1]);
  // 논문의 10호용 별 (22mm, 1510kg/m³, Cd 0.5)
  assert.ok(Math.abs(v[3] - Math.sqrt((9.8 * 4 * 1510 * 0.022) / (3 * 1.2 * 0.5))) < 0.2);
  assert.ok(v[0] > 15 && v[3] < 35, `${v}`);
});

test('늘어짐이 클수록 저항이 작은 무거운 별이다', () => {
  assert.ok(droopDrag(1) < droopDrag(0.3));
  assert.equal(droopDrag(0.3), 1);
  assert.ok(droopDrag(0) > 1);
});

test('처음 속도는 거리에 맞춰 늘고 소리보다 빠르지 않다', () => {
  const k = starDragK(0.015);
  assert.ok(starSpeed(k, 80, 2) > starSpeed(k, 40, 2) * 2, '멀리 보내려면 두 배보다 더 빨라야 한다');
  assert.ok(starSpeed(k, 2000, 0.1) <= 340);
});

test('바람은 공기의 흐름이다: 별은 바람에 밀리고 바람보다 빨라지지 않는다', () => {
  const calm = peonyAt(5, 1.5);
  const windy = peonyAt(5, 1.5, 6);
  assert.ok(Math.abs(calm.x) < 3, `무풍 ${calm.x}`);
  // 올라가는 동안 밀린 거리(바람의 1/4)에 터진 뒤 밀린 거리를 더한 값을 넘지 않는다
  const rise = (SIZE_SPECS[5].prefire + 0.5) * 6 * 0.25;
  assert.ok(Math.abs(windy.x) > rise + 1 && Math.abs(windy.x) < rise + 6 * 1.5, `바람 ${windy.x}`);
});

test('같은 쇼는 언제나 같은 결과다', () => {
  const a = peonyAt(7, 1.5);
  const b = peonyAt(7, 1.5);
  assert.deepEqual(a, b);
});
