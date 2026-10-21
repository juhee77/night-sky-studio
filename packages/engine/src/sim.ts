// 불꽃 계산. 모든 값은 미터 단위 3D 좌표 [동, 높이, 북]이고,
// 화면 주사율과 상관없이 STEP 간격으로만 계산한다. 그래서 같은 쇼는 어느 기기에서나 같게 재생된다.

import { SHELLS, shellSize, starCount, type ShellType } from './catalog.ts';
import { COLORS, COLOR_NAMES } from './colors.ts';
import { craftEffect, type CustomShell } from './custom.ts';
import { hash32, rand01 } from './rng.ts';
import {
  expandShow,
  isShellLaunch,
  launchKey,
  windVector,
  type Launch,
  type Show,
  type ShowWarning,
  type Vec3,
} from './show.ts';
import { SMOKE_LIFE, analyzeSmoke, puffAt, type Puff } from './smoke.ts';
import { burstHeightAt } from './build.ts';
import { textShape } from './text.ts';

/** 고정 계산 간격(초) */
export const STEP = 1 / 120;

export const FLAG_SPARK_TAIL = 1; // 국화: 지나간 자리에 불티를 남긴다
export const FLAG_WILLOW_TAIL = 2; // 버들: 길게 늘어지는 금빛 꼬리
export const FLAG_EMBER = 4; // 끝으로 갈수록 주황빛으로 식는다
export const FLAG_GLITTER = 8; // 사라지기 전에 반짝인다
export const FLAG_FLASH = 16; // 터지는 순간의 섬광
export const FLAG_SPARK = 32; // 꼬리에서 떨어져 나온 불티
export const FLAG_PALM_TAIL = 64; // 야자: 굵은 줄기 꼬리
export const FLAG_SPLIT = 128; // 크로세트: 수명이 끝나면 십자로 갈라진다
export const FLAG_LANCE = 256; // 지상 틀불꽃의 심지 하나. 제자리에서 타오른다
export const FLAG_STROBE = 512; // 내 불꽃 '깜빡임': 꺼졌다 켜졌다 하며 사라진다
export const FLAG_SPLIT_BURST = 1024; // 내 불꽃 '두 번 터지기': 갈라질 때 작은 불꽃으로 한 번 더 터진다

/** 렌더 버퍼에서 입자 하나가 차지하는 float 개수: x, y, z, 크기(m), r, g, b, a */
export const RENDER_STRIDE = 8;
/** 입자 말고 더 그리는 것(올라가는 알, 연기)을 위한 여유 칸 */
export const RENDER_EXTRA = 1100;
const MAX_PUFFS = 300;

/** 이 스텝마다 중간 저장점을 남긴다 (2초) */
const CHECKPOINT_EVERY = 240;
const MAX_CHECKPOINTS = 48;

const SPARK_RGB = [1.0, 0.62, 0.26] as const;
const EMBER_RGB = [1.0, 0.32, 0.08] as const;
const HEAD_RGB = [1.0, 0.85, 0.6] as const;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const SPARK_DAMP = Math.exp(-3 * STEP);
const WILLOW_SPARK_DAMP = Math.exp(-2 * STEP);
const PALM_SPARK_DAMP = Math.exp(-2.4 * STEP);
const TRAIL_DAMP = Math.exp(-2.5 * STEP);
const SPLIT_DAMP = Math.exp(-1.4 * STEP);
const CURTAIN_DAMP = Math.exp(-1.2 * STEP);
/** 나이아가라 불티가 떨어지는 지점 간격(m) */
const CURTAIN_PITCH = 6;
/** 틀불꽃 글자 높이(m) */
const LANCE_HEIGHT = 22;
/** 틀불꽃은 왼쪽 끝에서 오른쪽 끝까지 이 시간 동안 차례로 불이 붙는다 */
const LANCE_IGNITE = 0.6;
const SKY_DECAY = Math.exp(-6 * STEP);

const FLOAT_FIELDS = [
  'px', 'py', 'pz', 'vx', 'vy', 'vz', 'age', 'life', 'r', 'g', 'b', 'size', 'damp', 'grav',
] as const;

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
  readonly flags: Uint16Array;
  readonly seed: Uint32Array;
  /** 색이 바뀌는 별: (바뀌는 때 0~255) << 8 | (바뀐 색 번호 + 1). 0이면 바뀌지 않는다 */
  readonly aux: Uint32Array;

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
    this.flags = new Uint16Array(capacity);
    this.seed = new Uint32Array(capacity);
    this.aux = new Uint32Array(capacity);
  }

  spawn(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    life: number,
    r: number, g: number, b: number,
    size: number, damp: number, grav: number,
    flags: number, seed: number, aux = 0,
  ): boolean {
    const i = this.count;
    if (i >= this.capacity) return false;
    this.aux[i] = aux;
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
        // 매 스텝 도는 곳이라 필드를 하나씩 직접 옮긴다.
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
        this.aux[w] = this.aux[i];
      }
      w++;
    }
    this.count = w;
  }

  save(): PoolSnapshot {
    const n = this.count;
    const floats = FLOAT_FIELDS.map((k) => this[k].slice(0, n));
    return { count: n, floats, flags: this.flags.slice(0, n), seed: this.seed.slice(0, n), aux: this.aux.slice(0, n) };
  }

  load(s: PoolSnapshot): void {
    FLOAT_FIELDS.forEach((k, i) => this[k].set(s.floats[i]));
    this.flags.set(s.flags);
    this.seed.set(s.seed);
    this.aux.set(s.aux);
    this.count = s.count;
  }
}

