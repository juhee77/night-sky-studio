// 연출 카메라: 쇼를 보고 카메라 길을 미리 짜 둔다. 같은 쇼면 언제 봐도 같은 길이다 (쇼 시드로 정한다).
// 평소에는 7~11초마다 관람석을 바꿔 가며 천천히 다가가거나 옆으로 흐르고,
// 큰 한 방이 오기 1초 전에는 그쪽으로 다가가며, 피날레는 가까운 자리에서 넓게 잡았다가 천천히 다가간다.

import type { Camera } from './camera.ts';
import { mulberry32 } from './rng.ts';
import type { Launch, Vec3 } from './show.ts';
import type { Seat } from './venues.ts';

export interface Shot {
  start: number;
  end: number;
  from: Camera;
  to: Camera;
  kind: 'drift' | 'push' | 'close' | 'finale';
}

const lerp3 = (a: Vec3, b: Vec3, k: number): Vec3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const ease = (k: number) => k * k * (3 - 2 * k);

/** 초마다 얼마나 크게 터지는지 (알 크기를 더한 값) */
function intensity(launches: Launch[], duration: number): number[] {
  const per = new Array(Math.max(1, Math.ceil(duration))).fill(0);
  for (const l of launches) {
    const i = Math.floor(l.burstAt);
    if (i >= 0 && i < per.length) per[i] += l.type === 'cake' ? 1 : l.size;
  }
  return per;
}

/**
 * seats: 땅 위 관람석들 (평면도 제외). center: 불꽃이 터지는 가운데 (바지선들 가운데 높이 170m쯤).
 */
export function planShots(launches: Launch[], seats: Seat[], duration: number, seed: number, center: Vec3): Shot[] {
  const ground = seats.filter((s) => !s.plan);
  if (!ground.length || duration <= 0) return [];
  const rnd = mulberry32(seed ^ 0x5eed);
  const per = intensity(launches, duration);
  const mean = per.reduce((a, b) => a + b, 0) / per.length || 1;
  // 큰 한 방: 평소의 세 배 넘게 몰린 1초 (서로 6초 넘게 떨어진 것만)
  const peaks: number[] = [];
  per.forEach((v, i) => {
    if (v > mean * 3 && v >= (per[i - 1] ?? 0) && v >= (per[i + 1] ?? 0) && peaks.every((p) => i - p > 6)) peaks.push(i);
  });
  const finale = duration * 0.85;
  // 피날레: 가장 가까운 관람석에서 조금 물러나 넓게 잡았다가 다가간다 (먼 자리에서는 불꽃이 작아 보인다).
  const dist = (s: Seat) => Math.hypot(s.eye[0] - center[0], s.eye[2] - center[2]);
  const nearest = [...ground].sort((a, b) => dist(a) - dist(b))[0];

  const shots: Shot[] = [];
  let t = 0;
  let last = -1;
  const pickSeat = () => {
    let k = Math.floor(rnd() * ground.length);
    if (ground.length > 1 && k === last) k = (k + 1) % ground.length;
    last = k;
    return ground[k];
  };
  const toward = (s: Seat, k: number): Camera => {
    const target: Vec3 = [center[0] * 0.5 + s.target[0] * 0.5, s.target[1], center[2] * 0.5 + s.target[2] * 0.5];
    const eye = lerp3(s.eye, [center[0], s.eye[1], center[2]], k);
    // 다가가도 땅에 붙지 않게, 가까워질수록 조금 위로
    eye[1] = Math.max(s.eye[1], s.eye[1] + 40 * k);
    return { eye, target, fovY: s.fovY };
  };
  while (t < duration) {
    if (t >= finale - 0.5) {
      shots.push({ start: t, end: duration + 5, kind: 'finale', from: toward(nearest, -0.3), to: toward(nearest, 0.2) });
      break;
    }
    const nextPeak = peaks.find((p) => p - 1 > t + 2);
    let len = 7 + rnd() * 4;
    // 큰 한 방 1초 전에 끊어 다가가는 샷을 시작한다.
    if (nextPeak !== undefined && nextPeak - 1 < t + len) len = nextPeak - 1 - t;
    len = Math.min(len, finale - t);
    const seat = pickSeat();
    const atPeak = peaks.some((p) => Math.abs(p - 1 - t) < 0.01);
    if (atPeak) {
      shots.push({ start: t, end: t + len, kind: 'close', from: toward(seat, 0.15), to: toward(seat, 0.45) });
    } else if (rnd() < 0.5) {
      shots.push({ start: t, end: t + len, kind: 'push', from: toward(seat, 0), to: toward(seat, 0.12) });
    } else {
      // 옆으로 흐르기: 관람석 둘레를 조금 돈다
      const side = (rnd() < 0.5 ? -1 : 1) * 60;
      const from = toward(seat, 0.04);
      const to = { ...from, eye: [from.eye[0] + side, from.eye[1], from.eye[2]] as Vec3 };
      from.eye = [from.eye[0] - side, from.eye[1], from.eye[2]];
      shots.push({ start: t, end: t + len, kind: 'drift', from, to });
    }
    t += len;
  }
  return shots;
}

/** 그 시각의 카메라: 샷 안에서는 천천히 움직이고, 샷이 바뀔 때는 중계처럼 끊어 넘어간다 (먼 관람석 사이를 날아가면 어지럽다). */
export function shotCamera(shots: Shot[], t: number): Camera | null {
  if (!shots.length) return null;
  const i = shots.findIndex((s) => t < s.end);
  const s = i === -1 ? shots[shots.length - 1] : shots[i];
  const k = ease(Math.min(1, Math.max(0, (t - s.start) / Math.max(0.1, s.end - s.start))));
  return { eye: lerp3(s.from.eye, s.to.eye, k), target: lerp3(s.from.target, s.to.target, k), fovY: s.from.fovY + (s.to.fovY - s.from.fovY) * k };
}
