// 3D 도시: 무대의 건물과 다리를 입체 모형(삼각형)으로 만든다.
// 건물은 앞면·옆면·지붕이 있는 상자이고, 창문은 셰이더가 층마다 격자로 그린다 (몇 개는 불이 켜져 있다).
// 다리는 상판·교각·아치·주탑을 상자로 만들고, 상판을 따라 가로등을 단다.
// 강변도로에는 차 불빛이 오간다 (시각만으로 정해지므로 같은 시각이면 늘 같다).

import { RENDER_STRIDE } from '../sim.ts';
import type { Vec3 } from '../show.ts';
import type { BridgeShape, Crossing, Venue } from '../venues.ts';

/** 꼭짓점 하나: 위치(3) 법선(3) 면 위 자리 m(2) 건물 번호·종류(2) */
export const CITY_STRIDE = 10;

/** 종류: 0 건물, 1 다리 */
const KIND_BUILDING = 0;
const KIND_BRIDGE = 1;

export interface CityMesh {
  /** 꼭짓점 (CITY_STRIDE개씩, 삼각형 목록) */
  vertices: Float32Array;
  count: number;
  /** 늘 켜진 불빛: 다리 가로등, 높은 건물 꼭대기 항공등 (점 버퍼, RENDER_STRIDE개씩) */
  lamps: Float32Array;
  lampCount: number;
}

class Builder {
  private v: number[] = [];
  private lamps: number[] = [];

  /** 사각형 면 하나 (a→b→c→d 반시계, 법선 n). 면 위 자리는 가로 a→b, 세로 a→d 길이(m) */
  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, n: Vec3, seed: number, kind: number): void {
    const w = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const h = Math.hypot(d[0] - a[0], d[1] - a[1], d[2] - a[2]);
    const put = (p: Vec3, u: number, t: number) => this.v.push(p[0], p[1], p[2], n[0], n[1], n[2], u, t, seed, kind);
    put(a, 0, 0);
    put(b, w, 0);
    put(c, w, h);
    put(a, 0, 0);
    put(c, w, h);
    put(d, 0, h);
  }

  /** 상자: 바닥 x0..x1, z0..z1, 높이 y0..y1 (바닥면은 안 보이므로 뺀다) */
  box(x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, seed: number, kind: number): void {
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1], seed, kind); // 앞(관람석 쪽)
    this.quad([x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [0, 0, 1], seed, kind); // 뒤
    this.quad([x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [-1, 0, 0], seed, kind); // 왼쪽
    this.quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [1, 0, 0], seed, kind); // 오른쪽
    this.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0], seed, kind); // 지붕
  }

  /** 기울어진 막대 (아치 조각·케이블): a에서 b까지 두께 t인 상자 */
  beam(a: Vec3, b: Vec3, t: number, depth: number, seed: number): void {
    const x0 = Math.min(a[0], b[0]);
    const x1 = Math.max(a[0], b[0]);
    const y0 = Math.min(a[1], b[1]);
    const y1 = Math.max(a[1], b[1]) + t;
    this.box(x0, Math.max(x1, x0 + t), a[2] - depth / 2, a[2] + depth / 2, y0, y1, seed, KIND_BRIDGE);
  }

  /** 남북(z) 방향으로 기울어진 막대: a에서 b까지 두께 t, 폭 width */
  beamZ(a: Vec3, b: Vec3, t: number, width: number, seed: number): void {
    const z0 = Math.min(a[2], b[2]);
    const z1 = Math.max(a[2], b[2]);
    this.box(a[0] - width / 2, a[0] + width / 2, z0, Math.max(z1, z0 + t), Math.min(a[1], b[1]), Math.max(a[1], b[1]) + t, seed, KIND_BRIDGE);
  }

  lamp(p: Vec3, rgb: Vec3, size: number, bright: number): void {
    this.lamps.push(p[0], p[1], p[2], size, rgb[0], rgb[1], rgb[2], bright);
  }

  done(): CityMesh {
    return {
      vertices: new Float32Array(this.v),
      count: this.v.length / CITY_STRIDE,
      lamps: new Float32Array(this.lamps),
      lampCount: this.lamps.length / RENDER_STRIDE,
    };
  }
}

