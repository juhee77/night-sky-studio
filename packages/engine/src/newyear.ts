// 새해 불꽃 보내기: 받는 사람과 인사를 넣으면 지금 무대와 곡으로 새해 쇼를 만든다.
// 10초 카운트다운 뒤에 시작하고, 지상 틀이 있으면 새해 연도를 띄운다.

import { autoChoreograph, type MusicMap } from './auto.ts';
import { isLive } from './live.ts';
import { allTubes } from './rig.ts';
import { GREETING_MESSAGE_MAX, GREETING_TO_MAX, type Greeting, type Show } from './show.ts';

/** 새해 쇼를 권하는 때: 11월 1일부터 1월 31일까지 */
export function isNewYearSeason(now: Date): boolean {
  const m = now.getMonth();
  return m >= 10 || m === 0;
}

/** 맞이할 해. 11·12월이면 다음 해, 그 밖에는 올해. */
export function newYearOf(now: Date): number {
  return now.getFullYear() + (now.getMonth() >= 10 ? 1 : 0);
}

/** 받는 사람 이름과 인사를 다듬는다 (이름이 비면 null) */
export function cleanGreeting(to: string, message: string): Greeting | null {
  const name = to.trim().slice(0, GREETING_TO_MAX);
  if (!name) return null;
  const text = message.trim().slice(0, GREETING_MESSAGE_MAX);
  return text ? { to: name, message: text } : { to: name };
}

/** 지금 쇼의 무대·곡·발사 위치로 새해 쇼를 만든다. 의뢰는 떼어 낸다. */
export function newYearShow(show: Show, music: MusicMap, greeting: Greeting, year: number, seed: number): Show {
  const frame = show.launchers.some((l) => l.kind === 'frame');
  const cues = autoChoreograph(music, show.launchers, {
    seed,
    style: 'grand',
    mood: 'festive',
    density: 0.75,
    ...(frame ? { text: String(year) } : {}),
    ...(show.venue.wind ? { wind: show.venue.wind } : {}),
    ...(isLive(show) ? { tubes: allTubes(show.rig) } : {}),
  });
  const { commission: _c, ...rest } = show;
  return {
    ...rest,
    title: `${greeting.to}님께 보내는 ${year} 새해 불꽃`.slice(0, 60),
    greeting,
    countdown: true,
    cues,
  };
}
