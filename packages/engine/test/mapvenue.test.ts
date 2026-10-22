import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bearing, buildMapVenue, geoToLocal, localToGeo, venueOf, type MapPick } from '../src/mapvenue.ts';
import { decodeShow, encodeShow } from '../src/share.ts';
import type { Show } from '../src/show.ts';
import { siteCheck } from '../src/site.ts';
import { soundDelay } from '../src/sound.ts';
import { Simulation } from '../src/sim.ts';

// 서울 여의도 근처 (가짜 장소 아님: 좌표만 쓴다)
const pick: MapPick = {
  name: '강변 시험장',
  barges: [[37.5205, 126.9300], [37.5205, 126.9330]],
  // 관람석은 발사 위치 남쪽 약 700m
  seats: [{ label: '남쪽 강가', at: [37.5142, 126.9315] }, { label: '동쪽 다리 위', at: [37.5205, 126.9450] }],
  buildings: [
    { ring: [[37.5300, 126.9300], [37.5300, 126.9310], [37.5305, 126.9310], [37.5305, 126.9300]], height: 120 },
    // 관람석 뒤쪽 건물은 보이지 않으니 뺀다
    { ring: [[37.5100, 126.9300], [37.5100, 126.9310], [37.5105, 126.9310]], height: 80 },
  ],
};

test('위도·경도와 로컬 미터는 서로 바꿀 수 있다', () => {
  const base = { lat: 37.52, lon: 126.93, heading: 35 };
  const [x, z] = geoToLocal(base, 37.523, 126.935);
  const [la, lo] = localToGeo(base, x, z);
  assert.ok(Math.abs(la - 37.523) < 1e-7 && Math.abs(lo - 126.935) < 1e-7);
  // 북쪽으로 1도 ≈ 110km
  assert.ok(Math.abs(bearing([37.5, 127], [37.6, 127])) < 0.01);
});

test('첫 관람석이 발사 위치를 정면(+z)으로 바라보게 무대를 돌리고, 실제 거리를 지킨다', () => {
  const { venue, launchers } = buildMapVenue(pick);
  assert.ok(Math.abs(venue.heading) < 3 || Math.abs(venue.heading - 360) < 3, `${venue.heading}`);
  const s = venue.seats[0];
  assert.ok(Math.abs(s.x) < 15 && s.z < -650 && s.z > -750, `${s.x}, ${s.z}`);
  // 두 바지선은 약 265m 떨어져 있다 (경도 0.003도)
  const d = Math.hypot(launchers[0].pos[0] - launchers[1].pos[0], launchers[0].pos[2] - launchers[1].pos[2]);
  assert.ok(Math.abs(d - 265) < 5, `${d}`);
  assert.equal(venue.buildings.length, 1);
  assert.equal(venue.buildings[0][3], 120);
});

test('지도 무대로 쇼를 만들면 관람석·안전거리·소리 지연이 실제 거리로 계산되고 공유 링크에 담긴다', async () => {
  const { venue, launchers } = buildMapVenue(pick);
  const show: Show = {
    version: 1, seed: 1,
    venue: { preset: 'map', map: venue },
    launchers,
    cues: [{ t: 7, at: 'barge-1', type: 'peony', size: 10 }],
  };
  const v = venueOf(show)!;
  assert.deepEqual(Object.keys(v.seats), ['front-near', 'seat-2', 'top']);
  const sim = new Simulation(show);
  const delay = soundDelay(v.seats['front-near'].eye, sim.launches[0]);
  assert.ok(delay > 1.8 && delay < 2.6, `소리 지연 ${delay}`);
  // 동쪽 다리 위 관람석은 바지선 2에서 약 1km: 10호 안전거리 밖. 하지만 바지선을 관람석 쪽으로 옮기면 경고
  assert.equal(siteCheck(show).filter((w) => w.message.includes('관람석')).length, 0);
  show.launchers[0].pos = [0, 0, v.seats['front-near'].eye[2] + 200];
  assert.ok(siteCheck(show).some((w) => w.message.includes('남쪽 강가')));
  const back = await decodeShow(await encodeShow(show));
  assert.equal(back.venue.preset, 'map');
  assert.deepEqual(back.venue.map, venue);
});

test('바지선이나 관람석이 없으면 만들지 않는다', () => {
  assert.throws(() => buildMapVenue({ ...pick, barges: [] }), /바지선/);
  assert.throws(() => buildMapVenue({ ...pick, seats: [] }), /관람석/);
});
