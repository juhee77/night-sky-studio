// 무대: 불꽃 계산 + 배경 + WebGL 그리기 + 느린 기기에서 밀도 자동 낮추기.
// 편집기와 상영관(공유 링크로 보는 화면)이 같이 쓴다.

import {
  RENDER_EXTRA,
  SMOKE_POINTS,
  SKIES,
  writeSnow,
  RENDER_STRIDE,
  Simulation,
  StageRenderer,
  VENUES,
  venueOf,
  makeView,
  paintBackdrop,
  planShots,
  shotCamera,
  projectPoint,
  soundDelay,
  waterSpan,
  type Camera,
  type RenderQuality,
  type Launch,
  type Launcher,
  type Marker,
  type Seat,
  type Shot,
  type Show,
  type Vec3,
  type Venue,
  type View,
} from '@nss/engine';
import { launcherLabel } from './editor.ts';

/** 무대마다 있는 관람석 말고, 어느 무대에서나 쓰는 카메라 */
export const CAMERA_SEATS = [
  { id: 'director', label: '연출 카메라' },
  { id: 'free', label: '3D 자유 시점' },
  { id: 'fly', label: '날아다니기' },
] as const;

/** 3D 자유 시점: 쇼 가운데를 바라보며 둘레를 도는 카메라 */
interface Orbit {
  yaw: number;
  pitch: number;
  dist: number;
  target: Vec3;
}

const QUALITY_KEY = 'nss:quality';