const WARM: Vec3 = [1, 0.78, 0.5];

function addBridge(b: Builder, br: BridgeShape): void {
  if (br.kind === 'none') return;
  const { z, deckY } = br;
  const deckDepth = 22;
  // 상판 (차도 폭 22m)과 상판을 따라 양쪽 가로등 (30m마다)
  b.box(br.x0, br.x1, z - deckDepth / 2, z + deckDepth / 2, deckY - 3, deckY, 1, KIND_BRIDGE);
  for (let x = br.x0 + 15; x < br.x1; x += 30) {
    b.lamp([x, deckY + 7, z - deckDepth / 2], WARM, 1.8, 1);
    b.lamp([x + 15, deckY + 7, z + deckDepth / 2], WARM, 1.8, 0.7);
  }
  if (br.kind === 'girder') {
    for (const x of br.piers) b.box(x - 3, x + 3, z - 6, z + 6, 0, deckY - 3, 2, KIND_BRIDGE);
    return;
  }
  if (br.kind === 'arch') {
    const half = br.span / 2;
    for (const x of [-half - 30, half + 10]) b.box(x, x + 20, z - 14, z + 14, 0, deckY + 40, 3, KIND_BRIDGE);
    const arch = (x: number) => deckY + br.rise * 1.6 * (1 - (x / half) ** 2) - 10;
    const step = 20;
    for (let x = -half; x < half; x += step) {
      for (const side of [-1, 1]) b.beam([x, arch(x), z + side * 9], [x + step, arch(x + step), z + side * 9], 6, 4, 4);
      if (x > -half && Math.abs(x) < half * 0.85) b.box(x - 0.6, x + 0.6, z - 9.6, z - 8.4, deckY, arch(x), 5, KIND_BRIDGE);
    }
    return;
  }
  // 현수교: 주탑과 늘어진 케이블, 주탑 꼭대기 항공등
  const [t0, t1] = br.towers;
  const top = deckY + br.towerH;
  for (const x of br.towers) {
    b.box(x - 6, x + 6, z - 14, z - 8, 0, top, 6, KIND_BRIDGE);
    b.box(x - 6, x + 6, z + 8, z + 14, 0, top, 6, KIND_BRIDGE);
    b.box(x - 6, x + 6, z - 14, z + 14, top - 8, top, 6, KIND_BRIDGE);
    b.lamp([x, top + 3, z], [1, 0.15, 0.1], 2.4, 0.7);
  }
  const mid = (t0 + t1) / 2;
  const halfSpan = (t1 - t0) / 2;
  const sag = (x: number) => {
    if (x >= t0 && x <= t1) return deckY + 6 + (br.towerH - 6) * ((x - mid) / halfSpan) ** 2;
    const out = x < t0 ? t0 - x : x - t1;
    return Math.max(deckY + 2, top - out * 0.25);
  };
  const step = 25;
  for (let x = t0 - 450; x < t1 + 450; x += step) {
    for (const side of [-11, 11]) {
      b.beam([x, sag(x), z + side], [x + step, sag(x + step), z + side], 1.2, 1.2, 7);
      // 케이블 따라 조명 (밤 다리의 빛줄)
      b.lamp([x, sag(x) + 1, z + side], [0.75, 0.85, 1], 1.1, 0.35);
    }
  }
}

