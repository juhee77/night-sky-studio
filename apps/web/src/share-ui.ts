// 공유 링크 창: 쇼를 줄여 주소의 # 뒤에 담고, 서버판이면 짧은 링크도 만든다.

import { encodeShow } from '@nss/engine';
import type { Editor } from './editor.ts';
import { fmtTime } from './format.ts';
import { remoteEnabled, shortLink } from './remote.ts';
import { $, el } from './ui.ts';

const AUTHOR = 'nss:author';

/** 이 기기에서 쓰는 만든 사람 이름 */
function savedAuthor(): string {
  try {
    return localStorage.getItem(AUTHOR) ?? '';
  } catch {
    return '';
  }
}

export function wireShare(ctx: { editor: Editor }): void {
  const authorInput = $<HTMLInputElement>('share-author');
  const remixNote = $<HTMLParagraphElement>('share-remix');

  /** 지금 쇼와 만든 사람 이름으로 링크를 만든다 */
  async function build(): Promise<void> {
    const author = authorInput.value.trim().slice(0, 24);
    const code = await encodeShow({ ...ctx.editor.show, author: author || undefined });
    const base = new URL(`${import.meta.env.BASE_URL}v/`, location.origin);
    const link = `${base.href}#s=${code}`;
    el.shareLink.value = link;
    const m = ctx.editor.show.music;
    const notes = [`링크 길이 ${link.length.toLocaleString('ko-KR')}자.`];
    if (link.length > 8000) notes.push('링크가 길어서 일부 메신저에서 잘릴 수 있습니다. 그럴 땐 쇼 파일로 내보내 보내 주세요.');
    if (m && !m.id.startsWith('basic-')) {
      notes.push(`음악 파일은 링크에 들어가지 않습니다. 받는 사람이 같은 파일(「${m.title}」, ${fmtTime(m.duration).replace(/\.\d+$/, '')})을 골라야 함께 들립니다. 바로 들려주려면 기본 곡을 쓰세요.`);
    }
    el.shareInfo.textContent = notes.join(' ');
    el.shareShort.disabled = false;
    el.shareShort.dataset.code = code;
  }

  el.shareBtn.addEventListener('click', async () => {
    authorInput.value = savedAuthor();
    const r = ctx.editor.show.remixOf;
    remixNote.hidden = !r;
    if (r) remixNote.textContent = `원작 「${r.title}」${r.author ? `(${r.author}님)` : ''}도 함께 표시됩니다.`;
    await build();
    el.shareNative.hidden = !navigator.share;
    el.shareShort.hidden = !remoteEnabled();
    el.shareDialog.showModal();
    el.shareLink.select();
  });
  let timer = 0;
  authorInput.addEventListener('input', () => {
    try {
      localStorage.setItem(AUTHOR, authorInput.value.trim().slice(0, 24));
    } catch {
      // 저장하지 못하면 이번 링크에만 넣는다.
    }
    clearTimeout(timer);
    timer = window.setTimeout(() => void build(), 250);
  });
  el.shareCopy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(el.shareLink.value);
      el.shareCopy.textContent = '복사했습니다';
    } catch {
      el.shareLink.select();
      el.shareCopy.textContent = '선택했습니다. ⌘C로 복사하세요';
    }
    setTimeout(() => (el.shareCopy.textContent = '링크 복사'), 2500);
  });
  el.shareShort.addEventListener('click', async () => {
    el.shareShort.disabled = true;
    try {
      const short = await shortLink(el.shareShort.dataset.code ?? '');
      const base = new URL(`${import.meta.env.BASE_URL}v/`, location.origin);
      el.shareLink.value = `${base.href}#l=${short}`;
      el.shareInfo.textContent = '짧은 링크를 만들었습니다. 쇼는 서버에 저장되고, 링크에는 짧은 글자만 들어갑니다.';
      el.shareLink.select();
    } catch (err) {
      el.shareInfo.textContent = (err as Error).message;
      el.shareShort.disabled = false;
    }
  });
  el.shareNative.addEventListener('click', () => {
    void navigator.share?.({ title: ctx.editor.show.title ?? '밤하늘 연출실', url: el.shareLink.value }).catch(() => {});
  });
}
