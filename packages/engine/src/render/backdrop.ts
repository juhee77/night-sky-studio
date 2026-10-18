// 배경(하늘, 강, 건너편 도시, 다리)을 2D 캔버스에 그린다.
// 불꽃과 같은 카메라로 3D 좌표를 투영하므로, 관람석을 바꾸면 배경도 같이 바뀐다.

import { NEAR, toClip, type Mat4 } from '../camera.ts';
import { mulberry32 } from '../rng.ts';
import type { Vec3 } from '../show.ts';
import type { Venue } from '../venues.ts';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const SKY_TOP = '#03040c';
const SKY_HORIZON = '#161a3e';
const WATER = '#080b20';
const GROUND = '#04050b';
const BUILDING = '#06070f';
const BRIDGE = '#0c0e22';
const WINDOW = 'rgba(255, 196, 120, 0.35)';

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

/** 세계의 한 점이 화면 어디에 오는지 (카메라 뒤면 null) */
export function projectPoint(m: Mat4, p: Vec3, w: number, h: number): [number, number] | null {
  const [x, y, , cw] = toClip(m, p);
  if (cw <= NEAR) return null;
  return [((x / cw) * 0.5 + 0.5) * w, (1 - ((y / cw) * 0.5 + 0.5)) * h];
}

export function paintBackdrop(ctx: Ctx, w: number, h: number, m: Mat4, venue: Venue): void {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, SKY_TOP);
  sky.addColorStop(0.8, SKY_HORIZON);
  sky.addColorStop(1, SKY_HORIZON);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  const rnd = mulberry32(42);
  for (let i = 0; i < 160; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.12 + rnd() * 0.35})`;
    const s = (0.6 + rnd()) * Math.max(1, h / 700);
    ctx.fillRect(rnd() * w, rnd() * h * 0.7, s, s);
  }

  const X = 6000;
  fillWorld(ctx, m, [[-X, 0, venue.farShoreZ], [X, 0, venue.farShoreZ], [X, 0, 5000], [-X, 0, 5000]], w, h, GROUND);
  fillWorld(ctx, m, [[-X, 0, venue.nearShoreZ], [X, 0, venue.nearShoreZ], [X, 0, venue.farShoreZ], [-X, 0, venue.farShoreZ]], w, h, WATER);

  // 멀리 있는 줄부터 그려야 가까운 건물이 앞을 가린다.
  const buildings = [...venue.buildings].sort((a, b) => b.z - a.z);
  for (const b of buildings) {
    fillWorld(ctx, m, [[b.x0, 0, b.z], [b.x1, 0, b.z], [b.x1, b.height, b.z], [b.x0, b.height, b.z]], w, h, BUILDING);
    for (const [wx, wy] of b.windows) {
      fillWorld(ctx, m, [[wx, wy, b.z - 0.5], [wx + 2.5, wy, b.z - 0.5], [wx + 2.5, wy + 2.5, b.z - 0.5], [wx, wy + 2.5, b.z - 0.5]], w, h, WINDOW);
    }
  }

  const br = venue.bridge;
  for (const x of br.piers) {
    fillWorld(ctx, m, [[x - 3, 0, br.z], [x + 3, 0, br.z], [x + 3, br.deckY, br.z], [x - 3, br.deckY, br.z]], w, h, BRIDGE);
  }
  fillWorld(
    ctx, m,
    [[-2000, br.deckY, br.z], [2000, br.deckY, br.z], [2000, br.deckY + br.deckThickness, br.z], [-2000, br.deckY + br.deckThickness, br.z]],
    w, h, BRIDGE,
  );

  fillWorld(ctx, m, [[-X, 0, -5000], [X, 0, -5000], [X, 0, venue.nearShoreZ], [-X, 0, venue.nearShoreZ]], w, h, GROUND);
}
