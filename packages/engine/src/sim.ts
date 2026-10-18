// 불꽃 계산. 모든 값은 미터 단위 3D 좌표 [동, 높이, 북]이고,
// 화면 주사율과 상관없이 STEP 간격으로만 계산한다. 그래서 같은 쇼는 어느 기기에서나 같게 재생된다.

import { SHELLS, SIZE_SPECS, starCount } from './catalog.ts';
import { COLORS } from './colors.ts';
import { hash32, rand01 } from './rng.ts';
import { expandShow, windVector, type Launch, type Show, type ShowWarning, type Vec3 } from './show.ts';

/** 고정 계산 간격(초) */
export const STEP = 1 / 120;

export const FLAG_SPARK_TAIL = 1; // 국화: 지나간 자리에 불티를 남긴다
export const FLAG_WILLOW_TAIL = 2; // 버들: 길게 늘어지는 금빛 꼬리
export const FLAG_EMBER = 4; // 끝으로 갈수록 주황빛으로 식는다
export const FLAG_GLITTER = 8; // 사라지기 전에 반짝인다
export const FLAG_FLASH = 16; // 터지는 순간의 섬광
export const FLAG_SPARK = 32; // 꼬리에서 떨어져 나온 불티

/** 렌더 버퍼에서 입자 하나가 차지하는 float 개수: x, y, z, 크기(m), r, g, b, a */
export const RENDER_STRIDE = 8;

const SPARK_RGB = [1.0, 0.62, 0.26] as const;
const EMBER_RGB = [1.0, 0.32, 0.08] as const;
const HEAD_RGB = [1.0, 0.85, 0.6] as const;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const SPARK_DAMP = Math.exp(-3 * STEP);
const WILLOW_SPARK_DAMP = Math.exp(-2 * STEP);
const TRAIL_DAMP = Math.exp(-2.5 * STEP);
const SKY_DECAY = Math.exp(-6 * STEP);

class ParticlePool {
  readonly capacity: number;
  count = 0;
  readonly px: Float32Array;
  readonly py: Float32Array;
  readonly pz: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly vz: Float32Array;
  readonly age: Float32Array;
  readonly life: Float32Array;
  readonly r: Float32Array;
  readonly g: Float32Array;
  readonly b: Float32Array;
  readonly size: Float32Array;
  /** 한 스텝마다 속도에 곱하는 감쇠값 exp(-drag * STEP) */
  readonly damp: Float32Array;
  readonly grav: Float32Array;
  readonly flags: Uint8Array;
  readonly seed: Uint32Array;

  constructor(capacity: number) {
    this.capacity = capacity;
    const f = () => new Float32Array(capacity);
    this.px = f();
    this.py = f();
    this.pz = f();
    this.vx = f();
    this.vy = f();
    this.vz = f();
    this.age = f();
    this.life = f();
    this.r = f();
    this.g = f();
    this.b = f();
    this.size = f();
    this.damp = f();
    this.grav = f();
    this.flags = new Uint8Array(capacity);
    this.seed = new Uint32Array(capacity);
  }

  spawn(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    life: number,
    r: number, g: number, b: number,
    size: number, damp: number, grav: number,
    flags: number, seed: number,
  ): boolean {
    const i = this.count;
    if (i >= this.capacity) return false;
    this.px[i] = x;
    this.py[i] = y;
    this.pz[i] = z;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.vz[i] = vz;
    this.age[i] = 0;
    this.life[i] = life;
    this.r[i] = r;
    this.g[i] = g;
    this.b[i] = b;
    this.size[i] = size;
    this.damp[i] = damp;
    this.grav[i] = grav;
    this.flags[i] = flags;
    this.seed[i] = seed;
    this.count = i + 1;
    return true;
  }

  /** 수명이 다한 입자를 순서를 지키며 지운다. */
  compact(): void {
    let w = 0;
    for (let i = 0; i < this.count; i++) {
      if (this.age[i] >= this.life[i]) continue;
      if (w !== i) {
        this.px[w] = this.px[i];
        this.py[w] = this.py[i];
        this.pz[w] = this.pz[i];
        this.vx[w] = this.vx[i];
        this.vy[w] = this.vy[i];
        this.vz[w] = this.vz[i];
        this.age[w] = this.age[i];
        this.life[w] = this.life[i];
        this.r[w] = this.r[i];
        this.g[w] = this.g[i];
        this.b[w] = this.b[i];
        this.size[w] = this.size[i];
        this.damp[w] = this.damp[i];
        this.grav[w] = this.grav[i];
        this.flags[w] = this.flags[i];
        this.seed[w] = this.seed[i];
      }
      w++;
    }
    this.count = w;
  }
}

