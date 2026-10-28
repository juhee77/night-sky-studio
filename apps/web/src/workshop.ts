// 불꽃 공작소: 내 불꽃을 설계하는 방.
// 실제 불꽃 알처럼 바깥 층과 심에 별을 채우고, 움직임과 두 번 터지기를 정한 뒤, 시험 발사로 확인한다.

import {
  TAIL_LABEL,
  type TailLength,
  STAR_KIND_LABEL,
  COLORS,
  COLOR_NAMES,
  DEFAULT_CRAFT,
  SHELL_COST,
  buildToShell,
  craftReport,
  defaultBuild,
  isDangerous,
  customLength,
  customStarCount,
  decodeShellCode,
  diagnose,
  testFire,
  type TestRecord,
  encodeShellCode,
  newCustomShell,
  BENCH_STEPS,
  newBench,
  type Bench,
  type ColorName,
  type CustomShell,
  type ShellLayer,
  type Show,
  type StarKind,
} from '@nss/engine';
import { shortId, type Drawer } from './drawer.ts';
import { BenchUI } from './bench-ui.ts';
import { forgeControls, sequenceFields, wireForge, wireSequence } from './forge.ts';
import { progress } from './progress.ts';
import { Stage } from './stage.ts';

const COLOR_LABEL: Record<ColorName, string> = {
  gold: '금색', white: '흰색', red: '빨강', green: '초록', blue: '파랑', pink: '분홍', cyan: '하늘', purple: '보라',
};
const STAR_LABEL = STAR_KIND_LABEL;
const css = (c: ColorName) => `rgb(${COLORS[c].map((v) => Math.round(Math.min(1, v) * 255)).join(',')})`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** 격자 그리기: 13×13 칸. 가운데가 (0, 0) */
const GRID = 13;
const HALF = (GRID - 1) / 2;

/** 시간 차 연출 등 효과 모음: 누르면 그 효과로 설계를 바꾼다 */
/** 꼬리를 남기는 별 종류 (꼬리 길이를 고를 수 있다) */
const TAILED: StarKind[] = ['tail', 'willow', 'brocade', 'kamuro'];

const EFFECTS: Record<string, () => Partial<CustomShell>> = {
  '타임 레인': () => ({
    layers: [{ role: 'outer', shape: { kind: 'sphere', count: 90 }, star: 'dot', color: 'gold', scale: 1, delay: 0, sequence: { order: 'random', span: 2.2, mode: 'sparkle' } }],
    motion: { speed: 0.9, droop: 0.85, life: 2.6, flicker: false },
    chain: undefined,
    split: undefined,
  }),
  '어둡게 날다 하나씩 켜짐': () => ({
    layers: [{ role: 'outer', shape: { kind: 'sphere', count: 110 }, star: 'dot', color: 'cyan', scale: 1, delay: 0, sequence: { order: 'random', span: 1.2, mode: 'light' } }],
    motion: { speed: 1, droop: 0.3, life: 2.2, flicker: false },
    chain: undefined,
    split: undefined,
  }),
  '심 먼저, 바깥은 차례로 작게 터짐 (천륜)': () => ({
    layers: [
      { role: 'outer', shape: { kind: 'sphere', count: 80 }, star: 'dot', color: 'gold', scale: 1, delay: 0, sequence: { order: 'random', span: 1.6, mode: 'pop' } },
      { role: 'pistil', shape: { kind: 'sphere', count: 36 }, star: 'dot', color: 'cyan', scale: 0.45, delay: 0 },
    ],
    motion: { speed: 1, droop: 0.3, life: 2.4, flicker: false },
    chain: undefined,
    split: undefined,
  }),
  '긴 버들 (카무로)': () => ({
    layers: [{ role: 'outer', shape: { kind: 'sphere', count: 70 }, star: 'kamuro', color: 'gold', scale: 1, delay: 0, tail: 'long' }],
    motion: { speed: 0.95, droop: 0.75, life: 6.5, flicker: false },
    chain: undefined,
    split: undefined,
  }),
  '여러 단 터지기': () => ({
    layers: [{ role: 'outer', shape: { kind: 'sphere', count: 120 }, star: 'tail', color: 'red', scale: 1, delay: 0 }],
    motion: { speed: 0.8, droop: 0.3, life: 1.8, flicker: false },
    chain: 3,
    split: undefined,
  }),
  '한 박자 늦은 심': () => ({
    layers: [
      { role: 'outer', shape: { kind: 'sphere', count: 90 }, star: 'tail', color: 'gold', scale: 1, delay: 0 },
      { role: 'pistil', shape: { kind: 'sphere', count: 40 }, star: 'dot', color: 'green', scale: 0.5, delay: 0.6 },
    ],
    motion: { speed: 1, droop: 0.3, life: 2.4, flicker: false },
    chain: undefined,
    split: undefined,
  }),
  토성: () => ({
    layers: [
      { role: 'outer', shape: { kind: 'ring', count: 70 }, star: 'dot', color: 'gold', scale: 1, delay: 0 },
      { role: 'pistil', shape: { kind: 'sphere', count: 60 }, star: 'dot', color: 'blue', scale: 0.5, delay: 0 },
    ],
    motion: { speed: 1, droop: 0.2, life: 2.2, flicker: false },
    chain: undefined,
    split: undefined,
  }),
};

