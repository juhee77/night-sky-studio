import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildReport, buildToShell, defaultBuild, evenStars, normalizeBuild, starCapacity, starEffect } from '../src/build.ts';
import { newCustomShell, normalizeShell } from '../src/custom.ts';
import { decodeShow, encodeShow } from '../src/share.ts';
import type { Show } from '../src/show.ts';
import { Simulation } from '../src/sim.ts';

const showOf = (shell: ReturnType<typeof buildToShell>): Show => ({
  version: 1, seed: 11,
  venue: { preset: 'river-bridge-city', wind: { dir: 0, speed: 3 } },
  launchers: [{ id: 'barge-1', kind: 'barge', pos: [0, 0, 0] }],
  cues: [{ t: 5, at: 'barge-1', type: 'custom', custom: shell.id, size: 5 }],
  customShells: { [shell.id]: shell },
});

const base = newCustomShell('b1', '시험 알');

test('별을 고르게 붙이면 빈 자리가 작고, 한쪽을 비우면 하늘에 구멍이 보인다', () => {
  const even = defaultBuild();
  const holed = { ...defaultBuild(), stars: evenStars(90).filter(([, y]) => y > -0.3) };
  const a = buildReport(even);
  const b = buildReport(holed);
  assert.ok(a.evenness > 80, `고른 알 ${a.evenness}`);
  assert.ok(a.largestGap < 20, `고른 알 빈 자리 ${a.largestGap}도`);
  assert.ok(b.largestGap > 40, `구멍 난 알 ${b.largestGap}도`);
  assert.ok(b.warnings.some((w) => w.includes('구멍')));
});

test('별 자리가 그대로 날아가는 방향이 된다: 아래쪽을 비우면 그 방향으로 별이 없다', () => {
  // 알이 구르기 때문에 방향은 돌아가 있지만, 빈 자리의 크기는 그대로 남는다.
  const holed = buildToShell({ ...defaultBuild(), stars: evenStars(120).filter(([, y]) => y > 0), pistil: null }, base);
  const s = new Simulation(showOf(holed));
  s.advanceTo(5.9);
  const p = s.pool;
  const c: number[] = [0, 0, 0];
  const pts: number[][] = [];
  for (let i = 0; i < p.count; i++) if (p.size[i] === 4.5) pts.push([p.px[i], p.py[i], p.pz[i]]);
  for (const q of pts) for (let k = 0; k < 3; k++) c[k] += q[k] / pts.length;
  // 반구만 채웠으니 별들의 무게중심이 터진 자리에서 한쪽으로 크게 치우친다.
  const burst = new Simulation(showOf(buildToShell({ ...defaultBuild(), pistil: null }, base)));
  burst.advanceTo(5.9);
  const q = burst.pool;
  const c2: number[] = [0, 0, 0];
  let n2 = 0;
  for (let i = 0; i < q.count; i++) if (q.size[i] === 4.5) { c2[0] += q.px[i]; c2[1] += q.py[i]; c2[2] += q.pz[i]; n2++; }
  const shift = Math.hypot(c[0] - c2[0] / n2, c[1] - c2[1] / n2, c[2] - c2[2] / n2);
  assert.ok(shift > 25, `치우침 ${shift.toFixed(1)}m`);
});

test('도화선이 길면 늦게, 짧으면 낮게 터진다', () => {
  const late = buildReport({ ...defaultBuild(), fuse: 1.3 });
  const early = buildReport({ ...defaultBuild(), fuse: 0.7 });
  assert.ok(late.timing > 1 && late.pastApex, `늦게 ${late.timing}`);
  assert.ok(early.timing < -1 && early.heightRatio < 0.95, `일찍 ${early.timing}, 높이 ${early.heightRatio}`);
  // 시뮬레이션에서도: 도화선이 짧으면 계획한 시각보다 먼저 터진다
  const sim = new Simulation(showOf(buildToShell({ ...defaultBuild(), fuse: 0.7, pistil: null }, base)));
  sim.advanceTo(4.0);
  assert.ok(sim.pool.count > 100, `일찍 터진 별 ${sim.pool.count}`);
});

