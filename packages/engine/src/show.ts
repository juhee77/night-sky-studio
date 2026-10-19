// 쇼 파일 규격과, cue를 실제 발사 목록으로 펼치는 일.
// cue의 t는 터지는 시각이다 (케이크는 첫 발, 나이아가라·틀불꽃은 불이 붙는 시각).
// 발사 시각은 카탈로그의 상승 시간을 빼서 여기서 계산한다.

import {
  isShell,
  shellSize,
  typeLabel,
  visibleLength,
  type FireworkType,
  type RiseEffect,
  type ShellType,
  type Size,
} from './catalog.ts';
import type { ColorName } from './colors.ts';
import type { Commission } from './commission.ts';
import { customLength, shellKey, type CustomShell } from './custom.ts';
import type { Sky } from './weather.ts';
import type { Rig } from './rig.ts';
import { hash32, hashString } from './rng.ts';

/** 무대 원점 기준 미터 [동, 높이, 북] */
export type Vec3 = [number, number, number];

export interface Launcher {
  id: string;
  /** barge: 바지선(하늘 불꽃), bridge: 다리(나이아가라), frame: 지상 틀(글자) */
  kind: 'barge' | 'bridge' | 'frame';
  pos: Vec3;
  /** 다리의 양 끝 */
  from?: Vec3;
  to?: Vec3;
}

export type CakePattern = 'fan' | 'zigzag' | 'straight';

export interface Cue {
  /** 터지는 시각(초) */
  t: number;
  /** 발사 위치 id */
  at: string;
  type: FireworkType;
  size: Size;
  colors?: ColorName[];
  /** 수직에서 동쪽(+x)으로 기운 각도(도) */
  angle?: number;
  /** 부채꼴 묶음: count발을 spread도 안에 고르게 펼친다 */
  fan?: { count: number; spread: number };
  /** 케이크: 발 수, 간격(초), 각도 무늬 */
  shots?: number;
  interval?: number;
  pattern?: CakePattern;
  /** 나이아가라·틀불꽃이 타는 시간(초) */
  len?: number;
  /** 틀불꽃 글자 */
  text?: string;
  /** 내 불꽃: show.customShells의 id */
  custom?: string;
  /** 올라가는 모습 (없으면 희미한 불티 꼬리) */
  rise?: RiseEffect;
  /** 손으로 고른 통 (부채꼴은 발마다, 케이크는 하나) */
  tubes?: string[];
}

/** 쇼에 쓴 음악. 음악 파일 자체는 쇼에 넣지 않는다. */
export interface MusicRef {
  /** 기본 곡은 'basic-1' 같은 id, 내 음악 파일은 'file:' + 파일 지문 */
  id: string;
  title: string;
  bpm: number;
  /** 첫 박이 오는 시각(초) */
  offset: number;
  /** 곡 길이(초). 받은 사람이 같은 파일을 골랐는지 확인하는 데도 쓴다. */
  duration: number;
}

export interface Show {
  version: 1;
  title?: string;
  seed: number;
  music?: MusicRef;
  venue: {
    preset: string;
    /** dir: 바람이 불어오는 방향(도, 북=0 시계방향), speed: m/s */
    wind?: { dir: number; speed: number };
    /** 구름 바닥 높이(m). 이보다 높이 터지는 불꽃은 구름에 묻힌다. */
    cloud?: number;
    /** 계절과 시간대 (없으면 맑은 밤) */
    sky?: Sky;
  };
  /** 감상할 때 10초 카운트다운 뒤에 시작한다 (새해 쇼) */
  countdown?: boolean;
  seat?: { id: string };
  launchers: Launcher[];
  cues: Cue[];
  /** 의뢰 모드에서 받은 의뢰 (공유 링크에는 넣지 않는다) */
  commission?: Commission;
  /** 이 쇼에 쓴 내 불꽃 정의 (공유 링크에 같이 담는다) */
  customShells?: Record<string, CustomShell>;
  /** 발사장 장비: 바지선 갑판 위 랙 */
  rig?: Rig;
}

