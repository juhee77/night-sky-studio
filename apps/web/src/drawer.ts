// 내 불꽃 서랍: 불꽃 공작소에서 만든 불꽃을 이 기기에 모아 둔다.
// 쇼에 놓을 때는 정의를 쇼 안에 복사해 넣어서, 서랍을 고쳐도 이미 만든 쇼는 그대로 터진다.

import { normalizeShell, type CustomShell } from '@nss/engine';

const KEY = 'nss:drawer';

export class Drawer {
  private shells: CustomShell[] = [];
  private listeners = new Set<() => void>();

  constructor() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.shells = (JSON.parse(raw) as CustomShell[]).map(normalizeShell);
    } catch {
      // 저장소를 못 쓰면 이번 창에서만 쓴다.
    }
  }

  on(fn: () => void): void {
    this.listeners.add(fn);
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.shells));
    } catch {
      // 저장 못 해도 계속 쓸 수 있다.
    }
    for (const fn of this.listeners) fn();
  }

  list(): CustomShell[] {
    return this.shells;
  }

  get(id: string): CustomShell | undefined {
    return this.shells.find((s) => s.id === id);
  }

  put(shell: CustomShell): void {
    const s = normalizeShell(shell);
    const i = this.shells.findIndex((x) => x.id === s.id);
    if (i >= 0) this.shells[i] = s;
    else this.shells.unshift(s);
    this.save();
  }

  remove(id: string): void {
    this.shells = this.shells.filter((s) => s.id !== id);
    this.save();
  }
}

export function shortId(): string {
  return Math.random().toString(36).slice(2, 8);
}