test('발사약이 적으면 낮게 터진다', () => {
  const r = buildReport({ ...defaultBuild(), lift: 0.6 });
  assert.ok(r.heightRatio < 0.8, `${r.heightRatio}`);
  assert.ok(r.warnings.some((w) => w.includes('낮게')));
});

test('알 구조는 공유 링크로 보내도 그대로다', async () => {
  const shell = buildToShell(defaultBuild(7), base);
  const back = await decodeShow(await encodeShow(showOf(shell)));
  assert.deepEqual(back.customShells![shell.id].build, normalizeBuild(shell.build!));
  assert.deepEqual(normalizeShell(back.customShells![shell.id]).flight, shell.flight);
});

const mainStars = (shell: ReturnType<typeof buildToShell>) => {
  const s = new Simulation(showOf(shell));
  s.advanceTo(5.3);
  let n = 0;
  for (let i = 0; i < s.pool.count; i++) if (s.pool.size[i] === 4.5) n++;
  return n;
};

test('덜 마른 별은 일부가 불붙지 않는다', () => {
  const dry = buildToShell({ ...defaultBuild(), pistil: null, star: { method: 'pumped', sizeMm: 12, dryHours: 48 } }, base);
  const wet = buildToShell({ ...defaultBuild(), pistil: null, star: { method: 'pumped', sizeMm: 12, dryHours: 6 } }, base);
  assert.equal(dry.misfire, undefined);
  assert.ok((wet.misfire ?? 0) > 0.3, `${wet.misfire}`);
  const a = mainStars(dry);
  const b = mainStars(wet);
  assert.ok(b < a * 0.8, `마른 별 ${a}, 덜 마른 별 ${b}`);
  assert.ok(buildReport({ ...defaultBuild(), star: { method: 'pumped', sizeMm: 12, dryHours: 6 } }).warnings.some((w) => w.includes('덜 말라')));
});

test('만드는 방식이 별의 고르기를, 크기가 수명을 정한다', () => {
  const rolled = starEffect({ method: 'rolled', sizeMm: 12, dryHours: 48 });
  const cut = starEffect({ method: 'cut', sizeMm: 12, dryHours: 48 });
  assert.ok(rolled.care > cut.care + 0.4);
  assert.ok(rolled.cost > cut.cost);
  assert.ok(starEffect({ method: 'pumped', sizeMm: 20, dryHours: 48 }).life > starEffect({ method: 'pumped', sizeMm: 8, dryHours: 48 }).life);
  const shell = buildToShell({ ...defaultBuild(), star: { method: 'cut', sizeMm: 18, dryHours: 48 } }, base);
  assert.equal(shell.craft?.starSize, 'large');
  assert.ok((shell.craft?.care ?? 1) < 0.4);
});

test('층을 입힌 별은 바깥층 두께만큼 지나서 안층 색으로 바뀐다', () => {
  const shell = buildToShell({ ...defaultBuild(), star: { method: 'rolled', sizeMm: 14, dryHours: 48, inner: { color: 'green', outerShare: 0.3 } } }, base);
  assert.deepEqual(shell.layers[0].then, { color: 'green', at: 0.3 });
});

test('큰 별은 알에 덜 들어간다', () => {
  assert.ok(starCapacity(5, 8) > starCapacity(5, 18));
  const r = buildReport({ ...defaultBuild(), stars: evenStars(200), star: { method: 'pumped', sizeMm: 22, dryHours: 48 } });
  assert.ok(r.warnings.some((w) => w.includes('까지만')), r.warnings.join(','));
});

test('별 만들기는 정규화와 공유 링크를 지나도 남는다', async () => {
  const b = normalizeBuild({ ...defaultBuild(), star: { method: 'cut', sizeMm: 99, dryHours: -3, inner: { color: 'blue', outerShare: 0.5 } } });
  assert.deepEqual(b.star, { method: 'cut', sizeMm: 25, dryHours: 0, inner: { color: 'blue', outerShare: 0.5 } });
  const shell = buildToShell(b, base);
  const back = await decodeShow(await encodeShow(showOf(shell)));
  assert.equal(normalizeShell(back.customShells![shell.id]).misfire, shell.misfire);
});
