// 의뢰 모드 채점. 기획안의 점수 항목을 따른다:
// 박자, 빈 하늘, 다양성, 연기·구름, 피날레, 의뢰인 취향, 예산과 조건.

import { SHELLS, isShell, shellSize, typeLabel } from './catalog.ts';
import type { ColorName } from './colors.ts';
import { COLOR_LABEL, colorList, showCost, type Commission, type Rule } from './commission.ts';
import { cueLength, expandShow, isShellLaunch, windVector, type Launch, type Show } from './show.ts';
import { analyzeSmoke } from './smoke.ts';
import { craftReport } from './custom.ts';

export interface ScoreItem {
  key: 'beat' | 'gaps' | 'variety' | 'smoke' | 'finale' | 'taste' | 'rules' | 'craft';
  label: string;
  /** 0~100 */
  score: number;
  /** 총점에서 차지하는 비중 (합 1) */
  weight: number;
  comment: string;
}

export interface RuleResult {
  rule: Rule;
  label: string;
  ok: boolean;
  detail?: string;
}

export interface ScoreResult {
  items: ScoreItem[];
  total: number;
  /** 곡 가운데 하늘에 불꽃이 있던 시간의 비율 (0~1). 낮으면 총점이 깎인다. */
  coverage: number;
  /** 0~3 */
  stars: number;
  cost: number;
  budget: number;
  rules: RuleResult[];
  /** 예산을 크게 넘었거나 조건을 둘 이상 어기면 의뢰 실패 */
  failed: boolean;
  failReason?: string;
  reward: number;
  reputation: number;
}

const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export function ruleLabel(r: Rule): string {
  switch (r.kind) {
    case 'include':
      return `${typeLabel(r.type)} 넣기`;
    case 'frameText':
      return '지상 틀에 글자 띄우기';
    case 'colorsOnly':
      return `${colorList(r.colors)}만 쓰기`;
    case 'endColors':
      return `마지막 ${r.seconds}초는 ${colorList(r.colors)}만`;
    case 'finale':
      return `피날레 ${r.seconds}초 이상 꽉 차게`;
    case 'maxSize':
      return `${r.size}호보다 큰 불꽃 쓰지 않기 (안전거리)`;
  }
}

/** 쇼의 끝: 의뢰 곡 길이 (곡이 없으면 마지막 불꽃) */
function endOf(show: Show, launches: Launch[]): number {
  return show.music?.duration ?? Math.max(0, ...launches.map((l) => l.burstAt + 2));
}

function checkRule(r: Rule, show: Show, launches: Launch[], end: number): RuleResult {
  const label = ruleLabel(r);
  const cues = show.cues;
  const colorsOf = (l: Launch) => l.colors;
  switch (r.kind) {
    case 'include': {
      const ok = cues.some((c) => c.type === r.type);
      return { rule: r, label, ok, detail: ok ? undefined : `${typeLabel(r.type)}이 없습니다.` };
    }
    case 'frameText': {
      const ok = cues.some((c) => c.type === 'lancework' && (c.text ?? '').trim().length > 0);
      return { rule: r, label, ok, detail: ok ? undefined : '지상 틀불꽃이 없습니다.' };
    }
    case 'colorsOnly': {
      const bad = launches.filter((l) => colorsOf(l).some((c) => !r.colors.includes(c)));
      return { rule: r, label, ok: !bad.length, detail: bad.length ? `다른 색을 쓴 불꽃 ${countCues(bad)}개` : undefined };
    }
    case 'endColors': {
      const from = end - r.seconds;
      const bad = launches.filter((l) => l.burstAt >= from && colorsOf(l).some((c) => !r.colors.includes(c)));
      return { rule: r, label, ok: !bad.length, detail: bad.length ? `${fmt(from)} 뒤에 다른 색 불꽃 ${countCues(bad)}개` : undefined };
    }
    case 'finale': {
      const from = end - r.seconds - 2;
      const n = launches.filter((l) => l.burstAt >= from && l.burstAt <= end).length;
      const need = Math.round(r.seconds * 1.5);
      return { rule: r, label, ok: n >= need, detail: n >= need ? undefined : `마지막 ${r.seconds}초에 ${n}발 (${need}발 이상 필요)` };
    }
    case 'maxSize': {
      const bad = cues.filter((c) => isShell(c.type) && c.type !== 'cake' && c.size > r.size);
      return { rule: r, label, ok: !bad.length, detail: bad.length ? `${r.size}호보다 큰 불꽃 ${bad.length}개` : undefined };
    }
  }
}

function countCues(ls: Launch[]): number {
  return new Set(ls.map((l) => l.cueIndex)).size;
}

const clamp = (x: number, a = 0, b = 100) => Math.min(b, Math.max(a, x));

