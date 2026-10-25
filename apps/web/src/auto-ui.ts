// 자동 연출 창: 분위기·밀도·효과·구간을 골라 곡에 맞춰 불꽃을 놓는다.

import { allTubes, autoChoreograph, isLive, type AutoOptions, type MusicMap, type Mood } from '@nss/engine';
import type { Career } from './career.ts';
import type { Drawer } from './drawer.ts';
import type { Editor } from './editor.ts';
import { fmtTime } from './format.ts';
import type { Office } from './office.ts';
import { progress } from './progress.ts';
import type { Timeline } from './timeline.ts';
import type { Transport } from './transport.ts';
import { $, el, say } from './ui.ts';

export interface AutoCtx {
  editor: Editor;
  drawer: Drawer;
  office: Office;
  career: Career;
  transport: Transport;
  timeline: Timeline;
  togglePlay(): void;
  musicMap(): MusicMap;
}

export function wireAuto(ctx: AutoCtx): void {
  let autoMood: Mood = 'festive';

  function autoOptions(seed: number): AutoOptions {
    const o: AutoOptions = { seed, style: autoMood === 'calm' ? 'calm' : 'grand', mood: autoMood, density: Number(el.autoDensity.value) };
    if ($<HTMLInputElement>('auto-effects').checked) o.effects = true;
    if ($<HTMLInputElement>('auto-customs').checked) {
      const mine = ctx.drawer.list().filter((x) => !ctx.office.isLocked('custom', x.id));
      if (mine.length) o.customs = mine.slice(0, 6).map((x) => ({ id: x.id, size: x.build?.size ?? 5 }));
    }
    // 실전 모드: 갑판에 실린 통 안에서만
    if (isLive(ctx.editor.show)) o.tubes = allTubes(ctx.editor.show.rig);
    const range = autoRange();
    if (range && $<HTMLInputElement>('auto-range').checked) o.range = range;
    const text = el.autoText.value.trim();
    if (text) o.text = text;
    const c = ctx.editor.show.commission;
    if (c) {
      // 의뢰 쇼: 해금한 불꽃과 의뢰 조건, 예산을 지킨다.
      o.allowed = ctx.career.state.unlocked;
      o.budget = c.budget;
      for (const r of c.rules) {
        if (r.kind === 'maxSize') o.maxSize = r.size;
        else if (r.kind === 'colorsOnly') o.colors = r.colors;
        else if (r.kind === 'include') (o.include ??= []).push(r.type);
        else if (r.kind === 'endColors') o.endColors = { seconds: r.seconds, colors: r.colors };
        else if (r.kind === 'frameText' && !o.text) o.text = c.client.slice(0, 12);
      }
    }
    return o;
  }

  /** 고른 불꽃이 있는 구간 (그 앞뒤 박자까지). 고른 것이 없으면 null */
  function autoRange(): { from: number; to: number } | null {
    const sel = ctx.editor.selectedCues;
    if (!sel.length) return null;
    const ts = sel.map((c) => c.t);
    return { from: Math.max(0, Math.min(...ts) - 0.01), to: Math.max(...ts) + 0.01 };
  }

  el.autoBtn.addEventListener('click', () => {
    const range = autoRange();
    $<HTMLElement>('auto-range-field').hidden = !range;
    $<HTMLInputElement>('auto-range').checked = !!range;
    if (range) $<HTMLElement>('auto-range-label').textContent = `고른 불꽃이 있는 구간(${fmtTime(range.from)}~${fmtTime(range.to)})만 다시 만들기`;
    $<HTMLElement>('auto-customs-field').hidden = !ctx.drawer.list().length;
    const n = ctx.editor.show.cues.length;
    el.autoReplace.textContent = n ? `지금 놓인 불꽃 ${n}개를 지우고 새로 만듭니다. 마음에 들지 않으면 「되돌리기」로 되돌릴 수 있습니다.` : '';
    const c = ctx.editor.show.commission;
    el.autoLimits.textContent =
      (c ? `의뢰 쇼라서 해금한 불꽃과 의뢰 조건, 예산(${c.budget}) 안에서 만듭니다. ` : '') +
      (isLive(ctx.editor.show) ? '실전 모드라서 갑판에 실린 통 안에서만 만듭니다.' : '');
    const hasFrame = ctx.editor.show.launchers.some((l) => l.kind === 'frame') && !ctx.office.isLocked('lancework');
    el.autoTextField.hidden = !hasFrame;
    if (!el.autoText.value && ctx.editor.show.title) el.autoText.placeholder = `예: ${ctx.editor.show.title.slice(0, 12)}`;
    el.autoDialog.showModal();
  });
  el.autoDialog.querySelectorAll<HTMLButtonElement>('[data-mood]').forEach((b) =>
    b.addEventListener('click', () => {
      autoMood = b.dataset.mood as Mood;
      el.autoDialog.querySelectorAll('[data-mood]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    }),
  );
  el.autoDensity.addEventListener('input', () => {
    const d = Number(el.autoDensity.value);
    el.autoDensityOut.value = d < 0.5 ? '드문드문' : d < 0.8 ? '보통' : '촘촘하게';
  });
  el.autoRun.addEventListener('click', () => {
    const seed = Math.floor(Math.random() * 1e9);
    const o = autoOptions(seed);
    const cues = autoChoreograph(ctx.musicMap(), ctx.editor.show.launchers, o);
    const range = o.range;
    ctx.editor.change((d) => {
      // 구간만 다시 만들면 그 밖의 불꽃은 그대로 둔다.
      d.cues = range ? [...d.cues.filter((c) => c.t < range.from || c.t >= range.to), ...cues].sort((a, b) => a.t - b.t) : cues;
      // 섞어 쓴 내 불꽃은 설계를 쇼 안에 복사해 둔다.
      for (const c of cues) {
        const def = c.custom ? ctx.drawer.get(c.custom) : undefined;
        if (def) d.customShells = { ...d.customShells, [def.id]: structuredClone(def) };
      }
    });
    ctx.editor.select([]);
    el.autoDialog.close();
    if (ctx.transport.playing) ctx.togglePlay();
    ctx.transport.seek(range ? Math.max(0, range.from - 4) : 0);
    if (!range) ctx.timeline.scroll = 0;
    say(
      range
        ? `${fmtTime(range.from)}~${fmtTime(range.to)} 구간에 불꽃 ${cues.length}개를 다시 놓았습니다.`
        : `불꽃 ${cues.length}개를 놓았습니다. ▶ 재생해 보고, 마음에 안 들면 「자동 연출」을 다시 누르면 다른 쇼가 나옵니다.`,
    );
    // 새 기능이 열리면 그 안내가 위 안내를 덮는다.
    if (!range) progress.did('auto');
  });
}
