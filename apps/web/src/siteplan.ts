// 발사장 평면도: 위에서 내려다보며 바지선·다리 나이아가라·지상 틀 자리를 끌어서 정한다.
// 바지선마다 그 자리에서 쏘는 가장 큰 알의 안전거리 원을 그리고, 관람석과 겹치면 알려 준다.

import {
  SAFETY_RADIUS,
  VENUES,
  addBarge,
  largestSizeAt,
  moveLauncher,
  removeBarge,
  resetSite,
  siteCheck,
  waterSpan,
  type Launcher,
} from '@nss/engine';
import { launcherLabel, type Editor } from './editor.ts';

export class SitePlanner {
  private dialog: HTMLDialogElement;
  private editor: Editor;
  private canvas: HTMLCanvasElement;
  private selected: string | null = null;
  private drag: string | null = null;

  constructor(dialog: HTMLDialogElement, editor: Editor) {
    this.dialog = dialog;
    this.editor = editor;
    this.canvas = dialog.querySelector<HTMLCanvasElement>('#site-canvas')!;
    editor.on((c) => c === 'show' && dialog.open && this.render());
    dialog.querySelector('#site-add')!.addEventListener('click', () => {
      let id = '';
      editor.change((d) => (id = addBarge(d)));
      this.selected = id;
      this.render();
    });
    dialog.querySelector('#site-remove')!.addEventListener('click', () => {
      const id = this.selected;
      if (!id) return;
      editor.change((d) => removeBarge(d, id));
      this.selected = null;
      this.render();
    });
    dialog.querySelector('#site-reset')!.addEventListener('click', () => {
      editor.change((d) => resetSite(d));
      this.selected = null;
    });
    this.canvas.addEventListener('pointerdown', (e) => {
      const hit = this.hit(e);
      this.selected = hit;
      if (hit) {
        this.drag = hit;
        this.canvas.setPointerCapture(e.pointerId);
        editor.beginBatch();
      }
      this.render();
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      const [x, z] = this.toWorld(e);
      const id = this.drag;
      editor.change((d) => moveLauncher(d, id, x, z));
    });
    const end = () => {
      if (!this.drag) return;
      this.drag = null;
      editor.endBatch();
    };
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
  }

  open(): void {
    this.dialog.showModal();
    this.render();
  }

  /** 평면도 범위: 동서 ±1400m, 남북은 관람석 물가 앞부터 다리 너머까지 */
  private bounds() {
    const venue = VENUES[this.editor.show.venue.preset];
    const near = venue ? venue.nearShoreZ : -640;
    const far = Math.max(venue?.bridge.z ?? 300, Math.min(venue?.farShoreZ ?? 1200, 1300)) + 200;
    return { x0: -1400, x1: 1400, z0: near - 260, z1: far };
  }

  private layout() {
    const w = this.canvas.clientWidth || 600;
    const h = this.canvas.clientHeight || 400;
    const b = this.bounds();
    const scale = Math.min(w / (b.x1 - b.x0), h / (b.z1 - b.z0));
    const ox = (w - (b.x1 - b.x0) * scale) / 2;
    const oy = (h - (b.z1 - b.z0) * scale) / 2;
    // 북쪽이 위, 동쪽이 오른쪽 (관람석에서 바라본 모습과 같다)
    const sx = (x: number) => ox + (x - b.x0) * scale;
    const sy = (z: number) => oy + (b.z1 - z) * scale;
    return { w, h, scale, sx, sy, ox, oy, b };
  }

