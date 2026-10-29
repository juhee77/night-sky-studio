// 쇼를 화면 밖에서 따로 그려 내보낸다: 장노출 사진, 영상(MP4).
// 편집 중인 무대와 별개로 계산하므로, 찍는 동안에도 편집 화면은 그대로다.

import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  canEncodeVideo,
  getFirstEncodableAudioCodec,
} from 'mediabunny';
import {
  RENDER_EXTRA,
  SKIES,
  writeSnow,
  type CrowdCue,
  type Launch,
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
import { Sfx, scheduleSounds } from './sfx.ts';

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
  // 장노출은 여러 장의 빛을 쌓으므로 번짐(블룸) 없이 그린다 (쌓이면 하얗게 탄다).
  const renderer = new StageRenderer(gl, { preserve: true, quality: 'low' });
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
      fog: SKIES[show.venue.sky ?? 'night'].fog,
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
  paintBackdrop(g, w, h, view.viewProj, venue, [], show.venue.cloud, SKIES[show.venue.sky ?? 'night']);
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

export interface VideoOptions extends CaptureFrame {
  fps: number;
  /** 쇼에서 영상으로 만들 구간 */
  from: number;
  to: number;
  music: AudioBuffer | null;
  delayFor: ((l: Launch) => number) | null;
  crowd: CrowdCue[] | null;
  fanCount: (l: Launch) => number;
  onProgress: (done: number, stage: string) => void;
  signal: AbortSignal;
}

/** 이 브라우저에서 영상 만들기를 할 수 있는지 */
export async function canMakeVideo(width: number, height: number): Promise<boolean> {
  try {
    return typeof VideoEncoder !== 'undefined' && (await canEncodeVideo('avc', { width, height }));
  } catch {
    return false;
  }
}

/** 음악과 효과음을 한 소리로 섞는다 (재생과 같은 소리, 화면 밖에서 빠르게) */
async function mixAudio(o: VideoOptions, launches: Launch[]): Promise<AudioBuffer> {
  const rate = 48000;
  const len = o.to - o.from;
  const ctx = new OfflineAudioContext(2, Math.ceil(len * rate), rate);
  if (o.music && o.from < o.music.duration) {
    const src = ctx.createBufferSource();
    src.buffer = o.music;
    const g = ctx.createGain();
    g.gain.value = 0.8;
    src.connect(g).connect(ctx.destination);
    src.start(0, o.from);
  }
  const sfx = new Sfx(ctx, ctx.destination);
  scheduleSounds(sfx, launches, o.from, o.to, (t) => t - o.from, { delayFor: o.delayFor, crowd: o.crowd, fanCount: o.fanCount });
  return ctx.startRendering();
}

/**
 * 영상(MP4) 만들기: 한 프레임씩 계산해 그리고 인코딩하므로, 기기가 느려도 끊기지 않는다.
 * 소리는 음악·발사음·폭발음·관객 소리를 미리 섞어서 넣는다.
 */
export async function makeVideo(o: VideoOptions): Promise<Blob> {
  const { width: w, height: h, show, venue, fps } = o;
  const look = SKIES[show.venue.sky ?? 'night'];
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const renderer = new StageRenderer(canvas, { preserve: true });
  const sim = new Simulation(show, { density: 1 });
  const buffer = new Float32Array((sim.pool.capacity + RENDER_EXTRA) * RENDER_STRIDE);

  o.onProgress(0, '소리를 섞는 중');
  const audio = await mixAudio(o, sim.launches);
  if (o.signal.aborted) throw new DOMException('그만뒀습니다.', 'AbortError');

  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  const video = new CanvasSource(canvas, { codec: 'avc', bitrate: QUALITY_HIGH });
  output.addVideoTrack(video, { frameRate: fps });
  const audioCodec = await getFirstEncodableAudioCodec(['aac', 'opus']);
  const audioSource = audioCodec ? new AudioBufferSource({ codec: audioCodec, bitrate: QUALITY_HIGH }) : null;
  if (audioSource) output.addAudioTrack(audioSource);
  await output.start();
  if (audioSource) await audioSource.add(audio);

  const backdrop = document.createElement('canvas');
  let backdropKey = '';
  const frames = Math.max(1, Math.round((o.to - o.from) * fps));
  sim.advanceTo(o.from);
  try {
    for (let i = 0; i < frames; i++) {
      if (o.signal.aborted) throw new DOMException('그만뒀습니다.', 'AbortError');
      const t = o.from + i / fps;
      const cam = o.camera(t);
      const view = makeView(cam, w, h);
      const key = cam.eye.map((v) => v.toFixed(1)).join(',');
      if (key !== backdropKey) {
        // 카메라가 움직일 때만 배경을 다시 그린다 (날아다니기는 매 프레임, 절반 해상도로)
        const moving = backdropKey !== '';
        backdrop.width = moving ? w / 2 : w;
        backdrop.height = moving ? h / 2 : h;
        paintBackdrop(backdrop.getContext('2d')!, backdrop.width, backdrop.height, view.viewProj, venue, [], show.venue.cloud, look);
        renderer.setBackdrop(backdrop);
        backdropKey = key;
      }
      sim.advanceTo(t);
      let count = sim.writeRender(buffer);
      if (look.snow) count += writeSnow(buffer, count, t, cam.eye, sim.skyLight[0] + sim.skyLight[1] + sim.skyLight[2]);
      renderer.render({
        buffer,
        count,
        viewProj: view.viewProj,
        pxPerMeter: view.pxPerMeter,
        eye: cam.eye,
        skyLight: sim.skyLight,
        reflection: !cam.plan,
        shore: waterSpan(venue),
        fog: look.fog,
      });
      await video.add(i / fps, 1 / fps);
      if (i % 15 === 0) o.onProgress(i / frames, '영상을 만드는 중');
    }
  } catch (err) {
    await output.cancel();
    throw err;
  }
  o.onProgress(1, '마무리하는 중');
  await output.finalize();
  return new Blob([output.target.buffer!], { type: 'video/mp4' });
}
