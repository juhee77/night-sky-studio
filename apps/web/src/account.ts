// 계정과 클라우드 창 (서버판에서만 보인다): 로그인·가입, 쇼와 내 불꽃을 클라우드에 저장하고 꺼내기.

import { normalizeShell, type CustomShell, type Show } from '@nss/engine';
import type { Drawer } from './drawer.ts';
import type { Editor } from './editor.ts';
import { cloudDelete, cloudGet, cloudList, cloudPut, currentAuth, login, logout, signup } from './remote.ts';
import { putShow } from './storage.ts';

export interface AccountHost {
  openShow(id: string, show: Show): Promise<void>;
  say(message: string): void;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export class AccountPanel {
  private dialog: HTMLDialogElement;
  private host: AccountHost;

  constructor(dialog: HTMLDialogElement, editor: Editor, drawer: Drawer, host: AccountHost) {
    this.dialog = dialog;
    this.host = host;
    const q = <T extends HTMLElement>(id: string) => dialog.querySelector<T>(`#${id}`)!;
    const creds = () => [q<HTMLInputElement>('account-name').value.trim(), q<HTMLInputElement>('account-pass').value] as const;
    q('account-login').addEventListener('click', () => this.run(async () => {
      const a = await login(...creds());
      return `${a.name}님, 로그인했습니다.`;
    }));
    q('account-signup').addEventListener('click', () => this.run(async () => {
      const a = await signup(...creds());
      return `${a.name}님, 가입했습니다.`;
    }));
    q('account-logout').addEventListener('click', () => this.run(async () => {
      await logout();
      return '로그아웃했습니다.';
    }));
    q('cloud-save-show').addEventListener('click', () => this.run(async () => {
      const show = editor.show;
      await cloudPut('shows', editor.id, show.title || '제목 없는 쇼', JSON.stringify(show));
      return `「${show.title || '제목 없는 쇼'}」을 클라우드에 저장했습니다.`;
    }));
    q('cloud-save-shells').addEventListener('click', () => this.run(async () => {
      const list = drawer.list();
      for (const s of list) await cloudPut('shells', s.id, s.name, JSON.stringify(s));
      return `내 불꽃 ${list.length}개를 클라우드에 저장했습니다.`;
    }));
    q('cloud-load-shells').addEventListener('click', () => this.run(async () => {
      const list = await cloudList('shells');
      for (const s of list) {
        const got = await cloudGet('shells', s.id);
        drawer.put(normalizeShell(JSON.parse(got.data) as CustomShell));
      }
      return `클라우드의 내 불꽃 ${list.length}개를 서랍에 담았습니다.`;
    }));
  }

  open(): void {
    this.dialog.showModal();
    void this.render();
  }

  private msg(text: string): void {
    this.dialog.querySelector('#account-msg')!.textContent = text;
  }

  private async run(fn: () => Promise<string>): Promise<void> {
    this.msg('잠시만요…');
    try {
      this.msg(await fn());
    } catch (err) {
      this.msg((err as Error).message);
    }
    await this.render();
  }

  private async render(): Promise<void> {
    const auth = currentAuth();
    (this.dialog.querySelector('#account-out') as HTMLElement).hidden = !!auth;
    (this.dialog.querySelector('#account-in') as HTMLElement).hidden = !auth;
    if (!auth) return;
    this.dialog.querySelector('#account-who')!.textContent = `${auth.name}님으로 로그인했습니다.`;
    const ul = this.dialog.querySelector('#cloud-shows')!;
    let list;
    try {
      list = await cloudList('shows');
    } catch (err) {
      ul.innerHTML = `<li>${esc((err as Error).message)}</li>`;
      return;
    }
    ul.innerHTML = list.length
      ? list.map((s) => `<li><span>${esc(s.title || '제목 없는 쇼')}</span><span class="note">${new Date(s.updatedAt).toLocaleString('ko-KR')}</span>
          <button type="button" data-cloud-open="${esc(s.id)}">이 기기로 열기</button><button type="button" data-cloud-del="${esc(s.id)}">클라우드에서 지우기</button></li>`).join('')
      : '<li class="note">클라우드에 저장한 쇼가 없습니다.</li>';
    ul.querySelectorAll<HTMLButtonElement>('[data-cloud-open]').forEach((b) =>
      b.addEventListener('click', () => this.run(async () => {
        const got = await cloudGet('shows', b.dataset.cloudOpen!);
        const show = JSON.parse(got.data) as Show;
        if (show.version !== 1 || !Array.isArray(show.cues) || !Array.isArray(show.launchers)) throw new Error('쇼 데이터가 아닙니다.');
        await putShow({ id: got.id, updatedAt: Date.now(), show });
        await this.host.openShow(got.id, show);
        this.dialog.close();
        this.host.say(`클라우드의 「${show.title || '쇼'}」을 열었습니다.`);
        return '';
      })),
    );
    ul.querySelectorAll<HTMLButtonElement>('[data-cloud-del]').forEach((b) =>
      b.addEventListener('click', () => {
        if (!confirm('클라우드에서 이 쇼를 지울까요? 이 기기에 있는 쇼는 그대로입니다.')) return;
        void this.run(async () => {
          await cloudDelete('shows', b.dataset.cloudDel!);
          return '클라우드에서 지웠습니다.';
        });
      }),
    );
  }
}