/** 올라가는 중인 불꽃 알 */
interface Rising {
  launch: Launch;
  age: number;
  pos: Vec3;
}

export interface SimOptions {
  /** 별과 불티의 밀도(0.25~1). 느린 기기에서 낮춘다. */
  density?: number;
}

export class Simulation {
  readonly show: Show;
  readonly launches: Launch[];
  readonly warnings: ShowWarning[];
  readonly duration: number;
  readonly density: number;
  readonly pool: ParticlePool;
  /** 터진 불꽃이 하늘을 밝히는 빛 [r, g, b] */
  readonly skyLight: [number, number, number] = [0, 0, 0];

  /** 지금까지 진행한 스텝 수 */
  step = 0;
  private next = 0;
  private rising: Rising[] = [];
  private readonly wind: Vec3;

  constructor(show: Show, options: SimOptions = {}) {
    this.show = show;
    const expanded = expandShow(show);
    this.launches = expanded.launches;
    this.warnings = expanded.warnings;
    this.duration = expanded.duration;
    this.density = Math.min(1, Math.max(0.25, options.density ?? 1));
    this.pool = new ParticlePool(Math.round(45000 * this.density) + 2000);
    this.wind = windVector(show);
  }

  get time(): number {
    return this.step * STEP;
  }

  get risingCount(): number {
    return this.rising.length;
  }

  reset(): void {
    this.step = 0;
    this.next = 0;
    this.rising = [];
    this.pool.count = 0;
    this.skyLight[0] = this.skyLight[1] = this.skyLight[2] = 0;
  }

  /** t초까지 계산한다. 뒤로 가면 처음부터 다시 계산한다. 진행한 스텝 수를 돌려준다. */
  advanceTo(t: number): number {
    const target = Math.max(0, Math.floor(t / STEP + 1e-9));
    if (target < this.step) this.reset();
    const from = this.step;
    while (this.step < target) this.tick();
    return this.step - from;
  }

  private tick(): void {
    const now = this.step * STEP;

    while (this.next < this.launches.length && this.launches[this.next].fireAt <= now) {
      const launch = this.launches[this.next++];
      // 쇼 시작 전에 쐈어야 하는 불꽃은 이미 올라가던 중인 것으로 친다.
      this.rising.push({ launch, age: now - launch.fireAt, pos: [...launch.origin] });
    }

    this.updateRising();
    this.updateParticles();

    this.skyLight[0] *= SKY_DECAY;
    this.skyLight[1] *= SKY_DECAY;
    this.skyLight[2] *= SKY_DECAY;
    this.step++;
  }

  private updateRising(): void {
    const pool = this.pool;
    for (let i = 0; i < this.rising.length; ) {
      const s = this.rising[i];
      s.age += STEP;
      const spec = SIZE_SPECS[s.launch.size];
      risePosition(s.launch, Math.min(s.age, spec.prefire), this.wind, s.pos);

      const seed = hash32(s.launch.seed, this.step, 3);
      if (rand01(seed) < 0.6 * this.density) {
        pool.spawn(
          s.pos[0], s.pos[1], s.pos[2],
          (rand01(seed, 1) - 0.5) * 3, -6 - rand01(seed, 2) * 4, (rand01(seed, 3) - 0.5) * 3,
          0.3 + rand01(seed, 4) * 0.4,
          SPARK_RGB[0] * 0.8, SPARK_RGB[1] * 0.8, SPARK_RGB[2] * 0.8,
          1.6, TRAIL_DAMP, 9.8, FLAG_SPARK, seed,
        );
      }

      if (s.age >= spec.prefire) {
        this.burst(s.launch, s.pos);
        this.rising.splice(i, 1);
      } else {
        i++;
      }
    }
  }

