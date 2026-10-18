// 불꽃 설정 칸. 선택한 불꽃이 없으면 "새로 놓을 불꽃"을, 있으면 선택한 불꽃을 고친다.

import {
  COLORS,
  COLOR_NAMES,
  SHELLS,
  SHELL_TYPES,
  SIZES,
  SIZE_SPECS,
  type ColorName,
  type Cue,
  type ShellType,
  type Size,
} from '@nss/engine';
import { round3, type Editor } from './editor.ts';
import { fmtTime } from './format.ts';

const COLOR_LABEL: Record<ColorName, string> = {
  gold: '금색', white: '흰색', red: '빨강', green: '초록', blue: '파랑', pink: '분홍', cyan: '하늘', purple: '보라',
};

const css = (c: ColorName) => `rgb(${COLORS[c].map((v) => Math.round(Math.min(1, v) * 255)).join(',')})`;

export class Panel {
  private title: HTMLElement;
  private body: HTMLElement;
  private editor: Editor;

  constructor(root: HTMLElement, editor: Editor) {
    this.editor = editor;
    root.innerHTML = `<h2 id="panel-title"></h2><div class="panel-body"></div>`;
    this.title = root.querySelector('#panel-title')!;
    this.body = root.querySelector('.panel-body')!;
    editor.on((c) => {
      if (c === 'selection' || c === 'template' || (c === 'show' && editor.selection.size)) this.render();
    });
    this.render();
  }

  /** 지금 칸이 보여 주는 값: 선택이 있으면 첫 번째 선택 불꽃, 없으면 새로 놓을 설정 */
  private current(): { type: ShellType; size: Size; colors: ColorName[]; angle: number; fanCount: number; fanSpread: number } {
    const ed = this.editor;
    const c = ed.selectedCues[0];
    if (!c) return ed.template;
    return {
      type: c.type,
      size: c.size,
      colors: c.colors?.length ? c.colors : ['gold'],
      angle: c.angle ?? 0,
      fanCount: c.fan?.count ?? 1,
      fanSpread: c.fan?.spread ?? 40,
    };
  }

  /** 값 하나를 바꾼다. 선택이 있으면 선택한 불꽃 모두에, 없으면 새로 놓을 설정에. */
  private apply(patch: (c: Cue) => void, template: Partial<Editor['template']>): void {
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

    const typeButtons = SHELL_TYPES.map(
      (t) => `<button type="button" data-type="${t}" aria-pressed="${t === v.type}">${SHELLS[t].label}</button>`,
    ).join('');
    const sizeButtons = SIZES.map(
      (s) => `<button type="button" data-size="${s}" aria-pressed="${s === v.size}">${s}호</button>`,
    ).join('');
    const swatches = (slot: 0 | 1) =>
      (slot === 1 ? [`<button type="button" class="swatch none" data-color${slot}="" aria-label="두 번째 색 없음" aria-pressed="${!v.colors[1]}">없음</button>`] : [])
        .concat(
          COLOR_NAMES.map(
            (c) =>
              `<button type="button" class="swatch" data-color${slot}="${c}" style="--c:${css(c)}" aria-label="${COLOR_LABEL[c]}" title="${COLOR_LABEL[c]}" aria-pressed="${v.colors[slot] === c}"></button>`,
          ),
        )
        .join('');

    const sel = ed.selectedCues;
    const first = sel[0];
    const timing = first
      ? `<div class="field timing">
          <label for="cue-t">터지는 시각</label>
          <input id="cue-t" type="number" step="0.01" min="0" value="${first.t.toFixed(2)}" ${n > 1 ? 'disabled' : ''} />
          <p class="note">점화 ${fmtTime(first.t - SIZE_SPECS[first.size].prefire)} · 상승 ${SIZE_SPECS[first.size].prefire}초</p>
        </div>
        <button type="button" class="danger" id="cue-delete">선택한 불꽃 지우기</button>`
      : `<p class="note hint">시간표의 빈 곳을 누르거나, 무대를 누르거나, 재생 중에 숫자 키 1·2·3을 누르면 이 불꽃이 그 시각에 터지도록 놓입니다.</p>`;

    this.body.innerHTML = `
      <div class="field"><span class="label">종류</span><div class="chips types">${typeButtons}</div></div>
      <div class="field"><span class="label">크기</span><div class="chips">${sizeButtons}</div></div>
      <div class="field"><span class="label">색</span><div class="swatches">${swatches(0)}</div></div>
      <div class="field"><span class="label">두 번째 색</span><div class="swatches">${swatches(1)}</div></div>
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
      </div>
      ${timing}`;

    this.body.querySelectorAll<HTMLButtonElement>('[data-type]').forEach((b) =>
      b.addEventListener('click', () => {
        const type = b.dataset.type as ShellType;
        this.apply((c) => (c.type = type), { type });
      }),
    );
    this.body.querySelectorAll<HTMLButtonElement>('[data-size]').forEach((b) =>
      b.addEventListener('click', () => {
        const size = Number(b.dataset.size) as Size;
        this.apply((c) => (c.size = size), { size });
      }),
    );
    this.body.querySelectorAll<HTMLButtonElement>('[data-color0]').forEach((b) =>
      b.addEventListener('click', () => {
        const c0 = b.dataset.color0 as ColorName;
        const colors = [c0, ...v.colors.slice(1)];
        this.apply((c) => (c.colors = [c0, ...(c.colors ?? []).slice(1)]), { colors });
      }),
    );
    this.body.querySelectorAll<HTMLButtonElement>('[data-color1]').forEach((b) =>
      b.addEventListener('click', () => {
        const c1 = b.dataset.color1 as ColorName | '';
        const colors = c1 ? [v.colors[0], c1] : [v.colors[0]];
        this.apply((c) => (c.colors = c1 ? [c.colors?.[0] ?? 'gold', c1] : [c.colors?.[0] ?? 'gold']), { colors });
      }),
    );

    const angle = this.body.querySelector<HTMLInputElement>('#angle')!;
    angle.addEventListener('input', () => (this.body.querySelector('#angle-out')!.textContent = `${angle.value}°`));
    angle.addEventListener('change', () => {
      const a = Number(angle.value);
      this.apply((c) => (a ? (c.angle = a) : delete c.angle), { angle: a });
    });

    const fan = this.body.querySelector<HTMLSelectElement>('#fan')!;
    const spread = this.body.querySelector<HTMLInputElement>('#fan-spread')!;
    const applyFan = () => {
      const count = Number(fan.value);
      const s = Number(spread.value);
      this.apply((c) => (count > 1 ? (c.fan = { count, spread: s }) : delete c.fan), { fanCount: count, fanSpread: s });
    };
    fan.addEventListener('change', applyFan);
    spread.addEventListener('input', () => (this.body.querySelector('#fan-out')!.textContent = `${spread.value}°`));
    spread.addEventListener('change', applyFan);

    const tInput = this.body.querySelector<HTMLInputElement>('#cue-t');
    tInput?.addEventListener('change', () => {
      const t = round3(Math.max(0, Number(tInput.value)));
      const [i] = ed.selection;
      ed.change((d) => (d.cues[i].t = t));
    });
    this.body.querySelector('#cue-delete')?.addEventListener('click', () => ed.deleteSelected());
  }
}