  private toWorld(e: PointerEvent): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    const { scale, ox, oy, b } = this.layout();
    return [b.x0 + (e.clientX - r.left - ox) / scale, b.z1 - (e.clientY - r.top - oy) / scale];
  }

  private hit(e: PointerEvent): string | null {
    const r = this.canvas.getBoundingClientRect();
    const { sx, sy } = this.layout();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    let best: string | null = null;
    let bestD = 18;
    for (const l of this.editor.show.launchers) {
      const d = Math.hypot(sx(l.pos[0]) - mx, sy(l.pos[2]) - my);
      if (d < bestD) {
        bestD = d;
        best = l.id;
      }
    }
    return best;
  }

  render(): void {
    const show = this.editor.show;
    const venue = VENUES[show.venue.preset];
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const { w, h, scale, sx, sy, b } = this.layout();
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    const g = this.canvas.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#121019';
    g.fillRect(0, 0, w, h);
    const font = (px: number) => `${px}px 'IBM Plex Sans KR', -apple-system, sans-serif`;
    if (venue) {
      const [near, far] = waterSpan(venue);
      g.fillStyle = '#0d2236';
      g.fillRect(sx(b.x0), sy(Math.min(far, b.z1)), sx(b.x1) - sx(b.x0), sy(near) - sy(Math.min(far, b.z1)));
      // 다리
      const br = venue.bridge;
      g.strokeStyle = '#6b6478';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(sx(Math.max(br.x0, b.x0)), sy(br.z));
      g.lineTo(sx(Math.min(br.x1, b.x1)), sy(br.z));
      g.stroke();
      // 관람석
      for (const seat of Object.values(venue.seats)) {
        if (seat.plan) continue;
        const x = sx(seat.eye[0]);
        const y = sy(seat.eye[2]);
        if (y > h + 10) continue;
        g.fillStyle = '#e8d8a8';
        g.beginPath();
        g.arc(x, Math.min(h - 8, y), 5, 0, Math.PI * 2);
        g.fill();
        g.font = font(11);
        g.textAlign = 'center';
        g.fillText(seat.label, x, Math.min(h - 8, y) - 9);
      }
    }
    const warnings = siteCheck(show);
    const warned = new Set(warnings.map((x) => x.launcher));
    // 안전거리 원
    for (const l of show.launchers) {
      if (l.kind !== 'barge') continue;
      const size = largestSizeAt(show, l.id);
      if (!size) continue;
      g.strokeStyle = warned.has(l.id) ? 'rgba(248, 113, 113, 0.8)' : 'rgba(250, 204, 21, 0.35)';
      g.fillStyle = warned.has(l.id) ? 'rgba(248, 113, 113, 0.08)' : 'rgba(250, 204, 21, 0.04)';
      g.lineWidth = 1.5;
      g.setLineDash([6, 5]);
      g.beginPath();
      g.arc(sx(l.pos[0]), sy(l.pos[2]), SAFETY_RADIUS[size] * scale, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.setLineDash([]);
    }
    show.launchers.forEach((l, i) => this.drawLauncher(g, l, launcherLabel(l, i), sx, sy, scale, font));

    const list = this.dialog.querySelector('#site-warnings')!;
    list.innerHTML = warnings.length
      ? warnings.map((x) => `<li class="${x.level}">${x.message}</li>`).join('')
      : '<li class="ok">관람석이 모든 안전거리 밖에 있습니다.</li>';
    const sel = show.launchers.find((l) => l.id === this.selected);
    (this.dialog.querySelector('#site-remove') as HTMLButtonElement).disabled = !sel || sel.kind !== 'barge';
    this.dialog.querySelector('#site-selected')!.textContent = sel
      ? `${launcherLabel(sel, show.launchers.indexOf(sel))}: 동서 ${Math.round(sel.pos[0])}m, 남북 ${Math.round(sel.pos[2])}m${
          sel.kind === 'barge' && largestSizeAt(show, sel.id) ? ` · 가장 큰 알 ${largestSizeAt(show, sel.id)}호` : ''
        }`
      : '바지선·다리·지상 틀을 눌러 고르고, 끌어서 옮기세요.';
  }

  private drawLauncher(
    g: CanvasRenderingContext2D,
    l: Launcher,
    name: string,
    sx: (x: number) => number,
    sy: (z: number) => number,
    scale: number,
    font: (px: number) => string,
  ): void {
    const on = l.id === this.selected;
    const x = sx(l.pos[0]);
    const y = sy(l.pos[2]);
    g.fillStyle = on ? '#fbbf24' : l.kind === 'barge' ? '#f4a261' : l.kind === 'bridge' ? '#7dd8ee' : '#c4b5fd';
    if (l.kind === 'bridge' && l.from && l.to) {
      g.fillRect(sx(l.from[0]), y - 4, (l.to[0] - l.from[0]) * scale, 8);
    } else if (l.kind === 'frame') {
      g.fillRect(x - 22, y - 5, 44, 10);
    } else {
      // 바지선: 길이 약 60m
      g.fillRect(x - 30 * scale - 4, y - 7, 60 * scale + 8, 14);
    }
    if (on) {
      g.strokeStyle = '#fff';
      g.lineWidth = 2;
      g.strokeRect(x - 14, y - 14, 28, 28);
    }
    g.fillStyle = '#eceaf6';
    g.font = font(12);
    g.textAlign = 'center';
    g.fillText(name, x, y + 24);
  }
}