  private burst(l: Launch, at: Vec3): void {
    const shell = SHELLS[l.type];
    const spec = SIZE_SPECS[l.size];
    const pool = this.pool;
    const n = Math.max(12, Math.round(starCount(l.type, l.size) * this.density));
    const radius = (spec.spread / 2) * shell.spreadScale;
    const damp = Math.exp(-shell.drag * STEP);
    const rot = rand01(l.seed, 1) * Math.PI * 2;
    // 구의 축을 조금 기울여, 별을 고르게 놓는 방식의 극점 무늬가 보이지 않게 한다.
    const tilt = (rand01(l.seed, 2) - 0.5) * 0.8;
    const ct = Math.cos(tilt);
    const st = Math.sin(tilt);

    let flags = 0;
    if (shell.tail === 'spark') flags |= FLAG_SPARK_TAIL;
    if (shell.tail === 'willow') flags |= FLAG_WILLOW_TAIL;
    if (shell.ember) flags |= FLAG_EMBER;
    if (shell.glitter) flags |= FLAG_GLITTER;

    for (let i = 0; i < n; i++) {
      const s = hash32(l.seed, i, 11);
      const yy = 1 - (2 * (i + 0.5)) / n;
      const rr = Math.sqrt(1 - yy * yy);
      const phi = i * GOLDEN_ANGLE + rot;
      let dx = Math.cos(phi) * rr + (rand01(s, 1) - 0.5) * 0.08;
      let dy = yy + (rand01(s, 2) - 0.5) * 0.08;
      let dz = Math.sin(phi) * rr + (rand01(s, 3) - 0.5) * 0.08;
      const len = Math.hypot(dx, dy, dz);
      dx /= len;
      dy /= len;
      dz /= len;
      const ry = dy * ct - dz * st;
      const rz = dy * st + dz * ct;
      // 공기 저항이 k일 때 처음 속도 v는 v/k 만큼 날아가므로, 반지름에 맞춰 v = k·R로 정한다.
      const speed = shell.drag * radius * (0.93 + rand01(s, 4) * 0.14);
      const rgb = COLORS[l.colors[i % l.colors.length]];
      pool.spawn(
        at[0], at[1], at[2],
        dx * speed, ry * speed, rz * speed,
        shell.starLife * (0.9 + rand01(s, 5) * 0.2),
        rgb[0], rgb[1], rgb[2],
        shell.starSize, damp, 9.8, flags, s,
      );
    }

    const first = COLORS[l.colors[0]];
    pool.spawn(
      at[0], at[1], at[2], 0, 0, 0, 0.16,
      1, 0.92, 0.8, spec.spread * 0.45, 1, 0, FLAG_FLASH, l.seed,
    );
    const light = (spec.spread / 320) * 0.35;
    this.skyLight[0] += first[0] * light;
    this.skyLight[1] += first[1] * light;
    this.skyLight[2] += first[2] * light;
  }

  private updateParticles(): void {
    const p = this.pool;
    const [wx, , wz] = this.wind;
    const n0 = p.count;
    for (let i = 0; i < n0; i++) {
      const age = p.age[i] + STEP;
      p.age[i] = age;
      if (age >= p.life[i]) continue;

      const d = p.damp[i];
      // 공기는 바람과 같이 움직이므로, 수평 속도는 바람 속도로 다가간다.
      const vx = wx + (p.vx[i] - wx) * d;
      const vy = p.vy[i] * d - p.grav[i] * STEP;
      const vz = wz + (p.vz[i] - wz) * d;
      p.vx[i] = vx;
      p.vy[i] = vy;
      p.vz[i] = vz;
      p.px[i] += vx * STEP;
      p.py[i] += vy * STEP;
      p.pz[i] += vz * STEP;

      const f = p.flags[i];
      if (f & FLAG_SPARK_TAIL) {
        const s = hash32(p.seed[i], this.step, 5);
        if (rand01(s) < 0.45 * this.density) {
          p.spawn(
            p.px[i], p.py[i], p.pz[i],
            vx * 0.15 + (rand01(s, 1) - 0.5) * 3, vy * 0.15 + (rand01(s, 2) - 0.5) * 3, vz * 0.15 + (rand01(s, 3) - 0.5) * 3,
            0.3 + rand01(s, 4) * 0.4,
            SPARK_RGB[0] * 0.9, SPARK_RGB[1] * 0.9, SPARK_RGB[2] * 0.9,
            1.7, SPARK_DAMP, 6, FLAG_SPARK, s,
          );
        }
      } else if (f & FLAG_WILLOW_TAIL) {
        const s = hash32(p.seed[i], this.step, 6);
        if (rand01(s) < 0.5 * this.density) {
          p.spawn(
            p.px[i], p.py[i], p.pz[i],
            vx * 0.05 + (rand01(s, 1) - 0.5) * 1.2, vy * 0.05, vz * 0.05 + (rand01(s, 3) - 0.5) * 1.2,
            0.7 + rand01(s, 4) * 0.6,
            1.0 * 0.75, 0.7 * 0.75, 0.3 * 0.75,
            1.9, WILLOW_SPARK_DAMP, 2.5, FLAG_SPARK, s,
          );
        }
      }
    }
    p.compact();
  }

