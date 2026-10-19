// 시험장: 만든 알을 한 발 쏘아 실제로 어떻게 터졌는지 재고, 왜 그렇게 터졌는지 알려 준다.
// 미리 계산한 보고서(buildReport)와 달리, 시뮬레이션에서 나온 별을 그대로 잰다.

import { buildReport, evenStars, starBias, type Dir, type ShellBuild } from './build.ts';
import { customStarCount, type CustomShell } from './custom.ts';
import type { Show } from './show.ts';
import { Simulation } from './sim.ts';

export interface TestRecord {
  /** 터졌는지 (불발이면 false) */
  burst: boolean;
  /** 터진 높이(m) */
  height: number;
  /** 둥근 정도 (0~100): 별이 날아가는 빠르기가 모든 방향으로 같을수록 높다 */
  roundness: number;
  /** 납작함 (0~100): 별이 한 평면에 모여 있으면 높다 (옆에서 보면 선) */
  flatness: number;
  /** 가장 큰 빈 자리 (도) */
  holeDeg: number;
  /** 빈 자리가 있는 쪽 (알 기준이 아니라 하늘 기준) */
  holeSide: 'top' | 'bottom' | 'side' | null;
  /** 한꺼번에 꺼짐 (0~100) */
  sync: number;
  /** 밝기 (0~100) */
  brightness: number;
  /** 불붙은 별 / 넣은 별 */
  lit: number;
  planned: number;
}

export interface Defect {
  title: string;
  cause: string;
  fix: string;
}

/** 3x3 대칭 행렬의 고윳값 (야코비 회전) */
function eigen3(m: number[]): number[] {
  const a = [...m];
  for (let sweep = 0; sweep < 12; sweep++) {
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      const apq = a[p * 3 + q];
      if (Math.abs(apq) < 1e-12) continue;
      const theta = (a[q * 3 + q] - a[p * 3 + p]) / (2 * apq);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1);
      const s = t * c;
      for (let k = 0; k < 3; k++) {
        const akp = a[k * 3 + p];
        const akq = a[k * 3 + q];
        a[k * 3 + p] = c * akp - s * akq;
        a[k * 3 + q] = s * akp + c * akq;
      }
      for (let k = 0; k < 3; k++) {
        const apk = a[p * 3 + k];
        const aqk = a[q * 3 + k];
        a[p * 3 + k] = c * apk - s * aqk;
        a[q * 3 + k] = s * apk + c * aqk;
      }
    }
  }
  return [a[0], a[4], a[8]].sort((x, y) => x - y);
}

const isStar = (size: number) => size === 4.5 || size === 5.5;

