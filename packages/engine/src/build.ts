// 제작 공방: 불꽃 알 하나를 실제 구조로 다룬다.
//   일본식 둥근 알: 종이 반구 두 개, 안쪽 벽을 따라 별 한 줄, 가운데 할약, 필요하면 심(안쪽 작은 알)
//   서양식 원통 알: 원통 안에 별과 할약을 층층이 (둥근 알보다 덜 동그랗게 퍼진다)
//   시한 도화선은 터지는 때를, 바닥의 발사약은 올라가는 높이를 정한다.
// 별을 붙인 자리가 곧 별이 날아가는 방향이다. 별 간격이 벌어진 곳은 하늘에 빈 자리로 보인다.
// 값은 게임용 근사이고 실제 제조 수치가 아니다.

import { SIZE_SPECS, type Size } from './catalog.ts';
import type { ColorName } from './colors.ts';
import type { CustomShell, StarKind } from './custom.ts';

export type ShellForm = 'round' | 'cylinder';
export type Dir = [number, number, number];

export interface ShellBuild {
  form: ShellForm;
  /** 알 크기 (호). 지름과 알맞은 도화선·발사약이 크기마다 다르다 */
  size: Size;
  /** 바깥 별 자리: 알 안쪽 벽 위의 방향 (단위 벡터) */
  stars: Dir[];
  starColor: ColorName;
  starKind: StarKind;
  /** 색이 바뀌는 별 */
  then?: { color: ColorName; at: number };
  /** 심(안쪽 작은 알). 없으면 null */
  pistil: { count: number; color: ColorName; kind: StarKind } | null;
  /** 할약 양 (0~1) */
  breakCharge: number;
  /** 종이 겹 수 (2~12) */
  paper: number;
  /** 도화선 길이: 알맞은 길이에 대한 비율 (1이면 꼭대기에서 터짐) */
  fuse: number;
  /** 발사약 양: 알맞은 양에 대한 비율 (1이면 크기표 높이) */
  lift: number;
}

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/** 별을 알 벽에 고르게 붙인 자리 (피보나치 구) */
export function evenStars(count: number): Dir[] {
  const out: Dir[] = [];
  for (let i = 0; i < count; i++) {
    const y = 1 - (2 * (i + 0.5)) / count;
    const r = Math.sqrt(1 - y * y);
    const a = i * GOLDEN;
    out.push([Math.cos(a) * r, y, Math.sin(a) * r]);
  }
  return out;
}

export function defaultBuild(size: Size = 5): ShellBuild {
  return {
    form: 'round',
    size,
    stars: evenStars(90),
    starColor: 'gold',
    starKind: 'tail',
    pistil: { count: 30, color: 'cyan', kind: 'dot' },
    breakCharge: 0.5,
    paper: 6,
    fuse: 1,
    lift: 1,
  };
}

/** 알 지름(cm): 1호가 약 3cm */
export function caliberCm(size: Size): number {
  return size * 3;
}

const angle = (a: Dir, b: Dir) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));

export interface BuildReport {
  caliberCm: number;
  /** 별 간격 고르기 (0~100) */
  evenness: number;
  /** 가장 큰 빈 자리 (도): 하늘에 구멍으로 보이는 크기 */
  largestGap: number;
  /** 터지는 높이(m)와 크기표 높이 대비 */
  burstHeight: number;
  heightRatio: number;
  /** 계획한 박자보다 몇 초 늦게(+)·일찍(−) 터지는지 */
  timing: number;
  /** 꼭대기를 지나 떨어지면서 터지는지 */
  pastApex: boolean;
  warnings: string[];
}

