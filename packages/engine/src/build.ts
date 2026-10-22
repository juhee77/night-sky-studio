// 제작 공방: 불꽃 알 하나를 실제 구조로 다룬다.
//   일본식 둥근 알: 종이 반구 두 개, 안쪽 벽을 따라 별 한 줄, 가운데 할약, 필요하면 심(안쪽 작은 알)
//   서양식 원통 알: 원통 안에 별과 할약을 층층이 (둥근 알보다 덜 동그랗게 퍼진다)
//   시한 도화선은 터지는 때를, 바닥의 발사약은 올라가는 높이를 정한다.
// 별을 붙인 자리가 곧 별이 날아가는 방향이다. 별 간격이 벌어진 곳은 하늘에 빈 자리로 보인다.
// 값은 게임용 근사이고 실제 제조 수치가 아니다.

import { RISE_EFFECTS, SIZE_SPECS, type RiseEffect, type Size } from './catalog.ts';
import type { ColorName } from './colors.ts';
import { normalizeSequence, type CustomShell, type Sequence, type StarKind } from './custom.ts';
import { evaluateMix, normalizeComposition, type Composition } from './chem.ts';

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
  /** 바깥 별의 화약 배합 (없으면 별 색만 고른 기본 화약) */
  comp?: Composition;
  /** 별이 사는 기본 시간(초). 배합의 타는 빠르기가 여기에 곱해진다 */
  life?: number;
  /** 별 만드는 방식·크기·말리기·층 (없으면 보통 별) */
  star?: StarMaking;
  /** 조립 솜씨 (없으면 보통 솜씨) */
  assembly?: Assembly;
  /** 원통 알의 칸 수: 2 이상이면 칸마다 차례로 터진다 */
  breaks?: number;
  /** 손으로 한 작업 기록 (굴리기·종이 바르기·할약 붓기). 보여 주기용 */
  hand?: { roll?: number; paste?: number; pour?: number };
  /** 바깥 별이 켜지는 순서 (별마다 넣은 지연 도화선) */
  sequence?: Sequence;
  /** 알 겉에 붙인 상승 효과 */
  rise?: RiseEffect;
}

/** 알 조립: 할약 채우기, 반구 맞붙이기, 종이 바르기 */
export interface Assembly {
  /** 할약이 한쪽(알의 동쪽)으로 치우친 정도 (0 고름 ~ 1 크게 치우침) */
  chargeOffset: number;
  /** 반구를 맞붙인 정확도 (0~1) */
  seam: number;
  /** 종이를 바른 정성: 고르게 꼭꼭 눌러 발랐는지 (0~1) */
  paste: number;
}

export function defaultAssembly(): Assembly {
  return { chargeOffset: 0, seam: 0.85, paste: 0.8 };
}

/** 별 무게중심이 알 가운데서 벗어난 정도 (0 고름 ~ 1 한쪽에 몰림) */
export function starBias(stars: Dir[]): number {
  if (!stars.length) return 1;
  const c = [0, 0, 0];
  for (const s of stars) for (let k = 0; k < 3; k++) c[k] += s[k] / stars.length;
  return Math.min(1, Math.hypot(c[0], c[1], c[2]) * 2);
}

/** 3D 대칭 (0~100): 별 자리, 빈 자리, 할약, 이음매, 종이가 모두 고르면 높다 */
export function symmetry3D(b: ShellBuild, largestGapDeg?: number): number {
  const a = b.assembly ?? defaultAssembly();
  const gap = largestGapDeg ?? buildReport(b).largestGap;
  const parts = [
    1 - starBias(b.stars) * 0.9,
    1 - clamp((gap - 18) / 70, 0, 0.8),
    1 - a.chargeOffset * 0.6,
    0.7 + 0.3 * a.seam,
    0.8 + 0.2 * a.paste,
    b.form === 'cylinder' ? 0.85 : 1,
  ];
  return Math.round(100 * parts.reduce((x, y) => x * y, 1));
}

