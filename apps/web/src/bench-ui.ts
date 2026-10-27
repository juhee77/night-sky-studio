// 작업대: 알 하나를 공정 순서대로 손으로 만든다. 슬라이더 없이, 손으로 한 결과만 값이 된다.
// 한 화면에 한 공정. 위의 공정 칩으로 오가고, 시험장에서 결함이 나오면 고칠 공정으로 바로 돌아간다.

import {
  BENCH_STEPS,
  COLORANT_LABEL,
  ROLL_TURNS,
  addStars,
  benchNeed,
  benchToBuild,
  buildToShell,
  cutScore,
  diagnose,
  evaluateMix,
  idealFuseCm,
  idealLiftG,
  joinSeam,
  pumpScore,
  rollScore,
  stirScore,
  testFire,
  type Bench,
  type BenchStep,
  type Colorant,
  type CustomShell,
  type Dir,
  type Ingredient,
  type StarMethod,
} from '@nss/engine';
import { pastePad, pourPad, rollPad } from './handwork.ts';

const DPR = () => Math.min(2, window.devicePixelRatio || 1);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const rgbCss = (rgb: readonly number[]) => `rgb(${rgb.map((v) => Math.round(Math.min(1, v) * 255)).join(',')})`;

function setup(canvas: HTMLCanvasElement): [CanvasRenderingContext2D, number, number] {
  const w = canvas.clientWidth || 300;
  const h = canvas.clientHeight || 200;
  canvas.width = Math.round(w * DPR());
  canvas.height = Math.round(h * DPR());
  const g = canvas.getContext('2d')!;
  g.setTransform(DPR(), 0, 0, DPR(), 0, 0);
  return [g, w, h];
}

const local = (c: HTMLCanvasElement, e: PointerEvent): [number, number] => {
  const r = c.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
};

function capture(c: HTMLCanvasElement, e: PointerEvent): void {
  try {
    c.setPointerCapture(e.pointerId);
  } catch {
    // 손가락이 이미 떨어졌으면 그냥 둔다.
  }
}

const INGREDIENTS: { id: Ingredient; label: string; color: string }[] = [
  { id: 'oxidizer', label: '산화제', color: '#e2a64a' },
  { id: 'fuel', label: '연료', color: '#6d5a48' },
  { id: 'colorant', label: '색 성분', color: '#f472b6' },
  { id: 'helper', label: '색 돕는 성분', color: '#7dd8ee' },
  { id: 'binder', label: '접착제', color: '#9ca3af' },
];

const METHOD_HELP: Record<StarMethod, string> = {
  rolled: `굴림판 가운데 둘레로 원을 그려 굴립니다. ${ROLL_TURNS}바퀴에 별 10알, 원이 고를수록 별이 고릅니다.`,
  pumped: '틀을 눌러 한 알씩 찍습니다. 일정한 박자로 누를수록 별이 고릅니다.',
  cut: '반죽 판을 칼로 가로질러 당깁니다. 한 번에 8알, 곧게 당길수록 별이 고릅니다.',
};

/** 시험장 결함 → 고치러 갈 공정 */
function stepFor(title: string, cause: string): BenchStep {
  if (title.includes('불발')) return cause.includes('종이') ? 'paste' : 'join';
  if (title.includes('불붙지')) return 'dry';
  if (title.includes('구멍') || title.includes('쏠려')) return 'place';
  if (title.includes('찌그러짐')) return cause.includes('몰려') ? 'place' : 'pour';
  if (title.includes('제각각')) return 'stars';
  if (title.includes('어두움')) return 'mix';
  if (title.includes('낮게')) return 'fuse';
  return 'test';
}

export interface BenchHost {
  /** 작업대가 바뀌면 (미리보기·서랍 저장용 설계를 다시 만든다) */
  changed(): void;
  /** 공정을 옮겼다 (이어 만들 수 있게 기억한다) */
  stepped?(step: BenchStep): void;
  shell(): CustomShell;
  save(): void;
}

export class BenchUI {
  private box: Element;
  private b: Bench;
  private host: BenchHost;
  step: BenchStep = 'mix';

  constructor(box: Element, bench: Bench, host: BenchHost, step: BenchStep) {
    this.box = box;
    this.b = bench;
    this.host = host;
    this.step = step;
  }

  /** 작업대 결과로 만든 불꽃 설계 */
  static shellOf(b: Bench, base: CustomShell): CustomShell {
    return buildToShell(benchToBuild(b), base);
  }