/** 이 구조로 만들면 어떻게 터질지 미리 계산한다. */
export function buildReport(b: ShellBuild): BuildReport {
  const stars = b.stars;
  // 별마다 가장 가까운 별까지의 각도: 고르게 붙였다면 거의 같다.
  let evenness = 0;
  if (stars.length > 3) {
    const nn = stars.map((s, i) => {
      let m = Infinity;
      for (let j = 0; j < stars.length; j++) if (j !== i) m = Math.min(m, angle(s, stars[j]));
      return m;
    });
    const mean = nn.reduce((a, c) => a + c, 0) / nn.length;
    const sd = Math.sqrt(nn.reduce((a, c) => a + (c - mean) ** 2, 0) / nn.length);
    evenness = Math.round(100 * Math.max(0, 1 - (sd / mean) * 2.5));
  }
  // 빈 자리: 구 위에 고르게 놓은 400개의 점에서 가장 가까운 별까지의 가장 큰 각도
  let gap = 180;
  if (stars.length) {
    gap = 0;
    for (const p of evenStars(400)) {
      let m = Infinity;
      for (const s of stars) m = Math.min(m, angle(p, s));
      gap = Math.max(gap, m);
    }
    gap = (gap * 180) / Math.PI;
  }
  const f = flightOf(b);
  const spec = SIZE_SPECS[b.size];
  const apex = spec.prefire * Math.sqrt(f.height);
  const burstTime = spec.prefire * f.burstAt;
  const y = burstHeightAt(spec.height * f.height, apex, burstTime);
  const warnings: string[] = [];
  if (gap > 30) warnings.push(`별 사이에 ${Math.round(gap)}도만큼 빈 자리가 있어 하늘에 구멍으로 보입니다.`);
  if (b.form === 'cylinder') warnings.push('원통 알은 둥근 알보다 덜 동그랗게 퍼집니다.');
  if (b.breakCharge > 0.8 && b.paper < 5) warnings.push('할약에 비해 종이가 얇아 한쪽으로 찢어지며 찌그러지기 쉽습니다.');
  if (b.breakCharge < 0.2) warnings.push('할약이 적어 별이 멀리 퍼지지 못합니다.');
  if (burstTime > apex + 0.3) warnings.push('도화선이 길어 꼭대기를 지나 떨어지면서 터집니다.');
  if (burstTime < apex * 0.75) warnings.push('도화선이 짧아 다 올라가기 전에 낮게 터집니다.');
  if (f.height < 0.8) warnings.push('발사약이 적어 낮게 올라갑니다.');
  return {
    caliberCm: caliberCm(b.size),
    evenness,
    largestGap: Math.round(gap),
    burstHeight: Math.round(y),
    heightRatio: y / spec.height,
    timing: Math.round((burstTime - spec.prefire) * 100) / 100,
    pastApex: burstTime > apex,
    warnings,
  };
}

/** 위로 올라가다 꼭대기에서 멈추고 떨어지는 높이 (같은 감속으로) */
export function burstHeightAt(h: number, apex: number, t: number): number {
  if (t <= apex) {
    const u = t / apex;
    return h * (1 - (1 - u) * (1 - u));
  }
  const a = (2 * h) / (apex * apex);
  return Math.max(0, h - 0.5 * a * (t - apex) ** 2);
}

/** 도화선·발사약 → 비행 (높이 배율, 터지는 때 배율) */
export function flightOf(b: ShellBuild): { height: number; burstAt: number } {
  return { height: 0.4 + 0.6 * b.lift, burstAt: b.fuse };
}

/** 알 구조를 불꽃 설계로 바꾼다. 이름·움직임은 기존 설계(base)를 따른다. */
export function buildToShell(b: ShellBuild, base: CustomShell): CustomShell {
  const layers: CustomShell['layers'] = [
    {
      role: 'outer',
      shape: { kind: 'dirs', dirs: b.stars.map((d) => [...d] as Dir) },
      star: b.starKind,
      color: b.starColor,
      ...(b.then ? { then: { ...b.then } } : {}),
      scale: 1,
      delay: 0,
    },
  ];
  if (b.pistil) {
    layers.push({ role: 'pistil', shape: { kind: 'sphere', count: b.pistil.count }, star: b.pistil.kind, color: b.pistil.color, scale: 0.42, delay: 0.08 });
  }
  return {
    ...base,
    layers,
    // 원통 알은 터지는 압력이 고르지 않아 할약을 더 넣은 것처럼 찌그러진다.
    craft: {
      starSize: base.craft?.starSize ?? 'medium',
      breakCharge: Math.min(1, b.breakCharge + (b.form === 'cylinder' ? 0.25 : 0)),
      paper: b.paper,
      care: base.craft?.care ?? 0.5,
      premium: base.craft?.premium ?? false,
    },
    flight: flightOf(b),
    build: b,
  };
}

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, Number.isFinite(x) ? x : a));

/** 바깥에서 온 구조를 안전한 범위로 고친다. */
export function normalizeBuild(raw: ShellBuild): ShellBuild {
  const stars = (raw.stars ?? [])
    .slice(0, 260)
    .map((d) => {
      const [x, y, z] = d.map((v) => clamp(v, -1, 1));
      const n = Math.hypot(x, y, z) || 1;
      return [x / n, y / n, z / n] as Dir;
    });
  const sizes: Size[] = [3, 5, 7, 10];
  return {
    form: raw.form === 'cylinder' ? 'cylinder' : 'round',
    size: sizes.includes(raw.size) ? raw.size : 5,
    stars,
    starColor: raw.starColor ?? 'gold',
    starKind: raw.starKind ?? 'tail',
    ...(raw.then ? { then: { color: raw.then.color, at: clamp(raw.then.at, 0.1, 0.9) } } : {}),
    pistil: raw.pistil ? { count: Math.round(clamp(raw.pistil.count, 6, 80)), color: raw.pistil.color, kind: raw.pistil.kind } : null,
    breakCharge: clamp(raw.breakCharge, 0, 1),
    paper: Math.round(clamp(raw.paper, 2, 12)),
    fuse: clamp(raw.fuse, 0.6, 1.5),
    lift: clamp(raw.lift, 0.5, 1.4),
  };
}
