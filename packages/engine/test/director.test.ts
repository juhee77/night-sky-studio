import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planShots, shotCamera } from '../src/director.ts';
import { expandShow, type Launcher, type Show } from '../src/show.ts';
import { VENUES } from '../src/venues.ts';

const launchers: Launcher[] = [
  { id: 'barge-1', kind: 'barge', pos: [-220, 0, 0] },
  { id: 'barge-2', kind: 'barge', pos: [0, 0, -80] },
  { id: 'barge-3', kind: 'barge', pos: [220, 0, 60] },
];
// 한 발씩 이어지다 30초에 모든 바지선에서 큰 한 방
const cues: Show['cues'] = [
  ...Array.from({ length: 50 }, (_, k) => ({ t: 5 + k, at: launchers[k % 3].id, type: 'peony' as const, size: 3 as const, colors: ['gold' as const] })),
  ...launchers.map((l) => ({ t: 30, at: l.id, type: 'chrysanthemum' as const, size: 10 as const, colors: ['white' as const] })),
];
const show: Show = { version: 1, seed: 42, venue: { preset: 'river-bridge-city' }, launchers, cues };
const seats = Object.values(VENUES['river-bridge-city'].seats);
const plan = (seed: number) => planShots(expandShow(show).launches, seats, 60, seed, [0, 170, 0]);

test('연출 카메라: 같은 쇼는 같은 길, 곡 전체를 빈틈없이 덮는다', () => {
  const a = plan(42);
  assert.deepEqual(plan(42), a);
  assert.notDeepEqual(plan(7), a);
  assert.equal(a[0].start, 0);
  for (let i = 1; i < a.length; i++) assert.ok(Math.abs(a[i].start - a[i - 1].end) < 1e-9);
  assert.ok(a[a.length - 1].end >= 60);
  // 평면도(위에서 보기) 자리는 쓰지 않는다
  for (const s of a) assert.ok(s.from.eye[1] < 400);
});

test('연출 카메라: 큰 한 방 1초 전에 다가가는 샷, 피날레는 넓게 잡고 다가간다', () => {
  const a = plan(42);
  const close = a.find((s) => s.kind === 'close');
  assert.ok(close, a.map((s) => s.kind).join());
  assert.ok(Math.abs(close!.start - 29) < 1e-9, `${close!.start}`);
  const fin = a[a.length - 1];
  assert.equal(fin.kind, 'finale');
  const d = (cam: { eye: number[] }) => Math.hypot(cam.eye[0], cam.eye[2]);
  assert.ok(d(fin.to) < d(fin.from));
});

test('연출 카메라: 샷 안에서는 천천히 움직이고, 바뀔 때만 끊어 넘어간다', () => {
  const a = plan(42);
  const starts = a.map((s) => s.start);
  let prev = shotCamera(a, 0)!;
  for (let t = 0.05; t < 60; t += 0.05) {
    const cam = shotCamera(a, t)!;
    const jump = Math.hypot(cam.eye[0] - prev.eye[0], cam.eye[1] - prev.eye[1], cam.eye[2] - prev.eye[2]);
    const cut = starts.some((s) => s > t - 0.05 && s <= t);
    if (!cut) assert.ok(jump < 15, `t=${t.toFixed(2)} ${jump.toFixed(1)}m`);
    prev = cam;
  }
});
