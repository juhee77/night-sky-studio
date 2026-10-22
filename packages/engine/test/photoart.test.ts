import assert from 'node:assert/strict';
import { test } from 'node:test';
import { artCount, artFromLuminance, decodeArt } from '../src/art.ts';

/** 흰 바탕에 검은 원 하나 (12×12) */
const disc = () => {
  const w = 12;
  const h = 12;
  return { w, h, lum: Array.from({ length: w * h }, (_, i) => (Math.hypot((i % w) - 5.5, Math.floor(i / w) - 5.5) < 4.5 ? 0.1 : 0.95)) };
};

test('사진의 어두운 곳을 칸으로 켠다 (흰 바탕 로고)', () => {
  const { w, h, lum } = disc();
  const art = artFromLuminance(lum, w, h, 0.5, 'fill');
  const on = decodeArt(art);
  assert.ok(on[5 * w + 5], '가운데 켜짐');
  assert.ok(!on[0], '모서리 꺼짐');
  // 뒤집으면 바탕이 켜진다
  assert.equal(artCount(artFromLuminance(lum, w, h, 0.5, 'fill', true)), w * h - artCount(art));
});

test('윤곽만 고르면 덩어리 가장자리만 남아 심지가 줄어든다', () => {
  const { w, h, lum } = disc();
  const fill = artFromLuminance(lum, w, h, 0.5, 'fill');
  const edge = artFromLuminance(lum, w, h, 0.5, 'outline');
  assert.ok(artCount(edge) < artCount(fill) * 0.7 && artCount(edge) > 10, `${artCount(edge)} / ${artCount(fill)}`);
  assert.ok(!decodeArt(edge)[5 * w + 5], '속은 비었다');
});