interface PoolSnapshot {
  count: number;
  floats: Float32Array[];
  flags: Uint16Array;
  seed: Uint32Array;
  aux: Uint32Array;
}

/** 올라가는 중인 불꽃 알 */
interface Rising {
  launch: Launch & { type: ShellType };
  age: number;
  pos: Vec3;
}

/** 타고 있는 나이아가라 */
interface Curtain {
  launch: Launch;
  age: number;
}

/** 중간 저장점: 이 스텝을 계산하기 직전의 상태 */
interface Checkpoint {
  step: number;
  next: number;
  rising: Rising[];
  curtains: Curtain[];
  skyLight: [number, number, number];
  pool: PoolSnapshot;
}

export interface SimOptions {
  /** 별과 불티의 밀도(0.25~1). 느린 기기에서 낮춘다. */
  density?: number;
}

export class Simulation {
  show: Show;
  launches: Launch[];
  warnings: ShowWarning[];
  duration: number;
  readonly density: number;
  readonly pool: ParticlePool;
  /** 터진 불꽃이 하늘을 밝히는 빛 [r, g, b] */
  readonly skyLight: [number, number, number] = [0, 0, 0];

  /** 지금까지 진행한 스텝 수 */
  step = 0;
  private next = 0;
  private rising: Rising[] = [];
  private curtains: Curtain[] = [];
  private wind: Vec3;
  private checkpoints = new Map<number, Checkpoint>();
  /** 연기 덩어리들과, 연기에 가려 흐리게 터지는 발사들 */
  private puffs: Puff[] = [];
  private obscured = new Set<string>();

  constructor(show: Show, options: SimOptions = {}) {
    this.show = show;
    const expanded = expandShow(show);
    this.launches = expanded.launches;
    this.warnings = expanded.warnings;
    this.duration = expanded.duration;
    this.density = Math.min(1, Math.max(0.25, options.density ?? 1));
    this.pool = new ParticlePool(Math.round(45000 * this.density) + 2000);
    this.wind = windVector(show);
    this.updateSmoke();
  }

  /** 연기는 터지는 순서와 바람만으로 정해지므로 쇼가 바뀔 때 미리 계산해 둔다. */
  private updateSmoke(): void {
    const smoke = analyzeSmoke(this.launches, this.wind);
    this.puffs = smoke.puffs.filter((p) => p.d0 >= 0.5);
    this.obscured = new Set([...smoke.obscured].map(launchKey));
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
    this.curtains = [];
    this.pool.count = 0;
    this.skyLight[0] = this.skyLight[1] = this.skyLight[2] = 0;
  }

  /**
   * 쇼를 바꾼다. 바뀐 불꽃 가운데 가장 먼저 쏘는 시각 이전의 계산은 그대로 두고,
   * 그 뒤만 다시 계산하게 한다. 편집할 때마다 처음부터 계산하지 않기 위해서다.
   */
  setShow(show: Show): void {
    const expanded = expandShow(show);
    let from = Infinity;
    const sameWorld =
      show.seed === this.show.seed &&
      JSON.stringify(show.venue) === JSON.stringify(this.show.venue);
    if (!sameWorld) {
      from = -Infinity;
    } else {
      const before = new Map<string, number>();
      for (const l of this.launches) before.set(launchKey(l), (before.get(launchKey(l)) ?? 0) + 1);
      for (const l of expanded.launches) {
        const k = launchKey(l);
        const n = before.get(k) ?? 0;
        if (n > 0) before.set(k, n - 1);
        else from = Math.min(from, l.fireAt);
      }
      for (const l of this.launches) {
        const k = launchKey(l);
        if ((before.get(k) ?? 0) > 0) {
          from = Math.min(from, l.fireAt);
          before.set(k, before.get(k)! - 1);
        }
      }
    }

    this.show = show;
    this.launches = expanded.launches;
    this.warnings = expanded.warnings;
    this.duration = expanded.duration;
    this.wind = windVector(show);
    this.updateSmoke();
    if (from === Infinity) return;

    // 저장점 s는 스텝 s-1까지 쏜 불꽃만 담고 있다.
    const valid = (step: number) => (step - 1) * STEP < from;
    for (const step of [...this.checkpoints.keys()]) if (!valid(step)) this.checkpoints.delete(step);
    if (!valid(this.step)) this.restoreBefore(this.step);
  }

  /** t초까지 계산한다. 뒤로 가면 가까운 저장점부터 다시 계산한다. 진행한 스텝 수를 돌려준다. */
  advanceTo(t: number): number {
    const target = Math.max(0, Math.floor(t / STEP + 1e-9));
    if (target < this.step) this.restoreBefore(target);
    const from = this.step;
    while (this.step < target) {
      if (this.step % CHECKPOINT_EVERY === 0 && this.step > 0) this.saveCheckpoint();
      this.tick();
    }
    return this.step - from;
  }

