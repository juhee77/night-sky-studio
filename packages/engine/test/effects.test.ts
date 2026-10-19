import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ALL_TYPES, SHELLS, type ShellType } from '../src/catalog.ts';
import { newCustomShell } from '../src/custom.ts';
import { decodeShow, encodeShow } from '../src/share.ts';
import type { Show } from '../src/show.ts';
import { FLAG_SPARK, Simulation } from '../src/sim.ts';
import { starSounds } from '../src/sound.ts';

const showOf = (type: ShellType): Show => ({
  version: 1, seed: 7,
  venue: { preset: 'river-bridge-city', wind: { dir: 0, speed: 0 } },
  launchers: [{ id: 'b', kind: 'barge', pos: [0, 0, 0] }],
  cues: [{ t: 5, at: 'b', type, size: 5 }],
});

/** 별(불티 제외)의 경로가 직선에서 얼마나 벗어나는지: 같은 별의 두 시각 위치와 속도로 잰다 */
function wobble(type: ShellType): number {
  const sim = new Simulation(showOf(type));
  sim.advanceTo(5.3);
  const p = sim.pool;
  const before = new Map<number, [number, number]>();
  for (let i = 0; i < p.count; i++) if (!(p.flags[i] & FLAG_SPARK) && p.size[i] === SHELLS[type].starSize) before.set(p.seed[i], [p.px[i], p.pz[i]]);
  sim.advanceTo(5.45);
  let sum = 0;
  let n = 0;
  for (let i = 0; i < p.count; i++) {
    const b = before.get(p.seed[i]);
    if (!b || p.flags[i] & FLAG_SPARK) continue;
    // 수평 속도로 예상한 자리와 실제 자리의 차이
    const ex = b[0] + p.vx[i] * 0.15;
    const ez = b[1] + p.vz[i] * 0.15;
    sum += Math.hypot(p.px[i] - ex, p.pz[i] - ez);
    n++;
  }
  return sum / Math.max(1, n);
}

test('허머·피시·낙엽 별은 곧게 날지 않고 흔들린다', () => {
  const base = wobble('peony');
  for (const t of ['hummer', 'fish', 'leaves'] as const) {
    const w = wobble(t);
    assert.ok(w > base + 0.4, `${t} 흔들림 ${w.toFixed(2)}m, 모란 ${base.toFixed(2)}m`);
  }
});

test('크래클은 별이 꺼질 무렵 작은 점이 많이 튄다', () => {
  const count = (type: ShellType, t: number) => {
    const sim = new Simulation(showOf(type));
    sim.advanceTo(t);
    let n = 0;
    for (let i = 0; i < sim.pool.count; i++) if (sim.pool.flags[i] & FLAG_SPARK && sim.pool.life[i] < 0.06) n++;
    return n;
  };
  assert.equal(count('crackle', 5.5), 0);
  assert.ok(count('crackle', 5 + 1.6 * 0.85) > 10, `${count('crackle', 5 + 1.6 * 0.85)}`);
});

test('살루트는 별 대신 아주 큰 섬광이다', () => {
  const sim = new Simulation(showOf('salute'));
  sim.advanceTo(5.02);
  const peony = new Simulation(showOf('peony'));
  peony.advanceTo(5.02);
  assert.ok(sim.skyLight[0] > peony.skyLight[0] * 2);
});

test('별 소리 신호: 효과마다 다른 소리가 나고, 내 불꽃의 별 종류로도 난다', () => {
  const launches = (type: ShellType) => new Simulation(showOf(type)).launches;
  assert.deepEqual(starSounds(launches('crackle')[0]).map((s) => s.kind), ['crackle']);
  assert.deepEqual(starSounds(launches('whistle')[0]).map((s) => s.kind), ['whistle']);
  assert.deepEqual(starSounds(launches('hummer')[0]).map((s) => s.kind), ['hummer']);
  assert.deepEqual(starSounds(launches('salute')[0]).map((s) => s.kind), ['salute']);
  assert.deepEqual(starSounds(launches('peony')[0]), []);
  const shell = newCustomShell('c', '타닥');
  shell.layers[0].star = 'crackle';
  const sim = new Simulation({ ...showOf('peony'), cues: [{ t: 5, at: 'b', type: 'custom', custom: 'c', size: 5 }], customShells: { c: shell } });
  assert.equal(starSounds(sim.launches[0])[0].kind, 'crackle');
});

test('새 불꽃은 공유 링크 번호 뒤에 붙어, 예전 링크의 번호가 바뀌지 않는다', async () => {
  assert.deepEqual(ALL_TYPES.slice(0, 13), ['chrysanthemum', 'peony', 'willow', 'palm', 'ring', 'crossette', 'heart', 'star', 'smile', 'cake', 'niagara', 'lancework', 'custom']);
  const show = showOf('brocade');
  const back = await decodeShow(await encodeShow(show));
  assert.equal(back.cues[0].type, 'brocade');
});