export function scoreShow(show: Show, c: Commission): ScoreResult {
  const { launches } = expandShow(show);
  const end = endOf(show, launches);
  const shells = launches.filter(isShellLaunch);
  const items: ScoreItem[] = [];
  let coverage = 0;

  // 박자: 터지는 순간이 박에 얼마나 붙었는지 (40ms 안이면 만점, 150ms 넘게 어긋나면 0)
  {
    const music = show.music;
    const times = [...new Set(launches.filter((l) => l.sub === 0).map((l) => l.burstAt))];
    let score = 70;
    let comment = '음악이 없어서 박자는 보통으로 칩니다.';
    if (music && times.length) {
      const beat = 60 / music.bpm;
      let sum = 0;
      let onBeat = 0;
      for (const t of times) {
        const k = (t - music.offset) / beat;
        const d = Math.abs(k - Math.round(k)) * beat;
        const s = clamp(1 - (d - 0.04) / 0.11, 0, 1);
        sum += s;
        if (s > 0.8) onBeat++;
      }
      score = (sum / times.length) * 100;
      comment = `박자에 맞은 불꽃 ${onBeat}/${times.length}개.`;
    }
    items.push({ key: 'beat', label: '박자', score, weight: 0.2, comment });
  }

  // 빈 하늘: 5초 넘게 아무것도 없는 구간
  {
    const spans = show.cues
      .map((cue) => [cue.t, cue.t + cueLength(cue)] as const)
      .sort((a, b) => a[0] - b[0]);
    let cursor = 4;
    let worst: [number, number] | null = null;
    let penalty = 0;
    let lit = 0;
    for (const [a, b] of [...spans, [end - 2, end - 2] as const]) {
      if (a - cursor > 5) {
        penalty += (a - cursor - 5) * 12;
        if (!worst || a - cursor > worst[1] - worst[0]) worst = [cursor, a];
      }
      // 하늘에 불꽃이 있던 시간 (겹치는 부분은 한 번만)
      const from = Math.max(a, cursor, 4);
      const to = Math.min(b, end - 2);
      if (to > from) lit += to - from;
      cursor = Math.max(cursor, b);
    }
    coverage = Math.min(1, lit / Math.max(1, end - 6));
    const score = clamp(100 - penalty);
    const comment = `${worst ? `${fmt(worst[0])}~${fmt(worst[1])} 하늘이 비었어요` : '빈 하늘 없이 이어졌어요'}. 곡의 ${Math.round(coverage * 100)}% 동안 불꽃이 떠 있었어요.`;
    items.push({ key: 'gaps', label: '빈 하늘', score, weight: 0.15, comment });
  }

  // 다양성: 종류와 색을 고루 썼는지, 같은 불꽃만 줄줄이 쏘지 않았는지
  {
    const types = new Set(show.cues.map((x) => x.type));
    const colors = new Set(show.cues.flatMap((x) => x.colors ?? ['gold']));
    const sorted = [...show.cues].sort((a, b) => a.t - b.t);
    let run = 1;
    let longest = 1;
    for (let i = 1; i < sorted.length; i++) {
      run = sorted[i].type === sorted[i - 1].type && sorted[i].size === sorted[i - 1].size ? run + 1 : 1;
      longest = Math.max(longest, run);
    }
    const score = clamp(Math.min(1, types.size / 5) * 60 + Math.min(1, colors.size / 4) * 40 - Math.max(0, longest - 6) * 8);
    const comment = `불꽃 ${types.size}종, 색 ${colors.size}가지${longest > 6 ? `. 같은 불꽃이 ${longest}번 이어졌어요` : ''}.`;
    items.push({ key: 'variety', label: '다양성', score, weight: 0.1, comment });
  }

  // 연기·구름: 앞 불꽃 연기에 가렸거나 구름 속에서 터진 불꽃
  {
    const smoke = analyzeSmoke(launches, windVector(show));
    const hidden = shells.filter((l) => smoke.obscured.has(l)).length;
    const cloud = show.venue.cloud;
    const inCloud = cloud ? shells.filter((l) => l.type !== 'cake' && shellSize(l.type, l.size).height > cloud).length : 0;
    const total = Math.max(1, shells.filter((l) => l.type !== 'cake').length);
    const score = clamp(100 - ((hidden + inCloud) / total) * 300);
    const parts = [];
    if (hidden) parts.push(`연기에 가린 불꽃 ${hidden}발${(show.venue.wind?.speed ?? 0) < 1.5 ? ' (바람이 약한 날은 같은 자리에서 연달아 쏘지 마세요)' : ''}`);
    if (inCloud) parts.push(`구름(${cloud}m) 위에서 터진 불꽃 ${inCloud}발`);
    items.push({ key: 'smoke', label: '연기·구름', score, weight: 0.1, comment: parts.length ? `${parts.join(', ')}.` : '가린 불꽃이 없어요.' });
  }

  // 피날레: 마지막 15% 구간이 평균보다 얼마나 촘촘하고 큰지
  {
    const from = end * 0.85;
    const fin = launches.filter((l) => l.burstAt >= from && l.burstAt <= end + 1);
    const avg = launches.length / Math.max(1, end);
    const dens = fin.length / Math.max(1, end - from);
    const big = fin.some((l) => (isShell(l.type) && l.type !== 'cake' && l.size >= 7) || l.type === 'cake' || l.type === 'niagara');
    const ratio = avg > 0 ? dens / avg : 0;
    const score = clamp((Math.min(ratio, 2.5) / 2.5) * 80 + (big ? 20 : 0));
    const comment = !fin.length
      ? '마지막에 터지는 불꽃이 없어요.'
      : `마지막 구간이 평소보다 ${ratio.toFixed(1)}배 촘촘해요${big ? '' : '. 큰 불꽃이나 케이크를 더하면 좋아요'}.`;
    items.push({ key: 'finale', label: '피날레', score, weight: 0.15, comment });
  }

  // 의뢰인 취향: 좋아하는 색 비율과 분위기
  {
    const liked = new Set<ColorName>(c.taste.colors);
    const stars = shells.length || 1;
    const likedShare = shells.filter((l) => l.colors.some((x) => liked.has(x))).length / stars;
    const perMin = (shells.length / Math.max(1, end)) * 60;
    const bigShare = shells.filter((l) => l.size >= 7 && l.type !== 'cake').length / stars;
    const calmShare = shells.filter((l) => SHELLS[l.type].tail === 'willow' || l.type === 'peony' || l.type === 'heart').length / stars;
    const mood = c.taste.style === 'grand'
      ? Math.min(1, perMin / 60) * 0.6 + Math.min(1, bigShare / 0.2) * 0.4
      : Math.min(1, calmShare / 0.4) * 0.6 + (perMin <= 45 ? 0.4 : Math.max(0, 0.4 - (perMin - 45) / 50));
    const score = clamp(Math.min(1, likedShare / 0.5) * 50 + mood * 50);
    const want = c.taste.colors.map((x) => COLOR_LABEL[x]).join('·');
    const comment = `좋아하는 색(${want})이 ${Math.round(likedShare * 100)}%, ${c.taste.style === 'grand' ? '화려함' : '차분함'} ${Math.round(mood * 100)}점.`;
    items.push({ key: 'taste', label: '의뢰인 취향', score, weight: 0.15, comment });
  }

  // 예산과 조건
  const rules = c.rules.map((r) => checkRule(r, show, launches, end));
  const cost = showCost(show);
  const over = cost / c.budget - 1;
  {
    const brokenRules = rules.filter((r) => !r.ok).length;
    const score = clamp(100 - brokenRules * 35 - Math.max(0, over) * 200);
    const comment = [
      `예산 ${cost}/${c.budget}`,
      brokenRules ? `조건 ${brokenRules}개를 지키지 못했어요` : '조건을 모두 지켰어요',
    ].join(', ') + '.';
    items.push({ key: 'rules', label: '예산과 조건', score, weight: 0.15, comment });
  }

  // 불꽃 완성도: 내 불꽃을 장인 모드로 만들어 썼다면, 둥글게 피고 한꺼번에 꺼지고 밝은지 본다.
  {
    const used = [...new Set(show.cues.filter((x) => x.type === 'custom' && x.custom).map((x) => x.custom!))]
      .map((id) => show.customShells?.[id])
      .filter((s): s is NonNullable<typeof s> => !!s?.craft);
    if (used.length) {
      const reports = used.map((s) => ({ name: s.name, r: craftReport(s) }));
      const score = reports.reduce((sum, x) => sum + x.r.quality, 0) / reports.length;
      const worst = [...reports].sort((a, b) => a.r.quality - b.r.quality)[0];
      const comment = `내 불꽃 ${reports.length}종 평균 ${Math.round(score)}점. 「${worst.name}」: 둥근 정도 ${worst.r.roundness}, 한꺼번에 꺼짐 ${worst.r.sync}, 밝기 ${worst.r.brightness}.`;
      // 다른 항목의 비중을 조금씩 줄이고 이 항목에 10%를 준다.
      for (const i of items) i.weight *= 0.9;
      items.push({ key: 'craft', label: '불꽃 완성도', score, weight: 0.1, comment });
    }
  }

  // 곡의 대부분이 비어 있으면 다른 항목이 좋아도 총점을 깎는다 (불꽃 몇 발만 놓고 납품하는 것을 막는다).
  const fill = 0.35 + 0.65 * Math.min(1, coverage / 0.8);
  const total = Math.round(items.reduce((s, i) => s + i.score * i.weight, 0) * fill);
  const broken = rules.filter((r) => !r.ok).length;
  let failReason: string | undefined;
  if (!show.cues.length) failReason = '불꽃이 하나도 없습니다.';
  else if (over > 0.1) failReason = `예산을 ${Math.round(over * 100)}% 넘었습니다.`;
  else if (broken >= 2) failReason = `조건을 ${broken}개 어겼습니다.`;
  const failed = failReason !== undefined;
  const stars = failed ? 0 : total >= 85 ? 3 : total >= 70 ? 2 : total >= 55 ? 1 : 0;
  // 별을 하나도 못 받으면 수고비만 조금 받는다.
  const reward = failed ? 0 : stars === 0 ? Math.round(c.reward * 0.15) : Math.round(c.reward * (0.4 + (0.6 * total) / 100) * (stars === 3 ? 1.2 : 1));
  const reputation = failed ? -5 : [0, 3, 6, 10][stars] + (stars ? c.tier * 2 : 0);

  return { items, total, coverage, stars, cost, budget: c.budget, rules, failed, failReason, reward, reputation };
}
