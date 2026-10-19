import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildToShell, defaultBuild, evenStars } from '../src/build.ts';
import { newCustomShell } from '../src/custom.ts';
import { diagnose, testFire } from '../src/testfire.ts';
import { Simulation } from '../src/sim.ts';

const base = newCustomShell('t1', '시험 알');
const shell = (b: Partial<ReturnType<typeof defaultBuild>>) => buildToShell({ ...defaultBuild(), pistil: null, ...b }, base);

test('잘 만든 알은 둥글고 결함이 없다', () => {
  const s = shell({});
  const r = testFire(s, 3);
  assert.ok(r.burst);
  assert.ok(r.roundness > 80, `둥근 정도 ${r.roundness}`);
  assert.ok(r.flatness < 30, `납작함 ${r.flatness}`);
  assert.ok(r.holeDeg < 30, `빈 자리 ${r.holeDeg}`);
  assert.ok(r.height > 150, `높이 ${r.height}`);
  assert.deepEqual(diagnose(s, r), []);
});

test('결함마다 원인과 고치는 방법이 한 줄씩 나온다', () => {
  const cases = [
    shell({ stars: evenStars(120).filter(([, y]) => y > -0.2) }),
    shell({ assembly: { chargeOffset: 1, seam: 1, paste: 1 } }),
    shell({ star: { method: 'cut', sizeMm: 12, dryHours: 0 } }),
  ];
  const titles = cases.map((s) => {
    const d = diagnose(s, testFire(s, 3));
    assert.ok(d.length > 0);
    for (const x of d) assert.ok(x.cause.length > 0 && x.fix.length > 0 && !x.cause.includes('\n'));
    return d.map((x) => x.title).join(',');
  });
  assert.match(titles[0], /구멍/);
  assert.match(titles[1], /찌그러짐/);
  assert.match(titles[2], /불붙지 않음/);
  assert.match(titles[2], /제각각/);
});

test('형상 불꽃은 납작해서 옆에서 보면 선이라고 알려 준다', () => {
  const heart = { ...base, id: 'h', layers: [{ role: 'outer' as const, shape: { kind: 'ring' as const, count: 60 }, star: 'dot' as const, color: 'red' as const, scale: 1, delay: 0 }] };
  const r = testFire(heart, 2);
  assert.ok(r.flatness > 60, `납작함 ${r.flatness}`);
  assert.ok(diagnose(heart, r).some((d) => d.title.includes('선')));
});

test('불발한 알은 원인을 짚는다', () => {
  const s = { ...shell({ assembly: { chargeOffset: 0, seam: 0.2, paste: 0.9 } }), dud: 0.5 };
  let rec = testFire(s, 1);
  let seed = 1;
  while (rec.burst && seed < 40) rec = testFire(s, ++seed);
  assert.equal(rec.burst, false);
  assert.match(diagnose(s, rec)[0].cause, /이음매/);
});

test('원통 알을 여러 칸으로 나누면 차례로 아래에서 다시 핀다', () => {
  const one = shell({ form: 'cylinder' });
  const three = shell({ form: 'cylinder', breaks: 3 });
  assert.equal(three.chain, 3);
  const at = (s: typeof one, t: number) => {
    const sim = new Simulation({
      version: 1, seed: 4, venue: { preset: 'river-bridge-city', wind: { dir: 0, speed: 0 } },
      launchers: [{ id: 'b', kind: 'barge', pos: [0, 0, 0] }],
      cues: [{ t: 5, at: 'b', type: 'custom', custom: s.id, size: 5 }], customShells: { [s.id]: s },
    });
    sim.advanceTo(t);
    let n = 0;
    for (let i = 0; i < sim.pool.count; i++) if (sim.pool.size[i] === 4.5 && sim.pool.age[i] >= 0) n++;
    return n;
  };
  // 처음엔 한 칸 몫만 보이고, 시간이 지나면 나머지 칸이 핀다.
  assert.ok(at(three, 5.1) < at(one, 5.1) * 0.5);
  assert.ok(at(three, 6.0) > at(three, 5.1) * 2);
});

test('심 별이 있어도 바깥 별의 구멍을 찾아낸다', () => {
  const s = buildToShell({ ...defaultBuild(), stars: evenStars(90).filter(([, y]) => y > -0.35) }, base);
  const r = testFire(s, 3);
  assert.ok(r.holeDeg > 30, `빈 자리 ${r.holeDeg}`);
});