/** cue 하나를 펼친 실제 발사 한 발 (케이크는 한 발마다 하나, 부채꼴도 한 발마다 하나) */
export interface Launch {
  cueIndex: number;
  sub: number;
  fireAt: number;
  burstAt: number;
  origin: Vec3;
  angle: number;
  type: FireworkType;
  size: Size;
  colors: ColorName[];
  seed: number;
  /** 나이아가라·틀불꽃이 타는 시간 */
  len?: number;
  /** 나이아가라를 거는 다리 양 끝 */
  span?: [Vec3, Vec3];
  text?: string;
  /** 내 불꽃 정의와 그 지문 */
  customDef?: CustomShell;
  customKey?: string;
  /** 올라가는 모습 */
  rise?: RiseEffect;
}

export interface ShowWarning {
  cueIndex: number;
  message: string;
}

export interface ExpandedShow {
  launches: Launch[];
  warnings: ShowWarning[];
  /** 마지막 불꽃이 사라질 때까지의 길이(초) */
  duration: number;
}

export const CAKE_DEFAULTS = { shots: 24, interval: 0.15, pattern: 'fan' as CakePattern, spread: 60 };
export const LEN_DEFAULTS = { niagara: 8, lancework: 10 };

/** 그 종류를 놓을 수 있는 발사 위치 */
export function launcherKindFor(type: FireworkType): Launcher['kind'] {
  return type === 'niagara' ? 'bridge' : type === 'lancework' ? 'frame' : 'barge';
}

/** 점화에서 터질 때까지 걸리는 시간 */
export function cuePrefire(cue: Pick<Cue, 'type' | 'size'>): number {
  return isShell(cue.type) ? shellSize(cue.type, cue.size).prefire : 0;
}

/** 시간표에 그릴 길이: 터지기 시작해서 눈에 보이는 동안 */
export function cueLength(cue: Cue, shells?: Record<string, CustomShell>): number {
  if (cue.type === 'custom') {
    const def = cue.custom ? shells?.[cue.custom] : undefined;
    return def ? customLength(def) : visibleLength('custom');
  }
  if (cue.type === 'niagara' || cue.type === 'lancework') return cue.len ?? LEN_DEFAULTS[cue.type];
  if (cue.type === 'cake') {
    const shots = cue.shots ?? CAKE_DEFAULTS.shots;
    return (shots - 1) * (cue.interval ?? CAKE_DEFAULTS.interval) + visibleLength('cake');
  }
  return visibleLength(cue.type);
}

/** 케이크 k번째 발의 각도 */
function cakeAngle(pattern: CakePattern, k: number, shots: number, spread: number): number {
  if (pattern === 'straight') return 0;
  if (pattern === 'fan') return shots > 1 ? -spread / 2 + (spread * k) / (shots - 1) : 0;
  // 지그재그: 8발마다 한쪽 끝에서 다른 쪽 끝으로 오간다.
  const phase = (k % 16) / 8;
  const tri = phase <= 1 ? phase : 2 - phase;
  return -spread / 2 + spread * tri;
}

