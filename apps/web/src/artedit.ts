// 지상 틀 그림 그리기: 칸을 눌러 심지를 세운다. 그린 그림은 글자 대신 물 위 틀에서 타오른다.

import { ART_PRESETS, decodeArt, encodeArt, textShape, type FrameArt } from '@nss/engine';

const SIZES: [number, number][] = [[16, 8], [24, 12], [32, 16], [48, 24]];

export class ArtEditor {
  private dialog: HTMLDialogElement;
  private canvas: HTMLCanvasElement;
  private w = 24;
  private h = 12;
  private on: boolean[] = [];
  private paint = true;
  private down = false;
  private resolve: ((a: FrameArt | null) => void) | null = null;

  constructor(dialog: HTMLDialogElement) {
    this.dialog = dialog;
    this.canvas = dialog.querySelector<HTMLCanvasElement>('#art-canvas')!;
    const q = <T extends HTMLElement>(id: string) => dialog.querySelector<T>(`#${id}`)!;
    q('art-size').innerHTML = SIZES.map(([w, h]) => `<option value="${w}x${h}">${w} × ${h}칸</option>`).join('');
    q('art-presets').innerHTML = Object.keys(ART_PRESETS).map((k) => `<button type="button" data-art-preset="${k}">${k}</button>`).join('');
    q<HTMLSelectElement>('art-size').addEventListener('change', (e) => {
      const [w, h] = (e.target as HTMLSelectElement).value.split('x').map(Number);
      this.resize(w, h);
    });
    dialog.querySelectorAll<HTMLButtonElement>('[data-art-mode]').forEach((b) =>
      b.addEventListener('click', () => {
        this.paint = b.dataset.artMode === 'paint';
        dialog.querySelectorAll('[data-art-mode]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      }),
    );
    dialog.querySelectorAll<HTMLButtonElement>('[data-art-preset]').forEach((b) =>
      b.addEventListener('click', () => this.place(ART_PRESETS[b.dataset.artPreset!]())),
    );
    q('art-clear').addEventListener('click', () => {
      this.on = new Array(this.w * this.h).fill(false);
      this.draw();
    });
    q('art-from-text').addEventListener('click', () => {
      const text = q<HTMLInputElement>('art-text').value.trim();
      if (text) this.fromText(text);
    });
    q('art-save').addEventListener('click', () => {
      const r = this.resolve;
      this.resolve = null;
      this.dialog.close();
      r?.(this.on.some(Boolean) ? encodeArt(this.w, this.h, this.on) : null);
    });
    dialog.addEventListener('close', () => {
      this.resolve?.(undefined as unknown as null);
      this.resolve = null;
    });
    const cell = (e: PointerEvent) => {
      const r = this.canvas.getBoundingClientRect();
      const c = Math.floor(((e.clientX - r.left) / r.width) * this.w);
      const row = Math.floor(((e.clientY - r.top) / r.height) * this.h);
      if (c < 0 || row < 0 || c >= this.w || row >= this.h) return;
      this.on[row * this.w + c] = this.paint;
      this.draw();
    };
    this.canvas.addEventListener('pointerdown', (e) => {
      this.down = true;
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch {
        // 손가락이 이미 떨어졌으면 그냥 둔다.
      }
      cell(e);
    });
    this.canvas.addEventListener('pointermove', (e) => this.down && cell(e));
    this.canvas.addEventListener('pointerup', () => (this.down = false));
    this.canvas.addEventListener('pointercancel', () => (this.down = false));
  }

  /** 그림을 고친다. 저장하면 그림(지우면 null), 그냥 닫으면 undefined */
  edit(art: FrameArt | undefined): Promise<FrameArt | null | undefined> {
    if (art) {
      this.w = art.w;
      this.h = art.h;
      this.on = decodeArt(art);
    } else this.resize(24, 12);
    (this.dialog.querySelector('#art-size') as HTMLSelectElement).value = `${this.w}x${this.h}`;
    this.dialog.showModal();
    requestAnimationFrame(() => this.draw());
    return new Promise((res) => (this.resolve = res as (a: FrameArt | null) => void));
  }

  private resize(w: number, h: number): void {
    const old = this.on;
    const ow = this.w;
    const oh = this.h;
    this.w = w;
    this.h = h;
    this.on = new Array(w * h).fill(false);
    for (let r = 0; r < Math.min(h, oh); r++) for (let c = 0; c < Math.min(w, ow); c++) this.on[r * w + c] = !!old[r * ow + c];
    this.draw();
  }

  /** 그림을 가운데에 놓는다 (크기가 크면 칸을 늘린다) */
  private place(art: FrameArt): void {
    const src = decodeArt(art);
    if (art.w > this.w || art.h > this.h) this.resize(Math.max(art.w, this.w), Math.max(art.h, this.h));
    this.on = new Array(this.w * this.h).fill(false);
    const ox = Math.floor((this.w - art.w) / 2);
    const oy = Math.floor((this.h - art.h) / 2);
    for (let r = 0; r < art.h; r++) for (let c = 0; c < art.w; c++) if (src[r * art.w + c]) this.on[(r + oy) * this.w + c + ox] = true;
    this.draw();
  }

  /** 글자를 칸으로 옮겨 그 위에 덧그릴 수 있게 */
  private fromText(text: string): void {
    const shape = textShape(text);
    this.on = new Array(this.w * this.h).fill(false);
    const scale = Math.min((this.h - 1) / 1, (this.w - 1) / Math.max(shape.width, 1e-3));
    const ox = Math.floor((this.w - shape.width * scale) / 2);
    const oy = Math.floor((this.h - scale) / 2);
    for (const [x, y] of shape.points) {
      const c = Math.round(ox + x * scale);
      const r = Math.round(oy + (1 - y) * scale);
      if (c >= 0 && r >= 0 && c < this.w && r < this.h) this.on[r * this.w + c] = true;
    }
    this.draw();
  }

  private draw(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.canvas.clientWidth || 600;
    const h = (w * this.h) / this.w;
    this.canvas.style.height = `${h}px`;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    const g = this.canvas.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#0b0c1d';
    g.fillRect(0, 0, w, h);
    const cw = w / this.w;
    const ch = h / this.h;
    for (let r = 0; r < this.h; r++) {
      for (let c = 0; c < this.w; c++) {
        const on = this.on[r * this.w + c];
        g.fillStyle = on ? '#fbbf24' : 'rgba(255,255,255,0.05)';
        g.beginPath();
        g.arc((c + 0.5) * cw, (r + 0.5) * ch, Math.min(cw, ch) * (on ? 0.38 : 0.12), 0, Math.PI * 2);
        g.fill();
      }
    }
    this.dialog.querySelector('#art-count')!.textContent = `심지 ${this.on.filter(Boolean).length}개`;
  }
}
