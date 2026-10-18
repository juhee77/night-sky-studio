// 쇼를 화면 밖에서 따로 그려 내보낸다: 장노출 사진.
// 편집 중인 무대와 별개로 계산하므로, 찍는 동안에도 편집 화면은 그대로다.

import {
  RENDER_EXTRA,
  RENDER_STRIDE,
  Simulation,
  StageRenderer,
  makeView,
  paintBackdrop,
  waterSpan,
  type Camera,
  type Show,
  type Venue,
} from '@nss/engine';
import { fmtTime } from './format.ts';

export interface CaptureFrame {
  show: Show;
  venue: Venue;
  /** 시각에 따라 카메라가 움직일 수 있다 (날아다니기) */
  camera: (t: number) => Camera & { plan?: boolean };
  width: number;
  height: number;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

/**
 * 장노출 사진: 셔터를 seconds초 동안 열어 둔 것처럼, 그 사이의 불꽃 빛을 한 장에 모두 더한다.
 * 불꽃 사진가들이 삼각대에 카메라를 세우고 찍는 방식이다.
 */
export async function longExposure(
  f: CaptureFrame,
  t0: number,
  seconds: number,
  onProgress: (done: number) => void,
): Promise<Blob> {
  const { width: w, height: h, show, venue } = f;
  const gl = document.createElement('canvas');
  gl.width = w;
  gl.height = h;
  const renderer = new StageRenderer(gl, { preserve: true });
  // 빛만 모으려고 배경은 검게 그린다. 배경은 마지막에 한 번 깐다.
  const black = document.createElement('canvas');
  black.width = black.height = 2;
  black.getContext('2d')!.fillRect(0, 0, 2, 2);
  renderer.setBackdrop(black);

  const cam = f.camera(t0);
  const view = makeView(cam, w, h);
  const sim = new Simulation(show, { density: 1 });
  const buffer = new Float32Array((sim.pool.capacity + RENDER_EXTRA) * RENDER_STRIDE);

  const acc = document.createElement('canvas');
  acc.width = w;
  acc.height = h;
  const ag = acc.getContext('2d')!;
  ag.fillStyle = '#000';
  ag.fillRect(0, 0, w, h);
  ag.globalCompositeOperation = 'lighter';
  // 오래 머무는 빛은 쌓여서 하얗게 타기 쉬우므로 한 장면의 몫은 작게 둔다.
  ag.globalAlpha = 0.08;

  const perSecond = 60;
  const samples = Math.max(1, Math.round(seconds * perSecond));
  sim.advanceTo(t0);
  for (let k = 0; k < samples; k++) {
    sim.advanceTo(t0 + k / perSecond);
    const count = sim.writeRender(buffer);
    renderer.render({
      buffer,
      count,
      viewProj: view.viewProj,
      pxPerMeter: view.pxPerMeter,
      eye: cam.eye,
      skyLight: [0, 0, 0],
      reflection: !cam.plan,
      shore: waterSpan(venue),
    });
    ag.drawImage(gl, 0, 0);
    if (k % 12 === 0) {
      onProgress(k / samples);
      await tick();
    }
  }

  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const g = out.getContext('2d')!;
  paintBackdrop(g, w, h, view.viewProj, venue, [], show.venue.cloud);
  g.globalCompositeOperation = 'lighter';
  g.drawImage(acc, 0, 0);
  g.globalCompositeOperation = 'source-over';

  // 아래 오른쪽에 작게: 쇼 이름, 찍은 구간, 셔터 시간
  const fs = Math.round(h / 54);
  g.font = `600 ${fs}px 'IBM Plex Sans KR', -apple-system, sans-serif`;
  g.textAlign = 'right';
  g.fillStyle = 'rgba(236, 234, 246, 0.7)';
  const label = `${show.title || '밤하늘 연출실'} · ${fmtTime(t0).replace(/\.\d+$/, '')}부터 ${seconds}초 노출`;
  g.fillText(label, w - fs, h - fs);

  onProgress(1);
  return new Promise((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new Error('이미지를 만들지 못했습니다.'))), 'image/png'));
}