  render(): void {
    const done = (s: BenchStep) => s !== 'test' && !benchNeed(this.b, s);
    const chips = BENCH_STEPS.map(
      (s, i) => `<button type="button" data-bench-step="${s.id}" aria-pressed="${this.step === s.id}">${done(s.id) ? '✓ ' : `${i + 1}. `}${s.label}</button>`,
    ).join('');
    const need = benchNeed(this.b, this.step);
    const idx = BENCH_STEPS.findIndex((s) => s.id === this.step);
    this.box.innerHTML = `
      <div class="chips bench-steps">${chips}</div>
      <section class="bench-step">${this.stepHtml()}</section>
      <p class="note bench-need">${need ? `아직: ${esc(need)}` : this.step === 'test' ? '' : '이 공정은 마쳤습니다.'}</p>
      <div class="dialog-actions">
        ${idx > 0 ? '<button type="button" id="bench-prev">이전 공정</button>' : ''}
        ${idx < BENCH_STEPS.length - 1 ? `<button type="button" id="bench-next" class="primary">다음: ${BENCH_STEPS[idx + 1].label}</button>` : ''}
      </div>`;
    this.box.querySelectorAll<HTMLButtonElement>('[data-bench-step]').forEach((b) =>
      b.addEventListener('click', () => this.go(b.dataset.benchStep as BenchStep)),
    );
    this.box.querySelector('#bench-prev')?.addEventListener('click', () => this.go(BENCH_STEPS[idx - 1].id));
    this.box.querySelector('#bench-next')?.addEventListener('click', () => this.go(BENCH_STEPS[idx + 1].id));
    requestAnimationFrame(() => this.wireStep());
  }

  private go(step: BenchStep): void {
    this.step = step;
    this.host.stepped?.(step);
    this.render();
  }

  /** 값이 바뀌면 설계를 다시 만들고, 화면은 다시 그리지 않거나(true면 다시 그림) */
  private changed(rerender = false): void {
    this.host.changed();
    if (rerender) this.render();
    else {
      const need = benchNeed(this.b, this.step);
      const el = this.box.querySelector('.bench-need');
      if (el) el.textContent = need ? `아직: ${need}` : this.step === 'test' ? '' : '이 공정은 마쳤습니다.';
    }
  }

