// 시간표. 발사 위치마다 한 줄이고, 불꽃은 터지는 시각에 놓인다.
// 불꽃 앞의 가는 선은 상승 시간이다: 선이 시작하는 점에서 점화된다.

import { CAKE_DEFAULTS, COLORS, cueLength, cuePrefire, typeLabel, type Cue } from '@nss/engine';
import { launcherLabel, round3, type Editor } from './editor.ts';

const LABEL_W = 76;
const RULER_H = 22;
const WAVE_H = 34;
const LANE_H = 34;
const MIN_PPS = 6;
const MAX_PPS = 400;

const C = {
  bg: '#0f1027',
  lane: '#14163a',
  laneAlt: '#121433',
  label: '#a6a3bd',
  text: '#eceaf6',
  beat: 'rgba(255,255,255,0.06)',
  bar: 'rgba(255,255,255,0.16)',
  wave: 'rgba(166,163,189,0.55)',
  playhead: '#fb923c',
  select: '#ffffff',
  warn: '#ff5a4f',
};

interface Hit {
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

type Drag =
  | { kind: 'scrub' }
  | { kind: 'move'; startX: number; startY: number; anchor: number; originals: Map<number, Cue>; moved: boolean }
  | { kind: 'empty'; startX: number; startY: number; startScroll: number; lane: number; moved: boolean };

export interface TimelineHost {
  time(): number;
  seek(t: number): void;
  duration(): number;
  waveform(): Float32Array | null;
  musicDuration(): number;
  warnings(): Set<number>;
}

export class Timeline {
  pps = 36;
  scroll = 0;
  private hits: Hit[] = [];
  private drag: Drag | null = null;
  /** 화면에 닿아 있는 손가락들 (두 손가락으로 벌리면 확대) */
  private pointers = new Map<number, number>();
  private pinch: { dist: number; pps: number; center: number } | null = null;
  private ctx: CanvasRenderingContext2D;
  private cssW = 0;
  private cssH = 0;
  private canvas: HTMLCanvasElement;
  private editor: Editor;
  private host: TimelineHost;

  constructor(canvas: HTMLCanvasElement, editor: Editor, host: TimelineHost) {
    this.canvas = canvas;
    this.editor = editor;
    this.host = host;
    this.ctx = canvas.getContext('2d')!;
    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    canvas.addEventListener('pointerup', (e) => this.onUp(e));
    canvas.addEventListener('pointercancel', (e) => this.onUp(e));
    canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
  }

  get height(): number {
    return RULER_H + WAVE_H + this.editor.show.launchers.length * LANE_H + 6;
  }

  private get visibleSec(): number {
    return (this.cssW - LABEL_W) / this.pps;
  }

  private x(t: number): number {
    return LABEL_W + (t - this.scroll) * this.pps;
  }

  private t(x: number): number {
    return this.scroll + (x - LABEL_W) / this.pps;
  }

  zoomBy(factor: number, aroundT = this.host.time()): void {
    const px = this.x(aroundT);
    this.pps = Math.min(MAX_PPS, Math.max(MIN_PPS, this.pps * factor));
    this.scroll = Math.max(0, aroundT - (px - LABEL_W) / this.pps);
  }

  /** 재생 위치가 화면 오른쪽 끝에 가까워지면 따라간다. */
  follow(t: number): void {
    const vis = this.visibleSec;
    if (t > this.scroll + vis * 0.85 || t < this.scroll) this.scroll = Math.max(0, t - vis * 0.15);
  }

