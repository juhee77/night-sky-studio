// 편집기 화면을 조립한다: 무대(불꽃), 시간표, 설정 칸, 음악과 재생, 자동 저장.

import './style.css';
import {
  RENDER_STRIDE,
  Simulation,
  StageRenderer,
  VENUES,
  detectTempo,
  makeView,
  launcherKindFor,
  paintBackdrop,
  projectPoint,
  setTextRasterizer,
  tapTempo,
  type Cue,
  type Launch,
  type Show,
  type View,
} from '@nss/engine';
import { demoShow } from './demo-show.ts';
import { Editor, newShow, round3, withDefaultLaunchers, type Snap } from './editor.ts';
import { fmtDate, fmtTime } from './format.ts';
import { Panel } from './panel.ts';
import {
  deleteShow,
  fileFingerprint,
  getMusic,
  getShow,
  lastShowId,
  listMusic,
  listShows,
  newId,
  putMusic,
  putShow,
  rememberLastShow,
  storageAvailable,
} from './storage.ts';
import { Timeline } from './timeline.ts';
import { BASIC_TRACKS, loadBasicTrack } from './tracks.ts';
import { Transport, waveformPeaks } from './transport.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const el = {
  stage: $<HTMLCanvasElement>('stage'),
  timeline: $<HTMLCanvasElement>('timeline'),
  panel: $<HTMLElement>('panel'),
  title: $<HTMLInputElement>('title'),
  saveState: $<HTMLSpanElement>('save-state'),
  play: $<HTMLButtonElement>('play'),
  clock: $<HTMLOutputElement>('clock'),
  music: $<HTMLSelectElement>('music'),
  musicFile: $<HTMLInputElement>('music-file'),
  bpm: $<HTMLInputElement>('bpm'),
  offset: $<HTMLInputElement>('offset'),
  tap: $<HTMLButtonElement>('tap'),
  detect: $<HTMLButtonElement>('detect'),
  seat: $<HTMLSelectElement>('seat'),
  sound: $<HTMLButtonElement>('sound'),
  fps: $('fps'),
  particles: $('particles'),
  warnings: $<HTMLParagraphElement>('warnings'),
  snap: $<HTMLSelectElement>('snap'),
  zoomIn: $<HTMLButtonElement>('zoom-in'),
  zoomOut: $<HTMLButtonElement>('zoom-out'),
  undo: $<HTMLButtonElement>('undo'),
  redo: $<HTMLButtonElement>('redo'),
  toast: $<HTMLParagraphElement>('toast'),
  showsBtn: $<HTMLButtonElement>('shows-btn'),
  dialog: $<HTMLDialogElement>('shows-dialog'),
  showList: $<HTMLUListElement>('show-list'),
  newShow: $<HTMLButtonElement>('new-show'),
  importShow: $<HTMLButtonElement>('import-show'),
  exportShow: $<HTMLButtonElement>('export-show'),
  importFile: $<HTMLInputElement>('import-file'),
};

let toastTimer = 0;
function say(message: string, ms = 4500): void {
  el.toast.textContent = message;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.toast.hidden = true), ms);
}

// ── 상태 ──
setTextRasterizer(rasterizeText);
const editor = new Editor(newId(), structuredClone(demoShow));
const transport = new Transport();
let sim = new Simulation(editor.show);
let buffer = new Float32Array((sim.pool.capacity + 256) * RENDER_STRIDE);
let musicBuffer: AudioBuffer | null = null;
let peaks: Float32Array | null = null;
let warnIdx = new Set<number>();
let clipboard: Cue[] = [];

const venue = () => VENUES[editor.show.venue.preset];
const seatId = () => editor.show.seat?.id ?? 'front-near';
const duration = () => Math.max(sim.duration, editor.show.music?.duration ?? 0, 20);

// ── 무대 ──
let renderer: StageRenderer;
try {
  renderer = new StageRenderer(el.stage);
} catch (err) {
  say(`${(err as Error).message} 최신 Chrome, Safari, Firefox에서 열어 주세요.`, 60000);
  throw err;
}
const backdropCanvas = document.createElement('canvas');
let view: View;
let backdropKey = '';