  private stepHtml(): string {
    const b = this.b;
    switch (this.step) {
      case 'mix': {
        const comp = benchToBuild(b).comp;
        const r = comp ? evaluateMix(comp) : null;
        return `
          <h4>배합: 숟가락으로 떠 넣고 저어 섞기</h4>
          <div class="field"><label for="bench-colorant">어떤 색 성분을 쓸까요</label><select id="bench-colorant">${(Object.keys(COLORANT_LABEL) as Colorant[])
            .map((k) => `<option value="${k}" ${b.mix.colorant === k ? 'selected' : ''}>${COLORANT_LABEL[k]}</option>`)
            .join('')}</select></div>
          <div class="chips">${INGREDIENTS.map((it) => `<button type="button" data-scoop="${it.id}"><i class="dot" style="--c:${it.color}"></i>${it.label} 한 숟가락 (${b.mix.scoops[it.id]})</button>`).join('')}
            <button type="button" id="bench-empty">그릇 비우기</button></div>
          <canvas id="bench-bowl" class="hand-canvas" aria-label="배합 그릇. 둘레로 원을 그려 젓습니다"></canvas>
          <p class="note" id="bench-mix-status">저은 고르기 ${Math.round(b.mix.stir * 100)}${r ? ` · 하늘에서 보일 색 <span class="mix-swatch-sm" style="background:${rgbCss(r.rgb)}"></span> 순도 ${Math.round(r.purity * 100)}${r.warnings.length ? ` · ${esc(r.warnings[0])}` : ''}` : ' · 그릇이 비었습니다'}</p>
          <p class="note">산화제를 가장 많이, 연료는 그 절반쯤, 색 성분은 연료만큼이 출발점입니다. 실제 제조 비율이 아니라 게임용 근사입니다.</p>`;
      }
      case 'stars':
        return `
          <h4>별 만들기: 별 상자 ${b.stars.count}알 · 고르기 ${Math.round(b.stars.care * 100)}</h4>
          <div class="field"><span class="label">만드는 방식</span><div class="chips">
            ${(['rolled', 'pumped', 'cut'] as StarMethod[]).map((m) => `<button type="button" data-bench-method="${m}" aria-pressed="${b.stars.method === m}">${{ rolled: '굴리기', pumped: '찍기', cut: '자르기' }[m]}</button>`).join('')}
          </div></div>
          <div class="field"><span class="label">별 크기 (틀·씨앗 고르기)</span><div class="chips">
            ${[9, 12, 16].map((mm) => `<button type="button" data-bench-size="${mm}" aria-pressed="${b.stars.sizeMm === mm}">${mm}mm</button>`).join('')}
          </div></div>
          <p class="note">${METHOD_HELP[b.stars.method]} 방식이나 크기를 바꾸면 이미 만든 별과 섞입니다.</p>
          <canvas id="bench-starpad" class="hand-canvas" aria-label="별 만드는 판"></canvas>
          <p class="note" id="bench-star-status"></p>
          <button type="button" id="bench-stars-reset">별 상자 비우기</button>`;
      case 'dry':
        return `
          <h4>말리기: ${b.dryHours}시간째</h4>
          <canvas id="bench-shelf" class="hand-canvas" aria-label="별을 말리는 선반"></canvas>
          <div class="chips"><button type="button" id="bench-dry">6시간 넘기기</button></div>
          <p class="note">이틀(48시간)은 말려야 모든 별에 불이 붙습니다. 덜 마른 별은 색이 짙고, 하늘에서 일부가 불붙지 않습니다.</p>`;
      case 'place':
        return `
          <h4>별 붙이기: 남은 별 ${b.stars.count - b.placed.length}알 · 붙인 별 ${b.placed.length}알</h4>
          <canvas id="bench-hemi" class="forge-hemi" aria-label="반구 두 개. 끌어서 별을 붙입니다"></canvas>
          <div class="chips">
            <button type="button" data-bench-tool="put" aria-pressed="true">붙이기</button>
            <button type="button" data-bench-tool="take" aria-pressed="false">떼기</button>
            <button type="button" id="bench-unplace">모두 떼기</button>
          </div>
          <p class="note">반구 위를 끌면 별을 한 알씩 붙입니다 (너무 붙여 놓으면 붙지 않습니다). 붉은 곳은 하늘에 구멍이 될 빈 자리입니다. 만든 별보다 많이 붙일 수는 없습니다.</p>`;
      case 'pour':
        return `
          <h4>할약 붓기 ${b.pour ? `(할약 ${Math.round(b.pour.charge * 100)}% · 치우침 ${Math.round(b.pour.offset * 100)}%)` : ''}</h4>
          <canvas id="bench-pour" class="hand-canvas" aria-label="반구에 할약 붓기"></canvas>
          <p id="bench-pour-status" class="note"></p>`;
      case 'join':
        return `
          <h4>반구 맞붙이기 ${b.join ? `(어긋남 ${Math.abs(b.join.angleDeg).toFixed(1)}° · 정확도 ${Math.round(joinSeam(b.join.angleDeg) * 100)})` : ''}</h4>
          <canvas id="bench-join" class="hand-canvas" aria-label="위 반구를 좌우로 끌어 돌려 표시를 맞춥니다"></canvas>
          <div class="chips"><button type="button" id="bench-join-ok" class="primary">이대로 맞붙이기</button></div>
          <p class="note">위 반구를 좌우로 끌어 돌립니다. 위아래 반구의 주황 표시가 한 줄이 되면 맞붙이세요.</p>`;
      case 'paste':
        return `
          <h4>종이 바르기 ${b.paste ? `(${b.paste.layers}겹 · 정성 ${Math.round(b.paste.care * 100)})` : ''}</h4>
          <canvas id="bench-paste" class="hand-canvas" aria-label="반구에 종이 바르기"></canvas>
          <p id="bench-paste-status" class="note"></p>
          <button type="button" id="bench-paste-done" disabled>다 발랐어요</button>`;
      case 'fuse':
        return `
          <h4>도화선 자르기 ${b.fuseCm !== undefined ? `(${b.fuseCm.toFixed(1)}cm)` : ''}</h4>
          <canvas id="bench-fuse" class="hand-canvas fuse-canvas" aria-label="도화선 자를 자리를 누릅니다"></canvas>
          <p class="note">${b.size}호 알은 꼭대기에 닿을 때 터지려면 약 ${idealFuseCm(b.size).toFixed(1)}cm가 알맞습니다. 자를 자리를 누르세요.</p>
          <h4>발사약 달기 ${b.liftG !== undefined ? `(${Math.round(b.liftG)}g)` : ''}</h4>
          <canvas id="bench-lift" class="hand-canvas" aria-label="저울에 발사약 붓기. 길게 누릅니다"></canvas>
          <p class="note" id="bench-lift-status">알맞은 양은 약 ${idealLiftG(b.size)}g입니다. 길게 눌러 저울에 붓고, 떼면 주머니에 담습니다.</p>`;
      case 'test':
        return `
          <h4>시험장</h4>
          <div class="chips"><button type="button" id="bench-fire" class="primary">한 발 쏘아 재 보기</button><button type="button" id="bench-save">서랍에 저장</button></div>
          <div id="bench-test-out"></div>`;
    }
  }