  draw(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth;
    const h = this.height;
    if (this.canvas.style.height !== `${h}px`) this.canvas.style.height = `${h}px`;
    if (this.cssW !== w || this.cssH !== h || this.canvas.width !== Math.round(w * dpr)) {
      this.cssW = w;
      this.cssH = h;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    const g = this.ctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = C.bg;
    g.fillRect(0, 0, w, h);

    const ed = this.editor;
    const show = ed.show;
    const t0 = this.scroll;
    const t1 = this.scroll + this.visibleSec;
    const lanesTop = RULER_H + WAVE_H;

    show.launchers.forEach((_, i) => {
      g.fillStyle = i % 2 ? C.laneAlt : C.lane;
      g.fillRect(LABEL_W, lanesTop + i * LANE_H, w - LABEL_W, LANE_H);
    });

    // 박자 눈금
    const { offset, length } = ed.beat;
    const drawBeats = length * this.pps >= 6;
    const firstBeat = Math.ceil((t0 - offset) / length);
    for (let b = firstBeat; offset + b * length <= t1; b++) {
      const isBar = b % 4 === 0;
      if (!isBar && !drawBeats) continue;
      const x = this.x(offset + b * length);
      g.fillStyle = isBar ? C.bar : C.beat;
      g.fillRect(Math.round(x), RULER_H, 1, h - RULER_H);
      if (isBar && length * 4 * this.pps > 28) {
        g.fillStyle = C.label;
        g.font = '10px "IBM Plex Mono", ui-monospace, monospace';
        g.fillText(String(b / 4 + 1), x + 3, RULER_H + 11);
      }
    }

    // 눈금자: 초
    const steps = [1, 2, 5, 10, 15, 30, 60];
    const tickStep = steps.find((s) => s * this.pps >= 64) ?? 60;
    g.fillStyle = C.label;
    g.font = '11px "IBM Plex Mono", ui-monospace, monospace';
    for (let s = Math.ceil(t0 / tickStep) * tickStep; s <= t1; s += tickStep) {
      const x = this.x(s);
      g.fillRect(Math.round(x), RULER_H - 6, 1, 6);
      const m = Math.floor(s / 60);
      g.fillText(`${m}:${String(s % 60).padStart(2, '0')}`, x + 3, 14);
    }

    // 음악 파형
    const peaks = this.host.waveform();
    const md = this.host.musicDuration();
    if (peaks && md > 0) {
      g.fillStyle = C.wave;
      const mid = RULER_H + WAVE_H / 2;
      for (let x = LABEL_W; x < w; x++) {
        const t = this.t(x);
        if (t < 0 || t > md) continue;
        const v = peaks[Math.min(peaks.length - 1, Math.floor((t / md) * peaks.length))];
        const hh = Math.max(1, v * (WAVE_H / 2 - 3));
        g.fillRect(x, mid - hh, 1, hh * 2);
      }
    }

    // 불꽃
    this.hits = [];
    const warn = this.host.warnings();
    g.font = '600 11px "IBM Plex Sans KR", -apple-system, sans-serif';
    g.textBaseline = 'middle';
    show.cues.forEach((cue, i) => {
      const lane = ed.laneOf(cue);
      const prefire = cuePrefire(cue);
      const len = cueLength(cue);
      if (cue.t + len < t0 || cue.t - prefire > t1) return;
      const y = lanesTop + lane * LANE_H;
      const x = this.x(cue.t);
      const cw = Math.max(8, len * this.pps);
      const bad = warn.has(i);
      const sel = ed.selection.has(i);

      // 상승 시간 선과 점화 점 (나이아가라·틀불꽃은 바로 불이 붙어 선이 없다)
      if (prefire > 0) {
        const fx = this.x(cue.t - prefire);
        g.strokeStyle = bad ? C.warn : 'rgba(255,220,170,0.45)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(fx, y + LANE_H / 2);
        g.lineTo(x, y + LANE_H / 2);
        g.stroke();
        g.fillStyle = bad ? C.warn : 'rgba(255,220,170,0.8)';
        g.beginPath();
        g.arc(fx, y + LANE_H / 2, 2.5, 0, Math.PI * 2);
        g.fill();
      }

      const rgb = COLORS[cue.colors?.[0] ?? 'gold'];
      g.fillStyle = `rgba(${rgb.map((v) => Math.round(Math.min(1, v) * 255)).join(',')},0.88)`;
      const ry = y + 5;
      const rh = LANE_H - 10;
      roundRect(g, x, ry, cw, rh, 4);
      g.fill();
      if (cue.colors && cue.colors.length > 1) {
        const rgb2 = COLORS[cue.colors[1]];
        g.fillStyle = `rgb(${rgb2.map((v) => Math.round(Math.min(1, v) * 255)).join(',')})`;
        g.fillRect(x + 2, ry + rh - 4, cw - 4, 2);
      }
      if (sel || bad) {
        g.strokeStyle = sel ? C.select : C.warn;
        g.lineWidth = 2;
        if (bad && !sel) g.setLineDash([4, 3]);
        roundRect(g, x, ry, cw, rh, 4);
        g.stroke();
        g.setLineDash([]);
      }
      const label = clipLabel(cue);
      if (cw > 30) {
        g.save();
        g.beginPath();
        g.rect(x, ry, cw, rh);
        g.clip();
        g.fillStyle = '#120e05';
        g.fillText(label, x + 6, ry + rh / 2 + 1);
        g.restore();
      }
      this.hits.push({ index: i, x, y: ry, w: cw, h: rh });
    });
    g.textBaseline = 'alphabetic';

    // 왼쪽 이름 칸
    g.fillStyle = C.bg;
    g.fillRect(0, 0, LABEL_W, h);
    g.fillStyle = C.label;
    g.font = '12px "IBM Plex Sans KR", -apple-system, sans-serif';
    g.fillText('음악', 12, RULER_H + WAVE_H / 2 + 4);
    show.launchers.forEach((l, i) => g.fillText(launcherLabel(l, i), 12, lanesTop + i * LANE_H + LANE_H / 2 + 4));

    // 재생 위치
    const px = this.x(this.host.time());
    if (px >= LABEL_W) {
      g.fillStyle = C.playhead;
      g.fillRect(Math.round(px) - 1, 0, 2, h);
      g.beginPath();
      g.moveTo(px - 6, 0);
      g.lineTo(px + 6, 0);
      g.lineTo(px, 8);
      g.fill();
    }
  }

  private local(e: PointerEvent | WheelEvent): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  private hitAt(x: number, y: number): Hit | undefined {
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i];
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h;
    }
    return undefined;
  }