  /**
   * 그릴 입자를 out에 채우고 개수를 돌려준다. 밝기와 색 변화도 여기서 정한다.
   * out은 (pool.capacity + 256) * RENDER_STRIDE 이상이어야 한다.
   */
  writeRender(out: Float32Array): number {
    const p = this.pool;
    let k = 0;
    for (let i = 0; i < p.count; i++) {
      const age = p.age[i];
      const u = age / p.life[i];
      const f = p.flags[i];
      let r = p.r[i];
      let g = p.g[i];
      let b = p.b[i];
      let a: number;

      if (f & FLAG_FLASH) {
        a = (1 - u) * (1 - u) * 0.9;
      } else if (f & FLAG_SPARK) {
        a = (1 - u) * 0.8;
      } else {
        const fadeIn = Math.min(1, age / 0.04);
        const fadeOut = u < 0.7 ? 1 : (1 - u) / 0.3;
        a = fadeIn * fadeOut;
        if (f & FLAG_EMBER) {
          const e = smoothstep(0.45, 1, u);
          r += (EMBER_RGB[0] - r) * e;
          g += (EMBER_RGB[1] - g) * e;
          b += (EMBER_RGB[2] - b) * e;
        }
        if (f & FLAG_GLITTER && u > 0.62) {
          a *= rand01(p.seed[i], Math.floor(age * 24), 9) > 0.45 ? 1.5 : 0.12;
        }
      }

      out[k++] = p.px[i];
      out[k++] = p.py[i];
      out[k++] = p.pz[i];
      out[k++] = p.size[i];
      out[k++] = r;
      out[k++] = g;
      out[k++] = b;
      out[k++] = a;
    }

    for (const s of this.rising) {
      out[k++] = s.pos[0];
      out[k++] = s.pos[1];
      out[k++] = s.pos[2];
      out[k++] = 2.4;
      out[k++] = HEAD_RGB[0];
      out[k++] = HEAD_RGB[1];
      out[k++] = HEAD_RGB[2];
      out[k++] = 1;
    }
    return k / RENDER_STRIDE;
  }

  /** 지금 상태의 지문. 같은 쇼·같은 시각이면 어느 기기에서나 같아야 한다. */
  stateHash(): number {
    const p = this.pool;
    const n = p.count;
    const xs = new Uint32Array(p.px.buffer, 0, n);
    const ys = new Uint32Array(p.py.buffer, 0, n);
    const zs = new Uint32Array(p.pz.buffer, 0, n);
    let h = hash32(this.step, n, this.rising.length);
    for (let i = 0; i < n; i++) {
      h = hash32(h, xs[i], ys[i]);
      h = hash32(h, zs[i]);
    }
    return h;
  }
}

/** 올라가는 불꽃 알의 위치. 꼭대기에 가까울수록 느려진다. */
function risePosition(l: Launch, age: number, wind: Vec3, out: Vec3): void {
  const spec = SIZE_SPECS[l.size];
  const u = Math.min(age / spec.prefire, 1);
  const e = 1 - (1 - u) * (1 - u);
  const tilt = (l.angle * Math.PI) / 180;
  out[0] = l.origin[0] + Math.sin(tilt) * spec.height * e + wind[0] * age * 0.25;
  out[1] = l.origin[1] + Math.cos(tilt) * spec.height * e;
  out[2] = l.origin[2] + wind[2] * age * 0.25;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
