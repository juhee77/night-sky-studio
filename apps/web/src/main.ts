// 0단계 렌더 시험 화면. 쇼를 재생하면서 fps와 입자 수를 보여 주고,
// 느린 기기에서는 밀도를 자동으로 낮춘다.

import {
  RENDER_STRIDE,
  Simulation,
  StageRenderer,
  VENUES,
  makeView,
  paintBackdrop,
  type View,
} from '@nss/engine';
import { demoShow } from './demo-show.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>('stage');
const playBtn = $<HTMLButtonElement>('play');
const scrub = $<HTMLInputElement>('scrub');
const clock = $<HTMLOutputElement>('clock');
const seatSel = $<HTMLSelectElement>('seat');
const densitySel = $<HTMLSelectElement>('density');
const reflectionBox = $<HTMLInputElement>('reflection');
const verifyBtn = $<HTMLButtonElement>('verify');
const toast = $<HTMLParagraphElement>('toast');
const out = {
  fps: $('fps'),
  particles: $('particles'),
  simMs: $('sim-ms'),
  drawMs: $('draw-ms'),
  warnings: $('warnings'),
};

const venue = VENUES[demoShow.venue.preset];
let seatId = demoShow.seat?.id ?? 'front-near';
for (const [id, seat] of Object.entries(venue.seats)) seatSel.add(new Option(seat.label, id, false, id === seatId));

let renderer: StageRenderer;
try {
  renderer = new StageRenderer(canvas);
} catch (err) {
  document.body.insertAdjacentHTML(
    'beforeend',
    `<p class="toast">${(err as Error).message} 최신 Chrome, Safari, Firefox에서 열어 주세요.</p>`,
  );
  throw err;
}

let sim = new Simulation(demoShow, { density: Number(densitySel.value) });
let buffer = new Float32Array((sim.pool.capacity + 256) * RENDER_STRIDE);
let view: View;
let t = 0;
let playing = true;

scrub.max = sim.duration.toFixed(2);
if (sim.warnings.length) {
  out.warnings.hidden = false;
  out.warnings.textContent = sim.warnings.map((w) => w.message).join(' ');
}

const backdropCanvas = document.createElement('canvas');

function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2) * (sim.density < 0.5 ? 0.75 : 1);
  const w = Math.round(canvas.clientWidth * dpr);
  const h = Math.round(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  view = makeView(venue.seats[seatId], w, h);
  backdropCanvas.width = w;
  backdropCanvas.height = h;
  paintBackdrop(backdropCanvas.getContext('2d')!, w, h, view.viewProj, venue);
  renderer.setBackdrop(backdropCanvas);
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  return `${m}:${(sec - m * 60).toFixed(2).padStart(5, '0')}`;
}

let toastTimer = 0;
function say(message: string): void {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.hidden = true), 4000);
}

function rebuild(density: number): void {
  sim = new Simulation(demoShow, { density });
  buffer = new Float32Array((sim.pool.capacity + 256) * RENDER_STRIDE);
  sim.advanceTo(t);
  resize();
}

// 성능 측정: 0.5초마다 fps를 갱신하고, 3초 동안 계속 느리면 밀도를 한 단계 낮춘다.
let frames = 0;
let windowStart = performance.now();
let slowSince = 0;
let simAcc = 0;
let drawAcc = 0;
let last = performance.now();

function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;

  if (playing) {
    t += dt;
    if (t >= sim.duration) t = 0;
    scrub.value = t.toFixed(2);
  }
  clock.value = `${fmt(t)} / ${fmt(sim.duration)}`;

  const s0 = performance.now();
  sim.advanceTo(t);
  const count = sim.writeRender(buffer);
  const s1 = performance.now();
  renderer.render({
    buffer,
    count,
    viewProj: view.viewProj,
    pxPerMeter: view.pxPerMeter,
    eye: venue.seats[seatId].eye,
    skyLight: sim.skyLight,
    reflection: reflectionBox.checked,
    shore: [venue.nearShoreZ, venue.farShoreZ],
  });
  const s2 = performance.now();
  simAcc += s1 - s0;
  drawAcc += s2 - s1;
  frames++;

  if (now - windowStart >= 500) {
    const fps = (frames * 1000) / (now - windowStart);
    out.fps.textContent = fps.toFixed(0);
    out.particles.textContent = count.toLocaleString('ko-KR');
    out.simMs.textContent = `${(simAcc / frames).toFixed(1)}ms`;
    out.drawMs.textContent = `${(drawAcc / frames).toFixed(1)}ms`;
    frames = 0;
    simAcc = 0;
    drawAcc = 0;
    windowStart = now;

    if (playing && fps < 48 && !document.hidden) {
      slowSince ||= now;
      if (now - slowSince > 3000) {
        const next = [...densitySel.options].find((o) => Number(o.value) < sim.density);
        if (next) {
          densitySel.value = next.value;
          rebuild(Number(next.value));
          say(`화면이 느려서 밀도를 '${next.text}'(으)로 낮췄습니다.`);
        }
        slowSince = 0;
      }
    } else {
      slowSince = 0;
    }
  }
  requestAnimationFrame(frame);
}

playBtn.addEventListener('click', () => {
  playing = !playing;
  playBtn.textContent = playing ? '❚❚' : '▶';
  playBtn.setAttribute('aria-label', playing ? '일시정지' : '재생');
  last = performance.now();
});

scrub.addEventListener('input', () => {
  t = Number(scrub.value);
});

seatSel.addEventListener('change', () => {
  seatId = seatSel.value;
  resize();
});

densitySel.addEventListener('change', () => {
  rebuild(Number(densitySel.value));
  say(`밀도를 '${densitySel.selectedOptions[0].text}'(으)로 바꿨습니다.`);
});

// 재현성 검사: 같은 쇼를 한 번에, 또 잘게 나눠서 계산해 결과 지문이 같은지 본다.
// 지문 값을 다른 기기의 값과 비교하면 기기 사이에서도 같은지 알 수 있다.
verifyBtn.addEventListener('click', () => {
  const target = Math.min(20, sim.duration);
  const a = new Simulation(demoShow, { density: sim.density });
  a.advanceTo(target);
  const b = new Simulation(demoShow, { density: sim.density });
  let x = 0;
  while (x < target) b.advanceTo((x = Math.min(target, x + 0.007 + Math.random() * 0.03)));
  const ha = a.stateHash().toString(16).padStart(8, '0');
  const hb = b.stateHash().toString(16).padStart(8, '0');
  say(ha === hb ? `같습니다. ${target}초 시점 지문 ${ha} (밀도 ${sim.density})` : `다릅니다: ${ha} / ${hb}`);
});

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !(e.target instanceof HTMLSelectElement)) {
    e.preventDefault();
    playBtn.click();
  }
});

window.addEventListener('resize', resize);
resize();
requestAnimationFrame(frame);