  private laneAt(y: number): number {
    return Math.floor((y - RULER_H - WAVE_H) / LANE_H);
  }

  /** 두 손가락으로 벌리거나 오므리면 확대·축소 */
  private updatePinch(): boolean {
    if (this.pointers.size !== 2) {
      this.pinch = null;
      return false;
    }
    const [a, b] = [...this.pointers.values()];
    const dist = Math.max(20, Math.abs(a - b));
    const center = this.t((a + b) / 2);
    if (!this.pinch) {
      this.pinch = { dist, pps: this.pps, center };
      if (this.drag?.kind === 'move' && this.drag.moved) this.editor.endBatch();
      this.drag = null;
    } else {
      const px = this.x(this.pinch.center);
      this.pps = Math.min(MAX_PPS, Math.max(MIN_PPS, (this.pinch.pps * dist) / this.pinch.dist));
      this.scroll = Math.max(0, this.pinch.center - (px - LABEL_W) / this.pps);
    }
    return true;
  }

  private onDown(e: PointerEvent): void {
    const [x, y] = this.local(e);
    this.pointers.set(e.pointerId, x);
    if (this.updatePinch()) return;
    if (x < LABEL_W) return;
    this.canvas.setPointerCapture(e.pointerId);
    if (y < RULER_H + WAVE_H) {
      this.drag = { kind: 'scrub' };
      this.host.seek(Math.max(0, this.t(x)));
      return;
    }
    const ed = this.editor;
    const hit = this.hitAt(x, y);
    if (hit) {
      if (e.shiftKey || e.metaKey || e.ctrlKey) ed.toggle(hit.index);
      else if (!ed.selection.has(hit.index)) ed.select([hit.index]);
      if (!ed.selection.has(hit.index)) return;
      const originals = new Map<number, Cue>();
      for (const i of ed.selection) originals.set(i, structuredClone(ed.show.cues[i]));
      this.drag = { kind: 'move', startX: x, startY: y, anchor: hit.index, originals, moved: false };
      return;
    }
    const lane = this.laneAt(y);
    if (lane < 0 || lane >= ed.show.launchers.length) return;
    this.drag = { kind: 'empty', startX: x, startY: y, startScroll: this.scroll, lane, moved: false };
  }