  private saveCheckpoint(): void {
    if (this.checkpoints.has(this.step)) return;
    if (this.checkpoints.size >= MAX_CHECKPOINTS) {
      // 가장 오래 전에 만든 것을 지운다.
      this.checkpoints.delete(this.checkpoints.keys().next().value!);
    }
    this.checkpoints.set(this.step, {
      step: this.step,
      next: this.next,
      rising: this.rising.map((r) => ({ launch: r.launch, age: r.age, pos: [...r.pos] as Vec3 })),
      curtains: this.curtains.map((c) => ({ ...c })),
      skyLight: [...this.skyLight],
      pool: this.pool.save(),
    });
  }

  /** target 스텝 이하의 가장 늦은 저장점으로 돌아간다. 없으면 처음으로. */
  private restoreBefore(target: number): void {
    let best: Checkpoint | undefined;
    for (const c of this.checkpoints.values()) if (c.step <= target && (!best || c.step > best.step)) best = c;
    if (!best) {
      this.reset();
      return;
    }
    this.step = best.step;
    this.next = best.next;
    this.rising = best.rising.map((r) => ({ launch: r.launch, age: r.age, pos: [...r.pos] as Vec3 }));
    this.curtains = best.curtains.map((c) => ({ ...c }));
    this.skyLight[0] = best.skyLight[0];
    this.skyLight[1] = best.skyLight[1];
    this.skyLight[2] = best.skyLight[2];
    this.pool.load(best.pool);
  }

