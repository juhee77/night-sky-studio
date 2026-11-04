// 새해 불꽃 보내기 창: 받는 사람과 인사를 넣으면 새해 쇼를 만들고 바로 공유 창을 연다.
// 11월부터 1월까지만 위 막대와 첫 화면에 버튼이 보인다.

import { cleanGreeting, isNewYearSeason, newYearOf, newYearShow, type MusicMap } from '@nss/engine';
import type { Editor } from './editor.ts';
import { progress } from './progress.ts';
import { saveAuthor, savedAuthor } from './share-ui.ts';
import type { Transport } from './transport.ts';
import { $, el } from './ui.ts';

export interface NewYearCtx {
  editor: Editor;
  transport: Transport;
  togglePlay(): void;
  musicMap(): MusicMap;
}

export function wireNewYear(ctx: NewYearCtx, now = new Date()): void {
  const btn = $<HTMLButtonElement>('newyear-btn');
  const introBtn = $<HTMLButtonElement>('intro-newyear');
  const dialog = $<HTMLDialogElement>('newyear-dialog');
  const to = $<HTMLInputElement>('newyear-to');
  const message = $<HTMLInputElement>('newyear-message');
  const from = $<HTMLInputElement>('newyear-from');
  const year = newYearOf(now);
  const season = isNewYearSeason(now);
  btn.hidden = !season;
  introBtn.hidden = !season;
  message.placeholder = `예: ${year}년에도 건강하고 행복하자!`;

  function open(): void {
    if (ctx.transport.playing) ctx.togglePlay();
    from.value = savedAuthor();
    const n = ctx.editor.show.cues.length;
    $<HTMLElement>('newyear-replace').textContent = n
      ? `지금 놓인 불꽃 ${n}개를 지우고 새로 만듭니다. 「되돌리기」로 되돌릴 수 있습니다.`
      : '';
    dialog.showModal();
    to.focus();
  }
  btn.addEventListener('click', open);
  introBtn.addEventListener('click', () => {
    $<HTMLElement>('intro').hidden = true;
    open();
  });

  $<HTMLFormElement>('newyear-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const greeting = cleanGreeting(to.value, message.value || message.placeholder.replace(/^예: /, ''));
    if (!greeting) return;
    saveAuthor(from.value);
    const seed = Math.floor(Math.random() * 1e9);
    const next = newYearShow(ctx.editor.show, ctx.musicMap(), greeting, year, seed);
    ctx.editor.change((d) => {
      Object.assign(d, next);
      delete d.commission;
    });
    ctx.editor.select([]);
    ctx.transport.seek(0);
    dialog.close();
    progress.did('auto');
    // 링크는 공유 창이 만든다 (보내는 사람 이름도 거기서 넣는다).
    el.shareBtn.click();
  });
}