  private onMove(e: PointerEvent): void {
    const [x, y] = this.local(e);
    if (this.pointers.has(e.pointerId)) {
      this.pointers.set(e.pointerId, x);
      if (this.updatePinch()) return;
    }
    const d = this.drag;
    if (!d) {
      this.canvas.style.cursor = y < RULER_H + WAVE_H ? 'col-resize' : this.hitAt(x, y) ? 'grab' : 'copy';
      return;
    }
    if (d.kind === 'scrub') {
      this.host.seek(Math.max(0, this.t(x)));
    } else if (d.kind === 'empty') {
      if (Math.abs(x - d.startX) > 5) d.moved = true;
      // 빈 곳을 끌면 시간표를 옆으로 민다 (터치 화면에서 쓰기 좋게).
      if (d.moved) this.scroll = Math.max(0, d.startScroll - (x - d.startX) / this.pps);
    } else {
      if (!d.moved && Math.hypot(x - d.startX, y - d.startY) < 4) return;
      const ed = this.editor;
      if (!d.moved) {
        d.moved = true;
        ed.beginBatch();
      }
      const anchor = d.originals.get(d.anchor)!;
      let dt = (x - d.startX) / this.pps;
      const snapped = e.altKey ? round3(anchor.t + dt) : ed.snapTime(anchor.t + dt);
      dt = snapped - anchor.t;
      const laneShift = Math.round((y - d.startY) / LANE_H);
      const launchers = ed.show.launchers;
      ed.change((draft) => {
        for (const [i, orig] of d.originals) {
          const from = ed.laneOf(orig);
          const lane = Math.min(launchers.length - 1, Math.max(0, from + laneShift));
          // 바지선 불꽃은 바지선 줄로만, 나이아가라는 다리 줄로만 옮긴다.
          const at = launchers[lane].kind === launchers[from].kind ? launchers[lane].id : orig.at;
          draft.cues[i] = { ...orig, t: round3(Math.max(0, orig.t + dt)), at };
        }
      });
      this.canvas.style.cursor = 'grabbing';
    }
  }

  private onUp(e: PointerEvent): void {
    this.pointers.delete(e.pointerId);
    if (this.pinch) {
      this.updatePinch();
      return;
    }
    const d = this.drag;
    this.drag = null;
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    if (!d) return;
    if (d.kind === 'move' && d.moved) this.editor.endBatch();
    if (d.kind === 'empty' && !d.moved) {
      const [x] = this.local(e);
      const ed = this.editor;
      if (ed.selection.size) {
        ed.select([]);
        return;
      }
      if (!ed.addCue(ed.snapTime(this.t(x)), ed.show.launchers[d.lane].id)) this.onReject?.();
    }
  }

  /** 그 줄에 놓을 수 없는 불꽃이었을 때 */
  onReject?: () => void;

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const [x] = this.local(e);
    if (e.ctrlKey || e.metaKey) {
      this.zoomBy(Math.exp(-e.deltaY * 0.004), this.t(x));
    } else {
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      this.scroll = Math.max(0, this.scroll + delta / this.pps);
    }
  }
}

function clipLabel(cue: Cue): string {
  const name = typeLabel(cue.type);
  if (cue.type === 'lancework') return `「${cue.text ?? ''}」 ${cue.len ?? 10}초`;
  if (cue.type === 'niagara') return `${name} ${cue.len ?? 8}초`;
  if (cue.type === 'cake') return `${name} ×${cue.shots ?? CAKE_DEFAULTS.shots}`;
  return `${name} ${cue.size}${cue.fan ? ` ×${cue.fan.count}` : ''}`;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}