/** 불발 확률: 이음매·종이·할약이 허술하면 높아진다 */
export function dudChance(b: ShellBuild): number {
  const a = b.assembly ?? defaultAssembly();
  const p = 0.005 + (1 - a.seam) * 0.12 + (1 - a.paste) * 0.1 + (b.paper < 4 ? 0.04 : 0) + (b.breakCharge < 0.15 ? 0.05 : 0);
  return Math.round(clamp(p, 0, 0.5) * 1000) / 1000;
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
  /** 3D 대칭 (0~100) */
  symmetry: number;
  /** 불발 확률 (0~1) */
  dud: number;
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
  if (b.star) {
    const cap = starCapacity(b.size, b.star.sizeMm);
    if (b.stars.length > cap) warnings.push(`${b.star.sizeMm}mm 별은 이 알에 ${cap}알까지만 들어갑니다.`);
    if (b.star.dryHours < 24) warnings.push('별이 덜 말라 일부가 불붙지 않습니다.');
    if (b.star.method === 'cut') warnings.push('자른 별은 크기가 들쭉날쭉해 꺼지는 때가 제각각입니다.');
  }
  const a = b.assembly;
  if (a && a.chargeOffset > 0.3) warnings.push('할약이 한쪽으로 몰려 그쪽 별만 멀리 날아갑니다.');
  if (a && a.seam < 0.5) warnings.push('반구 이음매가 어긋나 가운데 띠가 흐트러지고 불발이 늘어납니다.');
  if (a && a.paste < 0.4) warnings.push('종이를 허술하게 발라 압력이 새고 불발이 늘어납니다.');
  if (starBias(stars) > 0.3) warnings.push('별이 한쪽에 몰려 있어 동그랗게 피지 않습니다.');
  if (burstTime > apex + 0.3) warnings.push('도화선이 길어 꼭대기를 지나 떨어지면서 터집니다.');
  if (burstTime < apex * 0.75) warnings.push('도화선이 짧아 다 올라가기 전에 낮게 터집니다.');
  if (f.height < 0.8) warnings.push('발사약이 적어 낮게 올라갑니다.');
  return {
    caliberCm: caliberCm(b.size),
    evenness,
    largestGap: Math.round(gap),
    symmetry: symmetry3D(b, gap),
    dud: dudChance(b),
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
  const mix = b.comp ? evaluateMix(b.comp) : null;
  const star = b.star ? starEffect(b.star) : null;
  // 층 입힌 별: 바깥층(배합 색)이 먼저 타고, 안층 색으로 바뀐다.
  const then = b.star?.inner ? { color: b.star.inner.color, at: b.star.inner.outerShare } : b.then;
  const layers: CustomShell['layers'] = [
    {
      role: 'outer',
      shape: { kind: 'dirs', dirs: b.stars.map((d) => [...d] as Dir) },
      star: b.starKind,
      color: mix ? mix.color : b.starColor,
      ...(mix ? { tint: [...mix.rgb] as [number, number, number] } : {}),
      ...(then ? { then: { ...then } } : {}),
      ...(b.sequence ? { sequence: { ...b.sequence } } : {}),
      scale: 1,
      delay: 0,
    },
  ];
  if (b.pistil) {
    layers.push({ role: 'pistil', shape: { kind: 'sphere', count: b.pistil.count }, star: b.pistil.kind, color: b.pistil.color, scale: 0.42, delay: 0.08 });
  }
  const life = b.life ?? star?.life ?? 2.2;
  const shell: CustomShell = {
    ...base,
    layers,
    // 빨리 타는 배합일수록 별이 짧게 산다.
    motion: { ...base.motion, life: mix ? Math.max(0.8, Math.min(5, life * (1.35 - 0.7 * mix.burnRate))) : life },
    // 원통 알은 터지는 압력이 고르지 않아 할약을 더 넣은 것처럼 찌그러진다.
    craft: {
      starSize: star?.starSize ?? base.craft?.starSize ?? 'medium',
      breakCharge: Math.min(1, b.breakCharge + (b.form === 'cylinder' ? 0.25 : 0)),
      paper: b.paper,
      care: star?.care ?? base.craft?.care ?? 0.5,
      premium: base.craft?.premium ?? false,
    },
    flight: flightOf(b),
    build: b,
  };
  if (mix) shell.smoke = mix.smoke;
  else delete shell.smoke;
  const costMul = (mix?.cost ?? 1) * (star?.cost ?? 1);
  if (costMul !== 1) shell.costMul = costMul;
  else delete shell.costMul;
  if (star && star.misfire > 0) shell.misfire = star.misfire;
  else delete shell.misfire;
  if (b.assembly) {
    // 치우친 할약은 알의 동쪽(+x)에 몰렸다고 본다.
    shell.assembly = { offset: [b.assembly.chargeOffset * 0.5, 0, 0], seam: 1 - b.assembly.seam };
  } else delete shell.assembly;
  // 조립을 직접 한 알만 불발이 난다 (보통 솜씨 알은 늘 터진다).
  if (b.rise) shell.rise = b.rise;
  else delete shell.rise;
  if (b.form === 'cylinder' && (b.breaks ?? 1) > 1) shell.chain = b.breaks;
  else delete shell.chain;
  const dud = b.assembly ? dudChance(b) : 0;
  if (dud > 0.01) shell.dud = dud;
  else delete shell.dud;
  return shell;
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
    ...(raw.comp ? { comp: normalizeComposition(raw.comp) } : {}),
    ...(raw.life !== undefined ? { life: clamp(raw.life, 0.8, 5) } : {}),
    ...(raw.star
      ? {
          star: {
            method: (['rolled', 'pumped', 'cut'] as const).includes(raw.star.method) ? raw.star.method : 'pumped',
            sizeMm: clamp(raw.star.sizeMm, 5, 25),
            dryHours: clamp(raw.star.dryHours, 0, 96),
            ...(raw.star.handCare !== undefined ? { handCare: clamp(raw.star.handCare, 0, 1) } : {}),
            ...(raw.star.inner ? { inner: { color: raw.star.inner.color, outerShare: clamp(raw.star.inner.outerShare, 0.1, 0.9) } } : {}),
          },
        }
      : {}),
    ...(raw.rise && RISE_EFFECTS.includes(raw.rise) ? { rise: raw.rise } : {}),
    ...(raw.hand
      ? { hand: Object.fromEntries(Object.entries(raw.hand).filter(([k]) => ['roll', 'paste', 'pour'].includes(k)).map(([k, v]) => [k, clamp(v as number, 0, 1)])) }
      : {}),
    ...(raw.sequence ? { sequence: normalizeSequence(raw.sequence) } : {}),
    ...(raw.breaks !== undefined && raw.breaks > 1 ? { breaks: Math.round(clamp(raw.breaks, 2, 4)) } : {}),
    ...(raw.assembly
      ? { assembly: { chargeOffset: clamp(raw.assembly.chargeOffset, 0, 1), seam: clamp(raw.assembly.seam, 0, 1), paste: clamp(raw.assembly.paste, 0, 1) } }
      : {}),
  };
}

