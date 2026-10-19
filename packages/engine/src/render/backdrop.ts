// 배경(하늘, 강, 건너편 도시, 다리)을 2D 캔버스에 그린다.
// 불꽃과 같은 카메라로 3D 좌표를 투영하므로, 관람석을 바꾸면 배경도 같이 바뀐다.

import { NEAR, toClip, type Mat4 } from '../camera.ts';
import { mulberry32 } from '../rng.ts';
import type { Vec3 } from '../show.ts';
import type { BridgeShape, Venue } from '../venues.ts';
import { SKIES, type SkyLook } from '../weather.ts';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const GROUND = '#04050b';
const BUILDING = '#06070f';
const BRIDGE = '#0c0e22';
const CABLE = 'rgba(120, 130, 190, 0.35)';

/** 사각형(또는 다각형)을 카메라 앞쪽만 남기고 잘라서 칠한다. */
function fillWorld(ctx: Ctx, m: Mat4, pts: Vec3[], w: number, h: number, color: string): void {
  const clip = pts.map((p) => toClip(m, p));
  const kept: [number, number, number, number][] = [];
  for (let i = 0; i < clip.length; i++) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    const ina = a[3] > NEAR;
    const inb = b[3] > NEAR;
    if (ina) kept.push(a);
    if (ina !== inb) {
      const t = (NEAR - a[3]) / (b[3] - a[3]);
      kept.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, NEAR]);
    }
  }
  if (kept.length < 3) return;
  ctx.beginPath();
  kept.forEach(([x, y, , cw], i) => {
    const sx = ((x / cw) * 0.5 + 0.5) * w;
    const sy = (1 - ((y / cw) * 0.5 + 0.5)) * h;
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  });
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/** 두 점을 잇는 띠 (세계 좌표에서 두께 thick m, 다리 쪽 z면 위에) */
function band(ctx: Ctx, m: Mat4, w: number, h: number, a: Vec3, b: Vec3, thick: number, color: string): void {
  fillWorld(ctx, m, [a, b, [b[0], b[1] + thick, b[2]], [a[0], a[1] + thick, a[2]]], w, h, color);
}

function drawBridge(ctx: Ctx, m: Mat4, w: number, h: number, br: BridgeShape): void {
  if (br.kind === 'none') return;
  const { z, deckY } = br;
  if (br.kind === 'girder') {
    for (const x of br.piers) fillWorld(ctx, m, [[x - 3, 0, z], [x + 3, 0, z], [x + 3, deckY, z], [x - 3, deckY, z]], w, h, BRIDGE);
    band(ctx, m, w, h, [br.x0, deckY, z], [br.x1, deckY, z], 5, BRIDGE);
    return;
  }
  if (br.kind === 'arch') {
    // 양 끝 돌 기둥, 상판, 그 위로 크게 휜 아치와 아치에서 상판으로 내려오는 줄
    const half = br.span / 2;
    for (const x of [-half - 30, half + 10]) fillWorld(ctx, m, [[x, 0, z], [x + 20, 0, z], [x + 20, deckY + 40, z], [x, deckY + 40, z]], w, h, BRIDGE);
    band(ctx, m, w, h, [br.x0, deckY, z], [br.x1, deckY, z], 6, BRIDGE);
    const arch = (x: number) => deckY + br.rise * 1.6 * (1 - (x / half) ** 2) - 10;
    const step = 20;
    for (let x = -half; x < half; x += step) {
      band(ctx, m, w, h, [x, arch(x), z], [x + step, arch(x + step), z], 9, BRIDGE);
      if (x > -half && Math.abs(x) < half * 0.85) fillWorld(ctx, m, [[x - 0.8, deckY, z], [x + 0.8, deckY, z], [x + 0.8, arch(x), z], [x - 0.8, arch(x), z]], w, h, BRIDGE);
    }
    return;
  }
  // 현수교: 주탑, 상판, 주탑 사이와 바깥으로 늘어진 케이블, 케이블에서 내려오는 줄
  const [t0, t1] = br.towers;
  const top = deckY + br.towerH;
  for (const x of br.towers) fillWorld(ctx, m, [[x - 6, 0, z], [x + 6, 0, z], [x + 6, top, z], [x - 6, top, z]], w, h, BRIDGE);
  band(ctx, m, w, h, [br.x0, deckY, z], [br.x1, deckY, z], 5, BRIDGE);
  const mid = (t0 + t1) / 2;
  const halfSpan = (t1 - t0) / 2;
  const sag = (x: number) => {
    if (x >= t0 && x <= t1) return deckY + 6 + (br.towerH - 6) * ((x - mid) / halfSpan) ** 2;
    const out = x < t0 ? t0 - x : x - t1;
    return Math.max(deckY + 2, top - out * 0.25);
  };
  const step = 25;
  for (let x = t0 - 450; x < t1 + 450; x += step) {
    band(ctx, m, w, h, [x, sag(x), z], [x + step, sag(x + step), z], 1.6, CABLE);
    if (Math.abs(x - t0) > 10 && Math.abs(x - t1) > 10) fillWorld(ctx, m, [[x - 0.4, deckY, z], [x + 0.4, deckY, z], [x + 0.4, sag(x), z], [x - 0.4, sag(x), z]], w, h, CABLE);
  }
}

