// 편집기와 상영관이 같이 쓰는 음악·글자 도구.

import { detectTempo, setTextRasterizer, type MusicRef } from '@nss/engine';
import { round3 } from './editor.ts';
import { fileFingerprint, getMusic, putMusic } from './storage.ts';
import { loadBasicTrack } from './tracks.ts';

export function decodeAudio(data: ArrayBuffer): Promise<AudioBuffer> {
  return new OfflineAudioContext(1, 1, 44100).decodeAudioData(data);
}

/** 박자 찾기용: 한 채널을 22kHz 근처로 줄인다. */
export function monoForTempo(buf: AudioBuffer): { samples: Float32Array; rate: number } {
  const step = Math.max(1, Math.floor(buf.sampleRate / 22050));
  const ch = buf.getChannelData(0);
  const other = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null;
  const out = new Float32Array(Math.floor(ch.length / step));
  for (let i = 0; i < out.length; i++) out[i] = other ? (ch[i * step] + other[i * step]) / 2 : ch[i * step];
  return { samples: out, rate: buf.sampleRate / step };
}

/** 음악 파일을 열지 못한 까닭을 사용자 말로 */
export function musicErrorMessage(err: unknown): string {
  const name = (err as Error)?.name;
  if (name === 'EncodingError' || name === 'NotSupportedError' || name === 'DataError') {
    return '이 파일은 소리로 풀 수 없습니다. mp3, m4a, wav 같은 음악 파일을 골라 주세요. 저작권 보호가 걸린 곡(예: Apple Music에서 받은 곡)은 열 수 없습니다.';
  }
  if (name === 'QuotaExceededError') return '이 기기의 저장 공간이 부족해서 음악을 저장하지 못했습니다.';
  return `음악 파일을 열지 못했습니다. (${(err as Error)?.message ?? '알 수 없는 오류'})`;
}

const isIphone = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** 아이폰에서 처음 음악을 고를 때 한 번만: 고를 수 있는 곳을 알려 준다. */
export function iphoneMusicHint(): void {
  if (!isIphone()) return;
  try {
    if (localStorage.getItem('nss:iphoneMusicHint')) return;
    localStorage.setItem('nss:iphoneMusicHint', '1');
  } catch {
    // 저장 못 해도 안내는 띄운다.
  }
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = '아이폰은 「파일」 앱에 저장된 음악 파일(mp3, m4a 등)만 고를 수 있습니다. Apple Music 보관함의 곡은 고를 수 없어요.';
  toast.hidden = false;
  setTimeout(() => (toast.hidden = true), 9000);
}

export interface ImportedMusic {
  ref: MusicRef;
  buffer: AudioBuffer;
  confidence: number;
}

/** 음악 파일을 열어 박자를 찾고, 이 기기에 저장한다. */
export async function importMusicFile(file: File): Promise<ImportedMusic> {
  const buffer = await decodeAudio(await file.arrayBuffer());
  const { samples, rate } = monoForTempo(buffer);
  const tempo = detectTempo(samples, rate);
  const id = await fileFingerprint(file);
  const name = file.name.replace(/\.[^.]+$/, '');
  const ref: MusicRef = { id, title: name, bpm: tempo.bpm, offset: round3(tempo.offset), duration: round3(buffer.duration) };
  if (tempo.beatsPerBar === 3) ref.beatsPerBar = 3;
  await putMusic({ id, name, blob: file, bpm: ref.bpm, offset: ref.offset, duration: ref.duration, ...(ref.beatsPerBar ? { beatsPerBar: ref.beatsPerBar } : {}) });
  return { ref, buffer, confidence: tempo.confidence };
}

/** 쇼의 음악을 불러온다. 기본 곡이면 합성하고, 내 음악이면 이 기기 저장소에서 찾는다. 없으면 null. */
export async function loadMusic(ref: MusicRef): Promise<AudioBuffer | null> {
  const basic = loadBasicTrack(ref.id);
  if (basic) return basic;
  const rec = await getMusic(ref.id);
  return rec ? decodeAudio(await rec.blob.arrayBuffer()) : null;
}

/** 틀불꽃 글자를 기기 글꼴로 그려 심지 위치로 바꾼다. 한글도 쓸 수 있다. */
export function rasterizeText(text: string): { points: [number, number][]; width: number } {
  const H = 64;
  const c = document.createElement('canvas');
  const g = c.getContext('2d', { willReadFrequently: true })!;
  // 웹 글꼴은 늦게 받아질 수 있어서, 기기에 있는 글꼴로만 그린다.
  const font = `700 ${H}px 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif`;
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + 4;
  if (w <= 4) return { points: [], width: 0 };
  c.width = w;
  c.height = Math.ceil(H * 1.3);
  g.font = font;
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#fff';
  g.fillText(text, 2, H);
  const data = g.getImageData(0, 0, c.width, c.height).data;
  // 심지가 너무 많아지지 않게 간격을 넓힌다.
  let step = 3;
  let points: [number, number][] = [];
  do {
    points = [];
    for (let y = 0; y < c.height; y += step) {
      for (let x = 0; x < c.width; x += step) {
        if (data[(y * c.width + x) * 4 + 3] > 128) points.push([x / H, (H - y) / H]);
      }
    }
    step++;
  } while (points.length > 1400);
  return { points, width: c.width / H };
}

export function useDeviceFontForFrames(): void {
  setTextRasterizer(rasterizeText);
}