  private fixButton(step: BenchStep): string {
    if (step === 'test') return '';
    return `<button type="button" data-fix="${step}">「${BENCH_STEPS.find((s) => s.id === step)!.label}」 고치러 가기</button>`;
  }

  private wireStep(): void {
    const q = <T extends HTMLElement>(sel: string) => this.box.querySelector<T>(sel);
    const b = this.b;
    switch (this.step) {
      case 'mix': {
        const bowl = q<HTMLCanvasElement>('#bench-bowl')!;
        const pts: [number, number][] = [];
        let down = false;
        let turns = b.mix.stir * 8;
        const draw = () => {
          const [g, w, h] = setup(bowl);
          g.fillStyle = '#1a1424';
          g.fillRect(0, 0, w, h);
          const R = Math.min(w, h) * 0.4;
          g.fillStyle = '#3b3328';
          g.beginPath();
          g.arc(w / 2, h / 2, R, 0, Math.PI * 2);
          g.fill();
          // 성분 층: 덜 저었으면 띠가 보이고, 다 저으면 한 색이 된다
          const total = INGREDIENTS.reduce((s, it) => s + b.mix.scoops[it.id], 0) || 1;
          let a0 = 0;
          for (const it of INGREDIENTS) {
            const share = b.mix.scoops[it.id] / total;
            if (!share) continue;
            g.globalAlpha = 1 - b.mix.stir * 0.8;
            g.fillStyle = it.color;
            g.beginPath();
            g.moveTo(w / 2, h / 2);
            g.arc(w / 2, h / 2, R * 0.92, a0 + turns, a0 + turns + share * Math.PI * 2);
            g.fill();
            a0 += share * Math.PI * 2;
          }
          g.globalAlpha = 1;
          const comp = benchToBuild(b).comp;
          if (comp) {
            g.globalAlpha = b.mix.stir * 0.9;
            g.fillStyle = rgbCss(evaluateMix(comp).rgb.map((v) => v * 0.6));
            g.beginPath();
            g.arc(w / 2, h / 2, R * 0.92, 0, Math.PI * 2);
            g.fill();
            g.globalAlpha = 1;
          }
        };
        bowl.addEventListener('pointerdown', (e) => {
          down = true;
          capture(bowl, e);
          pts.length = 0;
          pts.push(local(bowl, e));
        });
        bowl.addEventListener('pointermove', (e) => {
          if (!down) return;
          pts.push(local(bowl, e));
          const r = rollScore(pts, bowl.clientWidth / 2, bowl.clientHeight / 2);
          const now = b.mix.stir * 8 + r.turns;
          turns = now;
          if (pts.length % 6 === 0) draw();
        });
        bowl.addEventListener('pointerup', () => {
          if (!down) return;
          down = false;
          const r = rollScore(pts, bowl.clientWidth / 2, bowl.clientHeight / 2);
          b.mix.stir = stirScore(b.mix.stir * 8 + r.turns);
          this.changed(true);
        });
        this.box.querySelectorAll<HTMLButtonElement>('[data-scoop]').forEach((btn) =>
          btn.addEventListener('click', () => {
            b.mix.scoops[btn.dataset.scoop as Ingredient]++;
            // 새로 넣으면 다시 저어야 고르게 섞인다
            b.mix.stir = Math.max(0, b.mix.stir - 0.25);
            this.changed(true);
          }),
        );
        q('#bench-empty')!.addEventListener('click', () => {
          b.mix.scoops = { oxidizer: 0, fuel: 0, colorant: 0, helper: 0, binder: 0 };
          b.mix.stir = 0;
          this.changed(true);
        });
        q<HTMLSelectElement>('#bench-colorant')!.addEventListener('change', (e) => {
          b.mix.colorant = (e.target as HTMLSelectElement).value as Colorant;
          this.changed(true);
        });
        draw();
        break;
      }
      case 'stars': {
        this.box.querySelectorAll<HTMLButtonElement>('[data-bench-method]').forEach((btn) =>
          btn.addEventListener('click', () => {
            b.stars.method = btn.dataset.benchMethod as StarMethod;
            this.changed(true);
          }),
        );
        this.box.querySelectorAll<HTMLButtonElement>('[data-bench-size]').forEach((btn) =>
          btn.addEventListener('click', () => {
            b.stars.sizeMm = Number(btn.dataset.benchSize);
            this.changed(true);
          }),
        );
        q('#bench-stars-reset')!.addEventListener('click', () => {
          b.stars.count = 0;
          b.stars.care = 0;
          b.stars.made = {};
          b.placed = [];
          this.changed(true);
        });
        const pad = q<HTMLCanvasElement>('#bench-starpad')!;
        const status = q('#bench-star-status')!;
        if (b.stars.method === 'rolled') {
          rollPad(pad, status, (care) => {
            addStars(b, 10, care);
            this.changed(true);
          });
        } else if (b.stars.method === 'pumped') {
          let last = 0;
          const intervals: number[] = [];
          const draw = (pressed = false) => {
            const [g, w, h] = setup(pad);
            g.fillStyle = '#3b3328';
            g.fillRect(0, 0, w, h);
            g.fillStyle = pressed ? '#f5c451' : '#8b6b4a';
            g.fillRect(w / 2 - 40, h / 2 - (pressed ? 10 : 30), 80, 24);
            g.fillStyle = '#6d5a48';
            g.fillRect(w / 2 - 50, h / 2 + 14, 100, 30);
            g.fillStyle = '#a6a3bd';
            g.font = `12px 'IBM Plex Sans KR', sans-serif`;
            g.textAlign = 'center';
            g.fillText('틀을 눌러 찍기 (일정한 박자로)', w / 2, 18);
          };
          pad.addEventListener('pointerdown', () => {
            const now = performance.now();
            if (last && now - last < 3000) intervals.push(now - last);
            last = now;
            const care = pumpScore(intervals.slice(-8));
            addStars(b, 1, care);
            status.textContent = `찍은 별 ${b.stars.count}알 · 박자 고르기 ${Math.round(care * 100)}`;
            draw(true);
            this.changed();
            const head = this.box.querySelector('.bench-step h4');
            if (head) head.textContent = `별 만들기: 별 상자 ${b.stars.count}알 · 고르기 ${Math.round(b.stars.care * 100)}`;
          });
          pad.addEventListener('pointerup', () => draw(false));
          draw();
        } else {
          let pts: [number, number][] = [];
          let down = false;
          const draw = () => {
            const [g, w, h] = setup(pad);
            g.fillStyle = '#1a1424';
            g.fillRect(0, 0, w, h);
            g.fillStyle = '#6d5a48';
            g.fillRect(20, 30, w - 40, h - 60);
            g.strokeStyle = '#eceaf6';
            g.lineWidth = 2;
            g.beginPath();
            pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
            g.stroke();
          };
          pad.addEventListener('pointerdown', (e) => {
            down = true;
            capture(pad, e);
            pts = [local(pad, e)];
          });
          pad.addEventListener('pointermove', (e) => {
            if (!down) return;
            pts.push(local(pad, e));
            draw();
          });
          pad.addEventListener('pointerup', () => {
            if (!down) return;
            down = false;
            const care = cutScore(pts);
            if (care > 0) {
              addStars(b, 8, care);
              status.textContent = `한 번 잘라 8알 · 칼 곧기 ${Math.round(care * 100)}`;
              this.changed();
              const head = this.box.querySelector('.bench-step h4');
              if (head) head.textContent = `별 만들기: 별 상자 ${b.stars.count}알 · 고르기 ${Math.round(b.stars.care * 100)}`;
            } else status.textContent = '판을 끝에서 끝까지 가로질러 당기세요.';
          });
          draw();
        }
        break;
      }
      case 'dry': {
        const shelf = q<HTMLCanvasElement>('#bench-shelf')!;
        const [g, w, h] = setup(shelf);
        g.fillStyle = '#1a1424';
        g.fillRect(0, 0, w, h);
        const wet = Math.max(0, 1 - b.dryHours / 48);
        const n = Math.min(120, b.stars.count);
        for (let i = 0; i < n; i++) {
          const x = 14 + (i % 20) * ((w - 28) / 19);
          const y = 20 + Math.floor(i / 20) * 22;
          g.fillStyle = `rgb(${Math.round(240 - wet * 150)}, ${Math.round(200 - wet * 130)}, ${Math.round(120 - wet * 70)})`;
          g.beginPath();
          g.arc(x, y, 5, 0, Math.PI * 2);
          g.fill();
        }
        q('#bench-dry')!.addEventListener('click', () => {
          b.dryHours = Math.min(96, b.dryHours + 6);
          this.changed(true);
        });
        break;
      }
      case 'place': {
        const c = q<HTMLCanvasElement>('#bench-hemi')!;
        let tool: 'put' | 'take' = 'put';
        this.box.querySelectorAll<HTMLButtonElement>('[data-bench-tool]').forEach((btn) =>
          btn.addEventListener('click', () => {
            tool = btn.dataset.benchTool as 'put' | 'take';
            this.box.querySelectorAll('[data-bench-tool]').forEach((x) => x.setAttribute('aria-pressed', String(x === btn)));
          }),
        );
        q('#bench-unplace')!.addEventListener('click', () => {
          b.placed = [];
          this.changed(true);
        });
        const geo = () => {
          const w = c.clientWidth;
          const h = c.clientHeight;
          const R = Math.min(w / 4 - 12, h / 2 - 20);
          return { w, h, R, centers: [[w / 4, h / 2 + 6], [(w * 3) / 4, h / 2 + 6]] as [number, number][] };
        };
        const draw = () => {
          const [g, w, h] = setup(c);
          const { R, centers } = geo();
          g.fillStyle = '#0b0c1d';
          g.fillRect(0, 0, w, h);
          centers.forEach(([cx, cy], half) => {
            const up = half === 0;
            g.fillStyle = '#1a1424';
            g.strokeStyle = '#8b6b4a';
            g.lineWidth = 3;
            g.beginPath();
            g.arc(cx, cy, R, 0, Math.PI * 2);
            g.fill();
            g.stroke();
            g.fillStyle = 'rgba(255, 80, 80, 0.28)';
            const step = 7;
            for (let py = -R; py <= R; py += step) {
              for (let px = -R; px <= R; px += step) {
                const x = px / R;
                const z = py / R;
                const rr = x * x + z * z;
                if (rr > 1) continue;
                const y = Math.sqrt(1 - rr) * (up ? 1 : -1);
                let best = -1;
                for (const s of b.placed) best = Math.max(best, s[0] * x + s[1] * y + s[2] * z);
                if (Math.acos(Math.min(1, best)) > 0.42) g.fillRect(cx + px - step / 2, cy + py - step / 2, step, step);
              }
            }
            g.fillStyle = '#f5c451';
            for (const [x, y, z] of b.placed) {
              if (up ? y < 0 : y >= 0) continue;
              g.beginPath();
              g.arc(cx + x * R, cy + z * R, 3.2, 0, Math.PI * 2);
              g.fill();
            }
            g.fillStyle = '#a6a3bd';
            g.font = `12px 'IBM Plex Sans KR', sans-serif`;
            g.textAlign = 'center';
            g.fillText(up ? '위 반구' : '아래 반구', cx, cy - R - 6);
          });
        };
        /** 누른 자리의 반구 방향 (반구 밖이면 null) */
        const dirAt = (e: PointerEvent): Dir | null => {
          const [mx, my] = local(c, e);
          const { R, centers } = geo();
          for (const [half, [cx, cy]] of centers.entries()) {
            const x = (mx - cx) / R;
            const z = (my - cy) / R;
            const rr = x * x + z * z;
            if (rr <= 1) return [x, Math.sqrt(1 - rr) * (half === 0 ? 1 : -1), z];
          }
          return null;
        };
        const act = (e: PointerEvent) => {
          const d = dirAt(e);
          if (!d) return;
          const near = (s: Dir) => s[0] * d[0] + s[1] * d[1] + s[2] * d[2] > Math.cos(0.17);
          if (tool === 'take') {
            const k = b.placed.findIndex(near);
            if (k >= 0) b.placed.splice(k, 1);
          } else if (b.placed.length < b.stars.count && !b.placed.some(near)) {
            b.placed.push(d);
          } else return;
          draw();
          const head = this.box.querySelector('.bench-step h4');
          if (head) head.textContent = `별 붙이기: 남은 별 ${b.stars.count - b.placed.length}알 · 붙인 별 ${b.placed.length}알`;
        };
        let down = false;
        c.addEventListener('pointerdown', (e) => {
          down = true;
          capture(c, e);
          act(e);
        });
        c.addEventListener('pointermove', (e) => down && act(e));
        c.addEventListener('pointerup', () => {
          down = false;
          this.changed();
        });
        draw();
        break;
      }
      case 'pour':
        pourPad(q<HTMLCanvasElement>('#bench-pour')!, q('#bench-pour-status')!, (charge, offset) => {
          b.pour = { charge, offset };
          this.changed(true);
        });
        break;
      case 'join': {
        const c = q<HTMLCanvasElement>('#bench-join')!;
        // 처음에는 아무렇게나 돌아가 있다
        let angle = b.join?.angleDeg ?? 35;
        let startX = 0;
        let start = angle;
        const draw = () => {
          const [g, w, h] = setup(c);
          g.fillStyle = '#1a1424';
          g.fillRect(0, 0, w, h);
          const R = Math.min(w, h) * 0.38;
          const cx = w / 2;
          const cy = h / 2;
          // 아래 반구 (고정)
          g.fillStyle = '#8b6b4a';
          g.beginPath();
          g.arc(cx, cy + 4, R, 0, Math.PI);
          g.fill();
          // 위 반구: 돌린 만큼 표시가 옆으로 간다 (정면에서 본 모습)
          g.beginPath();
          g.arc(cx, cy - 4, R, Math.PI, 0);
          g.fill();
          const mark = (dx: number, y0: number, y1: number) => {
            g.strokeStyle = '#fb923c';
            g.lineWidth = 4;
            g.beginPath();
            g.moveTo(cx + dx, y0);
            g.lineTo(cx + dx, y1);
            g.stroke();
          };
          mark(0, cy + 6, cy + 30);
          mark(Math.sin((angle * Math.PI) / 180) * R, cy - 30, cy - 6);
          g.fillStyle = '#a6a3bd';
          g.font = `12px 'IBM Plex Sans KR', sans-serif`;
          g.textAlign = 'center';
          g.fillText(`어긋남 ${Math.abs(angle).toFixed(1)}°`, cx, h - 8);
        };
        c.addEventListener('pointerdown', (e) => {
          capture(c, e);
          startX = local(c, e)[0];
          start = angle;
        });
        c.addEventListener('pointermove', (e) => {
          if (!e.buttons) return;
          angle = Math.max(-80, Math.min(80, start + (local(c, e)[0] - startX) * 0.35));
          draw();
        });
        q('#bench-join-ok')!.addEventListener('click', () => {
          b.join = { angleDeg: Math.round(angle * 10) / 10 };
          this.changed(true);
        });
        draw();
        break;
      }
      case 'paste':
        pastePad(q<HTMLCanvasElement>('#bench-paste')!, q('#bench-paste-status')!, q<HTMLButtonElement>('#bench-paste-done')!, (layers, care) => {
          b.paste = { layers, care };
          this.changed(true);
        });
        break;
      case 'fuse': {
        const ideal = idealFuseCm(b.size);
        const max = ideal * 1.8;
        const fc = q<HTMLCanvasElement>('#bench-fuse')!;
        let hover = b.fuseCm ?? ideal * 0.5;
        const drawFuse = () => {
          const [g, w, h] = setup(fc);
          g.fillStyle = '#1a1424';
          g.fillRect(0, 0, w, h);
          const x0 = 20;
          const x1 = w - 20;
          const at = (cm: number) => x0 + ((x1 - x0) * cm) / max;
          g.fillStyle = '#c9a36b';
          g.fillRect(x0, h / 2 - 4, x1 - x0, 8);
          g.fillStyle = '#a6a3bd';
          g.font = `11px 'IBM Plex Sans KR', sans-serif`;
          g.textAlign = 'center';
          for (let cm = 0; cm <= max; cm += 2) {
            g.fillRect(at(cm), h / 2 + 8, 1, 6);
            g.fillText(`${cm}`, at(cm), h / 2 + 26);
          }
          g.strokeStyle = '#f87171';
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(at(hover), h / 2 - 22);
          g.lineTo(at(hover), h / 2 + 4);
          g.stroke();
          g.fillText(`${hover.toFixed(1)}cm`, at(hover), h / 2 - 28);
        };
        const cmAt = (e: PointerEvent) => {
          const x = local(fc, e)[0];
          return Math.max(0.5, Math.min(max, ((x - 20) / (fc.clientWidth - 40)) * max));
        };
        fc.addEventListener('pointermove', (e) => {
          hover = cmAt(e);
          drawFuse();
        });
        fc.addEventListener('pointerdown', (e) => {
          b.fuseCm = Math.round(cmAt(e) * 10) / 10;
          this.changed(true);
        });
        drawFuse();
        // 발사약: 길게 눌러 저울에 붓는다 (초당 알맞은 양의 절반)
        const lc = q<HTMLCanvasElement>('#bench-lift')!;
        const status = q('#bench-lift-status')!;
        let t0 = 0;
        let raf = 0;
        const target = idealLiftG(b.size);
        const drawLift = (grams: number) => {
          const [g, w, h] = setup(lc);
          g.fillStyle = '#1a1424';
          g.fillRect(0, 0, w, h);
          g.fillStyle = '#6b6478';
          g.fillRect(w / 2 - 60, h - 30, 120, 10);
          g.fillStyle = '#3a2a1c';
          const pile = Math.min(1.6, grams / target);
          g.beginPath();
          g.moveTo(w / 2 - 50 * pile, h - 30);
          g.lineTo(w / 2, h - 30 - 60 * pile);
          g.lineTo(w / 2 + 50 * pile, h - 30);
          g.fill();
          g.fillStyle = '#eceaf6';
          g.font = `14px 'IBM Plex Mono', monospace`;
          g.textAlign = 'center';
          g.fillText(`${Math.round(grams)}g`, w / 2, h - 6);
        };
        const tick = () => {
          const grams = ((performance.now() - t0) / 1000) * target * 0.5;
          drawLift(grams);
          status.textContent = `${Math.round(grams)}g / 알맞은 양 약 ${target}g`;
          raf = requestAnimationFrame(tick);
        };
        lc.addEventListener('pointerdown', (e) => {
          capture(lc, e);
          t0 = performance.now();
          tick();
        });
        lc.addEventListener('pointerup', () => {
          if (!t0) return;
          cancelAnimationFrame(raf);
          b.liftG = Math.round(((performance.now() - t0) / 1000) * target * 0.5);
          t0 = 0;
          this.changed(true);
        });
        drawLift(b.liftG ?? 0);
        break;
      }
      case 'test': {
        q('#bench-save')!.addEventListener('click', () => this.host.save());
        q('#bench-fire')!.addEventListener('click', () => {
          const out = q('#bench-test-out')!;
          const missing = BENCH_STEPS.filter((s) => s.id !== 'test' && benchNeed(b, s.id));
          const shell = this.host.shell();
          const rec = testFire(shell, Math.floor(Math.random() * 1e6));
          const defects = diagnose(shell, rec);
          out.innerHTML = `
            ${missing.length ? `<p class="note">아직 안 한 공정(${missing.map((s) => s.label).join(', ')})은 서툰 첫 솜씨로 쳤습니다.</p>` : ''}
            ${rec.burst
              ? `<ul class="forge-report">
                  <li><span>둥근 정도</span><b>${rec.roundness}</b></li>
                  <li><span>가장 큰 빈 자리</span><b>${rec.holeDeg}°</b></li>
                  <li><span>같이 꺼짐</span><b>${rec.sync}</b></li>
                  <li><span>밝기</span><b>${rec.brightness}</b></li>
                  <li><span>불붙은 별</span><b>${rec.lit}/${rec.planned}</b></li>
                  <li><span>높이</span><b>${rec.height}m</b></li>
                </ul>`
              : ''}
            ${defects.length
              ? `<ul class="ws-defects">${defects.map((d) => `<li><b>${esc(d.title)}</b><span>${esc(d.cause)} → ${esc(d.fix)}</span>${this.fixButton(stepFor(d.title, d.cause))}</li>`).join('')}</ul>`
              : '<p class="note">결함이 없습니다. 서랍에 저장해 쇼에 쓰세요.</p>'}`;
          out.querySelectorAll<HTMLButtonElement>('[data-fix]').forEach((btn) => btn.addEventListener('click', () => this.go(btn.dataset.fix as BenchStep)));
        });
        break;
      }
    }
  }
}

