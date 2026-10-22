import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeShow, encodeShow } from '../src/share.ts';
import type { Show } from '../src/show.ts';
import { allowedSizeAt, inPermitZone, siteCheck } from '../src/site.ts';
import { GRAND_RIVER, MOUNTAIN_LAKE, NARROW_RIVER, SKYSCRAPER, VENUES } from '../src/venues.ts';

const showAt = (id: string): Show => ({
  version: 1, seed: 1, venue: { preset: id }, launchers: structuredClone(VENUES[id].launchers),
  cues: [{ t: 6, at: 'barge-1', type: 'peony', size: 3 }],
});

test('세계의 무대는 일곱 곳이고, 기본 발사 위치는 모두 허가 구역 안·물 위에 있다', () => {
  assert.equal(Object.keys(VENUES).length, 7);
  for (const id of Object.keys(VENUES)) {
    const s = showAt(id);
    for (const l of s.launchers.filter((x) => x.kind === 'barge')) assert.ok(inPermitZone(s, l), `${id} ${l.id}`);
    assert.ok(s.launchers.filter((x) => x.kind === 'barge').length <= VENUES[id].permit.maxBarges, id);
    assert.equal(siteCheck(s).filter((w) => w.level === 'error').length, 0, `${id}: ${siteCheck(s).map((w) => w.message)}`);
    assert.ok(VENUES[id].seats['front-near'] && VENUES[id].seats.top?.plan, id);
  }
});

test('무대마다 성격이 다르다: 좁은 강은 작은 알만, 초대형 강변은 큰 알과 긴 줄, 호수는 다리 대신 산', () => {
  const narrow = showAt(NARROW_RIVER.id);
  assert.ok((allowedSizeAt(narrow, narrow.launchers[0]) ?? 0) <= 5, '좁은 강은 관람석이 가까워 5호까지');
  const grand = showAt(GRAND_RIVER.id);
  assert.equal(allowedSizeAt(grand, grand.launchers[0]), 10);
  assert.equal(grand.launchers.filter((l) => l.kind === 'barge').length, 6);
  assert.ok(Math.max(...SKYSCRAPER.buildings.map((b) => b.height)) > 800, '하늘을 찌르는 탑');
  assert.equal(MOUNTAIN_LAKE.bridge.kind, 'none');
  assert.ok(!MOUNTAIN_LAKE.launchers.some((l) => l.kind === 'bridge'));
  assert.ok((MOUNTAIN_LAKE.mountains ?? []).length >= 2);
});

test('새 무대의 쇼도 공유 링크로 열린다', async () => {
  for (const id of [NARROW_RIVER.id, GRAND_RIVER.id, SKYSCRAPER.id, MOUNTAIN_LAKE.id]) {
    const back = await decodeShow(await encodeShow(showAt(id)));
    assert.equal(back.venue.preset, id);
    assert.deepEqual(back.launchers, VENUES[id].launchers);
  }
});