  private tick(): void {
    const now = this.step * STEP;

    while (this.next < this.launches.length && this.launches[this.next].fireAt <= now) {
      const launch = this.launches[this.next++];
      if (isShellLaunch(launch)) {
        // 쇼 시작 전에 쐈어야 하는 불꽃은 이미 올라가던 중인 것으로 친다.
        this.rising.push({ launch, age: now - launch.fireAt, pos: [...launch.origin] });
      } else if (launch.type === 'niagara') {
        this.curtains.push({ launch, age: now - launch.fireAt });
      } else {
        this.lightFrame(launch, now - launch.fireAt);
      }
    }

    this.updateRising();
    this.updateCurtains();
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
      const spec = shellSize(s.launch.type, s.launch.size);
      // 도화선이 알맞지 않으면 꼭대기 전후에 터진다 (내 불꽃 제작 공방).
      const flight = s.launch.customDef?.flight;
      const burstAge = spec.prefire * (flight?.burstAt ?? 1);
      risePosition(s.launch, Math.min(s.age, burstAge), this.wind, s.pos, flight?.height ?? 1);

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

      if (s.age >= burstAge) {
        this.burst(s.launch, s.pos);
        this.rising.splice(i, 1);
      } else {
        i++;
      }
    }
  }

  /** 다리에 걸린 나이아가라: 다리를 따라 일정한 간격으로 불티가 흘러내린다. */
  private updateCurtains(): void {
    const pool = this.pool;
    for (let i = 0; i < this.curtains.length; ) {
      const c = this.curtains[i];
      c.age += STEP;
      const len = c.launch.len ?? 8;
      if (c.age >= len) {
        this.curtains.splice(i, 1);
        continue;
      }
      // 켜질 때와 꺼질 때는 천천히.
      const ramp = Math.min(1, c.age / 0.6, (len - c.age) / 0.8);
      const [a, b] = c.launch.span!;
      const span = Math.hypot(b[0] - a[0], b[2] - a[2]);
      const n = Math.max(2, Math.floor(span / CURTAIN_PITCH));
      const rgb = COLORS[c.launch.colors[0]];
      for (let k = 0; k <= n; k++) {
        const s = hash32(c.launch.seed, this.step, k);
        if (rand01(s) >= 0.22 * this.density * ramp) continue;
        const u = (k + rand01(s, 1) - 0.5) / n;
        // 금빛 불티에 고른 색을 조금 섞는다.
        const w = 0.35;
        pool.spawn(
          a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u - 0.5, a[2] + (b[2] - a[2]) * u,
          (rand01(s, 2) - 0.5) * 1.2, -1 - rand01(s, 3) * 1.5, (rand01(s, 4) - 0.5) * 1.2,
          1.3 + rand01(s, 5) * 0.8,
          (1.0 * (1 - w) + rgb[0] * w) * 0.95, (0.82 * (1 - w) + rgb[1] * w) * 0.95, (0.5 * (1 - w) + rgb[2] * w) * 0.95,
          2.1, CURTAIN_DAMP, 3.5, FLAG_SPARK, s,
        );
      }
      i++;
    }
  }

  /** 지상 틀불꽃에 불을 붙인다. 글자를 이루는 심지마다 제자리에서 타는 입자 하나. */
  private lightFrame(l: Launch, age: number): void {
    const shape = textShape(l.text ?? '');
    if (!shape.points.length) return;
    const scale = LANCE_HEIGHT;
    const half = (shape.width * scale) / 2;
    const len = l.len ?? 10;
    shape.points.forEach(([x, y], i) => {
      const s = hash32(l.seed, i, 41);
      const rgb = COLORS[l.colors[i % l.colors.length]];
      // 왼쪽부터 차례로 불이 붙는다: 아직 안 붙은 심지는 나이를 음수로 둔다.
      const delay = (x / Math.max(shape.width, 1e-3)) * LANCE_IGNITE + rand01(s) * 0.05;
      const ok = this.pool.spawn(
        l.origin[0] - half + x * scale, l.origin[1] + 4 + y * scale, l.origin[2],
        0, 0, 0,
        len,
        rgb[0], rgb[1], rgb[2],
        2.6, 1, 0, FLAG_LANCE, s,
      );
      if (ok) this.pool.age[this.pool.count - 1] = age - delay;
    });
  }

  /** 내 불꽃: 층마다 모양·별·색·지연을 따로 정해 피운다. */
  private burstCustom(l: Launch, def: CustomShell, at: Vec3): void {
    const spec = shellSize('custom', l.size);
    // 불발: 이음매가 벌어지거나 종이를 허술하게 바른 알은 아예 터지지 않기도 한다.
    if (def.dud && rand01(l.seed, 97) < def.dud) return;
    const craft = craftEffect(def.craft);
    const radius = (spec.spread / 2) * def.motion.speed * craft.spread;
    const baseLife = def.motion.life * craft.life;
    // 별이 오래 살수록 공기 저항을 줄여 너무 일찍 멈추지 않게 한다.
    const drag = Math.max(0.8, 3.4 / baseLife);
    // 장인 모드: 알이 고르게 터지지 않으면 한쪽으로 눌린 모양이 된다.
    const squashAxis = randomUnit(hash32(l.seed, 5, 91));
    const squash = 1 - 0.22 * Math.max(0, craft.asym - 0.3);
    const damp = Math.exp(-drag * STEP);
    const grav = 9.8 * (0.25 + 1.75 * def.motion.droop);
    // 여러 단 터지기: 별을 칸마다 나눠, 아래 칸일수록 늦게 조금 아래에서 핀다.
    const chain = def.chain ?? 1;
    for (let k = 0; k < chain; k++) {
      const atK: Vec3 = [at[0], at[1] - k * spec.spread * 0.14, at[2]];
      const delayK = k * 0.42;
      def.layers.forEach((layer, li) => {
        const seed = hash32(l.seed, li, 71);
        let dirs: [number, number, number, number][];
        if (layer.shape.kind === 'dirs') {
          // 알은 날아가며 구르므로, 붙인 자리 그대로지만 알 전체가 아무 방향으로 돌아가 있다.
          const m = tumble(hash32(l.seed, 0, 93));
          // 조립: 할약이 몰린 쪽 별은 더 세게, 반대쪽은 약하게 밀려난다.
          // 반구 이음매가 어긋나면 적도 근처 별이 흐트러진다.
          const off = def.assembly?.offset ?? [0, 0, 0];
          const seam = def.assembly?.seam ?? 0;
          dirs = layer.shape.dirs.map(([x, y, z], i) => {
            if (seam > 0 && Math.abs(y) < 0.2) {
              const s = hash32(seed, i, 13);
              x += (rand01(s, 1) - 0.5) * seam * 0.5;
              y += (rand01(s, 2) - 0.5) * seam * 0.5;
              z += (rand01(s, 3) - 0.5) * seam * 0.5;
              const n = Math.hypot(x, y, z) || 1;
              x /= n;
              y /= n;
              z /= n;
            }
            const mag = Math.max(0.3, 1 + 1.6 * (x * off[0] + y * off[1] + z * off[2]));
            return [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z, mag];
          });
        } else if (layer.shape.kind === 'points') {
          const pts = layer.shape.pts;
          const max = Math.max(1e-6, ...pts.map(([x, y]) => Math.hypot(x, y)));
          const [r, u] = planeAxes(seed);
          dirs = pts.map(([x, y]) => {
            const nx = x / max;
            const ny = y / max;
            const dx = r[0] * nx + u[0] * ny;
            const dy = r[1] * nx + u[1] * ny;
            const dz = r[2] * nx + u[2] * ny;
            const mag = Math.hypot(dx, dy, dz) || 1;
            return [dx / mag, dy / mag, dz / mag, mag];
          });
        } else {
          const n = Math.max(6, Math.round(layer.shape.count * craft.count * (layer.shape.kind === 'sphere' ? this.density : 1)));
          dirs = starDirections(layer.shape.kind, n, seed);
        }
        let flags = 0;
        if (layer.star === 'tail') flags |= FLAG_SPARK_TAIL;
        if (layer.star === 'willow') flags |= FLAG_WILLOW_TAIL;
        if (layer.star === 'glitter') flags |= FLAG_GLITTER;
        if (def.motion.flicker) flags |= FLAG_STROBE;
        if (def.split) flags |= FLAG_SPLIT | (def.split.into === 'burst' ? FLAG_SPLIT_BURST : 0);
        const cool = layer.color === 'blue' || layer.color === 'purple' ? craft.coolDim : 1;
        const rgb = layer.tint ?? COLORS[layer.color].map((v) => v * cool);
        const aux = layer.then ? (Math.round(layer.then.at * 255) << 8) | (COLOR_NAMES.indexOf(layer.then.color) + 1) : 0;
        const life = def.split ? def.split.after : baseLife;
        const precise = layer.shape.kind !== 'sphere' && layer.shape.kind !== 'dirs';
        for (let i = 0; i < dirs.length; i++) {
          const s = hash32(seed, i, 11);
          if (chain > 1 && i % chain !== k) continue;
          // 덜 마른 별은 불붙지 않는다.
          if (def.misfire && rand01(s, 12) < def.misfire) continue;
          let [dx, dy, dz, mag] = dirs[i];
          // 찌그러짐: 방향이 조금씩 흐트러지고, 한 축으로 눌린다.
          if (craft.asym > 0) {
            const noise = 0.08 * craft.asym;
            dx += (rand01(s, 6) - 0.5) * noise;
            dy += (rand01(s, 7) - 0.5) * noise;
            dz += (rand01(s, 8) - 0.5) * noise;
            const along = dx * squashAxis[0] + dy * squashAxis[1] + dz * squashAxis[2];
            dx -= along * (1 - squash) * squashAxis[0];
            dy -= along * (1 - squash) * squashAxis[1];
            dz -= along * (1 - squash) * squashAxis[2];
          }
          const jitter = (precise ? 0.03 : 0.14) * (craft.asym > 0 ? craft.asym / 0.5 : 1);
          const speed = drag * radius * layer.scale * mag * (1 - jitter / 2 + rand01(s, 4) * jitter);
          const lifeSpread = precise ? 0 : craft.spreadLife;
          const ok = this.pool.spawn(
            atK[0], atK[1], atK[2],
            dx * speed, dy * speed, dz * speed,
            life * (1 - lifeSpread + rand01(s, 5) * 2 * lifeSpread),
            rgb[0], rgb[1], rgb[2],
            layer.star === 'dot' ? 5.5 : 4.5, damp, grav, flags, s, aux,
          );
          // 늦게 피는 층: 나이를 음수로 두면 그때까지 보이지도 움직이지도 않는다.
          if (ok && layer.delay + delayK > 0) this.pool.age[this.pool.count - 1] = -(layer.delay + delayK);
        }
      });
    }
    const first = COLORS[def.layers[0]?.color ?? 'gold'];
    this.pool.spawn(at[0], at[1], at[2], 0, 0, 0, 0.16, 1, 0.92, 0.8, spec.spread * 0.45, 1, 0, FLAG_FLASH, l.seed);
    const light = (spec.spread / 320) * 0.35;
    this.skyLight[0] += first[0] * light;
    this.skyLight[1] += first[1] * light;
    this.skyLight[2] += first[2] * light;
  }

  private burst(l: Launch & { type: ShellType }, at: Vec3): void {
    if (l.customDef) {
      this.burstCustom(l, l.customDef, at);
      return;
    }
    const shell = SHELLS[l.type];
    const spec = shellSize(l.type, l.size);
    const pool = this.pool;
    const n = Math.max(6, Math.round(starCount(l.type, l.size) * (shell.pattern === 'sphere' ? this.density : 1)));
    const radius = (spec.spread / 2) * shell.spreadScale;
    const damp = Math.exp(-shell.drag * STEP);
    const dirs = starDirections(shell.pattern, n, l.seed);

    // 앞 불꽃의 연기 속에서 터지면 흐리게 보인다.
    const dim = this.obscured.has(launchKey(l)) ? 0.45 : 1;
    let flags = 0;
    if (shell.tail === 'spark') flags |= FLAG_SPARK_TAIL;
    if (shell.tail === 'willow') flags |= FLAG_WILLOW_TAIL;
    if (shell.tail === 'palm') flags |= FLAG_PALM_TAIL;
    if (shell.ember) flags |= FLAG_EMBER;
    if (shell.glitter) flags |= FLAG_GLITTER;
    if (shell.split) flags |= FLAG_SPLIT;

    for (let i = 0; i < n; i++) {
      const s = hash32(l.seed, i, 11);
      const [dx, dy, dz, mag] = dirs[i];
      // 공기 저항이 k일 때 처음 속도 v는 v/k 만큼 날아가므로, 반지름에 맞춰 v = k·R로 정한다.
      // 모양 불꽃은 모양이 흐트러지지 않게 속도 오차를 줄인다.
      const jitter = shell.pattern === 'sphere' || shell.pattern === 'palm' ? 0.14 : 0.03;
      const speed = shell.drag * radius * mag * (1 - jitter / 2 + rand01(s, 4) * jitter);
      const rgb = COLORS[l.colors[i % l.colors.length]];
      pool.spawn(
        at[0], at[1], at[2],
        dx * speed, dy * speed, dz * speed,
        shell.starLife * (shell.split ? 0.95 + rand01(s, 5) * 0.1 : 0.9 + rand01(s, 5) * 0.2),
        rgb[0] * dim, rgb[1] * dim, rgb[2] * dim,
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

  /** 크로세트 별 하나가 진행 방향에 수직인 네 갈래로 갈라진다. 두 번 터지기는 작은 불꽃으로 터진다. */
  private split(i: number): void {
    const p = this.pool;
    if (p.flags[i] & FLAG_SPLIT_BURST) {
      // 작게 한 번 더: 그 자리에서 작은 별 여섯 개가 사방으로
      for (let k = 0; k < 6; k++) {
        const s = hash32(p.seed[i], k, 17);
        const a = (k / 6) * Math.PI * 2 + rand01(s) * 0.4;
        const e = (rand01(s, 1) - 0.5) * 1.2;
        const sp = 18 + rand01(s, 2) * 6;
        p.spawn(
          p.px[i], p.py[i], p.pz[i],
          p.vx[i] * 0.2 + Math.cos(a) * Math.cos(e) * sp, p.vy[i] * 0.2 + Math.sin(e) * sp, p.vz[i] * 0.2 + Math.sin(a) * Math.cos(e) * sp,
          0.7 + rand01(s, 3) * 0.3,
          p.r[i], p.g[i], p.b[i],
          3.2, SPLIT_DAMP, 9.8, FLAG_EMBER, s,
        );
      }
      return;
    }
    const vx = p.vx[i];
    const vy = p.vy[i];
    const vz = p.vz[i];
    const len = Math.hypot(vx, vy, vz) || 1;
    const fx = vx / len;
    const fy = vy / len;
    const fz = vz / len;
    // 진행 방향에 수직인 두 축
    let ax = -fz;
    let ay = 0;
    let az = fx;
    let al = Math.hypot(ax, ay, az);
    if (al < 1e-3) {
      ax = 1;
      ay = 0;
      az = 0;
      al = 1;
    }
    ax /= al;
    ay /= al;
    az /= al;
    const bx = fy * az - fz * ay;
    const by = fz * ax - fx * az;
    const bz = fx * ay - fy * ax;
    const speed = 45;
    for (let k = 0; k < 4; k++) {
      const s = hash32(p.seed[i], k, 13);
      const ang = (k * Math.PI) / 2 + rand01(s) * 0.2;
      const c = Math.cos(ang);
      const sn = Math.sin(ang);
      p.spawn(
        p.px[i], p.py[i], p.pz[i],
        vx * 0.3 + (ax * c + bx * sn) * speed,
        vy * 0.3 + (ay * c + by * sn) * speed,
        vz * 0.3 + (az * c + bz * sn) * speed,
        1.0 + rand01(s, 1) * 0.2,
        p.r[i], p.g[i], p.b[i],
        4, SPLIT_DAMP, 9.8, FLAG_SPARK_TAIL | FLAG_EMBER, s,
      );
    }
  }

  private updateParticles(): void {
    const p = this.pool;
    const [wx, , wz] = this.wind;
    const n0 = p.count;
    for (let i = 0; i < n0; i++) {
      const age = p.age[i] + STEP;
      p.age[i] = age;
      const f = p.flags[i];
      if (age >= p.life[i]) {
        if (f & FLAG_SPLIT) this.split(i);
        continue;
      }
      // 아직 피지 않은 별(늦게 피는 층)은 그 자리에서 기다린다.
      if (age < 0 && !(f & FLAG_LANCE)) continue;
      if (f & FLAG_LANCE) {
        // 심지는 움직이지 않고, 가끔 작은 불티를 튀긴다.
        if (age > 0) {
          const s = hash32(p.seed[i], this.step, 8);
          if (rand01(s) < 0.03 * this.density) {
            p.spawn(
              p.px[i], p.py[i], p.pz[i],
              (rand01(s, 1) - 0.5) * 3, 1 + rand01(s, 2) * 3, (rand01(s, 3) - 0.5) * 3,
              0.25 + rand01(s, 4) * 0.3,
              SPARK_RGB[0], SPARK_RGB[1], SPARK_RGB[2],
              1.4, SPARK_DAMP, 6, FLAG_SPARK, s,
            );
          }
        }
        continue;
      }

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
      } else if (f & FLAG_PALM_TAIL) {
        const s = hash32(p.seed[i], this.step, 7);
        // 야자 줄기는 별이 적은 대신 꼬리가 굵고 촘촘하다.
        for (let k = 0; k < 2; k++) {
          if (rand01(s, k, 9) >= 0.9 * this.density) continue;
          p.spawn(
            p.px[i], p.py[i], p.pz[i],
            vx * 0.1 + (rand01(s, k, 1) - 0.5) * 2.5, vy * 0.1 + (rand01(s, k, 2) - 0.5) * 2.5, vz * 0.1 + (rand01(s, k, 3) - 0.5) * 2.5,
            0.6 + rand01(s, k, 4) * 0.5,
            1.0 * 0.85, 0.66 * 0.85, 0.28 * 0.85,
            2.6, PALM_SPARK_DAMP, 5, FLAG_SPARK, hash32(s, k),
          );
        }
      }
    }
    p.compact();
  }

  /**
   * 그릴 입자를 out에 채우고 개수를 돌려준다. 밝기와 색 변화도 여기서 정한다.
   * out은 (pool.capacity + RENDER_EXTRA) * RENDER_STRIDE 이상이어야 한다.
   */
  writeRender(out: Float32Array): number {
    const p = this.pool;
    const cloud = this.show.venue.cloud ?? Infinity;
    let k = 0;
    for (let i = 0; i < p.count; i++) {
      const age = p.age[i];
      const u = age / p.life[i];
      const f = p.flags[i];
      let r = p.r[i];
      let g = p.g[i];
      let b = p.b[i];
      let a: number;

      if (f & FLAG_LANCE) {
        // 아직 불이 안 붙었으면 보이지 않고, 타는 동안은 촛불처럼 흔들린다.
        if (age < 0) a = 0;
        else {
          const left = p.life[i] - age;
          a = Math.min(1, age / 0.08, left / 0.8) * (0.7 + 0.3 * rand01(p.seed[i], Math.floor(age * 30), 2));
        }
      } else if (f & FLAG_FLASH) {
        a = (1 - u) * (1 - u) * 0.9;
      } else if (f & FLAG_SPARK) {
        a = (1 - u) * 0.8;
      } else if (f & FLAG_SPLIT) {
        // 갈라지기 전까지는 밝기를 유지한다.
        a = Math.min(1, age / 0.04);
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
      // 색이 바뀌는 별
      const aux = p.aux[i];
      if (aux) {
        const at = (aux >>> 8) / 255;
        const to = COLORS[COLOR_NAMES[(aux & 0xff) - 1]];
        const m = smoothstep(at - 0.06, at + 0.06, u);
        r += (to[0] - r) * m;
        g += (to[1] - g) * m;
        b += (to[2] - b) * m;
      }
      if (f & FLAG_STROBE) a *= Math.floor(age * 9 + (p.seed[i] & 7)) % 2 ? 0.1 : 1.2;
      if (age < 0) a = 0;

      // 구름 속은 빛이 퍼져 거의 보이지 않는다.
      if (p.py[i] > cloud) a *= 0.12;

      out[k++] = p.px[i];
      out[k++] = p.py[i];
      out[k++] = p.pz[i];
      out[k++] = p.size[i];
      out[k++] = r;
      out[k++] = g;
      out[k++] = b;
      out[k++] = a;
    }

    // 연기: 불꽃 빛을 받아 희미하게 보이는 덩어리
    const now = this.time;
    let shown = 0;
    for (let i = this.puffs.length - 1; i >= 0 && shown < MAX_PUFFS; i--) {
      const puff = this.puffs[i];
      if (puff.t > now) continue;
      if (now - puff.t > SMOKE_LIFE) break;
      const at = puffAt(puff, now, this.wind);
      if (at.density < 0.03) continue;
      const lit = 0.12 + Math.min(0.5, (this.skyLight[0] + this.skyLight[1] + this.skyLight[2]) * 0.6);
      out[k++] = at.pos[0];
      out[k++] = at.pos[1];
      out[k++] = at.pos[2];
      out[k++] = at.r * 1.6;
      out[k++] = lit;
      out[k++] = lit;
      out[k++] = lit * 1.2;
      out[k++] = at.density * 0.16 * (at.pos[1] > cloud ? 0.2 : 1);
      shown++;
    }

    for (const s of this.rising) {
      out[k++] = s.pos[0];
      out[k++] = s.pos[1];
      out[k++] = s.pos[2];
      out[k++] = 2.4;
      out[k++] = HEAD_RGB[0];
      out[k++] = HEAD_RGB[1];
      out[k++] = HEAD_RGB[2];
      out[k++] = s.pos[1] > cloud ? 0.12 : 1;
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
    let h = hash32(this.step, n, this.rising.length * 1000 + this.curtains.length);
    for (let i = 0; i < n; i++) {
      h = hash32(h, xs[i], ys[i]);
      h = hash32(h, zs[i]);
    }
    return h;
  }
}

/** 별을 흩뿌리는 방향 [x, y, z, 속도 배율] */
function starDirections(pattern: string, n: number, seed: number): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  const rot = rand01(seed, 1) * Math.PI * 2;

  if (pattern === 'ring' || pattern === 'heart' || pattern === 'star' || pattern === 'smile') {
    const [r, u] = planeAxes(seed);
    const roll = pattern === 'ring' ? rot : (rand01(seed, 4) - 0.5) * 0.4;
    const cr = Math.cos(roll);
    const sr = Math.sin(roll);
    for (let i = 0; i < n; i++) {
      let x: number;
      let y: number;
      if (pattern === 'ring') {
        const t = (i / n) * Math.PI * 2;
        x = Math.cos(t);
        y = Math.sin(t);
      } else if (pattern === 'star') {
        [x, y] = starOutline(i / n);
      } else if (pattern === 'smile') {
        [x, y] = smileFace(i, n);
      } else {
        const t = (i / n) * Math.PI * 2;
        x = (16 * Math.pow(Math.sin(t), 3)) / 17;
        y = (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17;
      }
      const rx = x * cr - y * sr;
      const ry = x * sr + y * cr;
      const dx = r[0] * rx + u[0] * ry;
      const dy = r[1] * rx + u[1] * ry;
      const dz = r[2] * rx + u[2] * ry;
      const mag = Math.hypot(dx, dy, dz) || 1;
      out.push([dx / mag, dy / mag, dz / mag, mag]);
    }
    return out;
  }

  // 구 모양: 고르게 놓은 뒤 축을 조금 기울여 극점 무늬가 보이지 않게 한다.
  const tilt = (rand01(seed, 2) - 0.5) * 0.8;
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  for (let i = 0; i < n; i++) {
    const s = hash32(seed, i, 11);
    let yy = 1 - (2 * (i + 0.5)) / n;
    // 야자는 위쪽 반구에 굵은 줄기를 몰아 둔다.
    if (pattern === 'palm') yy = 1 - (1.3 * (i + 0.5)) / n;
    const rr = Math.sqrt(Math.max(0, 1 - yy * yy));
    const phi = i * GOLDEN_ANGLE + rot;
    let dx = Math.cos(phi) * rr + (rand01(s, 1) - 0.5) * 0.08;
    let dy = yy + (rand01(s, 2) - 0.5) * 0.08;
    let dz = Math.sin(phi) * rr + (rand01(s, 3) - 0.5) * 0.08;
    const len = Math.hypot(dx, dy, dz);
    dx /= len;
    dy /= len;
    dz /= len;
    out.push([dx, dy * ct - dz * st, dy * st + dz * ct, 1]);
  }
  return out;
}

/**
 * 평면 모양 불꽃의 면 위 두 축 [오른쪽, 위쪽]. 실제처럼 터질 때마다 면이 향하는 방향이 달라진다.
 * 관객(남쪽, -z)을 기준으로 좌우 ±70도, 앞뒤 ±25도 안에서 정한다.
 */
function planeAxes(seed: number): [Vec3, Vec3] {
  const yaw = (rand01(seed, 2) - 0.5) * (Math.PI * 140) / 180;
  const pitch = (rand01(seed, 3) - 0.5) * (Math.PI * 50) / 180;
  return [
    [Math.cos(yaw), 0, Math.sin(yaw)],
    [-Math.sin(yaw) * Math.sin(pitch), Math.cos(pitch), Math.cos(yaw) * Math.sin(pitch)],
  ];
}

/** 시드로 정하는 아무 방향의 단위 벡터 */
function randomUnit(seed: number): Vec3 {
  const z = rand01(seed, 1) * 2 - 1;
  const a = rand01(seed, 2) * Math.PI * 2;
  const r = Math.sqrt(1 - z * z);
  return [r * Math.cos(a), z, r * Math.sin(a)];
}

/** 다섯 꼭짓점 별의 윤곽 위 한 점 (u: 0~1) */
function starOutline(u: number): [number, number] {
  const corners: [number, number][] = [];
  for (let k = 0; k < 10; k++) {
    const r = k % 2 === 0 ? 1 : 0.42;
    const a = Math.PI / 2 + (k * Math.PI) / 5;
    corners.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const f = u * 10;
  const k = Math.floor(f) % 10;
  const t = f - Math.floor(f);
  const [ax, ay] = corners[k];
  const [bx, by] = corners[(k + 1) % 10];
  return [ax + (bx - ax) * t, ay + (by - ay) * t];
}

/** 웃는 얼굴: 별의 60%는 얼굴 원, 나머지는 두 눈과 입 */
function smileFace(i: number, n: number): [number, number] {
  const face = Math.round(n * 0.6);
  const eyes = Math.max(2, Math.round(n * 0.08));
  if (i < face) {
    const a = (i / face) * Math.PI * 2;
    return [Math.cos(a), Math.sin(a)];
  }
  if (i < face + eyes) return [(i - face) % 2 ? 0.35 : -0.35, 0.3];
  const m = n - face - eyes;
  const a = Math.PI * (1.18 + (0.64 * (i - face - eyes)) / Math.max(1, m - 1));
  return [Math.cos(a) * 0.55, Math.sin(a) * 0.55 + 0.05];
}

/** 올라가는 불꽃 알의 위치. 꼭대기에 가까울수록 느려진다. */
function risePosition(l: Launch & { type: ShellType }, age: number, wind: Vec3, out: Vec3, heightMul = 1): void {
  const spec = shellSize(l.type, l.size);
  const h = spec.height * heightMul;
  // 같은 감속으로 올라가므로, 낮게 쏘면 꼭대기에 더 일찍 닿는다.
  const apex = spec.prefire * Math.sqrt(heightMul);
  const y = burstHeightAt(h, apex, age);
  const e = y / spec.height;
  const tilt = (l.angle * Math.PI) / 180;
  out[0] = l.origin[0] + Math.sin(tilt) * spec.height * e + wind[0] * age * 0.25;
  out[1] = l.origin[1] + Math.cos(tilt) * spec.height * e;
  out[2] = l.origin[2] + wind[2] * age * 0.25;
}

/** 시드로 정하는 회전 행렬 (3×3, 행 우선) */
function tumble(seed: number): number[] {
  const a = rand01(seed, 1) * Math.PI * 2;
  const b = Math.acos(rand01(seed, 2) * 2 - 1);
  const c = rand01(seed, 3) * Math.PI * 2;
  const [ca, sa, cb, sb, cc, sc] = [Math.cos(a), Math.sin(a), Math.cos(b), Math.sin(b), Math.cos(c), Math.sin(c)];
  return [
    ca * cc - sa * cb * sc, -ca * sc - sa * cb * cc, sa * sb,
    sa * cc + ca * cb * sc, -sa * sc + ca * cb * cc, -ca * sb,
    sb * sc, sb * cc, cb,
  ];
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
