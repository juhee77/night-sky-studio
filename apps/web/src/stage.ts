// 무대: 불꽃 계산 + 배경 + WebGL 그리기 + 느린 기기에서 밀도 자동 낮추기.
// 편집기와 상영관(공유 링크로 보는 화면)이 같이 쓴다.

import {
  RENDER_STRIDE,
  Simulation,
  StageRenderer,
  VENUES,
  makeView,
  paintBackdrop,
  projectPoint,
  soundDelay,
  type Launch,
  type Launcher,
  type Marker,
  type Seat,
  type Show,
  type Venue,
  type View,
} from '@nss/engine';
import { launcherLabel } from './editor.ts';

export class Stage {
  sim: Simulation;
  view!: View;
  seatId: string;
  /** 마지막으로 그린 입자 수 */
  count = 0;
  /** 밀도를 자동으로 낮췄을 때 알려 준다 */
  onDensityLowered?: () => void;

  private canvas: HTMLCanvasElement;
  private renderer: StageRenderer;
  private buffer: Float32Array;
  private backdrop = document.createElement('canvas');
  private backdropKey = '';
  private slowSince = 0;
  private frames = 0;
  private windowStart = performance.now();
  fps = 0;

  constructor(canvas: HTMLCanvasElement, show: Show) {
    this.canvas = canvas;
    this.renderer = new StageRenderer(canvas);
    this.sim = new Simulation(show);
    this.buffer = new Float32Array((this.sim.pool.capacity + 256) * RENDER_STRIDE);
    this.seatId = show.seat?.id ?? 'front-near';
    new ResizeObserver(() => this.layout()).observe(canvas);
  }

  get venue(): Venue {
    return VENUES[this.sim.show.venue.preset] ?? Object.values(VENUES)[0];
  }

  get seat(): Seat {
    return this.venue.seats[this.seatId] ?? Object.values(this.venue.seats)[0];
  }

  setSeat(id: string): void {
    this.seatId = id;
    this.layout();
  }

  /** 쇼를 바꾼다. 같은 쇼를 고친 것이면 고친 곳 이후만 다시 계산한다. */
  setShow(show: Show): void {
    const launchersChanged = JSON.stringify(show.launchers) !== JSON.stringify(this.sim.show.launchers);
    this.sim.setShow(show);
    if (launchersChanged) this.backdropKey = '';
  }

  /** 다른 쇼를 처음부터 연다. */
  load(show: Show): void {
    this.sim = new Simulation(show, { density: this.sim.density });
    this.buffer = new Float32Array((this.sim.pool.capacity + 256) * RENDER_STRIDE);
    this.seatId = show.seat?.id ?? this.seatId;
    this.backdropKey = '';
    this.layout();
  }

  private rebuild(density: number): void {
    const show = this.sim.show;
    const t = this.sim.time;
    this.sim = new Simulation(show, { density });
    this.buffer = new Float32Array((this.sim.pool.capacity + 256) * RENDER_STRIDE);
    this.sim.advanceTo(t);
    this.backdropKey = '';
    this.layout();
  }

  layout(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * (this.sim.density < 0.5 ? 0.75 : 1);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    const key = `${w}x${h}:${this.seatId}:${this.sim.show.venue.preset}`;
    if (key === this.backdropKey) return;
    this.backdropKey = key;
    this.canvas.width = w;
    this.canvas.height = h;
    this.view = makeView(this.seat, w, h);
    this.backdrop.width = w;
    this.backdrop.height = h;
    const markers: Marker[] = this.seat.plan
      ? this.sim.show.launchers.map((l, i) => ({ pos: l.pos, label: launcherLabel(l, i), from: l.from, to: l.to }))
      : [];
    paintBackdrop(this.backdrop.getContext('2d')!, w, h, this.view.viewProj, this.venue, markers);
    this.renderer.setBackdrop(this.backdrop);
  }

  render(t: number, playing: boolean): void {
    this.layout();
    this.sim.advanceTo(t);
    this.count = this.sim.writeRender(this.buffer);
    const venue = this.venue;
    this.renderer.render({
      buffer: this.buffer,
      count: this.count,
      viewProj: this.view.viewProj,
      pxPerMeter: this.view.pxPerMeter,
      eye: this.seat.eye,
      skyLight: this.sim.skyLight,
      reflection: !this.seat.plan,
      shore: [venue.nearShoreZ, venue.farShoreZ],
    });
    this.watchSpeed(playing);
  }

  /** 0.5초마다 fps를 재고, 재생 중에 3초 동안 계속 느리면 밀도를 한 단계 낮춘다. */
  private watchSpeed(playing: boolean): void {
    const now = performance.now();
    this.frames++;
    if (now - this.windowStart < 500) return;
    this.fps = (this.frames * 1000) / (now - this.windowStart);
    this.frames = 0;
    this.windowStart = now;
    if (playing && this.fps < 45 && !document.hidden) {
      this.slowSince ||= now;
      if (now - this.slowSince > 3000 && this.sim.density > 0.35) {
        this.rebuild(this.sim.density > 0.6 ? 0.6 : 0.35);
        this.onDensityLowered?.();
        this.slowSince = 0;
      }
    } else {
      this.slowSince = 0;
    }
  }

  /** 화면의 x 좌표(클라이언트 픽셀)에서 가장 가까운, 그 종류의 발사 위치 번호 */
  nearestLauncher(clientX: number, kind: Launcher['kind']): number {
    const r = this.canvas.getBoundingClientRect();
    const sx = ((clientX - r.left) / r.width) * this.canvas.width;
    let best = -1;
    let bestD = Infinity;
    this.sim.show.launchers.forEach((l, i) => {
      if (l.kind !== kind) return;
      const p = projectPoint(this.view.viewProj, l.pos, this.canvas.width, this.canvas.height);
      if (!p) return;
      const d = Math.abs(p[0] - sx);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  /** 지금 관람석에서 이 불꽃 소리가 늦게 들리는 시간 (위에서 보기는 0) */
  soundDelay = (l: Launch): number => (this.seat.plan ? 0 : soundDelay(this.seat.eye, l));
}
