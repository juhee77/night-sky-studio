// 처음 열었을 때 보여 주는 예시 쇼. 기본 곡 「밤하늘 행진」(112 BPM)의 박자에 맞춰 놓았다.

import type { Cue, Show } from '@nss/engine';

const BEAT = 60 / 112;
/** 곡의 3마디째부터 센 bar마디 beat박에 터지는 시각. 첫 불꽃은 약 4.3초 (5호 상승 4초 + 여유). */
const at = (bar: number, beat = 0) => Math.round((8 + bar * 4 + beat) * BEAT * 1000) / 1000;

const cues: Cue[] = [
  // 1부: 한 발씩
  { t: at(0), at: 'barge-3', type: 'chrysanthemum', size: 5, colors: ['gold'] },
  { t: at(1), at: 'barge-1', type: 'peony', size: 3, colors: ['red'] },
  { t: at(1, 2), at: 'barge-2', type: 'peony', size: 3, colors: ['blue'] },
  { t: at(2), at: 'barge-3', type: 'chrysanthemum', size: 7, colors: ['white', 'cyan'] },
  { t: at(3), at: 'barge-1', type: 'peony', size: 5, colors: ['pink'], angle: -12 },
  { t: at(3), at: 'barge-2', type: 'peony', size: 5, colors: ['pink'], angle: 12 },

  // 2부: 부채꼴과 버들
  { t: at(4), at: 'barge-3', type: 'chrysanthemum', size: 3, colors: ['gold'], fan: { count: 5, spread: 50 } },
  { t: at(4, 2), at: 'barge-3', type: 'ring', size: 5, colors: ['cyan'] },
  { t: at(4, 3), at: 'barge-2', type: 'heart', size: 5, colors: ['pink'] },
  { t: at(5), at: 'barge-1', type: 'willow', size: 7, colors: ['gold'] },
  { t: at(5, 2), at: 'barge-2', type: 'willow', size: 7, colors: ['gold'] },
  { t: at(7), at: 'barge-3', type: 'peony', size: 5, colors: ['green', 'purple'] },
  { t: at(7, 2), at: 'barge-1', type: 'chrysanthemum', size: 5, colors: ['red'] },
  { t: at(7, 3), at: 'barge-2', type: 'chrysanthemum', size: 5, colors: ['blue'] },

  // 3부: 큰 한 발
  { t: at(9), at: 'barge-3', type: 'palm', size: 10, colors: ['gold'] },
  { t: at(10), at: 'barge-1', type: 'crossette', size: 5, colors: ['white'] },
  { t: at(10), at: 'barge-2', type: 'crossette', size: 5, colors: ['white'] },
  { t: at(9, 2), at: 'barge-1', type: 'peony', size: 5, colors: ['white'] },
  { t: at(9, 2), at: 'barge-2', type: 'peony', size: 5, colors: ['white'] },
];

// 피날레: 두 마디 동안 반 박마다, 마지막에 버들 세 발로 덮는다.
const finaleColors = ['gold', 'pink', 'cyan', 'red', 'white', 'green'] as const;
const pads = ['barge-1', 'barge-3', 'barge-2'];
for (let i = 0; i < 16; i++) {
  cues.push({
    t: at(11, i * 0.5),
    at: pads[i % 3],
    type: i % 2 ? 'peony' : 'chrysanthemum',
    size: i % 4 === 3 ? 7 : 5,
    colors: [finaleColors[i % finaleColors.length]],
    angle: (i % 3 - 1) * 10,
  });
}
for (const pad of pads) {
  cues.push({ t: at(13), at: pad, type: 'willow', size: 10, colors: ['gold'] });
}

export const demoShow: Show = {
  version: 1,
  title: '예시 쇼: 밤하늘 행진',
  seed: 8231,
  music: { id: 'basic-1', title: '밤하늘 행진', bpm: 112, offset: 0, duration: 61.5 },
  venue: { preset: 'river-bridge-city', wind: { dir: 250, speed: 2.1 } },
  seat: { id: 'front-near' },
  launchers: [
    { id: 'barge-1', kind: 'barge', pos: [-220, 0, 0] },
    { id: 'barge-2', kind: 'barge', pos: [220, 0, 60] },
    { id: 'barge-3', kind: 'barge', pos: [0, 0, -80] },
  ],
  cues,
};
