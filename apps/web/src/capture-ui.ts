// 장노출 사진과 영상 만들기 창. 사진·영상 코드는 처음 쓸 때 받아 온다 (편집기를 여는 속도를 위해).

import { audienceCues, type Launch } from '@nss/engine';
import type { Editor } from './editor.ts';
import { fmtTime } from './format.ts';
import type { Stage } from './stage.ts';
import type { Transport } from './transport.ts';
import { el, say } from './ui.ts';

export interface CaptureCtx {
  editor: Editor;
  stage: Stage;
  transport: Transport;
  togglePlay(): void;
  duration(): number;
  music(): AudioBuffer | null;
  fanCount(l: Launch): number;
}

export function wireCapture(ctx: CaptureCtx): void {
  let shutter = 4;
  let photoBlob: Blob | null = null;
  el.photoBtn.addEventListener('click', () => {
    if (ctx.transport.playing) ctx.togglePlay();
    el.photoFrom.textContent = `지금 재생 위치(${fmtTime(ctx.transport.time).replace(/\.\d+$/, '')})부터 찍습니다. 시간표에서 위치를 옮긴 뒤 찍어도 됩니다.`;
    el.photoDialog.showModal();
  });
  el.photoShutter.querySelectorAll<HTMLButtonElement>('[data-sec]').forEach((b) =>
    b.addEventListener('click', () => {
      shutter = Number(b.dataset.sec);
      el.photoShutter.querySelectorAll('[data-sec]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    }),
  );
  el.photoShoot.addEventListener('click', async () => {
    el.photoShoot.disabled = true;
    el.photoProgress.hidden = false;
    el.photoProgress.value = 0;
    try {
      const t0 = ctx.transport.time;
      // 사진·영상 코드는 처음 쓸 때 받아 온다 (편집기를 여는 속도를 위해)
      const { longExposure } = await import('./capture.ts');
      photoBlob = await longExposure(
        { show: ctx.editor.show, venue: ctx.stage.venue, camera: (t) => ctx.stage.cameraAt(t), width: 1920, height: 1080 },
        t0,
        shutter,
        (p) => (el.photoProgress.value = p),
      );
      if (el.photoPreview.src) URL.revokeObjectURL(el.photoPreview.src);
      el.photoPreview.src = URL.createObjectURL(photoBlob);
      el.photoPreview.hidden = false;
      el.photoSave.hidden = false;
      const file = new File([photoBlob], 'photo.png', { type: 'image/png' });
      el.photoShare.hidden = !navigator.canShare?.({ files: [file] });
    } catch (err) {
      say(`사진을 찍지 못했습니다. ${(err as Error).message}`);
    } finally {
      el.photoShoot.disabled = false;
      el.photoShoot.textContent = '다시 찍기';
      el.photoProgress.hidden = true;
    }
  });
  const photoName = () => `${(ctx.editor.show.title || '밤하늘').replace(/[\\/:*?"<>|]/g, '_')}-장노출.png`;
  el.photoSave.addEventListener('click', () => {
    if (!photoBlob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(photoBlob);
    a.download = photoName();
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  el.photoShare.addEventListener('click', () => {
    if (!photoBlob) return;
    const file = new File([photoBlob], photoName(), { type: 'image/png' });
    void navigator.share?.({ files: [file], title: ctx.editor.show.title ?? '밤하늘 연출실' }).catch(() => {});
  });

  let videoHeight = 720;
  let videoBlob: Blob | null = null;
  let videoAbort: AbortController | null = null;
  el.videoBtn.addEventListener('click', () => {
    if (ctx.transport.playing) ctx.togglePlay();
    el.videoDialog.showModal();
  });
  el.videoSize.querySelectorAll<HTMLButtonElement>('[data-h]').forEach((b) =>
    b.addEventListener('click', () => {
      videoHeight = Number(b.dataset.h);
      el.videoSize.querySelectorAll('[data-h]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    }),
  );
  el.videoMake.addEventListener('click', async () => {
    const h = videoHeight;
    const w = Math.round((h * 16) / 9);
    const { canMakeVideo, makeVideo } = await import('./capture.ts');
    if (!(await canMakeVideo(w, h))) {
      el.videoStatus.textContent = '이 브라우저에서는 영상을 만들 수 없습니다. 최신 Chrome, Edge, Safari에서 해 보세요.';
      return;
    }
    videoAbort = new AbortController();
    el.videoMake.disabled = true;
    el.videoStop.hidden = false;
    el.videoProgress.hidden = false;
    el.videoPreview.hidden = true;
    const started = performance.now();
    try {
      videoBlob = await makeVideo({
        show: ctx.editor.show,
        venue: ctx.stage.venue,
        camera: (t) => ctx.stage.cameraAt(t),
        width: w,
        height: h,
        fps: 30,
        from: 0,
        to: ctx.duration(),
        music: ctx.music(),
        delayFor: ctx.stage.soundDelay,
        crowd: audienceCues(ctx.stage.sim.launches),
        fanCount: ctx.fanCount,
        signal: videoAbort.signal,
        onProgress: (p, stageName) => {
          el.videoProgress.value = p;
          el.videoStatus.textContent = `${stageName}… ${Math.round(p * 100)}%`;
        },
      });
      if (el.videoPreview.src) URL.revokeObjectURL(el.videoPreview.src);
      el.videoPreview.src = URL.createObjectURL(videoBlob);
      el.videoPreview.hidden = false;
      el.videoSave.hidden = false;
      const file = new File([videoBlob], 'show.mp4', { type: 'video/mp4' });
      el.videoShare.hidden = !navigator.canShare?.({ files: [file] });
      const mb = (videoBlob.size / 1024 / 1024).toFixed(1);
      el.videoStatus.textContent = `다 만들었습니다. ${mb}MB, ${Math.round((performance.now() - started) / 1000)}초 걸렸습니다.`;
    } catch (err) {
      el.videoStatus.textContent =
        (err as Error).name === 'AbortError' ? '그만뒀습니다.' : `영상을 만들지 못했습니다. ${(err as Error).message}`;
    } finally {
      el.videoMake.disabled = false;
      el.videoMake.textContent = '다시 만들기';
      el.videoStop.hidden = true;
      el.videoProgress.hidden = true;
    }
  });
  el.videoStop.addEventListener('click', () => videoAbort?.abort());
  el.videoDialog.addEventListener('close', () => videoAbort?.abort());
  const videoName = () => `${(ctx.editor.show.title || '밤하늘').replace(/[\\/:*?"<>|]/g, '_')}.mp4`;
  el.videoSave.addEventListener('click', () => {
    if (!videoBlob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(videoBlob);
    a.download = videoName();
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  el.videoShare.addEventListener('click', () => {
    if (!videoBlob) return;
    const file = new File([videoBlob], videoName(), { type: 'video/mp4' });
    void navigator.share?.({ files: [file], title: ctx.editor.show.title ?? '밤하늘 연출실' }).catch(() => {});
  });
}
