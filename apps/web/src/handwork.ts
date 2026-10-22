// 제작 공방의 손작업: 굴림판에서 별 굴리기, 반구에 종이 바르기, 할약 붓기.
// 손가락 길은 엔진(hand.ts)이 채점하고, 끝나면 알 설계 값을 바꾼다.

import { ROLL_TURNS, pasteScore, pourResult, rollScore } from '@nss/engine';

const DPR = () => Math.min(2, window.devicePixelRatio || 1);

function setup(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const w = canvas.clientWidth || 260;
  const h = canvas.clientHeight || 180;
  canvas.width = Math.round(w * DPR());
  canvas.height = Math.round(h * DPR());
  const g = canvas.getContext('2d')!;
  g.setTransform(DPR(), 0, 0, DPR(), 0, 0);
  return g;
}

const local = (canvas: HTMLCanvasElement, e: PointerEvent): [number, number] => {
  const r = canvas.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
};

function capture(canvas: HTMLCanvasElement, e: PointerEvent): void {
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    // 손가락이 이미 떨어졌으면 그냥 둔다.
  }
}

const label = (g: CanvasRenderingContext2D, text: string, x: number, y: number) => {
  g.fillStyle = '#a6a3bd';
  g.font = `12px 'IBM Plex Sans KR', -apple-system, sans-serif`;
  g.textAlign = 'center';
  g.fillText(text, x, y);
};

/** 별 굴리기: 가운데 둘레로 원을 그린다. 다 돌면 onDone(고르기) */
export function rollPad(canvas: HTMLCanvasElement, status: HTMLElement, onDone: (care: number) => void): void {
  const pts: [number, number][] = [];
  let down = false;
  let finished = false;
  const draw = () => {
    const g = setup(canvas);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    g.fillStyle = '#3b3328';
    g.fillRect(0, 0, w, h);
    const r = rollScore(pts, w / 2, h / 2);
    // 굴린 만큼 별이 커진다
    const size = 6 + Math.min(1, r.turns / ROLL_TURNS) * 22;
    g.strokeStyle = 'rgba(255, 210, 150, 0.35)';
    g.lineWidth = 2;
    g.beginPath();
    pts.slice(-240).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
    g.fillStyle = '#f5c451';
    g.beginPath();
    g.arc(w / 2, h / 2, size, 0, Math.PI * 2);
    g.fill();
    label(g, finished ? '다 굴렸습니다' : '가운데 둘레로 원을 그리세요', w / 2, h - 10);
    status.textContent = `${Math.min(ROLL_TURNS, r.turns).toFixed(1)} / ${ROLL_TURNS}바퀴 · 원의 고르기 ${Math.round(r.evenness * 100)}`;
    if (r.done && !finished) {
      finished = true;
      onDone(Math.round(r.evenness * 100) / 100);
    }
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (finished) return;
    down = true;
    capture(canvas, e);
    pts.push(local(canvas, e));
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!down || finished) return;
    pts.push(local(canvas, e));
    draw();
  });
  canvas.addEventListener('pointerup', () => (down = false));
  requestAnimationFrame(draw);
}