/** 한 발 시험 발사. seed가 같으면 결과도 같다. */
export function testFire(shell: CustomShell, seed = 1): TestRecord {
  const size = shell.build?.size ?? 5;
  const show: Show = {
    version: 1,
    seed,
    venue: { preset: 'river-bridge-city', wind: { dir: 0, speed: 0 } },
    launchers: [{ id: 'test', kind: 'barge', pos: [0, 0, 0] }],
    cues: [{ t: 6, at: 'test', type: 'custom', custom: shell.id, size }],
    customShells: { [shell.id]: shell },
  };
  const sim = new Simulation(show);
  const p = sim.pool;
  const planned = customStarCount(shell);
  // 별이 처음 보이는 때까지 조금씩 나아간다.
  let t = 2;
  let found = false;
  for (; t < 12; t += 0.02) {
    sim.advanceTo(t);
    for (let i = 0; i < p.count && !found; i++) if (isStar(p.size[i])) found = true;
    if (found) break;
  }
  const empty: TestRecord = { burst: false, height: 0, roundness: 0, flatness: 0, holeDeg: 180, holeSide: null, sync: 0, brightness: 0, lit: 0, planned };
  if (!found) return empty;
  sim.advanceTo(t + 0.04);

  const vs: Dir[] = [];
  const lives: number[] = [];
  let bright = 0;
  let height = 0;
  const mean = [0, 0, 0];
  for (let i = 0; i < p.count; i++) {
    if (!isStar(p.size[i])) continue;
    vs.push([p.vx[i], p.vy[i], p.vz[i]]);
    lives.push(p.life[i]);
    bright += Math.max(p.r[i], p.g[i], p.b[i]);
    height += p.py[i];
    mean[0] += p.vx[i];
    mean[1] += p.vy[i];
    mean[2] += p.vz[i];
  }
  const n = vs.length;
  for (let k = 0; k < 3; k++) mean[k] /= n;
  // 알이 날던 빠르기를 빼고, 별이 퍼지는 빠르기만 본다.
  const cov = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const dirs: Dir[] = [];
  let speedSum = 0;
  for (const v of vs) {
    const d = [v[0] - mean[0], v[1] - mean[1], v[2] - mean[2]];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) cov[r * 3 + c] += (d[r] * d[c]) / n;
    const m = Math.hypot(d[0], d[1], d[2]) || 1;
    dirs.push([d[0] / m, d[1] / m, d[2] / m]);
    speedSum += m;
  }
  // 쏠림: 꼭대기에서 터진 알은 별 빠르기의 평균이 0에 가깝다. 한쪽 별만 세게 날면 평균이 그쪽으로 기운다.
  const lop = (Math.hypot(mean[0], mean[1], mean[2]) / Math.max(1e-9, speedSum / n)) * 1.5;
  const [l0, l1, l2] = eigen3(cov).map((x) => Math.max(1e-9, x));
  const flatness = Math.round(100 * Math.max(0, 1 - Math.sqrt(l0 / l1) * 1.6));
  // 평면 불꽃은 평면 안에서의 둥글기를, 공 불꽃은 세 방향 모두의 둥글기를 본다.
  const roundness = Math.round(100 * Math.sqrt((flatness > 60 ? l1 : l0) / l2) * (1 - Math.min(0.8, lop)));

  let hole = 0;
  let holeAt: Dir = [0, 1, 0];
  if (flatness <= 60) {
    // 빈 자리는 바깥 별로만 잰다 (느린 심 별이 구멍을 가려 주지 않는다).
    const speeds = vs.map((v) => Math.hypot(v[0] - mean[0], v[1] - mean[1], v[2] - mean[2]));
    const fast = [...speeds].sort((x, y) => x - y)[Math.floor(n * 0.9)] * 0.7;
    const outer = dirs.filter((_, i) => speeds[i] >= fast);
    for (const q of evenStars(300)) {
      let best = -1;
      for (const d of outer) best = Math.max(best, q[0] * d[0] + q[1] * d[1] + q[2] * d[2]);
      const a = Math.acos(Math.min(1, best));
      if (a > hole) {
        hole = a;
        holeAt = q;
      }
    }
  }
  const holeDeg = Math.round((hole * 180) / Math.PI);
  const lm = lives.reduce((a, b) => a + b, 0) / n;
  const lsd = Math.sqrt(lives.reduce((a, b) => a + (b - lm) ** 2, 0) / n);
  return {
    burst: true,
    height: Math.round(height / n),
    roundness,
    flatness,
    holeDeg,
    holeSide: holeDeg > 25 ? (holeAt[1] < -0.4 ? 'bottom' : holeAt[1] > 0.4 ? 'top' : 'side') : null,
    sync: Math.round(100 * Math.max(0, 1 - (lsd / lm) * 3.5)),
    brightness: Math.round(Math.min(100, (bright / n) * 100)),
    lit: n,
    planned,
  };
}

const SIDE_LABEL = { top: '위쪽', bottom: '아래쪽', side: '옆쪽' } as const;