/** 세계의 한 점이 화면 어디에 오는지 (카메라 뒤면 null) */
export function projectPoint(m: Mat4, p: Vec3, w: number, h: number): [number, number] | null {
  const [x, y, , cw] = toClip(m, p);
  if (cw <= NEAR) return null;
  return [((x / cw) * 0.5 + 0.5) * w, (1 - ((y / cw) * 0.5 + 0.5)) * h];
}

/** 위에서 보기에서 발사 위치를 표시할 때 쓰는 이름표 */
export interface Marker {
  pos: Vec3;
  label: string;
  /** 다리는 양 끝을 잇는 선으로 그린다 */
  to?: Vec3;
  from?: Vec3;
}

export function paintBackdrop(
  ctx: Ctx, w: number, h: number, m: Mat4, venue: Venue, markers: Marker[] = [], cloud?: number, look: SkyLook = SKIES.night,
): void {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, look.top);
  sky.addColorStop(0.8, look.horizon);
  sky.addColorStop(1, look.horizon);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  const rnd = mulberry32(42);
  for (let i = 0; i < look.stars; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.12 + rnd() * 0.35})`;
    const s = (0.6 + rnd()) * Math.max(1, h / 700);
    ctx.fillRect(rnd() * w, rnd() * h * 0.7, s, s);
  }

  const X = 6000;
  // 낮게 깔린 구름: 하늘을 덮는 천장. 이보다 높이 터지는 불꽃은 구름 속에 묻힌다.
  if (cloud) {
    fillWorld(ctx, m, [[-X, cloud, -1500], [X, cloud, -1500], [X, cloud, 6000], [-X, cloud, 6000]], w, h, 'rgba(52, 56, 92, 0.72)');
    fillWorld(ctx, m, [[-X, cloud - 25, -1500], [X, cloud - 25, -1500], [X, cloud - 25, 6000], [-X, cloud - 25, 6000]], w, h, 'rgba(52, 56, 92, 0.25)');
  }
  const far = venue.farShoreZ ?? 9000;
  if (venue.farShoreZ !== null) {
    fillWorld(ctx, m, [[-X, 0, far], [X, 0, far], [X, 0, 5000], [-X, 0, 5000]], w, h, GROUND);
  }
  fillWorld(ctx, m, [[-X, 0, venue.nearShoreZ], [X, 0, venue.nearShoreZ], [X, 0, far], [-X, 0, far]], w, h, look.water);
  if (venue.farShoreZ === null) {
    // 수평선: 바다 끝이 하늘과 만나는 곳을 조금 밝게
    fillWorld(ctx, m, [[-X * 3, 0, 8800], [X * 3, 0, 8800], [X * 3, 6, 8800], [-X * 3, 6, 8800]], w, h, 'rgba(70, 76, 130, 0.5)');
  }

  // 멀리 있는 줄부터 그려야 가까운 건물이 앞을 가린다.
  const buildings = [...venue.buildings].sort((a, b) => b.z - a.z);
  for (const b of buildings) {
    fillWorld(ctx, m, [[b.x0, 0, b.z], [b.x1, 0, b.z], [b.x1, b.height, b.z], [b.x0, b.height, b.z]], w, h, BUILDING);
    for (const [wx, wy] of b.windows) {
      fillWorld(ctx, m, [[wx, wy, b.z - 0.5], [wx + 2.5, wy, b.z - 0.5], [wx + 2.5, wy + 2.5, b.z - 0.5], [wx, wy + 2.5, b.z - 0.5]], w, h, `rgba(255, 196, 120, ${look.windows})`);
    }
  }

  drawBridge(ctx, m, w, h, venue.bridge);

  // 안개: 먼 것일수록 흐리게 덮는다 (화면 전체에 옅은 막)
  if (look.fog) {
    ctx.fillStyle = 'rgba(46, 49, 68, 0.45)';
    ctx.fillRect(0, 0, w, h);
  }

  fillWorld(ctx, m, [[-X, 0, -5000], [X, 0, -5000], [X, 0, venue.nearShoreZ], [-X, 0, venue.nearShoreZ]], w, h, venue.nearGround);

  // 발사 위치 표시 (위에서 보기)
  const scale = Math.max(1, h / 700);
  ctx.font = `600 ${Math.round(13 * scale)}px 'IBM Plex Sans KR', -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  for (const mk of markers) {
    if (mk.from && mk.to) {
      const a = projectPoint(m, mk.from, w, h);
      const b = projectPoint(m, mk.to, w, h);
      if (a && b) {
        ctx.strokeStyle = 'rgba(251, 146, 60, 0.9)';
        ctx.lineWidth = 3 * scale;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
      }
    }
    const p = projectPoint(m, mk.pos, w, h);
    if (!p) continue;
    ctx.fillStyle = '#fb923c';
    ctx.beginPath();
    ctx.arc(p[0], p[1], 5 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#eceaf6';
    ctx.fillText(mk.label, p[0], p[1] - 10 * scale);
  }
  ctx.textAlign = 'start';
}