const PRESETS: Record<string, () => [number, number][]> = {
  하트: () => sample((t) => [(16 * Math.sin(t) ** 3) / 17, (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17]),
  별: () => {
    const out: [number, number][] = [];
    for (let k = 0; k < 10; k++) {
      const a = Math.PI / 2 + (k * Math.PI) / 5;
      const b = Math.PI / 2 + ((k + 1) * Math.PI) / 5;
      const ra = k % 2 ? 0.42 : 1;
      const rb = k % 2 ? 1 : 0.42;
      for (let i = 0; i < 4; i++) {
        const f = i / 4;
        out.push([Math.cos(a) * ra * (1 - f) + Math.cos(b) * rb * f, Math.sin(a) * ra * (1 - f) + Math.sin(b) * rb * f]);
      }
    }
    return out;
  },
  원: () => sample((t) => [Math.cos(t), Math.sin(t)]),
  나비: () => sample((t) => {
    const r = Math.exp(Math.sin(t)) - 2 * Math.cos(4 * t) + Math.sin((2 * t - Math.PI) / 24) ** 5;
    return [(r * Math.sin(t)) / 3.2, (r * Math.cos(t)) / 3.2 - 0.15];
  }),
};

function sample(f: (t: number) => [number, number], n = 40): [number, number][] {
  return Array.from({ length: n }, (_, i) => f((i / n) * Math.PI * 2));
}

/** 그린 점들을 격자 칸에 맞춘다. */
function toGrid(pts: [number, number][]): Set<string> {
  return new Set(pts.map(([x, y]) => `${Math.round(x * HALF + HALF)},${Math.round(HALF - y * HALF)}`));
}

function fromGrid(cells: Set<string>): [number, number][] {
  return [...cells].map((k) => {
    const [c, r] = k.split(',').map(Number);
    return [(c - HALF) / HALF, (HALF - r) / HALF];
  });
}

export interface WorkshopHost {
  /** 이 불꽃을 지금 쇼의 '새로 놓을 불꽃'으로 */
  useInShow(id: string): void;
  say(message: string): void;
}

type View = 'front' | 'side' | 'top' | 'wind';

const BENCH_KEY = 'nss:bench';

export class Workshop {
  private dialog: HTMLDialogElement;
  private drawer: Drawer;
  private host: WorkshopHost;
  private shell: CustomShell = newCustomShell(shortId(), '내 불꽃');
  private layer = 0;
  private view: View = 'front';
  /** 빠른 설계(슬라이더), 제작 공방(알 구조), 작업대(처음부터 손으로) */
  private mode: 'quick' | 'build' | 'bench' = 'quick';
  /** 작업대 위의 알 (공작소를 닫아도 남는다) */
  private bench: Bench | null = null;
  private benchStep: BenchUI['step'] = 'mix';
  private stage: Stage | null = null;
  private seed = 3;
  private started = 0;
  /** 시험 기록: 최근 것부터 */
  private tests: { name: string; rec: TestRecord }[] = [];
  private raf = 0;
  private dirty = false;

  constructor(dialog: HTMLDialogElement, drawer: Drawer, host: WorkshopHost) {
    this.dialog = dialog;
    this.drawer = drawer;
    this.host = host;
    dialog.addEventListener('close', () => cancelAnimationFrame(this.raf));
    drawer.on(() => dialog.open && this.renderDrawer());
    // 새 작업 방식(제작 공방·작업대)이 열리면 탭을 다시 그린다.
    progress.on(() => dialog.open && this.renderControls());
    dialog.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) =>
      b.addEventListener('click', () => {
        this.view = b.dataset.view as View;
        dialog.querySelectorAll('[data-view]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        this.refreshPreview();
      }),
    );
    dialog.querySelector('#ws-fire')!.addEventListener('click', () => {
      // 다시 쏠 때마다 모양 불꽃이 향하는 방향이 달라진다 (실제와 같다).
      this.seed = Math.floor(Math.random() * 1e6);
      this.refreshPreview();
    });
    dialog.querySelector('#ws-test')!.addEventListener('click', () => this.runTest());
    dialog.querySelector('#ws-save')!.addEventListener('click', () => this.save());
    dialog.querySelector('#ws-new')!.addEventListener('click', () => {
      // 새 불꽃이면 작업대도 비운다.
      this.bench = null;
      this.benchStep = 'mix';
      this.saveBench();
      this.load(newCustomShell(shortId(), '내 불꽃'));
    });
    this.loadBench();
    dialog.querySelector('#ws-copy')!.addEventListener('click', () => void this.copyCode());
    dialog.querySelector('#ws-import')!.addEventListener('click', () => void this.importCode());
  }

  open(id?: string): void {
    const existing = id ? this.drawer.get(id) : undefined;
    this.load(existing ? structuredClone(existing) : this.shell);
    this.dialog.showModal();
    if (!this.stage) {
      this.stage = new Stage(this.dialog.querySelector<HTMLCanvasElement>('#ws-stage')!, this.previewShow());
    }
    this.refreshPreview();
    this.loop();
  }

  private load(shell: CustomShell): void {
    this.shell = shell;
    this.layer = 0;
    this.mode = shell.build ? 'build' : 'quick';
    this.dirty = false;
    this.renderControls();
    this.renderDrawer();
    this.refreshPreview();
  }

  private previewShow(): Show {
    const s = this.shell;
    return {
      version: 1,
      seed: this.seed,
      venue: { preset: 'river-bridge-city', wind: this.view === 'wind' ? { dir: 270, speed: 6 } : { dir: 250, speed: 0.5 } },
      seat: { id: 'front-near' },
      launchers: [{ id: 'barge-1', kind: 'barge', pos: [0, 0, 0] }],
      cues: [{ t: 4, at: 'barge-1', type: 'custom', custom: s.id, size: s.build?.size ?? 5 }],
      customShells: { [s.id]: s },
    };
  }

  /** 설계가 바뀌면 처음부터 다시 쏜다. */
  private refreshPreview(): void {
    if (!this.stage) return;
    this.stage.load(this.previewShow());
    if (this.view === 'side') this.stage.setOrbit(1.25, 0.18, 620, [0, 170, 0]);
    else if (this.view === 'top') this.stage.setOrbit(0, 1.35, 560, [0, 190, 0]);
    else this.stage.setSeat('front-near');
    this.started = performance.now();
  }

  /** 시험장: 지금 설계를 한 발 쏘아 재고, 결함과 원인을 보여 준다. */
  private runTest(): void {
    const rec = testFire(this.shell, this.seed);
    this.tests = [{ name: this.shell.name, rec }, ...this.tests].slice(0, 5);
    const defects = diagnose(this.shell, rec);
    const pct = (v: number) => `${v}`;
    const row = (t: { name: string; rec: TestRecord }, i: number) => {
      const r = t.rec;
      return `<tr${i === 0 ? ' class="now"' : ''}><td>${esc(t.name)}</td>${
        r.burst
          ? `<td>${pct(r.roundness)}</td><td>${r.holeDeg}°</td><td>${pct(r.sync)}</td><td>${pct(r.brightness)}</td><td>${r.lit}/${r.planned}</td><td>${r.height}m</td>`
          : '<td colspan="6">불발</td>'
      }</tr>`;
    };
    this.dialog.querySelector('#ws-test-out')!.innerHTML = `
      <table class="ws-test-table">
        <thead><tr><th>알</th><th>둥근 정도</th><th>빈 자리</th><th>같이 꺼짐</th><th>밝기</th><th>불붙은 별</th><th>높이</th></tr></thead>
        <tbody>${this.tests.map(row).join('')}</tbody>
      </table>
      ${defects.length
        ? `<ul class="ws-defects">${defects.map((d) => `<li><b>${d.title}</b><span>${d.cause} → ${d.fix}</span></li>`).join('')}</ul>`
        : '<p class="note">결함이 없습니다. 이대로 써도 됩니다.</p>'}`;
  }

  private loop = (): void => {
    if (!this.dialog.open || !this.stage) return;
    // 올라가는 모습은 잠깐만 보여 주고(3.2초부터), 다 사라지면 다시 쏜다.
    const span = 4 + customLength(this.shell) + 1.2 - 3.2;
    const t = 3.2 + (((performance.now() - this.started) / 1000) % span);
    this.stage.render(t, true);
    this.raf = requestAnimationFrame(this.loop);
  };

  private change(fn: (s: CustomShell) => void, rerender = false): void {
    fn(this.shell);
    this.dirty = true;
    if (rerender) this.renderControls();
    this.updateCount();
    this.refreshPreview();
  }

  private get cur(): ShellLayer {
    return this.shell.layers[Math.min(this.layer, this.shell.layers.length - 1)];
  }

  private updateCount(): void {
    const el = this.dialog.querySelector('#ws-count');
    if (el) el.textContent = `별 ${customStarCount(this.shell)}개 · 보이는 시간 ${customLength(this.shell).toFixed(1)}초`;
    this.updateReport();
  }

  /** 품평: 둥근 정도, 한꺼번에 꺼짐, 밝기, 심 선명도, 한 발 값 */
  private updateReport(): void {
    const box = this.dialog.querySelector('#ws-report');
    if (!box) return;
    if (!this.shell.craft) {
      box.innerHTML = '';
      return;
    }
    const r = craftReport(this.shell);
    const row = (label: string, v: number, hint: string) =>
      `<li><span>${label}</span><span class="meter"><i style="width:${v}%"></i></span><span class="num">${v}</span><p class="note">${hint}</p></li>`;
    box.innerHTML = `
      <h4>품평</h4>
      <ul class="score-items">
        ${row('둥근 정도', r.roundness, r.roundness < 60 ? '할약이 많거나 종이가 얇아 한쪽으로 눌려 핍니다.' : '고르게 동그랗게 핍니다.')}
        ${row('한꺼번에 꺼짐', r.sync, r.sync < 60 ? '별마다 타는 시간이 들쭉날쭉합니다. 별을 더 다듬으세요.' : '별들이 거의 같이 꺼집니다.')}
        ${row('밝기', r.brightness, r.brightness < 80 ? '파랑·보라는 고급 배합이 아니면 어둡게 나옵니다.' : '색이 제대로 밝습니다.')}
        ${this.shell.layers.length > 1 ? row('심 선명도', r.pistil, '심 색이 바깥 층과 다르고 늦지 않게 피면 또렷합니다.') : ''}
      </ul>
      <p class="note">5호 한 발 값 ${(SHELL_COST[5] * 0.8 * r.cost).toFixed(1)} (기본 불꽃 ${SHELL_COST[5]}). 의뢰에 쓰면 채점에 「불꽃 완성도」가 붙습니다.</p>`;
  }

  private renderControls(): void {
    const box = this.dialog.querySelector('.ws-controls')!;
    const tabs = `
      <div class="ws-tabs ws-mode" role="tablist" aria-label="만드는 방식">
        <button type="button" role="tab" data-mode="quick" aria-selected="${this.mode === 'quick'}">빠른 설계</button>
        ${progress.can('build') || this.mode === 'build' ? `<button type="button" role="tab" data-mode="build" aria-selected="${this.mode === 'build'}">제작 공방</button>` : ''}
        ${progress.can('bench') || this.mode === 'bench' ? `<button type="button" role="tab" data-mode="bench" aria-selected="${this.mode === 'bench'}">작업대</button>` : ''}
      </div>
      ${progress.can('build') ? '' : '<p class="note">의뢰를 하나 납품하면 알 속에 별을 직접 붙이는 「제작 공방」이 열립니다.</p>'}`;
    if (this.mode === 'bench') {
      const bench = (this.bench ??= newBench());
      box.innerHTML = `${tabs}
        <div class="field"><label for="ws-name">이름</label><input id="ws-name" maxlength="16" value="${esc(this.shell.name)}" /></div>
        <p class="note">배합부터 시험장까지 손으로 만듭니다. 슬라이더가 없고, 손으로 한 결과만 알에 들어갑니다.</p>
        <div class="bench"></div>
        <p id="ws-count" class="note"></p>`;
      this.wireMode(box);
      box.querySelector<HTMLInputElement>('#ws-name')!.addEventListener('input', (e) => {
        this.shell.name = (e.target as HTMLInputElement).value.slice(0, 16);
        this.dirty = true;
      });
      const ui = new BenchUI(box.querySelector('.bench')!, bench, {
        changed: () => {
          this.benchStep = ui.step;
          this.shell = BenchUI.shellOf(bench, this.shell);
          this.dirty = true;
          this.saveBench();
          this.updateCount();
          this.refreshPreview();
        },
        stepped: (step) => {
          this.benchStep = step;
          this.saveBench();
        },
        shell: () => this.shell,
        save: () => this.save(),
      }, this.benchStep);
      ui.render();
      this.updateCount();
      return;
    }
    if (this.mode === 'build') {
      const b = (this.shell.build ??= defaultBuild());
      box.innerHTML = `${tabs}
        <div class="field"><label for="ws-name">이름</label><input id="ws-name" maxlength="16" value="${esc(this.shell.name)}" /></div>
        <p class="note">실제 불꽃 알처럼 종이 반구 안쪽 벽에 별을 붙이고, 가운데에 할약을 채우고, 도화선과 발사약을 답니다. 별을 붙인 자리가 곧 날아가는 방향이라 빈 곳은 하늘에도 빕니다.</p>
        ${forgeControls(b)}
        <p id="ws-count" class="note"></p>`;
      this.wireMode(box);
      box.querySelector<HTMLInputElement>('#ws-name')!.addEventListener('input', (e) => {
        this.shell.name = (e.target as HTMLInputElement).value.slice(0, 16);
        this.dirty = true;
      });
      wireForge(box, b, (fn, rerender) => {
        fn(b);
        this.shell = buildToShell(b, this.shell);
        this.dirty = true;
        if (rerender) this.renderControls();
        this.refreshPreview();
      });
      this.updateCount();
      return;
    }
    this.renderQuick(box, tabs);
  }

  private wireMode(box: Element): void {
    box.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) =>
      b.addEventListener('click', () => {
        const mode = b.dataset.mode as 'quick' | 'build' | 'bench';
        if (mode === this.mode) return;
        this.mode = mode;
        if (mode === 'bench') {
          this.shell = BenchUI.shellOf((this.bench ??= newBench()), this.shell);
        } else if (mode === 'build') {
          // 지금 설계의 색과 별 종류로 알을 하나 만든다.
          const outer = this.shell.layers[0];
          const b0 = this.shell.build ?? { ...defaultBuild(), starColor: outer.color, starKind: outer.star };
          this.shell = buildToShell(b0, this.shell);
        } else {
          // 빠른 설계로 돌아가면 알 구조와 비행은 버리고 슬라이더로 다룬다.
          delete this.shell.build;
          delete this.shell.flight;
          this.shell.layers = this.shell.layers.map((l) => (l.shape.kind === 'dirs' ? { ...l, shape: { kind: 'sphere', count: l.shape.dirs.length } } : l));
        }
        this.dirty = true;
        this.renderControls();
        this.refreshPreview();
      }),
    );
  }

  private renderQuick(box: Element, tabs: string): void {
    const s = this.shell;
    const L = this.cur;
    const hasPistil = s.layers.length > 1;
    const shapeKind = L.shape.kind;
    const swatches = (name: string, selected: ColorName) =>
      COLOR_NAMES.map(
        (c) =>
          `<button type="button" class="swatch" data-${name}="${c}" style="--c:${css(c)}" aria-label="${COLOR_LABEL[c]}" title="${COLOR_LABEL[c]}" aria-pressed="${selected === c}"></button>`,
      ).join('');
    box.innerHTML = `${tabs}
      <div class="field"><label for="ws-name">이름</label><input id="ws-name" maxlength="16" value="${esc(s.name)}" /></div>
      <p id="ws-count" class="note"></p>
      <div class="field"><span class="label">효과 모음 (눌러서 시작하기)</span><div class="chips">
        ${Object.keys(EFFECTS).map((k) => `<button type="button" data-effect="${k}">${k}</button>`).join('')}
      </div></div>

      <div class="ws-tabs">
        <span class="ws-tabs" role="tablist" aria-label="층">
          <button type="button" role="tab" data-layer="0" aria-selected="${this.layer === 0}">바깥 층</button>
          <button type="button" role="tab" data-layer="1" aria-selected="${this.layer === 1}" ${hasPistil ? '' : 'disabled'}>심(芯)</button>
        </span>
        <label class="check-label"><input type="checkbox" id="ws-pistil" ${hasPistil ? 'checked' : ''} /> 심 넣기</label>
      </div>

      <fieldset class="ws-layer">
        <div class="field"><span class="label">모양</span><div class="chips">
          ${(['sphere', 'ring', 'points'] as const).map((k) => `<button type="button" data-shape="${k}" aria-pressed="${shapeKind === k}">${{ sphere: '둥근 공', ring: '고리', points: '직접 그리기' }[k]}</button>`).join('')}
        </div></div>
        ${shapeKind === 'points'
          ? `<div class="field">
              <span class="label">별을 놓을 자리 (누르거나 끌어서 칠하기)</span>
              <canvas id="ws-grid" class="ws-grid" width="260" height="260"></canvas>
              <div class="chips">${Object.keys(PRESETS).map((k) => `<button type="button" data-preset="${k}">${k}</button>`).join('')}<button type="button" data-preset="">지우기</button></div>
              <p class="note">하늘 불꽃은 단순한 모양까지만 잘 보입니다. 터질 때마다 향하는 방향이 달라서 옆에서는 납작한 선으로 보입니다. 글자는 지상 틀불꽃으로 띄우세요.</p>
            </div>`
          : `<div class="field"><label for="ws-stars">별 개수 <output>${(L.shape as { count: number }).count}개</output></label><input id="ws-stars" type="range" min="12" max="200" step="2" value="${(L.shape as { count: number }).count}" /></div>`}
        ${this.layer === 1 ? `<div class="field"><label for="ws-scale">크기 <output>${Math.round(L.scale * 100)}%</output></label><input id="ws-scale" type="range" min="0.2" max="0.9" step="0.05" value="${L.scale}" /></div>
          <div class="field"><label for="ws-delay">늦게 피기 <output>${L.delay.toFixed(2)}초</output></label><input id="ws-delay" type="range" min="0" max="1" step="0.05" value="${L.delay}" /></div>` : ''}
        <div class="field"><span class="label">별 종류</span><div class="chips">
          ${(Object.keys(STAR_LABEL) as StarKind[]).map((k) => `<button type="button" data-star="${k}" aria-pressed="${L.star === k}">${STAR_LABEL[k]}</button>`).join('')}
        </div></div>
        ${TAILED.includes(L.star) ? `<div class="field"><span class="label">꼬리 길이</span><div class="chips">
          ${(Object.keys(TAIL_LABEL) as TailLength[]).map((k) => `<button type="button" data-tail="${k}" aria-pressed="${(L.tail ?? 'normal') === k}">${TAIL_LABEL[k]}</button>`).join('')}
        </div></div>` : ''}
        <div class="field"><span class="label">색</span><div class="swatches">${swatches('color', L.color)}</div></div>
        ${sequenceFields(L.sequence)}
        <div class="field">
          <label class="check-label"><input type="checkbox" id="ws-then" ${L.then ? 'checked' : ''} /> 색이 바뀌는 별</label>
          ${L.then ? `<div class="swatches">${swatches('then', L.then.color)}</div>
            <label for="ws-then-at">바뀌는 때 <output>수명의 ${Math.round(L.then.at * 100)}%</output></label>
            <input id="ws-then-at" type="range" min="0.1" max="0.9" step="0.05" value="${L.then.at}" />` : ''}
        </div>
      </fieldset>

      <fieldset class="ws-motion">
        <legend>움직임</legend>
        <div class="field"><label for="ws-speed">퍼지는 크기 <output>${Math.round(s.motion.speed * 100)}%</output></label><input id="ws-speed" type="range" min="0.5" max="1.5" step="0.05" value="${s.motion.speed}" /></div>
        <div class="field"><label for="ws-droop">아래로 늘어짐 <output>${Math.round(s.motion.droop * 100)}%</output></label><input id="ws-droop" type="range" min="0" max="1" step="0.05" value="${s.motion.droop}" /></div>
        <div class="field"><label for="ws-life">사라지는 시간 <output>${s.motion.life.toFixed(1)}초</output></label><input id="ws-life" type="range" min="0.8" max="8" step="0.1" value="${s.motion.life}" /></div>
        <label class="check-label"><input type="checkbox" id="ws-flicker" ${s.motion.flicker ? 'checked' : ''} /> 깜빡이며 사라지기</label>
        <div class="field"><label for="ws-chain">여러 단 터지기 <output>${s.chain ?? 1}단</output></label><input id="ws-chain" type="range" min="1" max="4" step="1" value="${s.chain ?? 1}" /></div>
        <div class="field">
          <label for="ws-split">두 번 터지기</label>
          <select id="ws-split">
            <option value="" ${!s.split ? 'selected' : ''}>없음</option>
            <option value="crossette" ${s.split?.into === 'crossette' ? 'selected' : ''}>십자로 갈라지기</option>
            <option value="burst" ${s.split?.into === 'burst' ? 'selected' : ''}>작은 불꽃으로 한 번 더</option>
          </select>
          ${s.split ? `<label for="ws-split-at">갈라지는 때 <output>${s.split.after.toFixed(1)}초 뒤</output></label><input id="ws-split-at" type="range" min="0.4" max="3" step="0.1" value="${s.split.after}" />` : ''}
        </div>
      </fieldset>

      <fieldset class="ws-craft">
        <legend>장인 모드</legend>
        <label class="check-label"><input type="checkbox" id="ws-craft" ${s.craft ? 'checked' : ''} /> 실제처럼 만들기</label>
        <p class="note">켜면 별 크기, 할약 양, 종이 겹 수, 별 다듬기, 배합을 직접 정합니다. 서로 맞바꾸는 관계라서 모든 것을 다 좋게 만들 수는 없습니다. 끄면 늘 이상적으로 터집니다.</p>
        ${s.craft ? `
          <div class="field"><span class="label">별 크기</span><div class="chips">
            ${(['small', 'medium', 'large'] as const).map((k) => `<button type="button" data-starsize="${k}" aria-pressed="${s.craft!.starSize === k}">${{ small: '작게 (별 많음, 짧게)', medium: '보통', large: '크게 (오래 밝게, 별 적음)' }[k]}</button>`).join('')}
          </div></div>
          <div class="field"><label for="ws-break">할약 양 <output>${Math.round(s.craft.breakCharge * 100)}%</output></label><input id="ws-break" type="range" min="0" max="1" step="0.05" value="${s.craft.breakCharge}" /></div>
          <div class="field"><label for="ws-paper">종이 겹 수 <output>${s.craft.paper}겹</output></label><input id="ws-paper" type="range" min="2" max="12" step="1" value="${s.craft.paper}" /></div>
          <div class="field"><label for="ws-care">별 다듬기 <output>${Math.round(s.craft.care * 100)}%</output></label><input id="ws-care" type="range" min="0" max="1" step="0.05" value="${s.craft.care}" /></div>
          <label class="check-label"><input type="checkbox" id="ws-premium" ${s.craft.premium ? 'checked' : ''} /> 고급 배합 (파랑·보라를 밝게, 비쌈)</label>` : ''}
        <div id="ws-report"></div>
      </fieldset>`;
    this.updateCount();
    this.wireMode(box);
    this.wire(box);
  }

  private wire(box: Element): void {
    const q = <T extends Element>(sel: string) => box.querySelector<T>(sel);
    const all = (sel: string) => box.querySelectorAll<HTMLButtonElement>(sel);
    const slider = (id: string, fmt: (x: number) => string, apply: (x: number) => void) => {
      const input = q<HTMLInputElement>(`#${id}`);
      if (!input) return;
      const out = input.previousElementSibling?.querySelector('output');
      input.addEventListener('input', () => out && (out.textContent = fmt(Number(input.value))));
      input.addEventListener('change', () => this.change(() => apply(Number(input.value))));
    };

    q<HTMLInputElement>('#ws-name')!.addEventListener('input', (e) => {
      this.shell.name = (e.target as HTMLInputElement).value.slice(0, 16);
      this.dirty = true;
    });
    all('[data-layer]').forEach((b) =>
      b.addEventListener('click', () => {
        this.layer = Number(b.dataset.layer);
        this.renderControls();
      }),
    );
    q<HTMLInputElement>('#ws-pistil')!.addEventListener('change', (e) => {
      const on = (e.target as HTMLInputElement).checked;
      this.change((s) => {
        if (on && s.layers.length < 2) s.layers.push({ role: 'pistil', shape: { kind: 'sphere', count: 30 }, star: 'dot', color: 'gold', scale: 0.45, delay: 0.15 });
        if (!on) s.layers = s.layers.slice(0, 1);
      });
      this.layer = on ? 1 : 0;
      this.renderControls();
    });
    all('[data-shape]').forEach((b) =>
      b.addEventListener('click', () => {
        const kind = b.dataset.shape as 'sphere' | 'ring' | 'points';
        this.change(() => {
          const cur = this.cur.shape;
          const count = cur.kind === 'sphere' || cur.kind === 'ring' ? cur.count : cur.kind === 'dirs' ? cur.dirs.length : 60;
          this.cur.shape = kind === 'points' ? { kind, pts: PRESETS['하트']() } : { kind, count };
        }, true);
      }),
    );
    slider('ws-stars', (x) => `${x}개`, (x) => {
      const cur = this.cur.shape;
      if (cur.kind === 'sphere' || cur.kind === 'ring') cur.count = x;
    });
    slider('ws-scale', (x) => `${Math.round(x * 100)}%`, (x) => (this.cur.scale = x));
    slider('ws-delay', (x) => `${x.toFixed(2)}초`, (x) => (this.cur.delay = x));
    all('[data-star]').forEach((b) => b.addEventListener('click', () => this.change(() => (this.cur.star = b.dataset.star as StarKind), true)));
    all('[data-tail]').forEach((b) =>
      b.addEventListener('click', () =>
        this.change(() => {
          const t = b.dataset.tail as TailLength;
          if (t === 'normal') delete this.cur.tail;
          else this.cur.tail = t;
        }, true),
      ),
    );
    all('[data-color]').forEach((b) => b.addEventListener('click', () => this.change(() => (this.cur.color = b.dataset.color as ColorName), true)));
    all('[data-then]').forEach((b) =>
      b.addEventListener('click', () => this.change(() => (this.cur.then = { color: b.dataset.then as ColorName, at: this.cur.then?.at ?? 0.6 }), true)),
    );
    q<HTMLInputElement>('#ws-then')!.addEventListener('change', (e) =>
      this.change(() => {
        if ((e.target as HTMLInputElement).checked) this.cur.then = { color: 'white', at: 0.6 };
        else delete this.cur.then;
      }, true),
    );
    slider('ws-then-at', (x) => `수명의 ${Math.round(x * 100)}%`, (x) => this.cur.then && (this.cur.then.at = x));
    slider('ws-speed', (x) => `${Math.round(x * 100)}%`, (x) => (this.shell.motion.speed = x));
    slider('ws-droop', (x) => `${Math.round(x * 100)}%`, (x) => (this.shell.motion.droop = x));
    slider('ws-life', (x) => `${x.toFixed(1)}초`, (x) => (this.shell.motion.life = x));
    q<HTMLInputElement>('#ws-flicker')!.addEventListener('change', (e) =>
      this.change((s) => (s.motion.flicker = (e.target as HTMLInputElement).checked)),
    );
    q<HTMLSelectElement>('#ws-split')!.addEventListener('change', (e) => {
      const v = (e.target as HTMLSelectElement).value;
      this.change((s) => {
        if (!v) delete s.split;
        else s.split = { after: s.split?.after ?? 1.1, into: v as 'crossette' | 'burst' };
      }, true);
    });
    slider('ws-chain', (x) => `${x}단`, (x) => (x > 1 ? (this.shell.chain = x) : delete this.shell.chain));
    wireSequence(box, (fn) =>
      this.change(() => {
        const next = fn(this.cur.sequence);
        if (next) this.cur.sequence = next;
        else delete this.cur.sequence;
      }, true),
    );
    all('[data-effect]').forEach((b) =>
      b.addEventListener('click', () =>
        this.change((s) => {
          const name = s.name;
          Object.assign(s, EFFECTS[b.dataset.effect!](), { id: s.id, name });
          this.layer = 0;
        }, true),
      ),
    );
    slider('ws-split-at', (x) => `${x.toFixed(1)}초 뒤`, (x) => this.shell.split && (this.shell.split.after = x));

    q<HTMLInputElement>('#ws-craft')!.addEventListener('change', (e) =>
      this.change((s) => {
        if ((e.target as HTMLInputElement).checked) s.craft = { ...DEFAULT_CRAFT };
        else delete s.craft;
      }, true),
    );
    all('[data-starsize]').forEach((b) =>
      b.addEventListener('click', () => this.change((s) => s.craft && (s.craft.starSize = b.dataset.starsize as 'small' | 'medium' | 'large'), true)),
    );
    slider('ws-break', (x) => `${Math.round(x * 100)}%`, (x) => this.shell.craft && (this.shell.craft.breakCharge = x));
    slider('ws-paper', (x) => `${x}겹`, (x) => this.shell.craft && (this.shell.craft.paper = x));
    slider('ws-care', (x) => `${Math.round(x * 100)}%`, (x) => this.shell.craft && (this.shell.craft.care = x));
    q<HTMLInputElement>('#ws-premium')?.addEventListener('change', (e) =>
      this.change((s) => s.craft && (s.craft.premium = (e.target as HTMLInputElement).checked)),
    );

    const grid = q<HTMLCanvasElement>('#ws-grid');
    if (grid) this.wireGrid(grid, box);
  }

  private wireGrid(canvas: HTMLCanvasElement, box: Element): void {
    const shape = this.cur.shape;
    if (shape.kind !== 'points') return;
    let cells = toGrid(shape.pts);
    const g = canvas.getContext('2d')!;
    const cell = canvas.width / GRID;
    const draw = () => {
      g.fillStyle = '#0b0c1d';
      g.fillRect(0, 0, canvas.width, canvas.height);
      const on = css(this.cur.color);
      for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
          const lit = cells.has(`${c},${r}`);
          g.beginPath();
          g.arc((c + 0.5) * cell, (r + 0.5) * cell, lit ? cell * 0.32 : cell * 0.12, 0, Math.PI * 2);
          g.fillStyle = lit ? on : 'rgba(255,255,255,0.15)';
          g.fill();
        }
      }
    };
    const commit = () => {
      const pts = fromGrid(cells);
      this.change(() => (this.cur.shape = { kind: 'points', pts: pts.length ? pts : [[0, 0]] }));
    };
    let painting: boolean | null = null;
    const at = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const c = Math.floor(((e.clientX - r.left) / r.width) * GRID);
      const row = Math.floor(((e.clientY - r.top) / r.height) * GRID);
      return c >= 0 && c < GRID && row >= 0 && row < GRID ? `${c},${row}` : null;
    };
    canvas.addEventListener('pointerdown', (e) => {
      const k = at(e);
      if (!k) return;
      canvas.setPointerCapture(e.pointerId);
      painting = !cells.has(k);
      if (painting) cells.add(k);
      else cells.delete(k);
      draw();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (painting === null) return;
      const k = at(e);
      if (!k) return;
      if (painting) cells.add(k);
      else cells.delete(k);
      draw();
    });
    canvas.addEventListener('pointerup', () => {
      if (painting !== null) commit();
      painting = null;
    });
    box.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((b) =>
      b.addEventListener('click', () => {
        const p = b.dataset.preset ? PRESETS[b.dataset.preset]() : [];
        cells = toGrid(p);
        draw();
        commit();
      }),
    );
    draw();
  }

  private renderDrawer(): void {
    const list = this.dialog.querySelector('.ws-drawer-list')!;
    const shells = this.drawer.list();
    list.innerHTML = shells.length
      ? shells
          .map(
            (s) => `<li class="${s.id === this.shell.id ? 'current' : ''}">
              <span class="dot" style="--c:${css(s.layers[0].color)}"></span>
              <span class="name">${esc(s.name)}</span>
              <span class="note">별 ${customStarCount(s)}개</span>
              <button type="button" data-act="edit" data-id="${s.id}">고치기</button>
              <button type="button" data-act="use" data-id="${s.id}" class="primary">쇼에 쓰기</button>
              <button type="button" data-act="del" data-id="${s.id}" class="danger">지우기</button>
            </li>`,
          )
          .join('')
      : '<li class="note">아직 서랍이 비었습니다. 위에서 불꽃을 만들고 「서랍에 저장」을 누르세요.</li>';
    list.querySelectorAll<HTMLButtonElement>('button[data-act]').forEach((b) =>
      b.addEventListener('click', () => {
        const id = b.dataset.id!;
        if (b.dataset.act === 'edit') this.load(structuredClone(this.drawer.get(id)!));
        else if (b.dataset.act === 'use') {
          this.host.useInShow(id);
          this.dialog.close();
        } else if (b.dataset.confirm === '1') this.drawer.remove(id);
        else {
          b.dataset.confirm = '1';
          b.textContent = '정말 지우기';
        }
      }),
    );
  }

  /** 작업대 위의 알을 이 브라우저에 기억한다 (새로고침해도 이어서 만든다) */
  private saveBench(): void {
    try {
      if (this.bench) localStorage.setItem(BENCH_KEY, JSON.stringify({ bench: this.bench, step: this.benchStep }));
      else localStorage.removeItem(BENCH_KEY);
    } catch {
      // 기억하지 못해도 이번 창에서는 이어서 만든다.
    }
  }

  private loadBench(): void {
    try {
      const raw = JSON.parse(localStorage.getItem(BENCH_KEY) ?? 'null') as { bench?: Partial<Bench>; step?: string } | null;
      if (!raw?.bench) return;
      const fresh = newBench(raw.bench.size ?? 5);
      // 예전에 기억한 것에 빠진 칸은 새 작업대 값으로 채운다.
      this.bench = { ...fresh, ...raw.bench, mix: { ...fresh.mix, ...raw.bench.mix }, stars: { ...fresh.stars, ...raw.bench.stars } } as Bench;
      if (BENCH_STEPS.some((s) => s.id === raw.step)) this.benchStep = raw.step as BenchUI['step'];
    } catch {
      // 망가진 기록은 버리고 새로 시작한다.
    }
  }

  private save(): void {
    if (this.shell.build?.comp && isDangerous(this.shell.build.comp)) {
      this.host.say('위험한 배합이라 서랍에 저장할 수 없습니다. 산화제를 줄여 주세요.');
      return;
    }
    if (!this.shell.name.trim()) this.shell.name = '내 불꽃';
    this.drawer.put(this.shell);
    this.dirty = false;
    this.host.say(`「${this.shell.name}」을 서랍에 넣었습니다. 「쇼에 쓰기」를 누르면 팔레트에서 바로 쓸 수 있습니다.`);
    progress.did('shell-saved');
    if (this.shell.build) progress.did('build-saved');
  }

  private async copyCode(): Promise<void> {
    const code = await encodeShellCode(this.shell);
    const box = this.dialog.querySelector<HTMLInputElement>('#ws-code')!;
    box.value = code;
    try {
      await navigator.clipboard.writeText(code);
      this.host.say('불꽃 코드를 복사했습니다. 친구가 공작소의 「코드로 가져오기」에 붙여 넣으면 같은 불꽃이 서랍에 들어갑니다.');
    } catch {
      box.select();
      this.host.say('불꽃 코드를 선택해 두었습니다. 복사해서 보내세요.');
    }
  }

  private async importCode(): Promise<void> {
    const box = this.dialog.querySelector<HTMLInputElement>('#ws-code')!;
    try {
      const shell = await decodeShellCode(box.value);
      // 같은 id가 서랍에 있으면 덮어쓰지 않게 새 id를 준다.
      if (this.drawer.get(shell.id)) shell.id = shortId();
      this.drawer.put(shell);
      this.load(shell);
      this.host.say(`「${shell.name}」을 서랍에 넣었습니다.`);
    } catch (err) {
      this.host.say((err as Error).message);
    }
  }

  /** 저장하지 않은 고침이 있는지 */
  get hasChanges(): boolean {
    return this.dirty;
  }
}
