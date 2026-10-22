// 여러 관람석에서 나란히 보기: 같은 쇼를 두 자리에서 같은 시계로 재생해 어느 자리가 명당인지 본다.
// 소리는 한 번만 나고(편집 화면과 같은 시계), 화면만 둘이다.

import { venueOf, type Show } from '@nss/engine';
import { CAMERA_SEATS, Stage } from './stage.ts';

export interface CompareHost {
  show(): Show;
  time(): number;
  playing(): boolean;
  togglePlay(): void;
  seek(t: number): void;
}

export class Compare {
  private dialog: HTMLDialogElement;
  private host: CompareHost;
  private stages: Stage[] = [];
  private raf = 0;

  constructor(dialog: HTMLDialogElement, host: CompareHost) {
    this.dialog = dialog;
    this.host = host;
    dialog.addEventListener('close', () => cancelAnimationFrame(this.raf));
    dialog.querySelector('#compare-play')!.addEventListener('click', () => host.togglePlay());
    dialog.querySelector('#compare-restart')!.addEventListener('click', () => host.seek(0));
    dialog.querySelectorAll<HTMLSelectElement>('[data-compare-seat]').forEach((sel) =>
      sel.addEventListener('change', () => this.stages[Number(sel.dataset.compareSeat)]?.setSeat(sel.value)),
    );
  }

  get open(): boolean {
    return this.dialog.open;
  }

  show(): void {
    const show = this.host.show();
    const venue = venueOf(show);
    const seats = Object.entries(venue?.seats ?? {}).filter(([, s]) => !s.plan);
    this.dialog.showModal();
    const canvases = this.dialog.querySelectorAll<HTMLCanvasElement>('.compare-stage');
    canvases.forEach((canvas, i) => {
      if (!this.stages[i]) this.stages[i] = new Stage(canvas, show);
      else this.stages[i].load(show);
      const sel = this.dialog.querySelector<HTMLSelectElement>(`[data-compare-seat="${i}"]`)!;
      sel.innerHTML =
        seats.map(([id, s]) => `<option value="${id}">${s.label}</option>`).join('') +
        CAMERA_SEATS.filter((s) => s.id === 'fly').map((s) => `<option value="${s.id}">${s.label}</option>`).join('');
      // 처음에는 정면 가까이와, 그다음 자리를 나란히
      const id = seats[Math.min(i, seats.length - 1)]?.[0] ?? 'front-near';
      sel.value = id;
      this.stages[i].setSeat(id);
    });
    this.loop();
  }

  private loop = (): void => {
    if (!this.dialog.open) return;
    const t = this.host.time();
    for (const s of this.stages) {
      s.layout();
      s.render(t, this.host.playing());
    }
    this.dialog.querySelector('#compare-play')!.textContent = this.host.playing() ? '❚❚ 멈추기' : '▶ 재생';
    this.raf = requestAnimationFrame(this.loop);
  };
}