export function expandShow(show: Show): ExpandedShow {
  const launchers = new Map(show.launchers.map((l) => [l.id, l]));
  const launches: Launch[] = [];
  const warnings: ShowWarning[] = [];
  let duration = 0;

  const keys = new Map<string, string>();
  show.cues.forEach((cue, cueIndex) => {
    const launcher = launchers.get(cue.at);
    const def = cue.type === 'custom' && cue.custom ? show.customShells?.[cue.custom] : undefined;
    const label = def ? def.name : typeLabel(cue.type);
    if (cue.type === 'custom' && !def) {
      warnings.push({ cueIndex, message: `${cueIndex + 1}번째 불꽃(내 불꽃)의 설계가 이 쇼에 없습니다.` });
      return;
    }
    if (!launcher) {
      warnings.push({ cueIndex, message: `${cueIndex + 1}번째 불꽃의 발사 위치 "${cue.at}"가 없습니다.` });
      return;
    }
    if (launcher.kind !== launcherKindFor(cue.type)) {
      warnings.push({ cueIndex, message: `${cueIndex + 1}번째 불꽃(${label})은 이 발사 위치에 놓을 수 없습니다.` });
      return;
    }
    // 시드를 cue 순서가 아니라 내용으로 만든다. 다른 cue를 지우거나 끼워 넣어도 이 불꽃 모양은 그대로다.
    const base = hash32(show.seed, Math.round(cue.t * 1000), hashString(cue.at));
    const colors: ColorName[] = cue.colors?.length ? cue.colors : ['gold'];
    duration = Math.max(duration, cue.t + cueLength(cue, show.customShells) + 1.5);
    let customKey: string | undefined;
    if (def) {
      customKey = keys.get(def.id) ?? shellKey(def);
      keys.set(def.id, customKey);
    }

    if (cue.type === 'niagara' || cue.type === 'lancework') {
      const from = launcher.from ?? [launcher.pos[0] - 300, launcher.pos[1], launcher.pos[2]];
      const to = launcher.to ?? [launcher.pos[0] + 300, launcher.pos[1], launcher.pos[2]];
      launches.push({
        cueIndex, sub: 0, fireAt: cue.t, burstAt: cue.t, origin: launcher.pos, angle: 0,
        type: cue.type, size: cue.size, colors, seed: hash32(base, 0, 77),
        len: cue.len ?? LEN_DEFAULTS[cue.type],
        span: cue.type === 'niagara' ? [from, to] : undefined,
        text: cue.type === 'lancework' ? (cue.text ?? '').slice(0, 24) : undefined,
      });
      return;
    }

    const prefire = cuePrefire(cue);
    const fireAt = cue.t - prefire;
    if (fireAt < 0) {
      warnings.push({
        cueIndex,
        message:
          `${cueIndex + 1}번째 불꽃(${label} ${cue.size}호, ${cue.t.toFixed(2)}초)은 ` +
          `${prefire}초 전에 쏴야 해서 쇼 시작보다 ${(-fireAt).toFixed(2)}초 앞섭니다.`,
      });
    }

    if (cue.type === 'cake') {
      const shots = Math.max(1, Math.min(120, Math.round(cue.shots ?? CAKE_DEFAULTS.shots)));
      const interval = Math.max(0.03, cue.interval ?? CAKE_DEFAULTS.interval);
      const pattern = cue.pattern ?? CAKE_DEFAULTS.pattern;
      for (let k = 0; k < shots; k++) {
        launches.push({
          cueIndex, sub: k,
          fireAt: fireAt + k * interval, burstAt: cue.t + k * interval,
          origin: launcher.pos,
          angle: (cue.angle ?? 0) + cakeAngle(pattern, k, shots, CAKE_DEFAULTS.spread),
          type: 'cake', size: cue.size, colors: [colors[k % colors.length]],
          seed: hash32(base, k, 31),
        });
      }
      return;
    }

    const count = Math.max(1, Math.round(cue.fan?.count ?? 1));
    const spread = cue.fan?.spread ?? 0;
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
        colors,
        seed: hash32(base, sub, cue.size),
        ...(def ? { customDef: def, customKey } : {}),
        ...(cue.rise ?? def?.rise ? { rise: cue.rise ?? def?.rise } : {}),
      });
    }
  });

  launches.sort((a, b) => a.fireAt - b.fireAt || a.cueIndex - b.cueIndex || a.sub - b.sub);
  return { launches, warnings, duration };
}

/** 발사 한 발을 비교하는 열쇠. 같으면 화면에 같은 불꽃이 나온다. */
export function launchKey(l: Launch): string {
  return [
    l.fireAt.toFixed(5), l.seed, l.type, l.size, l.angle, l.colors.join(','), l.origin.join(','),
    l.len ?? '', l.text ?? '', l.span ? l.span.flat().join(',') : '', l.customKey ?? '', l.rise ?? '',
  ].join('|');
}

/** 하늘 불꽃인지 (올라가서 터지는 것) */
export function isShellLaunch(l: Launch): l is Launch & { type: ShellType } {
  return isShell(l.type);
}

/** 바람이 불어 가는 쪽의 속도 벡터(m/s) */
export function windVector(show: Show): Vec3 {
  const w = show.venue.wind;
  if (!w) return [0, 0, 0];
  const rad = (w.dir * Math.PI) / 180;
  // dir은 불어오는 방향이라, 불어 가는 쪽은 반대다.
  return [-Math.sin(rad) * w.speed, 0, -Math.cos(rad) * w.speed];
}