function readQuality(): 'auto' | RenderQuality {
  try {
    const v = localStorage.getItem(QUALITY_KEY);
    return v === 'high' || v === 'medium' || v === 'low' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

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
  private fastSince = 0;
  /** 화질 고르기 (이 기기에 기억). 자동이면 높음으로 시작해 느리면 밀도보다 먼저 낮춘다 */
  qualityPref: 'auto' | RenderQuality = readQuality();

  setQuality(pref: 'auto' | RenderQuality): void {
    this.qualityPref = pref;
    try {
      localStorage.setItem(QUALITY_KEY, pref);
    } catch {
      // 기억하지 못해도 이번에는 바꾼다.
    }
    this.renderer.quality = pref === 'auto' ? (this.renderer.software ? 'low' : 'high') : pref;
  }
  private orbit: Orbit = { yaw: 0, pitch: 0.15, dist: 900, target: [0, 140, 60] };
  /** 끌어서 돌리는 중 (배경을 낮은 해상도로 빨리 그린다) */
  dragging = false;
  private time = 0;
  private frames = 0;
  private windowStart = performance.now();
  fps = 0;

  constructor(canvas: HTMLCanvasElement, show: Show) {
    this.canvas = canvas;
    // 자동이면 렌더러가 기기에 맞게 고른다 (보통 높음, CPU로 그리는 기기는 낮음).
    this.renderer = new StageRenderer(canvas, this.qualityPref === 'auto' ? {} : { quality: this.qualityPref });
    this.sim = new Simulation(show);
    this.buffer = new Float32Array((this.sim.pool.capacity + RENDER_EXTRA) * RENDER_STRIDE);
    this.seatId = show.seat?.id ?? 'front-near';
    new ResizeObserver(() => this.layout()).observe(canvas);
  }

  get venue(): Venue {
    return venueOf(this.sim.show) ?? Object.values(VENUES)[0];
  }

  get seat(): Seat {
    if (this.seatId === 'free') return { label: '3D 자유 시점', ...this.orbitCamera(this.orbit), fovY: 55 };
    if (this.seatId === 'fly') return { label: '날아다니기', ...this.flyCamera(this.time), fovY: 55 };
    if (this.seatId === 'director') return { label: '연출 카메라', ...this.directorCamera(this.time) };
    return this.venue.seats[this.seatId] ?? Object.values(this.venue.seats)[0];
  }

  /** t초일 때의 카메라 (날아다니기는 시각마다 다르다) */
  cameraAt(t: number): Seat {
    if (this.seatId === 'fly') return { label: '날아다니기', ...this.flyCamera(t), fovY: 55 };
    if (this.seatId === 'director') return { label: '연출 카메라', ...this.directorCamera(t) };
    return this.seat;
  }

  /** 연기 덩어리 버퍼 */
  private smokeBuffer = new Float32Array(SMOKE_POINTS * RENDER_STRIDE);
  private shots: Shot[] = [];
  private shotsFor: unknown = null;

  /** 연출 카메라: 쇼가 바뀌면 카메라 길을 다시 짠다 (같은 쇼면 늘 같은 길) */
  private directorCamera(t: number): Camera {
    if (this.shotsFor !== this.sim.launches) {
      const barges = this.sim.show.launchers.filter((l) => l.kind === 'barge');
      const n = Math.max(1, barges.length);
      const center: Vec3 = [barges.reduce((s, l) => s + l.pos[0], 0) / n, 170, barges.reduce((s, l) => s + l.pos[2], 0) / n];
      this.shots = planShots(this.sim.launches, Object.values(this.venue.seats), Math.max(this.sim.duration, 10), this.sim.show.seed, center);
      this.shotsFor = this.sim.launches;
    }
    return shotCamera(this.shots, t) ?? Object.values(this.venue.seats)[0];
  }

  /** 움직이는 카메라인가 (배경을 매 프레임 다시 그린다) */
  get moving(): boolean {
    return this.seatId === 'fly' || this.seatId === 'director' || (this.seatId === 'free' && this.dragging);
  }

  setSeat(id: string): void {
    if (id === 'free' && this.seatId !== 'free') this.orbitFrom(this.seat);
    this.seatId = id;
    this.layout();
  }

  private orbitCamera(o: Orbit): { eye: Vec3; target: Vec3 } {
    const c = Math.cos(o.pitch);
    const eye: Vec3 = [
      o.target[0] + o.dist * c * Math.sin(o.yaw),
      Math.max(3, o.target[1] + o.dist * Math.sin(o.pitch)),
      o.target[2] - o.dist * c * Math.cos(o.yaw),
    ];
    return { eye, target: o.target };
  }

  /** 지금 관람석 카메라에서 자유 시점을 시작한다. */
  private orbitFrom(seat: Seat): void {
    const target: Vec3 = [0, 140, this.showCenterZ()];
    const dx = seat.eye[0] - target[0];
    const dy = seat.eye[1] - target[1];
    const dz = seat.eye[2] - target[2];
    const dist = Math.min(2500, Math.max(250, Math.hypot(dx, dy, dz)));
    this.orbit = { yaw: Math.atan2(dx, -dz), pitch: Math.asin(Math.max(-0.2, Math.min(1.3, dy / dist))), dist, target };
  }

  private showCenterZ(): number {
    const barges = this.sim.show.launchers.filter((l) => l.kind === 'barge');
    return barges.length ? barges.reduce((s, l) => s + l.pos[2], 0) / barges.length : 0;
  }

  /** 날아다니기: 시각만으로 정해지는 카메라 길. 같은 시각이면 늘 같은 화면이다. */
  private flyCamera(t: number): { eye: Vec3; target: Vec3 } {
    const z = this.showCenterZ();
    return this.orbitCamera({
      yaw: 0.55 * Math.sin(t / 13),
      pitch: 0.06 + 0.12 * (0.5 + 0.5 * Math.sin(t / 9 + 1)),
      dist: 820 + 260 * Math.sin(t / 17 + 0.5),
      target: [60 * Math.sin(t / 7), 150, z],
    });
  }

  /** 자유 시점 카메라를 직접 정한다 (공작소의 옆에서 보기) */
  setOrbit(yaw: number, pitch: number, dist: number, target: Vec3): void {
    this.orbit = { yaw, pitch, dist, target };
    this.seatId = 'free';
    this.backdropKey = '';
    this.layout();
  }

  /** 자유 시점 돌리기 (화면 픽셀 기준) */
  orbitBy(dx: number, dy: number): void {
    if (this.seatId !== 'free') return;
    this.orbit.yaw -= dx * 0.005;
    this.orbit.pitch = Math.min(1.35, Math.max(-0.05, this.orbit.pitch + dy * 0.004));
    this.layout();
  }

  zoomBy(factor: number): void {
    if (this.seatId !== 'free') return;
    this.orbit.dist = Math.min(3000, Math.max(150, this.orbit.dist * factor));
    this.layout();
  }

  /** 쇼를 바꾼다. 같은 쇼를 고친 것이면 고친 곳 이후만 다시 계산한다. */
  setShow(show: Show): void {
    const launchersChanged =
      JSON.stringify(show.launchers) !== JSON.stringify(this.sim.show.launchers) ||
      show.venue.cloud !== this.sim.show.venue.cloud ||
      show.venue.sky !== this.sim.show.venue.sky;
    this.sim.setShow(show);
    if (launchersChanged) this.backdropKey = '';
  }

  /** 다른 쇼를 처음부터 연다. */
  load(show: Show): void {
    this.sim = new Simulation(show, { density: this.sim.density });
    this.buffer = new Float32Array((this.sim.pool.capacity + RENDER_EXTRA) * RENDER_STRIDE);
    this.seatId = show.seat?.id ?? this.seatId;
    this.backdropKey = '';
    this.layout();
  }

  private rebuild(density: number): void {
    const show = this.sim.show;
    const t = this.sim.time;
    this.sim = new Simulation(show, { density });
    this.buffer = new Float32Array((this.sim.pool.capacity + RENDER_EXTRA) * RENDER_STRIDE);
    this.sim.advanceTo(t);
    this.backdropKey = '';
    this.layout();
  }

  layout(): void {
    // 터치 기기(휴대폰·태블릿)는 화소를 1.5배까지만: 빛나는 점이라 티가 거의 안 나고 그래픽 부담은 크게 준다.
    const maxDpr = matchMedia('(pointer: coarse)').matches ? 1.5 : 2;
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr) * (this.sim.density < 0.5 ? 0.75 : 1);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    const cam = this.seat;
    const key = `${w}x${h}:${this.seatId}:${this.sim.show.venue.preset}:${this.sim.show.venue.map?.lat ?? ''}:${this.sim.show.venue.map?.buildings.length ?? ''}:${this.sim.show.venue.sky}:${cam.eye.map((v) => v.toFixed(1))}`;
    if (key === this.backdropKey) return;
    this.backdropKey = key;
    this.canvas.width = w;
    this.canvas.height = h;
    this.view = makeView(cam, w, h);
    // 카메라가 움직이는 동안에는 배경을 절반 해상도로 그려 가볍게 한다 (어두운 실루엣이라 티가 안 난다).
    const scale = this.moving ? 0.5 : 1;
    const bw = Math.max(1, Math.round(w * scale));
    const bh = Math.max(1, Math.round(h * scale));
    this.backdrop.width = bw;
    this.backdrop.height = bh;
    const markers: Marker[] = cam.plan
      ? this.sim.show.launchers.map((l, i) => ({ pos: l.pos, label: launcherLabel(l, i), from: l.from, to: l.to }))
      : [];
    paintBackdrop(this.backdrop.getContext('2d')!, bw, bh, this.view.viewProj, this.venue, markers, this.sim.show.venue.cloud, this.look);
    this.renderer.setBackdrop(this.backdrop);
  }

  get look() {
    return SKIES[this.sim.show.venue.sky ?? 'night'];
  }

  render(t: number, playing: boolean): void {
    this.time = t;
    this.layout();
    this.sim.advanceTo(t);
    this.count = this.sim.writeRender(this.buffer);
    const look = this.look;
    if (look.snow) {
      const light = this.sim.skyLight[0] + this.sim.skyLight[1] + this.sim.skyLight[2];
      this.count += writeSnow(this.buffer, this.count, t, this.seat.eye, light);
    }
    const venue = this.venue;
    this.renderer.render({
      buffer: this.buffer,
      count: this.count,
      viewProj: this.view.viewProj,
      pxPerMeter: this.view.pxPerMeter,
      eye: this.seat.eye,
      skyLight: this.sim.skyLight,
      reflection: !this.seat.plan,
      shore: waterSpan(venue),
      fog: look.fog,
      smoke: { buffer: this.smokeBuffer, count: this.sim.writeSmoke(this.smokeBuffer) },
    });
    this.watchSpeed(playing);
  }

  /**
   * 0.5초마다 fps를 재고, 불꽃이 많이 떠 있는데(입자 2,500개 넘게) 재생 중 3초 동안 계속 느리면 밀도를 한 단계 낮춘다.
   * 입자가 적은데 느린 것은 불꽃 탓이 아니므로(창이 뒤에 있어 브라우저가 늦추는 등) 낮추지 않고,
   * 낮춘 뒤 불꽃이 많은 장면에서도 8초 넘게 넉넉히 빠르면 한 단계 되돌린다.
   */
  private watchSpeed(playing: boolean): void {
    const now = performance.now();
    this.frames++;
    if (now - this.windowStart < 500) return;
    this.fps = (this.frames * 1000) / (now - this.windowStart);
    this.frames = 0;
    this.windowStart = now;
    const busy = this.count > 2500;
    // 아주 느리면(초당 25장 아래) 불꽃 양과 상관없이 번짐부터 줄인다 (번짐은 화소 수만큼 든다).
    if (this.qualityPref === 'auto' && this.renderer.effectiveQuality !== 'low' && this.fps < 25 && !document.hidden) {
      this.renderer.quality = this.renderer.effectiveQuality === 'high' ? 'medium' : 'low';
      this.slowSince = 0;
      this.fastSince = 0;
      return;
    }
    if (playing && busy && this.fps < 45 && !document.hidden) {
      this.fastSince = 0;
      this.slowSince ||= now;
      if (now - this.slowSince > 3000) {
        // 자동 화질이면 번짐부터 줄이고, 그래도 느리면 밀도를 낮춘다.
        const q = this.renderer.effectiveQuality;
        if (this.qualityPref === 'auto' && q !== 'low') this.renderer.quality = q === 'high' ? 'medium' : 'low';
        else if (this.sim.density > 0.35) {
          this.rebuild(this.sim.density > 0.6 ? 0.6 : 0.35);
          this.onDensityLowered?.();
        }
        this.slowSince = 0;
      }
    } else if (playing && this.count > 1500 && this.fps >= 57 && this.sim.density < 1) {
      this.slowSince = 0;
      this.fastSince ||= now;
      if (now - this.fastSince > 8000) {
        this.rebuild(this.sim.density < 0.5 ? 0.6 : 1);
        this.fastSince = 0;
      }
    } else if (playing && this.count > 1500 && this.fps >= 57 && this.qualityPref === 'auto' && this.renderer.quality !== 'high') {
      // 밀도를 다 되돌린 뒤에도 넉넉하면 번짐을 한 단계 되돌린다.
      this.slowSince = 0;
      this.fastSince ||= now;
      if (now - this.fastSince > 8000) {
        this.renderer.quality = this.renderer.quality === 'low' ? 'medium' : 'high';
        this.fastSince = 0;
      }
    } else {
      this.slowSince = 0;
      if (!playing) this.fastSince = 0;
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

  /** 지금 관람석에서 이 불꽃 소리가 늦게 들리는 시간 (위에서 보기, 움직이는 카메라는 0) */
  soundDelay = (l: Launch): number =>
    this.seat.plan || this.seatId === 'free' || this.seatId === 'fly' ? 0 : soundDelay(this.seat.eye, l);

  /**
   * 무대 조작: 자유 시점에서는 끌어서 돌리고 휠·두 손가락으로 확대한다.
   * 거의 움직이지 않고 뗀 것은 '누르기'로 보고 onTap을 부른다.
   */
  attachControls(onTap: (clientX: number) => void): void {
    const pts = new Map<number, { x: number; y: number }>();
    let start = { x: 0, y: 0 };
    let moved = 0;
    let pinch = 0;
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) {
        start = { x: e.clientX, y: e.clientY };
        moved = 0;
        c.setPointerCapture(e.pointerId);
      }
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });
    c.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      moved = Math.max(moved, Math.hypot(e.clientX - start.x, e.clientY - start.y));
      if (this.seatId !== 'free') return;
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0) this.zoomBy(pinch / d);
        pinch = d;
      } else if (moved > 4) {
        this.dragging = true;
        this.orbitBy(dx, dy);
      }
    });
    const end = (e: PointerEvent) => {
      const wasSingle = pts.size === 1;
      pts.delete(e.pointerId);
      if (pts.size === 0 && this.dragging) {
        this.dragging = false;
        this.backdropKey = '';
      }
      if (wasSingle && e.type === 'pointerup' && moved <= 4) onTap(e.clientX);
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener(
      'wheel',
      (e) => {
        if (this.seatId !== 'free') return;
        e.preventDefault();
        this.zoomBy(Math.exp(e.deltaY * 0.0015));
      },
      { passive: false },
    );
  }
}
