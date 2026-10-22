// 발사장 평면도: 위에서 내려다보며 바지선·다리 나이아가라·지상 틀 자리를 끌어서 정한다.
// 바지선마다 그 자리에서 쏘는 가장 큰 알의 안전거리 원을 그리고, 관람석과 겹치면 알려 준다.

import {
  DECK,
  RACKS,
  RACK_KINDS,
  deckCheck,
  footprint,
  placeRack,
  rackTubes,
  type PlacedRack,
  type RackKind,
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
  private deckCanvas: HTMLCanvasElement;
  private rackSel: string | null = null;
  private rackDrag: { id: string; dx: number; dy: number } | null = null;

  constructor(dialog: HTMLDialogElement, editor: Editor) {
    this.dialog = dialog;
    this.editor = editor;
    this.canvas = dialog.querySelector<HTMLCanvasElement>('#site-canvas')!;
    this.deckCanvas = dialog.querySelector<HTMLCanvasElement>('#deck-canvas')!;
    dialog.querySelector('#deck-palette')!.innerHTML = RACK_KINDS.map((k) => `<button type="button" data-rack="${k}">+ ${RACKS[k].label}</button>`).join('');
    dialog.querySelectorAll<HTMLButtonElement>('[data-rack]').forEach((b) =>
      b.addEventListener('click', () => this.addRack(b.dataset.rack as RackKind)),
    );
    this.wireDeck();
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
        try {
          this.canvas.setPointerCapture(e.pointerId);
        } catch {
          // 손가락이 이미 떨어졌으면 그냥 둔다.
        }
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

  /** 고른 바지선의 갑판 (없으면 빈 목록) */
  private get deckId(): string | null {
    const l = this.editor.show.launchers.find((x) => x.id === this.selected);
    return l?.kind === 'barge' ? l.id : null;
  }

  private racks(): PlacedRack[] {
    const id = this.deckId;
    return id ? (this.editor.show.rig?.decks[id] ?? []) : [];
  }

  /** 갑판을 고친다 (장비가 없으면 만든다) */
  private changeDeck(fn: (racks: PlacedRack[]) => void): void {
    const id = this.deckId;
    if (!id) return;
    this.editor.change((d) => {
      d.rig ??= { decks: {} };
      fn((d.rig.decks[id] ??= []));
    });
  }

  private addRack(kind: RackKind): void {
    const r = placeRack(this.racks(), kind);
    if (!r) {
      this.dialog.querySelector('#deck-stats')!.textContent = `${RACKS[kind].label}을 놓을 빈 자리가 없거나 무게가 넘칩니다.`;
      return;
    }
    this.rackSel = r.id;
    this.changeDeck((list) => list.push(r));
  }

  private deckLayout() {
    const w = this.deckCanvas.clientWidth || 600;
    const h = this.deckCanvas.clientHeight || 220;
    const scale = Math.min((w - 20) / DECK.len, (h - 20) / DECK.wid);
    const cx = w / 2;
    const cy = h / 2;
    // 갑판도 북쪽이 위
    return { w, h, scale, sx: (x: number) => cx + x * scale, sy: (y: number) => cy - y * scale };
  }

  private deckPoint(e: PointerEvent): [number, number] {
    const r = this.deckCanvas.getBoundingClientRect();
    const { scale, w, h } = this.deckLayout();
    return [(e.clientX - r.left - w / 2) / scale, -(e.clientY - r.top - h / 2) / scale];
  }

  private wireDeck(): void {
    const c = this.deckCanvas;
    c.addEventListener('pointerdown', (e) => {
      const [x, y] = this.deckPoint(e);
      const hit = this.racks().find((r) => {
        const [hx, hy] = footprint(r);
        return Math.abs(x - r.x) <= hx + 0.2 && Math.abs(y - r.y) <= hy + 0.2;
      });
      this.rackSel = hit?.id ?? null;
      if (hit) {
        this.rackDrag = { id: hit.id, dx: x - hit.x, dy: y - hit.y };
        try {
          c.setPointerCapture(e.pointerId);
        } catch {
          // 손가락이 이미 떨어졌으면 그냥 둔다.
        }
        this.editor.beginBatch();
      }
      this.renderDeck();
    });
    c.addEventListener('pointermove', (e) => {
      const d = this.rackDrag;
      if (!d) return;
      const [x, y] = this.deckPoint(e);
      const snap = (v: number) => Math.round(v * 10) / 10;
      this.changeDeck((list) => {
        const r = list.find((q) => q.id === d.id);
        if (r) {
          r.x = snap(x - d.dx);
          r.y = snap(y - d.dy);
        }
      });
    });
    const end = () => {
      if (!this.rackDrag) return;
      this.rackDrag = null;
      this.editor.endBatch();
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
  }

  private renderDeck(): void {
    const box = this.dialog.querySelector<HTMLElement>('#deck')!;
    const id = this.deckId;
    box.hidden = !id;
    if (!id) return;
    const show = this.editor.show;
    const l = show.launchers.find((x) => x.id === id)!;
    this.dialog.querySelector('#deck-title')!.textContent = `${launcherLabel(l, show.launchers.indexOf(l))} 갑판 (${DECK.len}m × ${DECK.wid}m, ${DECK.kg / 1000}t까지)`;
    const racks = this.racks();
    const report = deckCheck(racks);
    const bad = new Set(report.problems.map((p) => p.rack));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const { w, h, scale, sx, sy } = this.deckLayout();
    const c = this.deckCanvas;
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#0d2236';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#3b3328';
    g.fillRect(sx(-DECK.len / 2), sy(DECK.wid / 2), DECK.len * scale, DECK.wid * scale);
    // 1m 눈금
    g.strokeStyle = 'rgba(255,255,255,0.05)';
    g.lineWidth = 1;
    for (let x = -DECK.len / 2; x <= DECK.len / 2; x++) {
      g.beginPath();
      g.moveTo(sx(x), sy(DECK.wid / 2));
      g.lineTo(sx(x), sy(-DECK.wid / 2));
      g.stroke();
    }
    for (const r of racks) {
      const [hx, hy] = footprint(r);
      const on = r.id === this.rackSel;
      g.fillStyle = bad.has(r.id) ? 'rgba(248,113,113,0.55)' : on ? 'rgba(251,191,36,0.55)' : 'rgba(148,163,184,0.35)';
      g.fillRect(sx(r.x - hx), sy(r.y + hy), hx * 2 * scale, hy * 2 * scale);
      g.strokeStyle = on ? '#fbbf24' : '#94a3b8';
      g.strokeRect(sx(r.x - hx), sy(r.y + hy), hx * 2 * scale, hy * 2 * scale);
      // 통: 위에서 보면 기운 쪽으로 짧은 선이 뻗는다
      for (const t of rackTubes(id, r)) {
        const rad = (RACKS[r.kind].size ?? 3) * 0.02 * scale + 1.5;
        g.fillStyle = '#111';
        g.beginPath();
        g.arc(sx(t.x), sy(t.y), rad, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#f4a261';
        g.beginPath();
        g.moveTo(sx(t.x), sy(t.y));
        g.lineTo(sx(t.x) + Math.sin((t.angle * Math.PI) / 180) * rad * 2.4, sy(t.y));
        g.stroke();
      }
    }
    const tubes = Object.entries(report.tubes).map(([k, n]) => (k === 'cake' ? `케이크 자리 ${n}` : `${k}호 통 ${n}`)).join(', ');
    this.dialog.querySelector('#deck-stats')!.textContent = `무게 ${report.kg}kg / ${DECK.kg}kg · 차지한 넓이 ${report.area}m² · ${tubes || '랙 없음'}`;
    this.dialog.querySelector('#deck-problems')!.innerHTML = report.problems.map((p) => `<li class="error">${p.message}</li>`).join('');
    this.renderRackControls(racks.find((r) => r.id === this.rackSel));
  }

  private renderRackControls(r: PlacedRack | undefined): void {
    const box = this.dialog.querySelector('#deck-rack')!;
    if (!r) {
      box.innerHTML = '';
      return;
    }
    box.innerHTML = `
      <b>${RACKS[r.kind].label}</b>
      <div class="field"><label for="rack-tilt">랙 기울기 <output>${r.tilt}°</output></label><input id="rack-tilt" type="range" min="-30" max="30" step="5" value="${r.tilt}" /></div>
      ${r.kind === 'fan5' ? `<div class="field"><label for="rack-spread">부채꼴 펼침 (만들 때 고정) <output>${r.spread ?? 40}°</output></label><input id="rack-spread" type="range" min="10" max="80" step="5" value="${r.spread ?? 40}" /></div>` : ''}
      <button type="button" id="rack-rot">돌리기</button>
      <button type="button" id="rack-del" class="danger">빼기</button>`;
    const id = r.id;
    const bind = (sel: string, fn: (q: PlacedRack, v: number) => void) => {
      const input = box.querySelector<HTMLInputElement>(sel);
      if (!input) return;
      const out = input.previousElementSibling?.querySelector('output');
      input.addEventListener('input', () => out && (out.textContent = `${input.value}°`));
      input.addEventListener('change', () => this.changeDeck((list) => {
        const q = list.find((x) => x.id === id);
        if (q) fn(q, Number(input.value));
      }));
    };
    bind('#rack-tilt', (q, v) => (q.tilt = v));
    bind('#rack-spread', (q, v) => (q.spread = v));
    box.querySelector('#rack-rot')!.addEventListener('click', () =>
      this.changeDeck((list) => {
        const q = list.find((x) => x.id === id);
        if (q) q.rot = q.rot === 90 ? 0 : 90;
      }),
    );
    box.querySelector('#rack-del')!.addEventListener('click', () => {
      this.rackSel = null;
      this.changeDeck((list) => list.splice(list.findIndex((x) => x.id === id), 1));
    });
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

    this.renderDeck();
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