/** 종이 바르기: 반구를 문지른다. 「다 발랐어요」를 누르면 onDone(겹 수, 정성) */
export function pastePad(canvas: HTMLCanvasElement, status: HTMLElement, doneBtn: HTMLButtonElement, onDone: (layers: number, care: number) => void): void {
  const N = 10;
  const cells: { x: number; y: number }[] = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const x = (i + 0.5) / N - 0.5;
    const y = (j + 0.5) / N - 0.5;
    if (x * x + y * y <= 0.25) cells.push({ x, y });
  }
  const hits = new Array(cells.length).fill(0);
  let last = -1;
  let down = false;
  const geo = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const R = Math.min(w, h) * 0.42;
    return { w, h, R, cx: w / 2, cy: h / 2 };
  };
  const draw = () => {
    const g = setup(canvas);
    const { w, h, R, cx, cy } = geo();
    g.fillStyle = '#1a1424';
    g.fillRect(0, 0, w, h);
    const r = pasteScore(hits);
    cells.forEach((c, k) => {
      // 덧바른 만큼 종이색이 진해진다
      const n = hits[k];
      g.fillStyle = `rgba(139, 107, 74, ${Math.min(1, 0.12 + n * 0.12)})`;
      const s = (2 * R) / N;
      g.fillRect(cx + c.x * 2 * R - s / 2, cy + c.y * 2 * R - s / 2, s - 1, s - 1);
    });
    g.strokeStyle = '#8b6b4a';
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.stroke();
    label(g, '반구 위를 고르게 문지르세요', w / 2, h - 8);
    status.textContent = `${r.layers}겹 · 이번 겹 ${Math.round(r.coverage * 100)}% 덮음 · 고르기 ${Math.round(r.evenness * 100)}`;
    doneBtn.disabled = r.layers < 2;
  };
  const rub = (e: PointerEvent) => {
    const [x, y] = local(canvas, e);
    const { R, cx, cy } = geo();
    const k = cells.findIndex((c) => Math.hypot(cx + c.x * 2 * R - x, cy + c.y * 2 * R - y) < R / N);
    // 같은 칸을 계속 문지르는 것은 한 번으로 친다
    if (k >= 0 && k !== last) {
      hits[k]++;
      last = k;
      draw();
    }
  };
  canvas.addEventListener('pointerdown', (e) => {
    down = true;
    capture(canvas, e);
    rub(e);
  });
  canvas.addEventListener('pointermove', (e) => down && rub(e));
  canvas.addEventListener('pointerup', () => {
    down = false;
    last = -1;
  });
  doneBtn.addEventListener('click', () => {
    const r = pasteScore(hits);
    onDone(Math.max(2, Math.min(12, r.layers)), Math.round(r.evenness * 100) / 100);
  });
  requestAnimationFrame(draw);
}

/** 할약 붓기: 길게 눌러 붓고 떼면 onDone(할약 양, 치우침) */
export function pourPad(canvas: HTMLCanvasElement, status: HTMLElement, onDone: (breakCharge: number, chargeOffset: number) => void): void {
  let start = 0;
  let offset = 0;
  let raf = 0;
  const draw = (sec: number) => {
    const g = setup(canvas);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const R = Math.min(w, h) * 0.4;
    const cx = w / 2;
    const cy = h / 2 + 6;
    g.fillStyle = '#1a1424';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#8b6b4a';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI);
    g.stroke();
    const p = pourResult(sec, offset);
    // 부은 만큼 반구가 찬다 (붓는 쪽이 더 높게)
    g.fillStyle = 'rgba(120, 110, 90, 0.9)';
    const level = cy + R - p.breakCharge * R;
    g.beginPath();
    g.moveTo(cx - R, cy);
    g.arc(cx, cy, R, Math.PI, 0, true);
    g.lineTo(cx + R, Math.max(level - offset * 20, cy));
    g.lineTo(cx - R, Math.max(level + offset * 20, cy));
    g.closePath();
    g.save();
    g.beginPath();
    g.arc(cx, cy, R - 2, 0, Math.PI);
    g.clip();
    g.fillRect(cx - R, Math.min(level, cy + R), 2 * R, R);
    g.restore();
    // 알맞은 양 표시 (50%)
    g.strokeStyle = '#34d399';
    g.setLineDash([4, 4]);
    g.beginPath();
    g.moveTo(cx - R, cy + R * 0.5);
    g.lineTo(cx + R, cy + R * 0.5);
    g.stroke();
    g.setLineDash([]);
    label(g, '가운데를 길게 눌러 붓고, 초록 선에서 떼세요', w / 2, 16);
    status.textContent = `할약 ${Math.round(p.breakCharge * 100)}% · 치우침 ${Math.round(p.chargeOffset * 100)}%`;
    return p;
  };
  const tick = () => {
    draw((performance.now() - start) / 1000);
    raf = requestAnimationFrame(tick);
  };
  canvas.addEventListener('pointerdown', (e) => {
    capture(canvas, e);
    const [x] = local(canvas, e);
    offset = (x - canvas.clientWidth / 2) / (canvas.clientWidth / 2);
    start = performance.now();
    tick();
  });
  canvas.addEventListener('pointerup', () => {
    if (!start) return;
    cancelAnimationFrame(raf);
    const p = draw((performance.now() - start) / 1000);
    start = 0;
    onDone(p.breakCharge, p.chargeOffset);
  });
  requestAnimationFrame(() => draw(0));
}
