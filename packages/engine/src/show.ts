// 쇼 파일 규격과, cue를 실제 발사 목록으로 펼치는 일.
// cue의 t는 터지는 시각이다. 발사 시각은 카탈로그의 상승 시간을 빼서 여기서 계산한다.

import { SHELLS, SIZE_SPECS, type ShellType, type Size } from './catalog.ts';
import type { ColorName } from './colors.ts';
import { hash32, hashString } from './rng.ts';

/** 무대 원점 기준 미터 [동, 높이, 북] */
export type Vec3 = [number, number, number];

export interface Launcher {
  id: string;
  kind: 'barge' | 'bridge' | 'frame';
  pos: Vec3;
}

export interface Cue {
  /** 터지는 시각(초) */
  t: number;
  /** 발사 위치 id */
  at: string;
  type: ShellType;
  size: Size;
  colors?: ColorName[];
  /** 수직에서 동쪽(+x)으로 기운 각도(도) */
  angle?: number;
  /** 부채꼴 묶음: count발을 spread도 안에 고르게 펼친다 */
  fan?: { count: number; spread: number };
}

export interface Show {
  version: 1;
  seed: number;
  venue: {
    preset: string;
    /** dir: 바람이 불어오는 방향(도, 북=0 시계방향), speed: m/s */
    wind?: { dir: number; speed: number };
  };
  seat?: { id: string };
  launchers: Launcher[];
  cues: Cue[];
}

/** cue 하나를 펼친 실제 발사 한 발 */
export interface Launch {
  cueIndex: number;
  sub: number;
  fireAt: number;
  burstAt: number;
  origin: Vec3;
  angle: number;
  type: ShellType;
  size: Size;
  colors: ColorName[];
  seed: number;
}

export interface ShowWarning {
  cueIndex: number;
  message: string;
}

export interface ExpandedShow {
  launches: Launch[];
  warnings: ShowWarning[];
  /** 마지막 별이 사라질 때까지의 길이(초) */
  duration: number;
}

export function expandShow(show: Show): ExpandedShow {
  const launchers = new Map(show.launchers.map((l) => [l.id, l]));
  const launches: Launch[] = [];
  const warnings: ShowWarning[] = [];
  let duration = 0;

  show.cues.forEach((cue, cueIndex) => {
    const launcher = launchers.get(cue.at);
    const shell = SHELLS[cue.type];
    if (!launcher) {
      warnings.push({ cueIndex, message: `${cueIndex + 1}번째 불꽃의 발사 위치 "${cue.at}"가 없습니다.` });
      return;
    }
    const prefire = SIZE_SPECS[cue.size].prefire;
    const fireAt = cue.t - prefire;
    if (fireAt < 0) {
      warnings.push({
        cueIndex,
        message:
          `${cueIndex + 1}번째 불꽃(${shell.label} ${cue.size}호, ${cue.t.toFixed(2)}초)은 ` +
          `${prefire}초 전에 쏴야 해서 쇼 시작보다 ${(-fireAt).toFixed(2)}초 앞섭니다.`,
      });
    }

    const count = Math.max(1, Math.round(cue.fan?.count ?? 1));
    const spread = cue.fan?.spread ?? 0;
    // 시드를 cue 순서가 아니라 내용으로 만든다. 다른 cue를 지우거나 끼워 넣어도 이 불꽃 모양은 그대로다.
    const base = hash32(show.seed, Math.round(cue.t * 1000), hashString(cue.at));
    for (let sub = 0; sub < count; sub++) {
      const offset = count > 1 ? -spread / 2 + (spread * sub) / (count - 1) : 0;
      launches.push({
        cueIndex,
        sub,
        fireAt,
        burstAt: cue.t,
        origin: launcher.pos,
        angle: (cue.angle ?? 0) + offset,
        type: cue.type,
        size: cue.size,
        colors: cue.colors?.length ? cue.colors : ['gold'],
        seed: hash32(base, sub, cue.size),
      });
    }
    duration = Math.max(duration, cue.t + shell.starLife + 1.5);
  });

  launches.sort((a, b) => a.fireAt - b.fireAt || a.cueIndex - b.cueIndex || a.sub - b.sub);
  return { launches, warnings, duration };
}

/** 바람이 불어 가는 쪽의 속도 벡터(m/s) */
export function windVector(show: Show): Vec3 {
  const w = show.venue.wind;
  if (!w) return [0, 0, 0];
  const rad = (w.dir * Math.PI) / 180;
  // dir은 불어오는 방향이라, 불어 가는 쪽은 반대다.
  return [-Math.sin(rad) * w.speed, 0, -Math.cos(rad) * w.speed];
}
