// 상영관 갤러리 (서버판에서만): 다른 사람이 올린 쇼와 내 불꽃을 구경하고, 좋아요를 누르고, 내 쇼·서랍에 담는다.

import { decodeShow, encodeShow, normalizeShell, type CustomShell, type Show } from '@nss/engine';
import type { Drawer } from './drawer.ts';
import type { Editor } from './editor.ts';
import {
  currentAuth,
  galleryDelete,
  galleryGet,
  galleryLike,
  galleryList,
  galleryReport,
  galleryUpload,
  type GalleryKind,
} from './remote.ts';
import { newId, putShow } from './storage.ts';

export interface GalleryHost {
  openShow(id: string, show: Show): Promise<void>;
  say(message: string): void;
  /** 로그인 창 열기 */
  login(): void;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export class Gallery {
  private dialog: HTMLDialogElement;
  private kind: GalleryKind = 'show';
  private sort: 'new' | 'top' = 'new';

  constructor(dialog: HTMLDialogElement, editor: Editor, drawer: Drawer, host: GalleryHost) {
    this.dialog = dialog;
    const q = <T extends HTMLElement>(id: string) => dialog.querySelector<T>(`#${id}`)!;
    dialog.querySelectorAll<HTMLButtonElement>('[data-gkind]').forEach((b) =>
      b.addEventListener('click', () => {
        this.kind = b.dataset.gkind as GalleryKind;
        void this.render();
      }),
    );
    dialog.querySelectorAll<HTMLButtonElement>('[data-gsort]').forEach((b) =>
      b.addEventListener('click', () => {
        this.sort = b.dataset.gsort as 'new' | 'top';
        void this.render();
      }),
    );
    q('gallery-login').addEventListener('click', () => {
      dialog.close();
      host.login();
    });
    q('gallery-up-show').addEventListener('click', () =>
      this.run(async () => {
        const title = editor.show.title || '제목 없는 쇼';
        await galleryUpload('show', title, await encodeShow(editor.show));
        this.kind = 'show';
        return `「${title}」을 상영관에 올렸습니다.`;
      }),
    );
    q('gallery-up-shell').addEventListener('click', () =>
      this.run(async () => {
        const id = q<HTMLSelectElement>('gallery-shell').value;
        const shell = drawer.get(id);
        if (!shell) throw new Error('올릴 내 불꽃을 고르세요.');
        await galleryUpload('shell', shell.name, JSON.stringify(shell));
        this.kind = 'shell';
        return `「${shell.name}」을 상영관에 올렸습니다.`;
      }),
    );
    this.onPick = async (id, action) => {
      if (action === 'like') {
        await galleryLike(id);
        return '';
      }
      if (action === 'report') {
        if (!confirm('이 글을 신고할까요? 신고가 쌓이면 상영관에서 숨겨집니다.')) return '';
        const r = await galleryReport(id);
        return r.hidden ? '신고했습니다. 상영관에서 숨겨졌습니다.' : '신고했습니다.';
      }
      if (action === 'delete') {
        if (!confirm('상영관에서 내릴까요?')) return '';
        await galleryDelete(id);
        return '상영관에서 내렸습니다.';
      }
      const got = await galleryGet(id);
      if (got.item.kind === 'shell') {
        const shell = normalizeShell(JSON.parse(got.data) as CustomShell);
        // 내 서랍의 불꽃과 겹치지 않게 새 id로 담는다.
        drawer.put({ ...shell, id: `g${id}-${shell.id}`.slice(0, 24) });
        return `「${shell.name}」을 내 불꽃 서랍에 담았습니다.`;
      }
      if (action === 'view') {
        window.open(`${import.meta.env.BASE_URL}v/#s=${got.data}`, '_blank', 'noopener');
        return '';
      }
      const show = await decodeShow(got.data);
      const localId = newId();
      await putShow({ id: localId, updatedAt: Date.now(), show });
      await host.openShow(localId, show);
      dialog.close();
      host.say(`「${show.title || got.item.title}」을 내 쇼로 담았습니다.`);
      return '';
    };
    this.drawerList = () => drawer.list();
  }

  private onPick: (id: number, action: string) => Promise<string>;
  private drawerList: () => CustomShell[];

  open(): void {
    this.dialog.showModal();
    void this.render();
  }

  private async run(fn: () => Promise<string>): Promise<void> {
    const msg = this.dialog.querySelector('#gallery-msg')!;
    msg.textContent = '잠시만요…';
    try {
      msg.textContent = await fn();
    } catch (err) {
      msg.textContent = (err as Error).message;
    }
    if (this.dialog.open) await this.render();
  }

  private async render(): Promise<void> {
    const auth = currentAuth();
    (this.dialog.querySelector('#gallery-need-login') as HTMLElement).hidden = !!auth;
    (this.dialog.querySelector('#gallery-body') as HTMLElement).hidden = !auth;
    if (!auth) return;
    this.dialog.querySelectorAll('[data-gkind]').forEach((b) => b.setAttribute('aria-pressed', String((b as HTMLElement).dataset.gkind === this.kind)));
    this.dialog.querySelectorAll('[data-gsort]').forEach((b) => b.setAttribute('aria-pressed', String((b as HTMLElement).dataset.gsort === this.sort)));
    const shells = this.drawerList();
    this.dialog.querySelector('#gallery-shell')!.innerHTML = shells.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
    (this.dialog.querySelector('#gallery-up-shell') as HTMLButtonElement).disabled = !shells.length;
    const ul = this.dialog.querySelector('#gallery-list')!;
    let items;
    try {
      items = await galleryList(this.kind, this.sort);
    } catch (err) {
      ul.innerHTML = `<li>${esc((err as Error).message)}</li>`;
      return;
    }
    ul.innerHTML = items.length
      ? items
          .map(
            (it) => `<li>
              <span><b>${esc(it.title)}</b> <span class="note">${esc(it.author)} · ${new Date(it.createdAt).toLocaleDateString('ko-KR')}</span></span>
              ${it.kind === 'show' ? `<button type="button" data-g="${it.id}" data-act="view">보기</button>` : ''}
              <button type="button" data-g="${it.id}" data-act="take">${it.kind === 'show' ? '내 쇼로 담기' : '서랍에 담기'}</button>
              <button type="button" data-g="${it.id}" data-act="like" aria-pressed="${it.liked}">♥ ${it.likes}</button>
              ${it.mine ? `<button type="button" data-g="${it.id}" data-act="delete">내리기</button>` : `<button type="button" data-g="${it.id}" data-act="report">신고</button>`}
            </li>`,
          )
          .join('')
      : '<li class="note">아직 올라온 것이 없습니다. 첫 번째로 올려 보세요.</li>';
    ul.querySelectorAll<HTMLButtonElement>('[data-g]').forEach((b) =>
      b.addEventListener('click', () => this.run(() => this.onPick(Number(b.dataset.g), b.dataset.act!))),
    );
  }
}
