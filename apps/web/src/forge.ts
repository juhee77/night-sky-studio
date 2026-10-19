// 제작 공방: 알을 실제 구조로 만든다. 왼쪽에 반으로 자른 단면, 아래에 미리 계산한 결과.
// 별을 붙인 자리가 곧 날아가는 방향이고, 도화선·발사약이 터지는 때와 높이를 정한다.

import {
  COLORANT_LABEL,
  COLORS,
  COLOR_NAMES,
  SIZES,
  defaultComposition,
  evaluateMix,
  isDangerous,
  normalizeComposition,
  type Colorant,
  type Composition,
  SIZE_SPECS,
  STAR_METHOD_LABEL,
  buildReport,
  defaultStarMaking,
  defaultAssembly,
  starCapacity,
  starEffect,
  type StarMaking,
  type StarMethod,
  evenStars,
  type ColorName,
  type Dir,
  type ShellBuild,
  type Size,
  type StarKind,
} from '@nss/engine';

const COLOR_LABEL: Record<ColorName, string> = {
  gold: '금색', white: '흰색', red: '빨강', green: '초록', blue: '파랑', pink: '분홍', cyan: '하늘', purple: '보라',
};
const STAR_LABEL: Record<StarKind, string> = { tail: '꼬리 있는 별', dot: '점 별', glitter: '반짝이는 별', willow: '버들 꼬리' };
const css = (c: ColorName) => `rgb(${COLORS[c].map((v) => Math.round(Math.min(1, v) * 255)).join(',')})`;
const rgbCss = (rgb: readonly number[]) => `rgb(${rgb.map((v) => Math.round(Math.min(1, v) * 255)).join(',')})`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

// 배합 노트: 마음에 든 배합을 이름 붙여 이 기기에 모아 둔다.
const RECIPES = 'nss:recipes';
export function loadRecipes(): Composition[] {
  try {
    return (JSON.parse(localStorage.getItem(RECIPES) ?? '[]') as Composition[]).map(normalizeComposition);
  } catch {
    return [];
  }
}
function saveRecipes(list: Composition[]): void {
  try {
    localStorage.setItem(RECIPES, JSON.stringify(list.slice(0, 30)));
  } catch {
    // 저장하지 못해도 이번 창에서는 쓸 수 있다.
  }
}

// 별 상자: 만들어 둔 별 묶음 (방식·크기·말린 시간·층). 알을 조립할 때 꺼내 쓴다.
const STARBOX = 'nss:starbox';
interface StarBatch extends StarMaking { name: string }
function loadStarBox(): StarBatch[] {
  try {
    return JSON.parse(localStorage.getItem(STARBOX) ?? '[]') as StarBatch[];
  } catch {
    return [];
  }
}
function saveStarBox(list: StarBatch[]): void {
  try {
    localStorage.setItem(STARBOX, JSON.stringify(list.slice(0, 20)));
  } catch {
    // 저장하지 못해도 이번 창에서는 쓸 수 있다.
  }
}

const METHOD_NOTE: Record<StarMethod, string> = {
  rolled: '씨앗 알갱이에 화약을 조금씩 입혀 굴립니다. 둥글고 고르며, 층을 입히기 좋습니다. 오래 걸려 비쌉니다.',
  pumped: '틀에 눌러 찍습니다. 빠르고 모양이 일정합니다.',
  cut: '화약 반죽을 깍둑 썹니다. 싸지만 크기가 들쭉날쭉해 꺼지는 때가 제각각입니다.',
};