/** 강을 가로지르는 다리 (남북 방향): 상판·교각, 철교는 트러스, 아치교는 아치. 양쪽 가로등 */
function addCrossing(b: Builder, c: Crossing): void {
  const { x, z0, z1, deckY } = c;
  const half = c.kind === 'truss' ? 8 : 13;
  b.box(x - half, x + half, z0, z1, deckY - 3, deckY, 21, KIND_BRIDGE);
  for (let z = z0 + 60; z < z1; z += 120) b.box(x - 4, x + 4, z - 4, z + 4, 0, deckY - 3, 22, KIND_BRIDGE);
  for (let z = z0 + 15; z < z1; z += 30) {
    b.lamp([x - half, deckY + 7, z], WARM, 1.8, 0.9);
    b.lamp([x + half, deckY + 7, z + 15], WARM, 1.8, 0.65);
  }
  if (c.kind === 'truss') {
    // 철교: 양쪽 위 줄과 15m마다 세로 부재
    for (const side of [-half, half]) {
      b.box(x + side - 0.8, x + side + 0.8, z0, z1, deckY + 11, deckY + 12.5, 23, KIND_BRIDGE);
      for (let z = z0; z < z1; z += 15) b.box(x + side - 0.6, x + side + 0.6, z - 0.6, z + 0.6, deckY, deckY + 12, 23, KIND_BRIDGE);
    }
  } else if (c.kind === 'arch') {
    // 한강대교처럼 경간마다 낮은 아치
    for (let z = z0; z < z1; z += 120) {
      const step = 12;
      for (let s = 0; s < 120; s += step) {
        const y = (t: number) => deckY + 22 * Math.sin((Math.PI * t) / 120);
        for (const side of [-half, half]) b.beamZ([x + side, y(s), z + s], [x + side, y(s + step), z + s + step], 1.2, 1.2, 24);
      }
    }
  }
}

/** 무대의 건물과 다리로 3D 모형을 만든다. 무대가 바뀔 때만 부른다. */
export function buildCityMesh(venue: Venue): CityMesh {
  const b = new Builder();
  venue.buildings.forEach((bd, i) => {
    const width = bd.x1 - bd.x0;
    // 깊이는 폭에 맞춰 (가늘고 높은 탑도 너무 얇지 않게)
    const depth = Math.max(12, Math.min(45, width * 0.9));
    b.box(bd.x0, bd.x1, bd.z, bd.z + depth, 0, bd.height, 11 + i, KIND_BUILDING);
    // 120m 넘는 건물 꼭대기에는 빨간 항공등
    if (bd.height > 120) b.lamp([(bd.x0 + bd.x1) / 2, bd.height + 2, bd.z + depth / 2], [1, 0.12, 0.08], 2.2, 0.6);
  });
  addBridge(b, venue.bridge);
  for (const c of venue.crossings ?? []) addCrossing(b, c);
  return b.done();
}

/**
 * 강변도로의 차 불빛 (건너편 강가와 가까운 강가 도로). 시각만으로 정해진다.
 * out에 RENDER_STRIDE개씩 채우고 개수를 돌려준다.
 */
export function writeCityTraffic(venue: Venue, t: number, out: Float32Array): number {
  const roads: { z: number; y: number }[] = [];
  if (venue.farShoreZ !== null) roads.push({ z: venue.farShoreZ + 25, y: 4 });
  const L = 6000;
  let k = 0;
  for (const road of roads) {
    for (const dir of [1, -1]) {
      for (let i = 0; i < 70 && k + 2 * RENDER_STRIDE <= out.length; i++) {
        // 차마다 빠르기와 간격이 조금씩 다르다
        const speed = 14 + ((i * 37) % 11);
        const x = ((((i * 97.3 + dir * t * speed) % L) + L) % L) - L / 2;
        const z = road.z + (dir > 0 ? -3 : 3);
        // 이쪽으로 오는 차는 흰 전조등, 멀어지는 차는 빨간 미등
        const rgb: Vec3 = dir > 0 ? [1, 0.95, 0.85] : [1, 0.18, 0.12];
        for (const dx of [-0.8, 0.8]) {
          out[k++] = x + dx;
          out[k++] = road.y;
          out[k++] = z;
          out[k++] = 0.9;
          out[k++] = rgb[0];
          out[k++] = rgb[1];
          out[k++] = rgb[2];
          out[k++] = dir > 0 ? 0.5 : 0.35;
        }
      }
    }
  }
  return k / RENDER_STRIDE;
}