function layoutStage(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2) * (sim.density < 0.5 ? 0.75 : 1);
  const w = Math.max(1, Math.round(el.stage.clientWidth * dpr));
  const h = Math.max(1, Math.round(el.stage.clientHeight * dpr));
  const key = `${w}x${h}:${seatId()}:${editor.show.venue.preset}`;
  if (key === backdropKey) return;
  backdropKey = key;
  el.stage.width = w;
  el.stage.height = h;
  view = makeView(venue().seats[seatId()], w, h);
  backdropCanvas.width = w;
  backdropCanvas.height = h;
  paintBackdrop(backdropCanvas.getContext('2d')!, w, h, view.viewProj, venue());
  renderer.setBackdrop(backdropCanvas);
}
new ResizeObserver(() => layoutStage()).observe(el.stage);

function rebuildSim(density: number): void {
  sim = new Simulation(editor.show, { density });
  buffer = new Float32Array((sim.pool.capacity + 256) * RENDER_STRIDE);
  backdropKey = '';
  layoutStage();
}

// 무대를 누르면, 고른 종류를 놓을 수 있는 발사 위치 가운데 가장 가까운 곳에 지금 시각으로 놓는다.
el.stage.addEventListener('click', (e) => {
  const r = el.stage.getBoundingClientRect();
  const sx = ((e.clientX - r.left) / r.width) * el.stage.width;
  const kind = launcherKindFor(editor.template.type);
  let best = -1;
  let bestD = Infinity;
  editor.show.launchers.forEach((l, i) => {
    if (l.kind !== kind) return;
    const p = projectPoint(view.viewProj, l.pos, el.stage.width, el.stage.height);
    if (!p) return;
    const d = Math.abs(p[0] - sx);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  if (best < 0) return;
  placeNow(best);
});

function placeNow(lane: number): void {
  const l = editor.show.launchers[lane];
  if (!l) return;
  const t = editor.snapTime(transport.time);
  if (!editor.addCue(t, l.id)) rejectPlacement();
}

function rejectPlacement(): void {
  say('나이아가라는 다리 줄에, 지상 틀불꽃은 지상 틀 줄에 놓습니다. 바지선 줄에는 하늘 불꽃과 케이크를 놓으세요.');
}

/** 틀불꽃 글자를 기기 글꼴로 그려 심지 위치로 바꾼다. 한글도 쓸 수 있다. */
function rasterizeText(text: string): { points: [number, number][]; width: number } {
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

// ── 시간표와 설정 칸 ──
const timeline: Timeline = new Timeline(el.timeline, editor, {
  time: () => transport.time,
  seek: (t) => transport.seek(Math.min(t, duration())),
  duration,
  waveform: () => peaks,
  musicDuration: () => musicBuffer?.duration ?? 0,
  warnings: () => warnIdx,
});
new Panel(el.panel, editor);
timeline.onReject = rejectPlacement;

el.snap.addEventListener('change', () => (editor.snap = el.snap.value as Snap));
el.zoomIn.addEventListener('click', () => timeline.zoomBy(1.5));
el.zoomOut.addEventListener('click', () => timeline.zoomBy(1 / 1.5));
el.undo.addEventListener('click', () => editor.undo());
el.redo.addEventListener('click', () => editor.redo());

// ── 쇼가 바뀌면 ──
let saveTimer = 0;
editor.on((c) => {
  if (c !== 'show') return;
  sim.setShow(editor.show);
  warnIdx = new Set(sim.warnings.map((w) => w.cueIndex));
  el.warnings.hidden = !sim.warnings.length;
  el.warnings.textContent = sim.warnings.length
    ? `${sim.warnings.length}개 불꽃은 쇼 시작 전에 쏴야 합니다 (시간표에 빨간 테두리). ${sim.warnings[0].message}`
    : '';
  el.undo.disabled = !editor.canUndo;
  el.redo.disabled = !editor.canRedo;
  if (document.activeElement !== el.title) el.title.value = editor.show.title ?? '';
  syncTempoInputs();
  el.saveState.textContent = '저장 중…';
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(save, 600);
});

async function save(): Promise<void> {
  await putShow({ id: editor.id, updatedAt: Date.now(), show: editor.show });
  rememberLastShow(editor.id);
  el.saveState.textContent = '저장됨';
}

el.title.addEventListener('input', () => editor.setTitle(el.title.value));

// ── 음악 ──
function syncTempoInputs(): void {
  const m = editor.show.music;
  if (document.activeElement !== el.bpm) el.bpm.value = m ? String(m.bpm) : '120';
  if (document.activeElement !== el.offset) el.offset.value = m ? m.offset.toFixed(2) : '0.00';
}

async function refreshMusicOptions(): Promise<void> {
  const files = await listMusic();
  const current = editor.show.music?.id;
  el.music.innerHTML = '';
  const basic = document.createElement('optgroup');
  basic.label = '기본 곡';
  for (const t of BASIC_TRACKS) basic.append(new Option(`${t.title} (${t.bpm})`, t.id));
  el.music.append(basic);
  const mine = document.createElement('optgroup');
  mine.label = '내 음악';
  for (const f of files) mine.append(new Option(f.name, f.id));
  if (current?.startsWith('file:') && !files.some((f) => f.id === current)) {
    mine.append(new Option(`${editor.show.music!.title} (이 기기에 없음)`, current));
  }
  mine.append(new Option('내 음악 파일 열기…', '__open'));
  el.music.append(mine);
  el.music.append(new Option('음악 없음', '__none'));
  el.music.value = current ?? '__none';
}

async function loadMusicFor(show: Show): Promise<void> {
  const m = show.music;
  musicBuffer = null;
  peaks = null;
  transport.setMusic(null);
  if (!m) return;
  let buf: AudioBuffer | null = null;
  const basic = loadBasicTrack(m.id);
  if (basic) {
    buf = await basic;
  } else {
    const rec = await getMusic(m.id);
    if (!rec) {
      say(`이 쇼의 음악 「${m.title}」이 이 기기에 없습니다. 같은 파일을 '내 음악 파일 열기'로 골라 주세요.`, 8000);
      return;
    }
    buf = await decode(await rec.blob.arrayBuffer());
  }
  if (editor.show !== show && editor.show.music?.id !== m.id) return; // 그사이 다른 쇼를 열었다
  musicBuffer = buf;
  peaks = waveformPeaks(buf);
  transport.setMusic(buf);
}

function decode(data: ArrayBuffer): Promise<AudioBuffer> {
  return new OfflineAudioContext(1, 1, 44100).decodeAudioData(data);
}

/** 박자 찾기용: 한 채널을 22kHz 근처로 줄인다. */
function monoForTempo(buf: AudioBuffer): { samples: Float32Array; rate: number } {
  const step = Math.max(1, Math.floor(buf.sampleRate / 22050));
  const ch = buf.getChannelData(0);
  const other = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null;
  const out = new Float32Array(Math.floor(ch.length / step));
  for (let i = 0; i < out.length; i++) out[i] = other ? (ch[i * step] + other[i * step]) / 2 : ch[i * step];
  return { samples: out, rate: buf.sampleRate / step };
}

el.music.addEventListener('change', async () => {
  const v = el.music.value;
  if (v === '__open') {
    el.musicFile.click();
    el.music.value = editor.show.music?.id ?? '__none';
    return;
  }
  if (v === '__none') {
    editor.change((d) => delete d.music);
    await loadMusicFor(editor.show);
    return;
  }
  const basic = BASIC_TRACKS.find((t) => t.id === v);
  if (basic) {
    const buf = await loadBasicTrack(basic.id)!;
    editor.change((d) => (d.music = { id: basic.id, title: basic.title, bpm: basic.bpm, offset: 0, duration: round3(buf.duration) }));
  } else {
    const rec = await getMusic(v);
    if (!rec) return;
    editor.change((d) => (d.music = { id: rec.id, title: rec.name, bpm: rec.bpm, offset: rec.offset, duration: rec.duration }));
  }
  await loadMusicFor(editor.show);
});

el.musicFile.addEventListener('change', async () => {
  const file = el.musicFile.files?.[0];
  el.musicFile.value = '';
  if (!file) return;
  say(`「${file.name}」을 읽고 박자를 찾는 중입니다…`, 20000);
  try {
    const buf = await decode(await file.arrayBuffer());
    const { samples, rate } = monoForTempo(buf);
    const tempo = detectTempo(samples, rate);
    const id = await fileFingerprint(file);
    const name = file.name.replace(/\.[^.]+$/, '');
    await putMusic({ id, name, blob: file, bpm: tempo.bpm, offset: round3(tempo.offset), duration: round3(buf.duration) });
    editor.change((d) => (d.music = { id, title: name, bpm: tempo.bpm, offset: round3(tempo.offset), duration: round3(buf.duration) }));
    await refreshMusicOptions();
    await loadMusicFor(editor.show);
    say(
      tempo.confidence < 0.35
        ? `박자가 뚜렷하지 않습니다. ${tempo.bpm} BPM으로 잡았지만, 재생하면서 '박자 두드리기'로 맞춰 주세요.`
        : `박자를 찾았습니다: ${tempo.bpm} BPM. 눈금이 맞지 않으면 '박자 두드리기'로 고쳐 주세요.`,
      8000,
    );
  } catch {
    say('이 파일은 열 수 없습니다. mp3, m4a, wav 같은 음악 파일을 골라 주세요.');
  }
});

el.bpm.addEventListener('change', () => {
  const bpm = Number(el.bpm.value);
  if (!(bpm >= 40 && bpm <= 240)) return syncTempoInputs();
  editor.change((d) => d.music && (d.music.bpm = round3(bpm)));
});
el.offset.addEventListener('change', () => {
  const offset = Math.max(0, Number(el.offset.value) || 0);
  editor.change((d) => d.music && (d.music.offset = round3(offset)));
});

el.detect.addEventListener('click', async () => {
  if (!musicBuffer) return say('음악을 먼저 골라 주세요.');
  const { samples, rate } = monoForTempo(musicBuffer);
  const tempo = detectTempo(samples, rate);
  editor.change((d) => d.music && Object.assign(d.music, { bpm: tempo.bpm, offset: round3(tempo.offset) }));
  say(`${tempo.bpm} BPM, 첫 박 ${tempo.offset.toFixed(2)}초로 맞췄습니다.`);
});

// 박자 두드리기: 재생 중에 박마다 누른다. 2초 넘게 쉬면 새로 센다.
let taps: number[] = [];
let tapIdle = 0;
function tap(): void {
  if (!editor.show.music) return say('음악을 먼저 골라 주세요.');
  if (!transport.playing) return say('재생을 시작한 뒤 박자에 맞춰 눌러 주세요.');
  const now = transport.time;
  if (taps.length && now - taps[taps.length - 1] > 2) taps = [];
  if (!taps.length) editor.beginBatch();
  taps.push(now);
  const r = tapTempo(taps);
  if (r) editor.change((d) => d.music && Object.assign(d.music, { bpm: r.bpm, offset: round3(r.offset) }));
  el.tap.textContent = r ? `${r.bpm} BPM` : `${taps.length}번째…`;
  clearTimeout(tapIdle);
  tapIdle = window.setTimeout(() => {
    editor.endBatch();
    taps = [];
    el.tap.textContent = '박자 두드리기';
  }, 2000);
}
el.tap.addEventListener('click', tap);

// ── 재생 ──
function togglePlay(): void {
  if (transport.playing) {
    transport.pause();
  } else {
    if (transport.time >= duration() - 0.05) transport.seek(0);
    transport.play();
  }
  el.play.textContent = transport.playing ? '❚❚' : '▶';
  el.play.setAttribute('aria-label', transport.playing ? '일시정지' : '재생');
}
el.play.addEventListener('click', togglePlay);

// 휴대폰에서는 박자 맞추기 칸을 접어 두고, 버튼으로 연다.
const tempoToggle = document.getElementById('tempo-toggle') as HTMLButtonElement;
tempoToggle.addEventListener('click', () => {
  const open = document.body.classList.toggle('show-tempo');
  tempoToggle.setAttribute('aria-expanded', String(open));
});

el.sound.addEventListener('click', () => {
  transport.soundOn = !transport.soundOn;
  el.sound.setAttribute('aria-pressed', String(transport.soundOn));
  el.sound.textContent = transport.soundOn ? '효과음 켜짐' : '효과음 꺼짐';
});

for (const [id, seat] of Object.entries(venue().seats)) el.seat.add(new Option(seat.label, id));
el.seat.addEventListener('change', () => {
  const id = el.seat.value;
  editor.change((d) => (d.seat = { id }));
  layoutStage();
});

// ── 키보드 ──
const typing = (t: EventTarget | null) =>
  t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement;

document.addEventListener('keydown', (e) => {
  if (typing(e.target) || el.dialog.open) return;
  const mod = e.metaKey || e.ctrlKey;
  const key = e.key.toLowerCase();
  if (e.code === 'Space') {
    e.preventDefault();
    togglePlay();
  } else if (key === 'delete' || key === 'backspace') {
    e.preventDefault();
    editor.deleteSelected();
  } else if (mod && key === 'z') {
    e.preventDefault();
    if (e.shiftKey) editor.redo();
    else editor.undo();
  } else if (mod && key === 'y') {
    e.preventDefault();
    editor.redo();
  } else if (mod && key === 'c') {
    clipboard = editor.selectedCues.map((c) => structuredClone(c));
    if (clipboard.length) say(`불꽃 ${clipboard.length}개를 복사했습니다.`, 1500);
  } else if (mod && key === 'v') {
    e.preventDefault();
    editor.paste(clipboard, editor.snapTime(transport.time));
  } else if (mod && key === 'd') {
    e.preventDefault();
    const cues = editor.selectedCues;
    if (cues.length) editor.paste(cues, Math.min(...cues.map((c) => c.t)) + editor.beat.length);
  } else if (mod && key === 'a') {
    e.preventDefault();
    editor.select(editor.show.cues.map((_, i) => i));
  } else if (!mod && /^[1-9]$/.test(e.key)) {
    placeNow(Number(e.key) - 1);
  } else if (!mod && key === 't') {
    tap();
  } else if (key === 'arrowleft' || key === 'arrowright') {
    e.preventDefault();
    const dir = key === 'arrowleft' ? -1 : 1;
    const step = e.altKey ? 0.01 : editor.beat.length;
    if (editor.selection.size) {
      const sel = editor.selection;
      editor.change((d) => {
        for (const i of sel) d.cues[i].t = round3(Math.max(0, d.cues[i].t + dir * step));
      });
    } else {
      transport.seek(Math.max(0, transport.time + dir * step));
    }
  } else if (key === 'home') {
    transport.seek(0);
  } else if (key === 'escape') {
    editor.select([]);
  }
});

// ── 내 쇼 ──
async function openShow(id: string, loaded: Show): Promise<void> {
  const show = withDefaultLaunchers(loaded);
  if (transport.playing) togglePlay();
  transport.seek(0);
  editor.load(id, show);
  el.seat.value = seatId();
  el.title.value = show.title ?? '';
  rememberLastShow(id);
  backdropKey = '';
  layoutStage();
  timeline.scroll = 0;
  await refreshMusicOptions();
  await loadMusicFor(show);
}

async function renderShowList(): Promise<void> {
  const shows = await listShows();
  el.showList.innerHTML = '';
  for (const rec of shows) {
    const li = document.createElement('li');
    if (rec.id === editor.id) li.className = 'current';
    const s = rec.show;
    const len = Math.max(...s.cues.map((c) => c.t), 0);
    li.innerHTML = `
      <div class="info">
        <div class="name"></div>
        <div class="meta">불꽃 ${s.cues.length}개 · ${fmtTime(len).replace(/\.\d+$/, '')} · ${fmtDate(rec.updatedAt)}</div>
      </div>
      <div class="row-actions">
        <button type="button" data-act="open">${rec.id === editor.id ? '열려 있음' : '열기'}</button>
        <button type="button" data-act="copy">복제</button>
        <button type="button" data-act="delete" class="danger">삭제</button>
      </div>`;
    li.querySelector('.name')!.textContent = s.title || '제목 없는 쇼';
    const [openBtn, copyBtn, delBtn] = li.querySelectorAll('button');
    openBtn.disabled = rec.id === editor.id;
    openBtn.addEventListener('click', async () => {
      await openShow(rec.id, rec.show);
      el.dialog.close();
    });
    copyBtn.addEventListener('click', async () => {
      const copy = { ...structuredClone(rec.show), title: `${rec.show.title ?? '쇼'} 사본` };
      await putShow({ id: newId(), updatedAt: Date.now(), show: copy });
      await renderShowList();
    });
    // 지우기는 한 번 더 눌러야 한다.
    delBtn.addEventListener('click', async () => {
      if (delBtn.dataset.confirm !== '1') {
        delBtn.dataset.confirm = '1';
        delBtn.textContent = '정말 삭제';
        return;
      }
      await deleteShow(rec.id);
      if (rec.id === editor.id) {
        const rest = await listShows();
        if (rest[0]) await openShow(rest[0].id, rest[0].show);
        else await createShow();
      }
      await renderShowList();
    });
    el.showList.append(li);
  }
}

async function createShow(): Promise<void> {
  const shows = await listShows();
  const id = newId();
  const show = newShow(`새 쇼 ${shows.length + 1}`);
  await putShow({ id, updatedAt: Date.now(), show });
  await openShow(id, show);
}

el.showsBtn.addEventListener('click', async () => {
  await renderShowList();
  el.dialog.showModal();
});
el.newShow.addEventListener('click', async () => {
  await createShow();
  el.dialog.close();
  say('새 쇼를 만들었습니다. 시간표의 빈 곳을 눌러 첫 불꽃을 놓아 보세요.');
});
el.exportShow.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(editor.show, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${(editor.show.title || 'show').replace(/[\\/:*?"<>|]/g, '_')}.nss.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
el.importShow.addEventListener('click', () => el.importFile.click());
el.importFile.addEventListener('change', async () => {
  const file = el.importFile.files?.[0];
  el.importFile.value = '';
  if (!file) return;
  try {
    const show = JSON.parse(await file.text()) as Show;
    if (show.version !== 1 || !Array.isArray(show.cues) || !Array.isArray(show.launchers)) throw new Error();
    const id = newId();
    await putShow({ id, updatedAt: Date.now(), show });
    await openShow(id, show);
    el.dialog.close();
    say(`「${show.title ?? file.name}」을 가져왔습니다.`);
  } catch {
    say('밤하늘 연출실 쇼 파일(.nss.json)이 아닙니다.');
  }
});

// ── 매 프레임 ──
const fanCount = (l: Launch) => editor.show.cues[l.cueIndex]?.fan?.count ?? 1;
let frames = 0;
let windowStart = performance.now();
let slowSince = 0;
let lastClock = '';

function frame(now: number): void {
  layoutStage();
  let t = transport.time;
  const end = duration();
  if (transport.playing && t >= end) {
    togglePlay();
    transport.seek(end);
    t = end;
  }
  sim.advanceTo(t);
  const count = sim.writeRender(buffer);
  renderer.render({
    buffer,
    count,
    viewProj: view.viewProj,
    pxPerMeter: view.pxPerMeter,
    eye: venue().seats[seatId()].eye,
    skyLight: sim.skyLight,
    reflection: true,
    shore: [venue().nearShoreZ, venue().farShoreZ],
  });
  transport.schedule(sim.launches, fanCount);
  if (transport.playing) timeline.follow(t);
  timeline.draw();

  const { offset, length } = editor.beat;
  const beatNo = Math.floor((t - offset) / length + 1e-6);
  const clock = `${fmtTime(t)} · ${beatNo >= 0 ? `${Math.floor(beatNo / 4) + 1}마디 ${(beatNo % 4) + 1}박` : '시작 전'}`;
  if (clock !== lastClock) el.clock.value = lastClock = clock;

  frames++;
  if (now - windowStart >= 500) {
    const fps = (frames * 1000) / (now - windowStart);
    el.fps.textContent = fps.toFixed(0);
    el.particles.textContent = count.toLocaleString('ko-KR');
    frames = 0;
    windowStart = now;
    // 3초 동안 계속 느리면 밀도를 한 단계 낮춘다.
    if (transport.playing && fps < 45 && !document.hidden) {
      slowSince ||= now;
      if (now - slowSince > 3000 && sim.density > 0.35) {
        rebuildSim(sim.density > 0.6 ? 0.6 : 0.35);
        say('화면이 느려서 불꽃 밀도를 낮췄습니다.');
        slowSince = 0;
      }
    } else {
      slowSince = 0;
    }
  }
  requestAnimationFrame(frame);
}

// ── 시작 ──
async function boot(): Promise<void> {
  if (!(await storageAvailable())) say('이 브라우저에서는 저장할 수 없어, 창을 닫으면 작업이 사라집니다.', 8000);
  const last = lastShowId();
  const rec = (last && (await getShow(last))) || (await listShows())[0];
  if (rec) {
    await openShow(rec.id, rec.show);
  } else {
    await putShow({ id: editor.id, updatedAt: Date.now(), show: editor.show });
    await openShow(editor.id, editor.show);
  }
  editor.emit('show');
  el.saveState.textContent = '저장됨';
}

layoutStage();
requestAnimationFrame(frame);
void boot();