function starSection(b: ShellBuild): string {
  const s = b.star;
  if (!s) {
    return `<label class="check-label"><input type="checkbox" id="star-on" /> 별을 직접 만들기</label>
      <p class="note">끄면 알맞게 찍어 잘 말린 보통 별을 씁니다.</p>`;
  }
  const e = starEffect(s);
  const cap = starCapacity(b.size, s.sizeMm);
  const box = loadStarBox();
  const outerColor = b.comp ? evaluateMix(b.comp).color : b.starColor;
  return `
    <label class="check-label"><input type="checkbox" id="star-on" checked /> 별을 직접 만들기</label>
    <canvas id="star-section" class="star-section" aria-label="별 한 알을 자른 단면"></canvas>
    <ul class="forge-report">
      <li><span>고르기</span><b>${Math.round(e.care * 100)}</b></li>
      <li><span>별 수명</span><b>${e.life.toFixed(1)}초</b></li>
      <li><span>불붙지 않는 별</span><b>${Math.round(e.misfire * 100)}%</b></li>
      <li><span>이 알에 들어가는 별</span><b>${cap}알</b></li>
      <li><span>값</span><b>×${e.cost.toFixed(2)}</b></li>
    </ul>
    <div class="field"><span class="label">만드는 방식</span><div class="chips">
      ${(Object.keys(STAR_METHOD_LABEL) as StarMethod[]).map((k) => `<button type="button" data-smethod="${k}" aria-pressed="${s.method === k}">${STAR_METHOD_LABEL[k]}</button>`).join('')}
    </div></div>
    <p class="note">${METHOD_NOTE[s.method]}</p>
    <div class="field"><label for="star-size">별 지름 <output>${s.sizeMm}mm</output></label><input id="star-size" type="range" min="5" max="25" step="1" value="${s.sizeMm}" /></div>
    <div class="field"><label for="star-dry">말린 시간 <output>${s.dryHours}시간</output></label><input id="star-dry" type="range" min="0" max="96" step="6" value="${s.dryHours}" /></div>
    <p class="note">큰 별은 오래 타지만 알에 덜 들어갑니다. 이틀(48시간)은 말려야 모두 불이 붙습니다.</p>
    <label class="check-label"><input type="checkbox" id="star-layer" ${s.inner ? 'checked' : ''} /> 층을 입혀 색이 바뀌는 별</label>
    ${s.inner ? `
      <p class="note">바깥층(${COLOR_LABEL[outerColor]})이 먼저 타고, 다 타면 안층 색으로 바뀝니다.</p>
      <div class="field"><span class="label">안층 색</span><div class="swatches">${COLOR_NAMES.map(
        (k) => `<button type="button" class="swatch" data-icolor="${k}" style="--c:${css(k)}" aria-label="${COLOR_LABEL[k]}" title="${COLOR_LABEL[k]}" aria-pressed="${s.inner!.color === k}"></button>`,
      ).join('')}</div></div>
      <div class="field"><label for="star-outer">바깥층 두께 <output>${Math.round(s.inner.outerShare * 100)}%</output></label><input id="star-outer" type="range" min="0.1" max="0.9" step="0.05" value="${s.inner.outerShare}" /></div>` : ''}
    <div class="field mix-notes">
      <span class="label">별 상자</span>
      <div class="row"><input id="star-name" maxlength="20" value="${esc(STAR_METHOD_LABEL[s.method] + ' ' + s.sizeMm + 'mm')}" aria-label="별 묶음 이름" /><button type="button" id="star-save">상자에 담기</button></div>
      ${box.length ? `<div class="chips">${box.map((x, i) => `<button type="button" data-starbox="${i}">${esc(x.name)}</button>`).join('')}</div>` : '<p class="note">담아 둔 별이 없습니다.</p>'}
    </div>`;
}

