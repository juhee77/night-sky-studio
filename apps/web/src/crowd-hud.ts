// 재생 중 관객 반응: 강가 관객 실루엣, 「관객 열기」 게이지, 터진 자리에 잠깐 뜨는 판정 글자.
// 판정은 점수표와 같은 기준(엔진 crowdTrack)이라 여기서 보이는 「완벽!」·「흐림…」이 점수에도 그대로 반영된다.

import { crowdAt, crowdTrack, type CrowdTrack, type Launch, type Show } from '@nss/engine';
import type { Stage } from './stage.ts';

const PREF = 'nss:crowd';

const MARK_TEXT = { perfect: '완벽!', smoke: '흐림…', cloud: '구름에 가림' } as const;

export class CrowdHud {
  private root: HTMLElement;
  private fill: HTMLElement;
  private marks: HTMLElement;
  private people: HTMLCanvasElement;
  private toggle: HTMLButtonElement;
  private track: CrowdTrack | null = null;
  private trackOf: Launch[] | null = null;
  private lastT = 0;
  private drawn = '';
  private on: boolean;

  constructor(wrap: HTMLElement) {
    this.on = readPref();
    this.root = document.createElement('div');
    this.root.className = 'crowd-hud';
    this.root.setAttribute('aria-hidden', 'true');
    this.root.innerHTML = `
      <canvas class="crowd-people"></canvas>
      <div class="crowd-marks"></div>
      <div class="crowd-gauge"><span class="crowd-gauge-label">관객 열기</span><div class="crowd-gauge-bar"><div class="crowd-gauge-fill"></div></div></div>`;
    this.people = this.root.querySelector('canvas')!;
    this.marks = this.root.querySelector('.crowd-marks')!;
    this.fill = this.root.querySelector('.crowd-gauge-fill')!;
    this.toggle = document.createElement('button');
    this.toggle.type = 'button';
    this.toggle.id = 'crowd-toggle';
    this.toggle.className = 'crowd-toggle';
    this.toggle.addEventListener('click', () => {
      this.on = !this.on;
      try {
        localStorage.setItem(PREF, this.on ? '1' : '0');
      } catch {
        // 기억하지 못해도 이번에는 따른다.
      }
      this.syncToggle();
    });
    this.syncToggle();
    wrap.append(this.root, this.toggle);
  }

  private syncToggle(): void {
    this.toggle.setAttribute('aria-pressed', String(this.on));
    this.toggle.textContent = this.on ? '관객 반응 켜짐' : '관객 반응 꺼짐';
    if (!this.on) this.root.hidden = true;
  }

  /** 매 프레임: 재생 중일 때만 보인다 */
  update(stage: Stage, show: Show, t: number, playing: boolean): void {
    const visible = this.on && (playing || document.body.classList.contains('watching'));
    this.root.hidden = !visible;
    this.toggle.hidden = !playing && !document.body.classList.contains('watching');
    if (!visible) {
      this.lastT = t;
      return;
    }
    const launches = stage.sim.launches;
    if (this.trackOf !== launches) {
      this.track = crowdTrack(show, launches);
      this.trackOf = launches;
    }
    const track = this.track!;
    const now = crowdAt(track, t);
    this.fill.style.transform = `scaleX(${now.heat.toFixed(3)})`;
    this.root.classList.toggle('hot', now.heat > 0.75);

    // 판정 글자: 방금 지난 판정만 (뒤로 감았거나 크게 건너뛰면 띄우지 않는다)
    if (t > this.lastT && t - this.lastT < 0.5) {
      for (const m of track.marks) {
        if (m.t <= this.lastT || m.t > t) continue;
        const p = stage.toScreen(m.at);
        if (!p) continue;
        const e = document.createElement('span');
        e.className = `crowd-mark ${m.kind}`;
        e.textContent = MARK_TEXT[m.kind];
        e.style.left = `${Math.round(p[0])}px`;
        e.style.top = `${Math.round(p[1])}px`;
        e.addEventListener('animationend', () => e.remove());
        this.marks.append(e);
      }
    }
    this.lastT = t;

    this.drawPeople(stage, now.arms, now.stand);
  }

  /** 강가 관객 실루엣. 강가 땅에 앉은 관람석에서만 (다리 위·전망대·자유 시점에서는 앞에 사람이 없다) */
  private drawPeople(stage: Stage, arms: number, stand: boolean): void {
    const c = this.people;
    const ground = stage.seat.eye[1] < 25 && !['free', 'fly', 'director'].includes(stage.seatId);
    const w = c.clientWidth;
    const h = c.clientHeight;
    const key = `${ground}|${w}|${h}|${Math.round(arms * 10)}|${stand}`;
    if (key === this.drawn) return;
    this.drawn = key;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    if (!ground) return;
    g.fillStyle = '#04050b';
    const n = Math.ceil(w / 15);
    for (let i = 0; i < n; i++) {
      const r = rand(i);
      const x = (i + 0.2 + rand(i + 99) * 0.6) * 15;
      // 앉은 사람과 선 사람, 키·어깨 폭이 제각각
      const tall = (stand ? 0.85 : 0.35) > rand(i + 7) ? 1 : 0;
      const head = 4.5 + r * 2;
      const top = h - (tall ? 34 : 22) - r * 6;
      g.beginPath();
      g.arc(x, top, head, 0, Math.PI * 2);
      g.ellipse(x, h, 7 + r * 3, h - top - head + 2, 0, Math.PI, 0);
      g.fill();
      // 함성: 몇 사람은 두 팔을, 몇 사람은 한 팔을 든다
      if (rand(i + 31) < arms * 0.7) {
        g.lineWidth = 2.6;
        g.strokeStyle = '#04050b';
        g.beginPath();
        g.moveTo(x - 5, top + head + 4);
        g.lineTo(x - 9, top - head - 6);
        if (rand(i + 47) < 0.6) {
          g.moveTo(x + 5, top + head + 4);
          g.lineTo(x + 9, top - head - 6);
        }
        g.stroke();
      }
    }
  }
}

function readPref(): boolean {
  try {
    return localStorage.getItem(PREF) !== '0';
  } catch {
    return true;
  }
}

/** 사람마다 늘 같은 0~1 값 */
function rand(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
