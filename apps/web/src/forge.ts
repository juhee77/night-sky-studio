// 제작 공방: 알을 실제 구조로 만든다. 왼쪽에 반으로 자른 단면, 아래에 미리 계산한 결과.
// 별을 붙인 자리가 곧 날아가는 방향이고, 도화선·발사약이 터지는 때와 높이를 정한다.

import {
  COLORS,
  COLOR_NAMES,
  SIZES,
  SIZE_SPECS,
  buildReport,
  evenStars,
  type ColorName,
  type ShellBuild,
  type Size,
  type StarKind,
} from '@nss/engine';

const COLOR_LABEL: Record<ColorName, string> = {
  gold: '금색', white: '흰색', red: '빨강', green: '초록', blue: '파랑', pink: '분홍', cyan: '하늘', purple: '보라',
};
const STAR_LABEL: Record<StarKind, string> = { tail: '꼬리 있는 별', dot: '점 별', glitter: '반짝이는 별', willow: '버들 꼬리' };
const css = (c: ColorName) => `rgb(${COLORS[c].map((v) => Math.round(Math.min(1, v) * 255)).join(',')})`;

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
  const starR = Math.max(3, R * 0.07);
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
    for (const [x, y, z] of [...b.stars].sort((p, q) => Math.abs(q[2]) - Math.abs(p[2]))) {
      const onCut = Math.abs(z) < 0.22;
      g.globalAlpha = onCut ? 1 : 0.22;
      g.fillStyle = css(b.starColor);
      g.beginPath();
      g.arc(cx + x * wall, cy - y * wall, onCut ? starR : starR * 0.7, 0, Math.PI * 2);
      g.fill();
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
      <div class="chips">
        <button type="button" data-fill="even">고르게 다시 붙이기</button>
        <button type="button" data-fill="hole">한쪽을 비워 보기</button>
      </div>
      <div class="field"><span class="label">별 종류</span><div class="chips">
        ${(Object.keys(STAR_LABEL) as StarKind[]).map((k) => `<button type="button" data-bkind="${k}" aria-pressed="${b.starKind === k}">${STAR_LABEL[k]}</button>`).join('')}
      </div></div>
      <div class="field"><span class="label">별 색</span><div class="swatches">${swatches('bcolor', b.starColor)}</div></div>
    </fieldset>

    <fieldset>
      <legend>심 (안쪽 작은 알)</legend>
      <label class="check-label"><input type="checkbox" id="forge-pistil" ${b.pistil ? 'checked' : ''} /> 심 넣기</label>
      ${b.pistil ? `
        <div class="field"><label for="forge-pcount">심 별 수 <output>${b.pistil.count}알</output></label><input id="forge-pcount" type="range" min="6" max="80" step="2" value="${b.pistil.count}" /></div>
        <div class="field"><span class="label">심 색</span><div class="swatches">${swatches('pcolor', b.pistil.color)}</div></div>` : ''}
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
