// 공유 링크 창: 쇼를 줄여 주소의 # 뒤에 담고, 서버판이면 짧은 링크도 만든다.

import { encodeShow } from '@nss/engine';
import type { Editor } from './editor.ts';
import { fmtTime } from './format.ts';
import { remoteEnabled, shortLink } from './remote.ts';
import { el } from './ui.ts';

export function wireShare(ctx: { editor: Editor }): void {
  el.shareBtn.addEventListener('click', async () => {
    const code = await encodeShow(ctx.editor.show);
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
    el.shareNative.hidden = !navigator.share;
    el.shareShort.hidden = !remoteEnabled();
    el.shareShort.disabled = false;
    el.shareShort.dataset.code = code;
    el.shareDialog.showModal();
    el.shareLink.select();
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
