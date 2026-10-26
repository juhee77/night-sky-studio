import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeShow, encodeShow } from '../src/share.ts';
import { expandShow, launchKey, type Show } from '../src/show.ts';
import { Simulation } from '../src/sim.ts';
import { soundDelay } from '../src/sound.ts';

const show: Show = {
  version: 1,
  title: '지수 생일 축하 🎂',
  seed: 4242,
  music: { id: 'file:abc-123', title: '내 노래', bpm: 118.4, offset: 0.37, duration: 192.5 },
  venue: { preset: 'river-bridge-city', wind: { dir: 250, speed: 2.1 } },
  seat: { id: 'tower' },
  launchers: [
    { id: 'barge-1', kind: 'barge', pos: [-220, 0, 0] },
    { id: 'bridge', kind: 'bridge', pos: [0, 18, 258], from: [-500, 18, 258], to: [500, 18, 258] },
    { id: 'ground', kind: 'frame', pos: [0, 0, -330] },
  ],
  cues: [
    { t: 7.5, at: 'barge-1', type: 'heart', size: 5, colors: ['pink', 'white'], angle: -10 },
    { t: 4.25, at: 'barge-1', type: 'chrysanthemum', size: 5, fan: { count: 5, spread: 50 } },
    { t: 12, at: 'barge-1', type: 'cake', size: 3, shots: 30, interval: 0.12, pattern: 'zigzag', colors: ['gold'] },
    { t: 15, at: 'bridge', type: 'niagara', size: 5, len: 9, colors: ['white'] },
    { t: 16.333, at: 'ground', type: 'lancework', size: 5, text: '지수야 사랑해', len: 10, colors: ['pink'] },
  ],
};

test('링크로 줄였다가 풀면 같은 쇼가 된다', async () => {
  const code = await encodeShow(show);
  assert.match(code, /^[A-Za-z0-9_-]+$/);
  const back = await decodeShow(code);
  assert.equal(back.title, show.title);
  assert.deepEqual(back.music, show.music);
  assert.deepEqual(back.venue, show.venue);
  assert.deepEqual(back.seat, show.seat);
  assert.deepEqual(back.launchers, show.launchers);
  // 순서는 시간 순으로 바뀌어도, 펼친 발사 목록은 같아야 한다 (같은 화면).
  const keys = (s: Show) => expandShow(s).launches.map(launchKey).sort();
  assert.deepEqual(keys(back), keys(show));
  const a = new Simulation(show);
  const b = new Simulation(back);
  a.advanceTo(18);
  b.advanceTo(18);
  assert.equal(a.stateHash(), b.stateHash());
});

test('만든 사람과 원작이 링크에 함께 간다', async () => {
  const back = await decodeShow(await encodeShow({ ...show, author: '주희', remixOf: { title: '여름밤', author: '지수' } }));
  assert.equal(back.author, '주희');
  assert.deepEqual(back.remixOf, { title: '여름밤', author: '지수' });
  const waltz = await decodeShow(await encodeShow({ ...show, music: { ...show.music!, beatsPerBar: 3 } }));
  assert.equal(waltz.music?.beatsPerBar, 3);
  const plain = await decodeShow(await encodeShow(show));
  assert.equal(plain.music?.beatsPerBar, undefined);
  assert.equal(plain.author, undefined);
  assert.equal(plain.remixOf, undefined);
});

test('불꽃 300개짜리 5분 쇼도 링크가 8,000자를 넘지 않는다', async () => {
  const cues = Array.from({ length: 300 }, (_, i) => ({
    t: 5 + i * 0.97, at: 'barge-1', type: (['peony', 'chrysanthemum', 'willow'] as const)[i % 3], size: 5 as const, colors: ['gold' as const],
  }));
  const code = await encodeShow({ ...show, cues });
  assert.ok(code.length < 8000, `${code.length}자`);
});

test('잘린 링크는 알기 쉬운 오류를 낸다', async () => {
  const code = await encodeShow(show);
  await assert.rejects(decodeShow(code.slice(0, code.length / 2)), /잘렸거나 손상/);
});

test('먼 자리일수록 소리가 늦게 들린다', () => {
  const l = expandShow(show).launches.find((x) => x.type === 'chrysanthemum' && x.sub === 2)!;
  const near = soundDelay([0, 8, -650], l);
  const far = soundDelay([0, 8, -1500], l);
  assert.ok(near > 1.8 && near < 2.2, `가까운 자리 ${near.toFixed(2)}초`);
  assert.ok(far > near + 2, `먼 자리 ${far.toFixed(2)}초`);
});
