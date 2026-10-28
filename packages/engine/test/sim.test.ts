import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COLOR_NAMES } from '../src/colors.ts';
import { cueLength, expandShow } from '../src/show.ts';
import { STEP, Simulation } from '../src/sim.ts';
import type { Show } from '../src/show.ts';

const show: Show = {
  version: 1,
  seed: 8231,
  venue: { preset: 'river-bridge-city', wind: { dir: 250, speed: 2.1 } },
  launchers: [
    { id: 'barge-1', kind: 'barge', pos: [-200, 0, 0] },
    { id: 'barge-2', kind: 'barge', pos: [200, 0, 40] },
    { id: 'bridge', kind: 'bridge', pos: [0, 18, 260], from: [-300, 18, 258], to: [300, 18, 258] },
    { id: 'ground', kind: 'frame', pos: [0, 0, -300] },
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

test('저장점에서 되감아도 처음부터 계산한 것과 같다', () => {
  const fresh = new Simulation(show);
  fresh.advanceTo(9.5);
  const a = new Simulation(show);
  a.advanceTo(14); // 저장점이 2초마다 생긴다
  a.advanceTo(9.5);
  assert.equal(a.stateHash(), fresh.stateHash());
});

test('쇼를 고치면 고친 곳 이후만 다시 계산하고, 결과는 새로 계산한 것과 같다', () => {
  const edited: Show = {
    ...show,
    cues: [...show.cues.slice(0, 3), { t: 9.0, at: 'barge-2', type: 'heart', size: 5, colors: ['pink'] }],
  };
  const a = new Simulation(show);
  a.advanceTo(12);
  a.setShow(edited);
  // 하트는 5초에 쏘므로 그 이전 저장점(4초)으로 돌아가 있어야 한다.
  assert.ok(a.step * STEP <= 5, `step ${a.step}`);
  a.advanceTo(12);
  const b = new Simulation(edited);
  b.advanceTo(12);
  assert.equal(a.stateHash(), b.stateHash());
});

test('새 불꽃 종류도 터지고 크로세트는 갈라진다', () => {
  const types = ['palm', 'ring', 'crossette', 'heart'] as const;
  for (const type of types) {
    const s = new Simulation({ ...show, cues: [{ t: 4, at: 'barge-1', type, size: 5 }] });
    s.advanceTo(4.5);
    assert.ok(s.pool.count > 6, `${type}: ${s.pool.count}`);
  }
  const c = new Simulation({ ...show, cues: [{ t: 4, at: 'barge-1', type: 'crossette', size: 5 }] });
  c.advanceTo(4.8);
  const before = c.pool.count;
  c.advanceTo(5.3);
  assert.ok(c.pool.count > before, '갈라진 뒤 입자가 늘어야 한다');
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

test('케이크는 정해진 간격으로 여러 발을 쏘고, 첫 발이 cue 시각에 터진다', () => {
  const cake: Show = { ...show, cues: [{ t: 5, at: 'barge-1', type: 'cake', size: 3, shots: 10, interval: 0.2, pattern: 'fan' }] };
  const { launches } = expandShow(cake);
  assert.equal(launches.length, 10);
  assert.equal(launches[0].burstAt, 5);
  assert.equal(launches[0].fireAt, 3.5); // 케이크 상승 1.5초
  assert.ok(Math.abs(launches[9].burstAt - 6.8) < 1e-9);
  assert.equal(launches[0].angle, -30);
  assert.equal(launches[9].angle, 30);
  assert.ok(Math.abs(cueLength(cake.cues[0]) - (9 * 0.2 + 1.1)) < 1e-9);
});

test('불꽃은 맞는 발사 위치에만 놓인다', () => {
  const wrong: Show = {
    ...show,
    cues: [
      { t: 5, at: 'bridge', type: 'peony', size: 5 },
      { t: 5, at: 'barge-1', type: 'niagara', size: 5 },
      { t: 5, at: 'ground', type: 'lancework', size: 5, text: 'HI' },
    ],
  };
  const { launches, warnings } = expandShow(wrong);
  assert.equal(warnings.length, 2);
  assert.equal(launches.length, 1);
  assert.equal(launches[0].type, 'lancework');
});

test('나이아가라는 정해진 시간 동안만 흘러내린다', () => {
  const s = new Simulation({ ...show, cues: [{ t: 2, at: 'bridge', type: 'niagara', size: 5, len: 3 }] });
  s.advanceTo(1.9);
  assert.equal(s.pool.count, 0);
  s.advanceTo(4);
  assert.ok(s.pool.count > 200, `불티 ${s.pool.count}`);
  s.advanceTo(9); // 꺼지고 불티도 다 떨어진 뒤
  assert.equal(s.pool.count, 0);
});

test('틀불꽃은 글자 모양의 심지에 왼쪽부터 불이 붙는다', () => {
  const s = new Simulation({ ...show, cues: [{ t: 1, at: 'ground', type: 'lancework', size: 5, text: 'HI', len: 4, colors: ['pink'] }] });
  s.advanceTo(1.05);
  const lances = s.pool.count;
  assert.ok(lances > 20, `심지 ${lances}`);
  const out = new Float32Array((s.pool.capacity + 512) * 8);
  const n = s.writeRender(out);
  let lit = 0;
  for (let i = 0; i < n; i++) if (out[i * 8 + 7] > 0) lit++;
  assert.ok(lit > 0 && lit < lances, `아직 일부만 붙어야 한다: ${lit}/${lances}`);
  s.advanceTo(8);
  assert.equal(s.pool.count, 0);
});

test('별과 웃는 얼굴 모양 불꽃도 터진다', () => {
  for (const type of ['star', 'smile'] as const) {
    const s = new Simulation({ ...show, cues: [{ t: 4, at: 'barge-1', type, size: 5 }] });
    s.advanceTo(4.5);
    assert.ok(s.pool.count > 30, `${type}: ${s.pool.count}`);
  }
});

test('정면 관람석에서 동쪽(+x)은 화면 오른쪽에 보인다', async () => {
  const { makeView, toClip } = await import('../src/camera.ts');
  const { RIVER_CITY } = await import('../src/venues.ts');
  for (const id of ['front-near', 'top'] as const) {
    const v = makeView(RIVER_CITY.seats[id], 1600, 900);
    const east = toClip(v.viewProj, [200, 100, 0]);
    const west = toClip(v.viewProj, [-200, 100, 0]);
    assert.ok(east[0] / east[3] > west[0] / west[3], `${id}: 동쪽이 오른쪽이어야 한다`);
  }
});

test('두 색 모란은 모든 별이 첫 색으로 피었다가 둘째 색으로 바뀌고, 별마다 꺼지는 때가 다르다', () => {
  const s = new Simulation({ ...show, cues: [{ t: 1, at: 'barge-1', type: 'peony', size: 5, colors: ['red', 'green'] }] });
  s.advanceTo(2);
  const stars = [...Array(s.pool.count).keys()].filter((i) => s.pool.aux[i] & 0xff);
  assert.ok(stars.length > 50, `색이 바뀌는 별 ${stars.length}`);
  const green = COLOR_NAMES.indexOf('green') + 1;
  assert.ok(stars.every((i) => (s.pool.aux[i] & 0xff) === green));
  const lives = stars.map((i) => s.pool.life[i]);
  assert.ok(Math.max(...lives) / Math.min(...lives) > 1.35);
});

test('하트 같은 모양 불꽃은 알이 굴러 아무 방향으로 선다 (늘 똑바로 관객을 보지 않는다)', () => {
  // 터진 직후 별들의 속도는 한 면 위에 있다: 두 별의 속도를 곱해(외적) 면이 보는 방향을 구한다
  const up: number[] = [];
  const facing: number[] = [];
  for (let k = 0; k < 24; k++) {
    const s = new Simulation({ ...show, seed: 100 + k, cues: [{ t: 1, at: 'barge-1', type: 'heart', size: 5 }] });
    s.advanceTo(1.02);
    const p = s.pool;
    const stars = [...Array(p.count).keys()].filter((i) => p.grav[i] > 0 && !(p.flags[i] & (16 | 32)));
    const v = (i: number) => [p.vx[i], p.vy[i], p.vz[i]];
    const a = v(stars[0]);
    const b = v(stars[Math.floor(stars.length / 4)]);
    const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const len = Math.hypot(n[0], n[1], n[2]);
    up.push(Math.abs(n[1] / len));
    facing.push(Math.abs(n[2] / len));
  }
  // 하늘을 보고 눕는 발도, 관객을 바로 보는 발도 섞여 나온다
  assert.ok(up.some((x) => x > 0.7), `누운 발 없음 ${up.map((x) => x.toFixed(2))}`);
  assert.ok(facing.some((x) => x > 0.8), '관객을 보는 발도 있다');
});