/** 별 한 알 단면: 크기, 모양(자른 별은 모남), 층 */
function drawStar(canvas: HTMLCanvasElement, b: ShellBuild): void {
  const s = b.star;
  if (!s) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth || 200;
  const h = canvas.clientHeight || 90;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const g = canvas.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#0b0c1d';
  g.fillRect(0, 0, w, h);
  const outer = b.comp ? rgbCss(evaluateMix(b.comp).rgb) : css(b.starColor);
  const r = 8 + s.sizeMm * 1.3;
  const cx = h / 2 + 8;
  const cy = h / 2;
  const shape = (rad: number) => {
    g.beginPath();
    if (s.method === 'cut') g.rect(cx - rad * 0.85, cy - rad * 0.8, rad * 1.75, rad * 1.6);
    else if (s.method === 'pumped') g.ellipse(cx, cy, rad * 0.9, rad, 0, 0, Math.PI * 2);
    else g.arc(cx, cy, rad, 0, Math.PI * 2);
    g.fill();
  };
  g.fillStyle = outer;
  shape(Math.min(r, h / 2 - 4));
  if (s.inner) {
    g.fillStyle = css(s.inner.color);
    shape(Math.min(r, h / 2 - 4) * (1 - s.inner.outerShare));
  }
  if (s.method === 'rolled') {
    g.fillStyle = '#c9a36b';
    g.beginPath();
    g.arc(cx, cy, 2.2, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#a6a3bd';
  g.font = `12px 'IBM Plex Sans KR', -apple-system, sans-serif`;
  g.textAlign = 'left';
  const x = cx + h / 2 + 6;
  g.fillText(`${STAR_METHOD_LABEL[s.method]} · ${s.sizeMm}mm`, x, cy - 6);
  g.fillText(s.inner ? `바깥층 ${Math.round(s.inner.outerShare * 100)}% → 안층` : s.method === 'rolled' ? '가운데 씨앗 알갱이' : '한 가지 색', x, cy + 12);
}

/** 반구 두 개를 위·아래에서 본 모습. 빈 자리는 붉게 칠한다. */
const HEMI_GAP = (24 * Math.PI) / 180;
function hemiLayout(w: number, h: number) {
  const R = Math.min(w / 4 - 12, h / 2 - 20);
  return { R, centers: [[w / 4, h / 2 + 6], [(w * 3) / 4, h / 2 + 6]] as [number, number][] };
}
function drawHemis(canvas: HTMLCanvasElement, b: ShellBuild): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth || 280;
  const h = canvas.clientHeight || 160;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const g = canvas.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#0b0c1d';
  g.fillRect(0, 0, w, h);
  const { R, centers } = hemiLayout(w, h);
  const color = b.comp ? rgbCss(evaluateMix(b.comp).rgb) : css(b.starColor);
  centers.forEach(([cx, cy], half) => {
    const up = half === 0;
    g.fillStyle = '#1a1424';
    g.strokeStyle = '#8b6b4a';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    // 빈 자리: 가장 가까운 별이 먼 곳
    g.fillStyle = 'rgba(255, 80, 80, 0.28)';
    const step = 6;
    for (let py = -R; py <= R; py += step) {
      for (let px = -R; px <= R; px += step) {
        const x = px / R;
        const z = py / R;
        const rr = x * x + z * z;
        if (rr > 1) continue;
        const y = Math.sqrt(1 - rr) * (up ? 1 : -1);
        let best = -1;
        for (const s of b.stars) best = Math.max(best, s[0] * x + s[1] * y + s[2] * z);
        if (Math.acos(Math.min(1, best)) > HEMI_GAP) g.fillRect(cx + px - step / 2, cy + py - step / 2, step, step);
      }
    }
    g.fillStyle = color;
    for (const [x, y, z] of b.stars) {
      if (up ? y < 0 : y >= 0) continue;
      g.beginPath();
      g.arc(cx + x * R, cy + z * R, 3.2, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#a6a3bd';
    g.font = `12px 'IBM Plex Sans KR', -apple-system, sans-serif`;
    g.textAlign = 'center';
    g.fillText(up ? '위 반구' : '아래 반구', cx, cy - R - 6);
  });
}

/** 반구 그림에서 누른 자리: 가까운 별이 있으면 빼고, 없으면 붙인다. */
function toggleStarAt(canvas: HTMLCanvasElement, ev: MouseEvent, stars: Dir[]): Dir[] | null {
  const rect = canvas.getBoundingClientRect();
  const { R, centers } = hemiLayout(rect.width, rect.height);
  const mx = ev.clientX - rect.left;
  const my = ev.clientY - rect.top;
  for (const [half, [cx, cy]] of centers.entries()) {
    const x = (mx - cx) / R;
    const z = (my - cy) / R;
    const rr = x * x + z * z;
    if (rr > 1) continue;
    const up = half === 0;
    const near = stars.findIndex(([sx, sy, sz]) => (up ? sy >= 0 : sy < 0) && Math.hypot(sx - x, sz - z) * R < 7);
    if (near >= 0) return stars.filter((_, i) => i !== near);
    return [...stars, [x, Math.sqrt(1 - rr) * (up ? 1 : -1), z]];
  }
  return null;
}

const PARTS: [keyof Composition, string, string][] = [
  ['oxidizer', '산화제', '#e2a64a'],
  ['fuel', '연료', '#6d5a48'],
  ['colorantAmount', '색 성분', '#f472b6'],
  ['colorant2Amount', '색 성분 2', '#a78bfa'],
  ['helper', '색 돕는 성분', '#7dd8ee'],
  ['binder', '접착제', '#9ca3af'],
];

function mixSection(c: Composition | undefined, starColor: ColorName): string {
  if (!c) {
    return `<label class="check-label"><input type="checkbox" id="mix-on" /> 화약을 직접 배합하기</label>
      <p class="note">끄면 고른 별 색의 기본 화약을 씁니다.</p>
      <div class="field"><span class="label">별 색</span><div class="swatches">${COLOR_NAMES.map(
        (k) => `<button type="button" class="swatch" data-bcolor="${k}" style="--c:${css(k)}" aria-label="${COLOR_LABEL[k]}" title="${COLOR_LABEL[k]}" aria-pressed="${starColor === k}"></button>`,
      ).join('')}</div></div>`;
  }
  const r = evaluateMix(c);
  const total = PARTS.reduce((s, [k]) => s + (Number(c[k]) || 0), 0) || 1;
  const bar = PARTS.filter(([k]) => Number(c[k]) > 0)
    .map(([k, label, color]) => `<i style="flex:${Number(c[k])};background:${color}" title="${label} ${Math.round((Number(c[k]) / total) * 100)}%"></i>`)
    .join('');
  const colorantOptions = (sel: Colorant | undefined, none: boolean) =>
    (none ? [`<option value="" ${!sel ? 'selected' : ''}>없음</option>`] : [])
      .concat((Object.keys(COLORANT_LABEL) as Colorant[]).map((k) => `<option value="${k}" ${sel === k ? 'selected' : ''}>${COLORANT_LABEL[k]}</option>`))
      .join('');
  const slider = (key: keyof Composition, label: string) =>
    `<div class="field"><label for="mix-${key}">${label} <output>${Math.round(((Number(c[key]) || 0) / total) * 100)}%</output></label><input id="mix-${key}" data-mix="${key}" type="range" min="0" max="80" step="1" value="${Number(c[key]) || 0}" /></div>`;
  const recipes = loadRecipes();
  return `
    <label class="check-label"><input type="checkbox" id="mix-on" checked /> 화약을 직접 배합하기</label>
    <div class="mix-result">
      <span class="mix-swatch" style="background:${rgbCss(r.rgb)};box-shadow:0 0 18px ${rgbCss(r.rgb)}"></span>
      <ul>
        <li><span>하늘에서 보이는 색</span><b>${COLOR_LABEL[r.color]}</b></li>
        <li><span>순도</span><b>${Math.round(r.purity * 100)}</b></li>
        <li><span>밝기</span><b>${Math.round(r.brightness * 100)}</b></li>
        <li><span>타는 빠르기</span><b>${r.burnRate < 0.35 ? '느림 (오래 탐)' : r.burnRate < 0.6 ? '보통' : '빠름 (짧게 탐)'}</b></li>
        <li><span>연기</span><b>${r.smoke < 0.7 ? '적음' : r.smoke < 1.1 ? '보통' : '많음'}</b></li>
        <li><span>값</span><b>×${r.cost.toFixed(2)}</b></li>
      </ul>
    </div>
    <div class="mix-bar" aria-label="성분 비율">${bar}</div>
    ${isDangerous(c) ? '<p class="forge-danger">위험한 배합입니다. 이대로는 서랍에 저장할 수 없습니다.</p>' : ''}
    ${r.warnings.length ? `<ul class="forge-warn">${r.warnings.map((w) => `<li>${w}</li>`).join('')}</ul>` : ''}
    ${slider('oxidizer', '산화제 (불을 돕는 성분)')}
    ${slider('fuel', '연료')}
    <div class="field"><label for="mix-colorant">색 성분</label><select id="mix-colorant">${colorantOptions(c.colorant, false)}</select></div>
    ${slider('colorantAmount', '색 성분 양')}
    <div class="field"><label for="mix-colorant2">두 번째 색 성분 (섞은 색)</label><select id="mix-colorant2">${colorantOptions(c.colorant2, true)}</select></div>
    ${c.colorant2 ? slider('colorant2Amount', '두 번째 색 성분 양') : ''}
    ${slider('helper', '색 돕는 성분 (선명하게, 비쌈)')}
    ${slider('binder', '접착제')}
    <p class="note">실제 불꽃의 큰 원리만 따온 게임용 배합입니다. 파랑은 너무 뜨겁게 타면 하얗게 바래 가장 어렵습니다.</p>
    <div class="field mix-notes">
      <span class="label">배합 노트</span>
      <div class="row"><input id="mix-name" maxlength="20" value="${esc(c.name)}" aria-label="배합 이름" /><button type="button" id="mix-save">이 배합 적어 두기</button></div>
      ${recipes.length ? `<div class="chips">${recipes.map((x, i) => `<button type="button" data-recipe="${i}">${esc(x.name)}</button>`).join('')}</div>` : '<p class="note">적어 둔 배합이 없습니다.</p>'}
    </div>`;
}

/** 알 단면: 종이 겹, 벽을 따라 붙은 별, 할약, 심, 도화선, 발사약 */
export function drawSection(canvas: HTMLCanvasElement, b: ShellBuild): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth || 280;
  const h = canvas.clientHeight || 300;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const g = canvas.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#0b0c1d';
  g.fillRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h * 0.44;
  const R = Math.min(w, h) * 0.36;
  const paper = 2 + b.paper * 1.3;
  const starR = Math.max(3, R * 0.07 * (b.star ? b.star.sizeMm / 12 : 1));
  const label = (text: string, x: number, y: number, align: CanvasTextAlign = 'left') => {
    g.fillStyle = '#a6a3bd';
    g.font = `12px 'IBM Plex Sans KR', -apple-system, sans-serif`;
    g.textAlign = align;
    g.fillText(text, x, y);
  };

  // 발사약 주머니 (알 아래)
  const liftH = 10 + b.lift * 16;
  g.fillStyle = '#3a2a1c';
  g.beginPath();
  g.ellipse(cx, cy + R + liftH / 2 + 2, R * 0.55, liftH / 2, 0, 0, Math.PI * 2);
  g.fill();
  label(`발사약 ${Math.round(b.lift * 100)}%`, cx + R * 0.62, cy + R + liftH / 2 + 6);

  if (b.form === 'round') {
    // 종이 겹 (바깥 고리)
    g.fillStyle = '#8b6b4a';
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1a1424';
    g.beginPath();
    g.arc(cx, cy, R - paper, 0, Math.PI * 2);
    g.fill();
    // 할약: 왕겨에 화약을 입힌 알갱이. 많을수록 촘촘하게
    const inner = R - paper - starR * 2.2;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const grains = Math.round(60 + b.breakCharge * 420);
    g.fillStyle = 'rgba(120, 110, 90, 0.85)';
    for (let i = 0; i < grains; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * inner;
      g.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1.6, 1.6);
    }
    // 심 (안쪽 작은 알)
    if (b.pistil) {
      const pr = inner * 0.42;
      g.strokeStyle = '#8b6b4a';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(cx, cy, pr, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = css(b.pistil.color);
      const n = Math.min(24, Math.round(b.pistil.count / 2));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        g.beginPath();
        g.arc(cx + Math.cos(a) * (pr - 4), cy + Math.sin(a) * (pr - 4), 2.4, 0, Math.PI * 2);
        g.fill();
      }
      label('심', cx, cy + 4, 'center');
    }
    // 바깥 별: 자르는 면(앞뒤 z가 작은 별)은 진하게, 나머지는 흐리게 (뒤쪽 벽에 붙은 별)
    const wall = R - paper - starR;
    const care = b.star ? starEffect(b.star).care : 1;
    const outer = b.comp ? rgbCss(evaluateMix(b.comp).rgb) : css(b.starColor);
    for (const [x, y, z] of [...b.stars].sort((p, q) => Math.abs(q[2]) - Math.abs(p[2]))) {
      const onCut = Math.abs(z) < 0.22;
      // 고르지 않은 별은 크기가 들쭉날쭉하다
      const jitter = 1 + (rnd() - 0.5) * (1 - care) * 0.9;
      const sr = (onCut ? starR : starR * 0.7) * jitter;
      g.globalAlpha = onCut ? 1 : 0.22;
      g.fillStyle = outer;
      g.beginPath();
      if (b.star?.method === 'cut') g.rect(cx + x * wall - sr, cy - y * wall - sr, sr * 2, sr * 2);
      else g.arc(cx + x * wall, cy - y * wall, sr, 0, Math.PI * 2);
      g.fill();
      if (onCut && b.star?.inner) {
        g.fillStyle = css(b.star.inner.color);
        g.beginPath();
        g.arc(cx + x * wall, cy - y * wall, sr * (1 - b.star.inner.outerShare), 0, Math.PI * 2);
        g.fill();
      }
    }
    g.globalAlpha = 1;
    label(`종이 ${b.paper}겹`, cx + R * 0.72, cy - R * 0.92);
  } else {
    // 원통 알: 위아래로 별과 할약 층
    const cw = R * 1.3;
    const ch = R * 1.9;
    g.fillStyle = '#8b6b4a';
    g.fillRect(cx - cw / 2, cy - ch / 2, cw, ch);
    g.fillStyle = '#1a1424';
    g.fillRect(cx - cw / 2 + paper, cy - ch / 2 + paper, cw - paper * 2, ch - paper * 2);
    const rows = 5;
    for (let r = 0; r < rows; r++) {
      const y = cy - ch / 2 + paper + ((r + 0.5) * (ch - paper * 2)) / rows;
      g.fillStyle = 'rgba(120, 110, 90, 0.85)';
      g.fillRect(cx - cw / 2 + paper + 4, y - 3, cw - paper * 2 - 8, 6 * b.breakCharge + 1);
      g.fillStyle = css(b.starColor);
      for (let k = 0; k < 7; k++) {
        g.beginPath();
        g.arc(cx - cw / 2 + paper + 10 + (k * (cw - paper * 2 - 20)) / 6, y - 8, starR * 0.8, 0, Math.PI * 2);
        g.fill();
      }
    }
    label(`종이 ${b.paper}겹`, cx + cw / 2 + 6, cy - ch / 2 + 12);
  }

  // 시한 도화선 (위에서 안으로)
  const fuseLen = R * (0.25 + 0.35 * (b.fuse - 0.6) / 0.9);
  g.fillStyle = '#c9a36b';
  g.fillRect(cx - 2.5, cy - R - 10, 5, fuseLen + 10);
  label(`도화선 ${Math.round(b.fuse * 100)}%`, cx + 8, cy - R - 2);
  label(`할약 ${Math.round(b.breakCharge * 100)}%`, cx - R * 0.98, cy + R * 0.98);
}

/** 공방 조절 칸. change는 구조를 고치고 시험 발사를 다시 한다. */
export function forgeControls(b: ShellBuild): string {
  const swatches = (name: string, selected: ColorName | undefined) =>
    COLOR_NAMES.map(
      (c) =>
        `<button type="button" class="swatch" data-${name}="${c}" style="--c:${css(c)}" aria-label="${COLOR_LABEL[c]}" title="${COLOR_LABEL[c]}" aria-pressed="${selected === c}"></button>`,
    ).join('');
  const r = buildReport(b);
  const spec = SIZE_SPECS[b.size];
  const timing = r.timing === 0 ? '박자에 딱 맞음' : r.timing > 0 ? `박자보다 ${r.timing.toFixed(2)}초 늦게` : `박자보다 ${(-r.timing).toFixed(2)}초 일찍`;
  return `
    <canvas id="forge-section" class="forge-section" aria-label="알을 반으로 자른 단면"></canvas>
    <ul class="forge-report">
      <li><span>지름</span><b>${r.caliberCm}cm (${b.size}호)</b></li>
      <li><span>별 간격 고르기</span><b>${r.evenness}</b></li>
      <li><span>가장 큰 빈 자리</span><b>${r.largestGap}도</b></li>
      <li><span>3D 대칭</span><b>${r.symmetry}</b></li>
      ${b.assembly ? `<li><span>불발 확률</span><b>${(r.dud * 100).toFixed(1)}%</b></li>` : ''}
      <li><span>터지는 높이</span><b>${r.burstHeight}m (크기표 ${spec.height}m)</b></li>
      <li><span>터지는 때</span><b>${timing}${r.pastApex ? ', 떨어지면서' : ''}</b></li>
    </ul>
    ${r.warnings.length ? `<ul class="forge-warn">${r.warnings.map((w) => `<li>${w}</li>`).join('')}</ul>` : ''}

    <fieldset>
      <legend>알</legend>
      <div class="field"><span class="label">형식</span><div class="chips">
        <button type="button" data-form="round" aria-pressed="${b.form === 'round'}">둥근 알 (일본식)</button>
        <button type="button" data-form="cylinder" aria-pressed="${b.form === 'cylinder'}">원통 알 (서양식)</button>
      </div></div>
      <div class="field"><span class="label">크기</span><div class="chips">
        ${SIZES.map((s) => `<button type="button" data-bsize="${s}" aria-pressed="${b.size === s}">${s}호</button>`).join('')}
      </div></div>
    </fieldset>

    <fieldset>
      <legend>바깥 별 (벽을 따라 한 줄)</legend>
      <div class="field"><label for="forge-count">별 수 <output>${b.stars.length}알</output></label><input id="forge-count" type="range" min="24" max="200" step="2" value="${b.stars.length}" /></div>
      <canvas id="forge-hemi" class="forge-hemi" aria-label="반구 두 개에 붙인 별. 별을 누르면 빼고, 빈 곳을 누르면 붙입니다"></canvas>
      <p class="note">별을 누르면 떼고, 빈 곳을 누르면 붙입니다. 붉은 곳은 하늘에 구멍으로 보일 빈 자리입니다.</p>
      <div class="chips">
        <button type="button" data-fill="even">고르게 다시 붙이기</button>
        <button type="button" data-fill="hole">한쪽을 비워 보기</button>
      </div>
      <div class="field"><span class="label">별 종류</span><div class="chips">
        ${(Object.keys(STAR_LABEL) as StarKind[]).map((k) => `<button type="button" data-bkind="${k}" aria-pressed="${b.starKind === k}">${STAR_LABEL[k]}</button>`).join('')}
      </div></div>
    </fieldset>

    <fieldset class="mix">
      <legend>별 화약 배합</legend>
      ${mixSection(b.comp, b.starColor)}
    </fieldset>

    <fieldset>
      <legend>별 만들기</legend>
      ${starSection(b)}
    </fieldset>

    <fieldset>
      <legend>심 (안쪽 작은 알)</legend>
      <label class="check-label"><input type="checkbox" id="forge-pistil" ${b.pistil ? 'checked' : ''} /> 심 넣기</label>
      ${b.pistil ? `
        <div class="field"><label for="forge-pcount">심 별 수 <output>${b.pistil.count}알</output></label><input id="forge-pcount" type="range" min="6" max="80" step="2" value="${b.pistil.count}" /></div>
        <div class="field"><span class="label">심 색</span><div class="swatches">${swatches('pcolor', b.pistil.color)}</div></div>` : ''}
    </fieldset>

    <fieldset>
      <legend>조립 (반구 맞붙이기·종이 바르기)</legend>
      <label class="check-label"><input type="checkbox" id="asm-on" ${b.assembly ? 'checked' : ''} /> 조립을 직접 하기</label>
      ${b.assembly ? `
        <div class="field"><label for="asm-offset">할약 치우침 <output>${Math.round(b.assembly.chargeOffset * 100)}%</output></label><input id="asm-offset" type="range" min="0" max="1" step="0.05" value="${b.assembly.chargeOffset}" /></div>
        <div class="field"><label for="asm-seam">반구 맞붙인 정확도 <output>${Math.round(b.assembly.seam * 100)}%</output></label><input id="asm-seam" type="range" min="0" max="1" step="0.05" value="${b.assembly.seam}" /></div>
        <div class="field"><label for="asm-paste">종이 바르기 정성 <output>${Math.round(b.assembly.paste * 100)}%</output></label><input id="asm-paste" type="range" min="0" max="1" step="0.05" value="${b.assembly.paste}" /></div>
        <p class="note">할약을 가운데 고르게 채워야 별이 사방으로 같은 힘을 받습니다. 이음매가 어긋나거나 종이를 허술하게 바르면 가운데 띠가 흐트러지고 불발이 늘어납니다.</p>` : '<p class="note">끄면 솜씨 좋은 장인이 조립한 것으로 봅니다.</p>'}
    </fieldset>

    <fieldset>
      <legend>할약·종이·도화선·발사약</legend>
      <div class="field"><label for="forge-break">할약 양 <output>${Math.round(b.breakCharge * 100)}%</output></label><input id="forge-break" type="range" min="0" max="1" step="0.05" value="${b.breakCharge}" /></div>
      <div class="field"><label for="forge-paper">종이 겹 수 <output>${b.paper}겹</output></label><input id="forge-paper" type="range" min="2" max="12" step="1" value="${b.paper}" /></div>
      <div class="field"><label for="forge-fuse">도화선 길이 <output>${Math.round(b.fuse * 100)}%</output></label><input id="forge-fuse" type="range" min="0.6" max="1.5" step="0.05" value="${b.fuse}" /></div>
      <div class="field"><label for="forge-lift">발사약 양 <output>${Math.round(b.lift * 100)}%</output></label><input id="forge-lift" type="range" min="0.5" max="1.4" step="0.05" value="${b.lift}" /></div>
      <p class="note">100%가 이 크기에 알맞은 양입니다. 도화선은 꼭대기에 닿는 때에 맞춰야 박자에 맞게 터지고, 발사약이 적으면 낮게 올라갑니다.</p>
    </fieldset>`;
}

/** 조절 칸에 이벤트를 단다. apply는 구조를 고친 뒤 부른다 (rerender면 칸을 다시 그린다). */
export function wireForge(box: Element, b: ShellBuild, apply: (fn: (b: ShellBuild) => void, rerender?: boolean) => void): void {
  const canvas = box.querySelector<HTMLCanvasElement>('#forge-section');
  if (canvas) requestAnimationFrame(() => drawSection(canvas, b));
  const hemi = box.querySelector<HTMLCanvasElement>('#forge-hemi');
  if (hemi) {
    requestAnimationFrame(() => drawHemis(hemi, b));
    hemi.addEventListener('click', (ev) => {
      const next = toggleStarAt(hemi, ev, b.stars);
      if (next) apply((x) => (x.stars = next), true);
    });
  }
  const starCanvas = box.querySelector<HTMLCanvasElement>('#star-section');
  if (starCanvas) requestAnimationFrame(() => drawStar(starCanvas, b));
  const all = (sel: string) => box.querySelectorAll<HTMLButtonElement>(sel);
  const slider = (id: string, fmt: (x: number) => string, fn: (b: ShellBuild, x: number) => void) => {
    const input = box.querySelector<HTMLInputElement>(`#${id}`);
    if (!input) return;
    const out = input.previousElementSibling?.querySelector('output');
    input.addEventListener('input', () => out && (out.textContent = fmt(Number(input.value))));
    input.addEventListener('change', () => apply((x) => fn(x, Number(input.value)), true));
  };
  all('[data-form]').forEach((el) => el.addEventListener('click', () => apply((x) => (x.form = el.dataset.form as ShellBuild['form']), true)));
  all('[data-bsize]').forEach((el) => el.addEventListener('click', () => apply((x) => (x.size = Number(el.dataset.bsize) as Size), true)));
  all('[data-fill]').forEach((el) =>
    el.addEventListener('click', () =>
      apply((x) => {
        const all = evenStars(x.stars.length || 90);
        // 한쪽을 비워 보기: 알 아래쪽 1/3에 별을 붙이지 않은 경우
        x.stars = el.dataset.fill === 'hole' ? all.filter(([, y]) => y > -0.35) : all;
      }, true),
    ),
  );
  slider('forge-count', (v) => `${v}알`, (x, v) => (x.stars = evenStars(v)));
  all('[data-bkind]').forEach((el) => el.addEventListener('click', () => apply((x) => (x.starKind = el.dataset.bkind as StarKind), true)));
  all('[data-bcolor]').forEach((el) => el.addEventListener('click', () => apply((x) => (x.starColor = el.dataset.bcolor as ColorName), true)));
  // 배합
  box.querySelector<HTMLInputElement>('#mix-on')?.addEventListener('change', (e) =>
    apply((x) => {
      if ((e.target as HTMLInputElement).checked) {
        const start: Colorant = (['red', 'green', 'blue', 'gold', 'white'] as Colorant[]).includes(x.starColor as Colorant) ? (x.starColor as Colorant) : 'red';
        x.comp = defaultComposition(start);
      } else {
        if (x.comp) x.starColor = evaluateMix(x.comp).color;
        delete x.comp;
      }
    }, true),
  );
  box.querySelectorAll<HTMLInputElement>('[data-mix]').forEach((input) => {
    const out = input.previousElementSibling?.querySelector('output');
    input.addEventListener('input', () => out && (out.textContent = `${input.value}`));
    input.addEventListener('change', () => apply((x) => x.comp && ((x.comp[input.dataset.mix as 'oxidizer'] as number) = Number(input.value)), true));
  });
  box.querySelector<HTMLSelectElement>('#mix-colorant')?.addEventListener('change', (e) =>
    apply((x) => x.comp && (x.comp.colorant = (e.target as HTMLSelectElement).value as Colorant), true),
  );
  box.querySelector<HTMLSelectElement>('#mix-colorant2')?.addEventListener('change', (e) =>
    apply((x) => {
      if (!x.comp) return;
      const v = (e.target as HTMLSelectElement).value as Colorant | '';
      if (v) {
        x.comp.colorant2 = v;
        x.comp.colorant2Amount ??= 12;
      } else {
        delete x.comp.colorant2;
        delete x.comp.colorant2Amount;
      }
    }, true),
  );
  box.querySelector('#mix-save')?.addEventListener('click', () => {
    if (!b.comp) return;
    const name = box.querySelector<HTMLInputElement>('#mix-name')!.value.trim() || '내 배합';
    const list = loadRecipes().filter((r) => r.name !== name);
    saveRecipes([{ ...b.comp, name }, ...list]);
    apply((x) => x.comp && (x.comp.name = name), true);
  });
  all('[data-recipe]').forEach((el) =>
    el.addEventListener('click', () => {
      const r = loadRecipes()[Number(el.dataset.recipe)];
      if (r) apply((x) => (x.comp = { ...r }), true);
    }),
  );
  // 조립
  box.querySelector<HTMLInputElement>('#asm-on')?.addEventListener('change', (e) =>
    apply((x) => {
      if ((e.target as HTMLInputElement).checked) x.assembly = defaultAssembly();
      else delete x.assembly;
    }, true),
  );
  slider('asm-offset', (v) => `${Math.round(v * 100)}%`, (x, v) => x.assembly && (x.assembly.chargeOffset = v));
  slider('asm-seam', (v) => `${Math.round(v * 100)}%`, (x, v) => x.assembly && (x.assembly.seam = v));
  slider('asm-paste', (v) => `${Math.round(v * 100)}%`, (x, v) => x.assembly && (x.assembly.paste = v));
  // 별 만들기
  box.querySelector<HTMLInputElement>('#star-on')?.addEventListener('change', (e) =>
    apply((x) => {
      if ((e.target as HTMLInputElement).checked) x.star = defaultStarMaking();
      else delete x.star;
    }, true),
  );
  all('[data-smethod]').forEach((el) => el.addEventListener('click', () => apply((x) => x.star && (x.star.method = el.dataset.smethod as StarMethod), true)));
  slider('star-size', (v) => `${v}mm`, (x, v) => x.star && (x.star.sizeMm = v));
  slider('star-dry', (v) => `${v}시간`, (x, v) => x.star && (x.star.dryHours = v));
  box.querySelector<HTMLInputElement>('#star-layer')?.addEventListener('change', (e) =>
    apply((x) => {
      if (!x.star) return;
      if ((e.target as HTMLInputElement).checked) x.star.inner = { color: x.starColor === 'green' ? 'red' : 'green', outerShare: 0.4 };
      else delete x.star.inner;
    }, true),
  );
  all('[data-icolor]').forEach((el) => el.addEventListener('click', () => apply((x) => x.star?.inner && (x.star.inner.color = el.dataset.icolor as ColorName), true)));
  slider('star-outer', (v) => `${Math.round(v * 100)}%`, (x, v) => x.star?.inner && (x.star.inner.outerShare = v));
  box.querySelector('#star-save')?.addEventListener('click', () => {
    if (!b.star) return;
    const name = box.querySelector<HTMLInputElement>('#star-name')!.value.trim() || '내 별';
    saveStarBox([{ ...structuredClone(b.star), name }, ...loadStarBox().filter((x) => x.name !== name)]);
    apply(() => {}, true);
  });
  all('[data-starbox]').forEach((el) =>
    el.addEventListener('click', () => {
      const batch = loadStarBox()[Number(el.dataset.starbox)];
      if (!batch) return;
      const { name: _name, ...star } = batch;
      apply((x) => (x.star = structuredClone(star)), true);
    }),
  );
  box.querySelector<HTMLInputElement>('#forge-pistil')?.addEventListener('change', (e) =>
    apply((x) => (x.pistil = (e.target as HTMLInputElement).checked ? { count: 30, color: 'cyan', kind: 'dot' } : null), true),
  );
  slider('forge-pcount', (v) => `${v}알`, (x, v) => x.pistil && (x.pistil.count = v));
  all('[data-pcolor]').forEach((el) => el.addEventListener('click', () => apply((x) => x.pistil && (x.pistil.color = el.dataset.pcolor as ColorName), true)));
  slider('forge-break', (v) => `${Math.round(v * 100)}%`, (x, v) => (x.breakCharge = v));
  slider('forge-paper', (v) => `${v}겹`, (x, v) => (x.paper = v));
  slider('forge-fuse', (v) => `${Math.round(v * 100)}%`, (x, v) => (x.fuse = v));
  slider('forge-lift', (v) => `${Math.round(v * 100)}%`, (x, v) => (x.lift = v));
}
