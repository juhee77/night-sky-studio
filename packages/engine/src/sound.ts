// 관람석에서 들리는 소리의 지연. 소리는 초속 약 343m로 오므로,
// 1km 떨어진 자리에서는 불꽃이 터지고 약 3초 뒤에 '쿵' 소리가 들린다.

import { isShell, shellSize } from './catalog.ts';
import type { Launch, Vec3 } from './show.ts';

export const SPEED_OF_SOUND = 343;

/** 소리가 나는 곳: 하늘 불꽃은 터지는 지점, 나이아가라·틀불꽃은 발사 위치 */
export function soundSource(l: Launch): Vec3 {
  if (!isShell(l.type)) return l.origin;
  const h = shellSize(l.type, l.size).height;
  const tilt = (l.angle * Math.PI) / 180;
  return [l.origin[0] + Math.sin(tilt) * h, l.origin[1] + Math.cos(tilt) * h, l.origin[2]];
}

/** 관람석(귀)까지 소리가 오는 데 걸리는 시간(초) */
export function soundDelay(ear: Vec3, l: Launch): number {
  const s = soundSource(l);
  return Math.hypot(s[0] - ear[0], s[1] - ear[1], s[2] - ear[2]) / SPEED_OF_SOUND;
}
