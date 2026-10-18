// 불꽃 설정 칸. 선택한 불꽃이 없으면 "새로 놓을 불꽃"을, 있으면 선택한 불꽃을 고친다.
// 종류마다 고를 수 있는 값이 다르다: 케이크는 발 수·간격, 나이아가라는 시간, 틀불꽃은 글자.

import {
  CAKE_DEFAULTS,
  COLORS,
  COLOR_NAMES,
  FIREWORK_TYPES,
  LEN_DEFAULTS,
  SIZES,
  cuePrefire,
  launcherKindFor,
  typeLabel,
  type CakePattern,
  type ColorName,
  type Cue,
  type CustomShell,
  type FireworkType,
  type Size,
} from '@nss/engine';
import { round3, type Editor, type Template } from './editor.ts';
import { fmtTime } from './format.ts';

const COLOR_LABEL: Record<ColorName, string> = {
  gold: '금색', white: '흰색', red: '빨강', green: '초록', blue: '파랑', pink: '분홍', cyan: '하늘', purple: '보라',
};

const PATTERN_LABEL: Record<CakePattern, string> = { fan: '부채꼴로 쓸기', zigzag: '좌우로 오가기', straight: '곧게' };

const css = (c: ColorName) => `rgb(${COLORS[c].map((v) => Math.round(Math.min(1, v) * 255)).join(',')})`;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export class Panel {
  private title: HTMLElement;
  private body: HTMLElement;
  private editor: Editor;
  private isLocked: (t: FireworkType, custom?: string) => boolean;
  private shells: () => CustomShell[];

  constructor(
    root: HTMLElement,
    editor: Editor,
    isLocked: (t: FireworkType, custom?: string) => boolean = () => false,
    shells: () => CustomShell[] = () => [],
  ) {
    this.editor = editor;
    this.isLocked = isLocked;
    this.shells = shells;
    root.innerHTML = `<h2 id="panel-title"></h2><div class="panel-body"></div>`;
    this.title = root.querySelector('#panel-title')!;
    this.body = root.querySelector('.panel-body')!;
    editor.on((c) => {
      if (c === 'selection' || c === 'template' || (c === 'show' && editor.selection.size)) this.render();
    });
    this.render();
  }

  /** 지금 칸이 보여 주는 값: 선택이 있으면 첫 번째 선택 불꽃, 없으면 새로 놓을 설정 */
  private current(): Template {
    const ed = this.editor;
    const c = ed.selectedCues[0];
    const tpl = ed.template;
    if (!c) return tpl;
    return {
      type: c.type,
      size: c.size,
      colors: c.colors?.length ? c.colors : ['gold'],
      angle: c.angle ?? 0,
      fanCount: c.fan?.count ?? 1,
      fanSpread: c.fan?.spread ?? 40,
      shots: c.shots ?? CAKE_DEFAULTS.shots,
      interval: c.interval ?? CAKE_DEFAULTS.interval,
      cakePattern: c.pattern ?? CAKE_DEFAULTS.pattern,
      len: c.len ?? (c.type === 'lancework' ? LEN_DEFAULTS.lancework : LEN_DEFAULTS.niagara),
      text: c.text ?? tpl.text,
      custom: c.custom,
    };
  }

  /** 값 하나를 바꾼다. 선택이 있으면 선택한 불꽃 모두에, 없으면 새로 놓을 설정에. */
  private apply(patch: (c: Cue) => void, template: Partial<Template>): void {
    const ed = this.editor;
    if (ed.selection.size) {
      const sel = ed.selection;
      ed.change((d) => {
        for (const i of sel) if (d.cues[i]) patch(d.cues[i]);
      });
    }
    ed.setTemplate(template);
  }

  render(): void {
    const ed = this.editor;
    const n = ed.selection.size;
    const v = this.current();
    this.title.textContent = n ? `선택한 불꽃 ${n}개` : '새로 놓을 불꽃';

    // 선택한 불꽃이 있으면, 그 발사 위치에 놓을 수 있는 종류만 고를 수 있다.
    const kind = n ? ed.selectionKind : null;
    const typeButtons = FIREWORK_TYPES.map((t) => {
      const locked = this.isLocked(t);
      const allowed = !locked && (!n || (kind !== null && launcherKindFor(t) === kind));
      const title = locked ? ' title="의뢰소에서 해금하면 쓸 수 있습니다"' : '';
      return `<button type="button" data-type="${t}" aria-pressed="${t === v.type}" ${allowed ? '' : 'disabled'}${title}>${typeLabel(t)}${locked ? ' <span class="lock">잠김</span>' : ''}</button>`;
    }).join('');
    // 내 불꽃: 서랍의 불꽃과, 이 쇼에만 들어 있는 불꽃(받은 쇼 등)
    const mine = new Map(this.shells().map((s) => [s.id, s]));
    for (const s of Object.values(ed.show.customShells ?? {})) if (!mine.has(s.id)) mine.set(s.id, s);
    const customButtons = [...mine.values()]
      .map((s) => {
        const locked = this.isLocked('custom', s.id);
        const allowed = !locked && (!n || kind === 'barge');
        const title = locked ? ' title="의뢰소에서 개발비를 내면 의뢰에 쓸 수 있습니다"' : '';
        const pressed = v.type === 'custom' && v.custom === s.id;
        return `<button type="button" class="custom-chip" data-custom="${s.id}" aria-pressed="${pressed}" ${allowed ? '' : 'disabled'}${title}><span class="dot" style="--c:${css(s.layers[0].color)}"></span>${s.name.replace(/[&<>"]/g, '')}${locked ? ' <span class="lock">잠김</span>' : ''}</button>`;
      })
      .join('');

    const isSpecial = v.type === 'niagara' || v.type === 'lancework';
    const sizeField = isSpecial
      ? ''
      : `<div class="field"><span class="label">크기</span><div class="chips">${SIZES.map(
          (s) => `<button type="button" data-size="${s}" aria-pressed="${s === v.size}">${s}호</button>`,
        ).join('')}</div></div>`;

    const swatches = (slot: 0 | 1) =>
      (slot === 1
        ? [`<button type="button" class="swatch none" data-color${slot}="" aria-label="두 번째 색 없음" aria-pressed="${!v.colors[1]}">없음</button>`]
        : []
      )
        .concat(
          COLOR_NAMES.map(
            (c) =>
              `<button type="button" class="swatch" data-color${slot}="${c}" style="--c:${css(c)}" aria-label="${COLOR_LABEL[c]}" title="${COLOR_LABEL[c]}" aria-pressed="${v.colors[slot] === c}"></button>`,
          ),
        )
        .join('');

    let typeFields = '';
    if (v.type === 'cake') {
      typeFields = `
        <div class="field">
          <label for="shots">발 수 <output id="shots-out">${v.shots}발</output></label>
          <input id="shots" type="range" min="6" max="60" step="2" value="${v.shots}" />
        </div>
        <div class="field">
          <label for="interval">간격 <output id="interval-out">${v.interval.toFixed(2)}초</output></label>
          <input id="interval" type="range" min="0.05" max="0.5" step="0.01" value="${v.interval}" />
        </div>
        <div class="field">
          <label for="cake-pattern">각도 무늬</label>
          <select id="cake-pattern">${(Object.keys(PATTERN_LABEL) as CakePattern[])
            .map((p) => `<option value="${p}" ${p === v.cakePattern ? 'selected' : ''}>${PATTERN_LABEL[p]}</option>`)
            .join('')}</select>
        </div>`;
    } else if (isSpecial) {
      typeFields = `
        ${v.type === 'lancework' ? `<div class="field"><label for="frame-text">글자 (12자까지)</label><input id="frame-text" maxlength="12" value="${esc(v.text)}" /></div>` : ''}
        <div class="field">
          <label for="len">타는 시간 <output id="len-out">${v.len}초</output></label>
          <input id="len" type="range" min="3" max="30" step="1" value="${v.len}" />
        </div>`;
    } else {
      typeFields = `
        <div class="field">
          <label for="angle">기울기 <output id="angle-out">${v.angle}°</output></label>
          <input id="angle" type="range" min="-30" max="30" step="5" value="${v.angle}" />
        </div>
        <div class="field">
          <label for="fan">부채꼴</label>
          <div class="row">
            <select id="fan">
              ${[1, 3, 5, 7].map((c) => `<option value="${c}" ${c === v.fanCount ? 'selected' : ''}>${c === 1 ? '한 발' : `${c}발`}</option>`).join('')}
            </select>
            <input id="fan-spread" type="range" min="10" max="80" step="5" value="${v.fanSpread}" ${v.fanCount === 1 ? 'disabled' : ''} aria-label="부채꼴 펼침 각도" />
            <output id="fan-out">${v.fanSpread}°</output>
          </div>
        </div>`;
    }

    const where =
      v.type === 'niagara'
        ? '다리 줄에 놓입니다. 다리에 걸려 폭포처럼 흘러내립니다.'
        : v.type === 'lancework'
          ? '지상 틀 줄에 놓입니다. 물 위 틀에서 글자가 왼쪽부터 타오릅니다.'
          : v.type === 'cake'
            ? '바지선 줄에 놓입니다. 낮은 높이에서 여러 발이 차례로 터집니다.'
            : '시간표의 빈 곳을 누르거나, 무대를 누르거나, 재생 중에 숫자 키를 누르면 그 시각에 터지도록 놓입니다.';

    const sel = ed.selectedCues;
    const first = sel[0];
    const timing = first
      ? `<div class="field timing">
          <label for="cue-t">${first.type === 'niagara' || first.type === 'lancework' ? '불붙는 시각' : '터지는 시각'}</label>
          <input id="cue-t" type="number" step="0.01" min="0" value="${first.t.toFixed(2)}" ${n > 1 ? 'disabled' : ''} />
          ${cuePrefire(first) > 0 ? `<p class="note">점화 ${fmtTime(first.t - cuePrefire(first))} · 상승 ${cuePrefire(first)}초</p>` : ''}
        </div>
        <button type="button" class="danger" id="cue-delete">선택한 불꽃 지우기</button>`
      : `<p class="note hint">${where}</p>`;

    this.body.innerHTML = `
      <div class="field"><span class="label">종류</span><div class="chips types">${typeButtons}</div></div>
      <div class="field"><span class="label">내 불꽃</span><div class="chips types">${customButtons || '<span class="note">「공작소」에서 만든 불꽃이 여기에 나옵니다.</span>'}</div></div>
      ${sizeField}
      <div class="field"><span class="label">색</span><div class="swatches">${swatches(0)}</div></div>
      <div class="field"><span class="label">두 번째 색</span><div class="swatches">${swatches(1)}</div></div>
      ${typeFields}
      ${timing}`;

    this.wire(v);
  }

  private wire(v: Template): void {
    const ed = this.editor;
    const q = <T extends Element>(sel: string) => this.body.querySelector<T>(sel);
    const all = (sel: string) => this.body.querySelectorAll<HTMLButtonElement>(sel);

    all('[data-type]').forEach((b) =>
      b.addEventListener('click', () => {
        const type = b.dataset.type as FireworkType;
        this.apply((c) => {
          c.type = type;
          if (type === 'cake') {
            c.shots ??= v.shots;
            c.interval ??= v.interval;
            c.pattern ??= v.cakePattern;
            delete c.fan;
          } else {
            delete c.shots;
            delete c.interval;
            delete c.pattern;
          }
        }, { type });
      }),
    );
    all('[data-custom]').forEach((b) =>
      b.addEventListener('click', () => {
        const id = b.dataset.custom!;
        const def = this.shells().find((s) => s.id === id) ?? ed.show.customShells?.[id];
        if (!def) return;
        if (ed.selection.size) {
          const sel = ed.selection;
          ed.change((d) => {
            for (const i of sel) {
              const c = d.cues[i];
              if (!c) continue;
              c.type = 'custom';
              c.custom = id;
              delete c.shots;
              delete c.interval;
              delete c.pattern;
            }
            d.customShells = { ...d.customShells, [id]: structuredClone(def) };
          });
        }
        ed.setTemplate({ type: 'custom', custom: id });
      }),
    );
    all('[data-size]').forEach((b) =>
      b.addEventListener('click', () => {
        const size = Number(b.dataset.size) as Size;
        this.apply((c) => (c.size = size), { size });
      }),
    );
    all('[data-color0]').forEach((b) =>
      b.addEventListener('click', () => {
        const c0 = b.dataset.color0 as ColorName;
        this.apply((c) => (c.colors = [c0, ...(c.colors ?? []).slice(1)]), { colors: [c0, ...v.colors.slice(1)] });
      }),
    );
    all('[data-color1]').forEach((b) =>
      b.addEventListener('click', () => {
        const c1 = b.dataset.color1 as ColorName | '';
        const colors = c1 ? [v.colors[0], c1] : [v.colors[0]];
        this.apply((c) => (c.colors = c1 ? [c.colors?.[0] ?? 'gold', c1] : [c.colors?.[0] ?? 'gold']), { colors });
      }),
    );

    // 슬라이더: 움직이는 동안은 숫자만 바꾸고, 놓았을 때 한 번 적용한다 (되돌리기가 한 칸이 되게).
    const slider = (id: string, out: string, fmt: (x: number) => string, commit: (x: number) => void) => {
      const input = q<HTMLInputElement>(`#${id}`);
      if (!input) return;
      input.addEventListener('input', () => (q(`#${out}`)!.textContent = fmt(Number(input.value))));
      input.addEventListener('change', () => commit(Number(input.value)));
    };

    slider('angle', 'angle-out', (x) => `${x}°`, (a) => this.apply((c) => (a ? (c.angle = a) : delete c.angle), { angle: a }));
    slider('shots', 'shots-out', (x) => `${x}발`, (shots) => this.apply((c) => (c.shots = shots), { shots }));
    slider('interval', 'interval-out', (x) => `${x.toFixed(2)}초`, (interval) =>
      this.apply((c) => (c.interval = round3(interval)), { interval }),
    );
    slider('len', 'len-out', (x) => `${x}초`, (len) => this.apply((c) => (c.len = len), { len }));

    const pattern = q<HTMLSelectElement>('#cake-pattern');
    pattern?.addEventListener('change', () => {
      const p = pattern.value as CakePattern;
      this.apply((c) => (c.pattern = p), { cakePattern: p });
    });

    const text = q<HTMLInputElement>('#frame-text');
    text?.addEventListener('change', () => {
      const t = text.value.trim().slice(0, 12) || '밤하늘';
      this.apply((c) => (c.text = t), { text: t });
    });

    const fan = q<HTMLSelectElement>('#fan');
    const spread = q<HTMLInputElement>('#fan-spread');
    if (fan && spread) {
      const applyFan = () => {
        const count = Number(fan.value);
        const s = Number(spread.value);
        this.apply((c) => (count > 1 ? (c.fan = { count, spread: s }) : delete c.fan), { fanCount: count, fanSpread: s });
      };
      fan.addEventListener('change', applyFan);
      spread.addEventListener('input', () => (q('#fan-out')!.textContent = `${spread.value}°`));
      spread.addEventListener('change', applyFan);
    }

    const tInput = q<HTMLInputElement>('#cue-t');
    tInput?.addEventListener('change', () => {
      const t = round3(Math.max(0, Number(tInput.value)));
      const [i] = ed.selection;
      ed.change((d) => (d.cues[i].t = t));
    });
    q('#cue-delete')?.addEventListener('click', () => ed.deleteSelected());
  }
}