// ── 별 만들기 ──
// 굴리기: 씨앗 알갱이에 화약을 조금씩 입혀 굴린다. 둥글고 고르지만 오래 걸린다.
// 찍기: 틀에 눌러 찍는다. 빠르고 모양이 일정하다.
// 자르기: 화약 반죽을 깍둑 썬다. 싸고 빠르지만 크기와 모양이 들쭉날쭉하다.
// 색이 바뀌는 별은 층을 입혀 만든다. 바깥층이 먼저 타므로 먼저 보인다.

export type StarMethod = 'rolled' | 'pumped' | 'cut';

export interface StarMaking {
  method: StarMethod;
  /** 별 지름(mm) */
  sizeMm: number;
  /** 말린 시간(시간). 덜 마르면 일부 별이 불붙지 않는다 */
  dryHours: number;
  /** 안층 (색이 바뀌는 별): 색과, 별 전체에서 바깥층이 차지하는 두께 비율 */
  inner?: { color: ColorName; outerShare: number };
  /** 굴림판에서 손으로 굴린 고르기 (0~1). 없으면 방식만으로 정한다 */
  handCare?: number;
}

export const STAR_METHOD_LABEL: Record<StarMethod, string> = { rolled: '굴리기', pumped: '찍기', cut: '자르기' };

export function defaultStarMaking(): StarMaking {
  return { method: 'pumped', sizeMm: 12, dryHours: 48 };
}

/** 이 크기 알의 벽에 이 크기 별을 한 줄로 붙이면 들어가는 최대 개수 */
export function starCapacity(size: Size, sizeMm: number): number {
  const wallR = (caliberCm(size) / 2) * 10 - sizeMm; // mm
  const r = sizeMm / 2;
  return Math.max(12, Math.floor(4 * (wallR / r) ** 2 * 0.78));
}

export interface StarEffect {
  /** 별마다 크기·꺼지는 때 편차 (장인 모드의 '다듬기'로 바꿔 쓴다, 0~1 높을수록 고름) */
  care: number;
  /** 별 수명(초) */
  life: number;
  /** 불붙지 않는 별의 비율 */
  misfire: number;
  /** 크기 분류 (장인 모드) */
  starSize: 'small' | 'medium' | 'large';
  /** 값 배율 */
  cost: number;
}

export function starEffect(s: StarMaking): StarEffect {
  const method = { rolled: { care: 0.9, cost: 1.25 }, pumped: { care: 0.65, cost: 1 }, cut: { care: 0.25, cost: 0.8 } }[s.method];
  const dry = Math.min(1, s.dryHours / 48);
  // 손으로 고르게 굴리면 별 크기가 고르고, 들쭉날쭉 굴리면 방식이 좋아도 고르지 않다.
  const hand = s.handCare === undefined ? 1 : 0.55 + 0.6 * s.handCare;
  return {
    care: Math.min(1, method.care * (0.6 + 0.4 * dry) * hand),
    life: Math.max(0.8, Math.min(5, 2.2 * (s.sizeMm / 12) ** 0.8)),
    misfire: Math.max(0, (1 - dry) * 0.45),
    starSize: s.sizeMm < 9 ? 'small' : s.sizeMm > 16 ? 'large' : 'medium',
    cost: method.cost * (0.8 + s.sizeMm / 60),
  };
}