/** 시험 결과에서 결함을 찾고, 원인과 고치는 방법을 한 줄씩 붙인다. */
export function diagnose(shell: CustomShell, rec: TestRecord): Defect[] {
  const b: ShellBuild | undefined = shell.build;
  const out: Defect[] = [];
  if (!rec.burst) {
    const a = b?.assembly;
    const cause =
      a && a.seam < 0.6 ? '반구 이음매가 어긋나 압력이 샜습니다' :
      a && a.paste < 0.6 ? '종이를 허술하게 발라 압력이 샜습니다' :
      b && b.paper < 4 ? '종이가 얇아 압력을 버티지 못했습니다' :
      '할약에 불이 제대로 옮겨붙지 않았습니다';
    out.push({ title: '불발', cause, fix: '반구를 정확히 맞붙이고 종이를 꼭꼭 눌러 겹을 늘리세요.' });
    return out;
  }
  const missing = 1 - rec.lit / Math.max(1, rec.planned);
  if (missing > 0.12 && b?.star && b.star.dryHours < 48) {
    out.push({ title: `별 ${Math.round(missing * 100)}%가 불붙지 않음`, cause: `별을 ${b.star.dryHours}시간만 말려 덜 말랐습니다`, fix: '별을 48시간 이상 말리세요.' });
  }
  if (rec.holeDeg > 30 && rec.holeSide) {
    const report = b ? buildReport(b) : null;
    out.push({
      title: `하늘에 ${rec.holeDeg}도짜리 구멍`,
      cause: report && report.largestGap > 25 ? `알 벽에 별 간격이 넓은 곳(${report.largestGap}도)이 있습니다` : `${SIDE_LABEL[rec.holeSide]} 별이 모자랍니다`,
      fix: '반구 그림의 붉은 곳에 별을 붙이거나 「고르게 다시 붙이기」를 누르세요.',
    });
  }
  if (rec.flatness > 60) {
    out.push({
      title: '옆에서 보면 선으로 보임',
      cause: '형상 불꽃은 별이 한 평면에 있어, 보는 방향에 따라 납작해집니다',
      fix: '같은 불꽃을 여러 발 쏘아 하나라도 정면을 보게 하세요.',
    });
  } else if (rec.roundness < 75) {
    const [cause, fix] =
      b?.assembly && b.assembly.chargeOffset > 0.3 ? ['할약이 한쪽으로 치우쳐 그쪽 별만 멀리 날았습니다', '할약을 가운데 고르게 채우세요.'] :
      b && starBias(b.stars) > 0.3 ? ['별이 한쪽에 몰려 붙어 있습니다', '별을 알 벽 전체에 고르게 붙이세요.'] :
      b && b.breakCharge > 0.8 && b.paper < 5 ? ['할약에 비해 종이가 얇아 한쪽으로 찢어지며 찌그러졌습니다', '종이 겹을 할약에 맞게 늘리세요.'] :
      b?.form === 'cylinder' ? ['원통 알은 터지는 압력이 고르지 않습니다', '동그란 모양이 중요하면 둥근 알로 만드세요.'] :
      ['할약이 너무 많거나 종이가 얇아 고르게 터지지 않았습니다', '할약을 줄이거나 종이 겹을 늘리세요.'];
    out.push({ title: `찌그러짐 (둥근 정도 ${rec.roundness})`, cause, fix });
  }
  if (rec.sync < 55) {
    const cause = b?.star?.method === 'cut' ? '자른 별이라 크기가 들쭉날쭉합니다' : '별 크기가 고르지 않습니다';
    out.push({ title: '별이 제각각 꺼짐', cause, fix: '별을 굴리거나 찍어서 크기를 고르게 만드세요.' });
  }
  if (rec.brightness < 45) {
    const blue = shell.layers.some((l) => l.color === 'blue' || l.color === 'purple');
    out.push({
      title: '어두움',
      cause: blue ? '파랑·보라는 뜨거우면 바래고 원래 어둡습니다' : '배합의 밝기가 낮습니다',
      fix: blue ? '색 돕는 성분을 늘리고 연료를 줄여 너무 뜨겁지 않게 하세요.' : '산화제와 연료의 균형을 맞추거나 금속 가루를 조금 넣으세요.',
    });
  }
  if (b && rec.height > 0) {
    const r = buildReport(b);
    if (r.heightRatio < 0.8) out.push({ title: '낮게 터짐', cause: r.timing < -0.5 ? '도화선이 짧아 다 올라가기 전에 터졌습니다' : '발사약이 모자랍니다', fix: '도화선과 발사약을 100% 가까이 맞추세요.' });
  }
  return out;
}
