// 편집기 화면을 조립한다: 무대(불꽃), 시간표, 설정 칸, 음악과 재생, 자동 저장.

import './style.css';
import {
  SKIES,
  SKY_IDS,
  VENUES,
  analyzeMusic,
  audienceCues,
  autoChoreograph,
  allTubes,
  isLive,
  detectTempo,
  flatMusicMap,
  type AutoOptions,
  type Mood,
  type MusicMap,
  encodeShow,
  launcherKindFor,
  tapTempo,
  type Cue,
  type Launch,
  type Show,
} from '@nss/engine';
import { Career } from './career.ts';
import { demoShow } from './demo-show.ts';
import { Editor, moveToVenue, newShow, round3, withDefaultLaunchers, type Snap } from './editor.ts';
import { fmtDate, fmtTime } from './format.ts';
import { importMusicFile, iphoneMusicHint, loadMusic, monoForTempo, musicErrorMessage, useDeviceFontForFrames } from './media.ts';
import { Drawer } from './drawer.ts';
import { Office } from './office.ts';
import { Workshop } from './workshop.ts';
import { SitePlanner } from './siteplan.ts';
import { Panel } from './panel.ts';
import { runCountdown } from './countdown.ts';
import { CAMERA_SEATS, Stage } from './stage.ts';
import {
  deleteShow,
  getMusic,
  getShow,
  lastShowId,
  listMusic,
  listShows,
  newId,
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
  watch: $<HTMLButtonElement>('watch'),
  watchExit: $<HTMLButtonElement>('watch-exit'),
  stageWrap: $<HTMLElement>('stage-wrap'),
  shareBtn: $<HTMLButtonElement>('share-btn'),
  shareDialog: $<HTMLDialogElement>('share-dialog'),
  shareLink: $<HTMLInputElement>('share-link'),
  shareCopy: $<HTMLButtonElement>('share-copy'),
  shareNative: $<HTMLButtonElement>('share-native'),
  shareInfo: $<HTMLParagraphElement>('share-info'),
  officeBtn: $<HTMLButtonElement>('office-btn'),
  workshopBtn: $<HTMLButtonElement>('workshop-btn'),
  siteBtn: $<HTMLButtonElement>('site-btn'),
  siteDialog: $<HTMLDialogElement>('site-dialog'),
  workshopDialog: $<HTMLDialogElement>('workshop-dialog'),
  autoBtn: $<HTMLButtonElement>('auto-btn'),
  autoDialog: $<HTMLDialogElement>('auto-dialog'),
  autoDensity: $<HTMLInputElement>('auto-density'),
  autoDensityOut: $<HTMLOutputElement>('auto-density-out'),
  autoText: $<HTMLInputElement>('auto-text'),
  autoTextField: $<HTMLDivElement>('auto-text-field'),
  autoLimits: $<HTMLParagraphElement>('auto-limits'),
  autoReplace: $<HTMLParagraphElement>('auto-replace'),
  autoRun: $<HTMLButtonElement>('auto-run'),
  venue: $<HTMLSelectElement>('venue'),
  stageBtn: $<HTMLButtonElement>('stage-btn'),
  stageDialog: $<HTMLDialogElement>('stage-dialog'),
  stageLocked: $<HTMLParagraphElement>('stage-locked'),
  skyChips: $<HTMLDivElement>('sky-chips'),
  windDir: $<HTMLSelectElement>('wind-dir'),
  windSpeed: $<HTMLInputElement>('wind-speed'),
  windOut: $<HTMLOutputElement>('wind-out'),
  cloudOn: $<HTMLInputElement>('cloud-on'),
  cloudH: $<HTMLInputElement>('cloud-h'),
  cloudOut: $<HTMLOutputElement>('cloud-out'),
  countdown: $<HTMLInputElement>('countdown'),
  photoBtn: $<HTMLButtonElement>('photo-btn'),
  photoDialog: $<HTMLDialogElement>('photo-dialog'),
  photoFrom: $<HTMLSpanElement>('photo-from'),
  photoShutter: $<HTMLDivElement>('photo-shutter'),
  photoProgress: $<HTMLProgressElement>('photo-progress'),
  photoPreview: $<HTMLImageElement>('photo-preview'),
  photoShoot: $<HTMLButtonElement>('photo-shoot'),
  photoSave: $<HTMLButtonElement>('photo-save'),
  photoShare: $<HTMLButtonElement>('photo-share'),
  videoBtn: $<HTMLButtonElement>('video-btn'),
  videoDialog: $<HTMLDialogElement>('video-dialog'),
  videoSize: $<HTMLDivElement>('video-size'),
  videoProgress: $<HTMLProgressElement>('video-progress'),
  videoStatus: $<HTMLParagraphElement>('video-status'),
  videoPreview: $<HTMLVideoElement>('video-preview'),
  videoMake: $<HTMLButtonElement>('video-make'),
  videoStop: $<HTMLButtonElement>('video-stop'),
  videoSave: $<HTMLButtonElement>('video-save'),
  videoShare: $<HTMLButtonElement>('video-share'),
};

let toastTimer = 0;
function say(message: string, ms = 4500): void {
  el.toast.textContent = message;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.toast.hidden = true), ms);
}

// ── 상태 ──
useDeviceFontForFrames();
const editor = new Editor(newId(), structuredClone(demoShow));
const transport = new Transport();
let musicBuffer: AudioBuffer | null = null;
let peaks: Float32Array | null = null;
/** 곡 분석 결과 (시간표 표시와 자동 연출이 같이 쓴다) */
let musicMapCache: { key: string; map: MusicMap } | null = null;
let warnIdx = new Set<number>();
let clipboard: Cue[] = [];

// ── 무대 ──
let stage: Stage;
try {
  stage = new Stage(el.stage, editor.show);
} catch (err) {
  say(`${(err as Error).message} 최신 Chrome, Safari, Firefox에서 열어 주세요.`, 60000);
  throw err;
}
stage.onDensityLowered = () => say('화면이 느려서 불꽃 밀도를 낮췄습니다.');

const seatId = () => editor.show.seat?.id ?? 'front-near';
const duration = () => Math.max(stage.sim.duration, editor.show.music?.duration ?? 0, 20);

// 무대를 누르면, 고른 종류를 놓을 수 있는 발사 위치 가운데 가장 가까운 곳에 지금 시각으로 놓는다.
// 3D 자유 시점에서는 끌어서 돌리고, 휠이나 두 손가락으로 확대한다.
stage.attachControls((clientX) => {
  if (document.body.classList.contains('watching')) return;
  const best = stage.nearestLauncher(clientX, launcherKindFor(editor.template.type));
  if (best >= 0) placeNow(best);
});

function placeNow(lane: number): void {
  const l = editor.show.launchers[lane];
  if (!l) return;
  const t = editor.snapTime(transport.time);
  const res = editor.addCue(t, l.id);
  if (res !== true) rejectPlacement(res);
}

function rejectPlacement(why: 'kind' | 'locked'): void {
  say(
    why === 'locked'
      ? '이 의뢰에서는 아직 해금하지 않은 불꽃입니다. 「의뢰소」에서 해금하세요.'
      : '나이아가라는 다리 줄에, 지상 틀불꽃은 지상 틀 줄에 놓습니다. 바지선 줄에는 하늘 불꽃과 케이크를 놓으세요.',
  );
}

// ── 의뢰소 ──
const career = new Career();
const office = new Office(editor, career, {
  shells: () => drawer.list(),
  openShow: (id, show) => openShow(id, show),
  saveNewShow: async (show) => {
    const id = newId();
    await putShow({ id, updatedAt: Date.now(), show });
    return id;
  },
  say,
  watch: () => startWatching(),
});
editor.allowType = (t, custom) => !office.isLocked(t, custom);
el.officeBtn.addEventListener('click', () => office.openBoard());

// ── 불꽃 공작소와 내 불꽃 서랍 ──
const drawer = new Drawer();
editor.findShell = (id) => drawer.get(id) ?? editor.show.customShells?.[id];
const workshop = new Workshop(el.workshopDialog, drawer, {
  useInShow: (id) => {
    editor.select([]);
    editor.setTemplate({ type: 'custom', custom: id });
    say(`「${drawer.get(id)?.name}」을 골랐습니다. 시간표의 바지선 줄 빈 곳을 누르면 놓입니다.`);
  },
  say,
});
drawer.on(() => editor.emit('template'));
el.workshopBtn.addEventListener('click', () => {
  if (transport.playing) togglePlay();
  workshop.open(editor.template.type === 'custom' ? editor.template.custom : undefined);
});

// ── 발사장 설계 ──
const site = new SitePlanner(el.siteDialog, editor);
el.siteBtn.addEventListener('click', () => {
  if (transport.playing) togglePlay();
  site.open();
});

// ── 시간표와 설정 칸 ──
const timeline: Timeline = new Timeline(el.timeline, editor, {
  time: () => transport.time,
  seek: (t) => transport.seek(Math.min(t, duration())),
  duration,
  waveform: () => peaks,
  structure: () => (musicBuffer ? currentMusicMap() : null),
  musicDuration: () => musicBuffer?.duration ?? 0,
  warnings: () => warnIdx,
});
new Panel(el.panel, editor, office.isLocked, () => drawer.list());
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
  stage.setShow(editor.show);
  const warnings = stage.sim.warnings;
  warnIdx = new Set(warnings.map((w) => w.cueIndex));
  el.warnings.hidden = !warnings.length;
  el.warnings.textContent = warnings.length
    ? `${warnings.length}개 불꽃은 바로잡아야 합니다 (시간표에 빨간 테두리). ${warnings[0].message}`
    : '';
  el.undo.disabled = !editor.canUndo;
  el.redo.disabled = !editor.canRedo;
  if (document.activeElement !== el.title) el.title.value = editor.show.title ?? '';
  syncTempoInputs();
  // 의뢰 쇼는 의뢰 곡을 바꿀 수 없다.
  el.music.disabled = !!editor.show.commission;
  syncVenueInputs();
  if (el.stageDialog.open) syncStageSettings();
  el.music.title = editor.show.commission ? '의뢰 곡은 바꿀 수 없습니다' : '';
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
  const buf = await loadMusic(m);
  if (!buf) {
    say(`이 쇼의 음악 「${m.title}」이 이 기기에 없습니다. 같은 파일을 「내 음악 파일」로 골라 주세요.`, 8000);
    return;
  }
  if (editor.show !== show && editor.show.music?.id !== m.id) return; // 그사이 다른 쇼를 열었다
  musicBuffer = buf;
  peaks = waveformPeaks(buf);
  transport.setMusic(buf);
}

el.music.addEventListener('change', async () => {
  const v = el.music.value;
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

document.querySelector('label[for="music-file"]')?.addEventListener('click', iphoneMusicHint);

el.musicFile.addEventListener('change', async () => {
  const file = el.musicFile.files?.[0];
  el.musicFile.value = '';
  if (!file) return;
  say(`「${file.name}」을 읽고 박자를 찾는 중입니다…`, 20000);
  try {
    const { ref, confidence } = await importMusicFile(file);
    editor.change((d) => (d.music = ref));
    await refreshMusicOptions();
    await loadMusicFor(editor.show);
    say(
      confidence < 0.35
        ? `박자가 뚜렷하지 않습니다. ${ref.bpm} BPM으로 잡았지만, 재생하면서 '박자 두드리기'로 맞춰 주세요.`
        : `박자를 찾았습니다: ${ref.bpm} BPM. 눈금이 맞지 않으면 '박자 두드리기'로 고쳐 주세요.`,
      8000,
    );
  } catch (err) {
    say(musicErrorMessage(err), 8000);
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

// ── 무대와 관람석 ──
for (const v of Object.values(VENUES)) el.venue.add(new Option(`${v.label} (${v.place})`, v.id));

/** 무대에 맞게 관람석 목록을 다시 채운다. */
function syncVenueInputs(): void {
  const venue = VENUES[editor.show.venue.preset] ?? VENUES['river-bridge-city'];
  el.venue.value = venue.id;
  // 의뢰 쇼는 의뢰받은 무대에서만 한다.
  el.venue.disabled = !!editor.show.commission;
  if (el.seat.dataset.venue !== venue.id) {
    el.seat.innerHTML = '';
    for (const [id, seat] of Object.entries(venue.seats)) el.seat.add(new Option(seat.label, id));
    for (const s of CAMERA_SEATS) el.seat.add(new Option(s.label, s.id));
    el.seat.dataset.venue = venue.id;
  }
  const want = seatId();
  el.seat.value = venue.seats[want] || CAMERA_SEATS.some((s) => s.id === want) ? want : 'front-near';
  if (stage.seatId !== el.seat.value) stage.setSeat(el.seat.value);
}

// ── 무대 설정: 계절과 시간대, 바람, 구름, 카운트다운 ──
const COMPASS = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
COMPASS.forEach((name, i) => el.windDir.add(new Option(`${name}풍`, String(i * 45))));
for (const id of SKY_IDS) {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.sky = id;
  b.textContent = SKIES[id].label;
  b.addEventListener('click', () =>
    editor.change((d) => {
      if (id === 'night') delete d.venue.sky;
      else d.venue.sky = id;
    }),
  );
  el.skyChips.append(b);
}

function syncStageSettings(): void {
  const s = editor.show;
  const locked = !!s.commission;
  el.stageLocked.hidden = !locked;
  for (const input of [el.venue, el.windDir, el.windSpeed, el.cloudOn, el.cloudH]) input.disabled = locked;
  el.skyChips.querySelectorAll<HTMLButtonElement>('[data-sky]').forEach((b) => {
    b.setAttribute('aria-pressed', String((s.venue.sky ?? 'night') === b.dataset.sky));
    b.disabled = locked;
  });
  const wind = s.venue.wind ?? { dir: 0, speed: 0 };
  el.windDir.value = String((Math.round((((wind.dir % 360) + 360) % 360) / 45) % 8) * 45);
  if (document.activeElement !== el.windSpeed) el.windSpeed.value = String(wind.speed);
  el.windOut.value = wind.speed < 0.5 ? '거의 없음' : `${wind.speed.toFixed(1)}m/s`;
  el.cloudOn.checked = !!s.venue.cloud;
  el.cloudH.disabled = locked || !s.venue.cloud;
  if (document.activeElement !== el.cloudH) el.cloudH.value = String(s.venue.cloud ?? 250);
  el.cloudOut.value = s.venue.cloud ? `${s.venue.cloud}m` : '';
  el.countdown.checked = !!s.countdown;
}

const setWind = () =>
  editor.change((d) => (d.venue.wind = { dir: Number(el.windDir.value), speed: Number(el.windSpeed.value) }));
el.windDir.addEventListener('change', setWind);
el.windSpeed.addEventListener('input', () => (el.windOut.value = `${Number(el.windSpeed.value).toFixed(1)}m/s`));
el.windSpeed.addEventListener('change', setWind);
el.cloudOn.addEventListener('change', () =>
  editor.change((d) => {
    if (el.cloudOn.checked) d.venue.cloud = Number(el.cloudH.value) || 250;
    else delete d.venue.cloud;
  }),
);
el.cloudH.addEventListener('input', () => (el.cloudOut.value = `${el.cloudH.value}m`));
el.cloudH.addEventListener('change', () => editor.change((d) => (d.venue.cloud = Number(el.cloudH.value))));
el.countdown.addEventListener('change', () =>
  editor.change((d) => {
    if (el.countdown.checked) d.countdown = true;
    else delete d.countdown;
  }),
);
el.stageBtn.addEventListener('click', () => {
  syncStageSettings();
  el.stageDialog.showModal();
});

el.venue.addEventListener('change', () => {
  const id = el.venue.value;
  editor.change((d) => moveToVenue(d, id));
  const v = VENUES[id];
  say(`무대를 「${v.label}」(${v.place})로 옮겼습니다. 발사 위치도 이 무대에 맞게 바뀌었습니다.`);
});

el.seat.addEventListener('change', () => {
  const id = el.seat.value;
  editor.change((d) => (d.seat = { id }));
  stage.setSeat(id);
});

// ── 감상: 무대만 화면 가득, 처음부터, 관람석 거리만큼 소리가 늦게 ──
function startWatching(): void {
  document.body.classList.add('watching');
  editor.select([]);
  void el.stageWrap.requestFullscreen?.().catch(() => {
    // 휴대폰처럼 전체 화면이 안 되면 화면 안에서만 가득 채운다.
  });
  transport.delayFor = stage.soundDelay;
  transport.crowd = audienceCues(stage.sim.launches);
  if (transport.playing) togglePlay();
  transport.seek(0);
  if (editor.show.countdown) cancelCountdown = runCountdown(transport, () => togglePlay());
  else togglePlay();
}
let cancelCountdown: (() => void) | null = null;

function stopWatching(): void {
  if (!document.body.classList.contains('watching')) return;
  document.body.classList.remove('watching');
  cancelCountdown?.();
  cancelCountdown = null;
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  transport.delayFor = null;
  transport.crowd = null;
  if (transport.playing) togglePlay();
}

el.watch.addEventListener('click', startWatching);
el.watchExit.addEventListener('click', stopWatching);
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) stopWatching();
});

// ── 자동 연출 ──
let autoMood: Mood = 'festive';

function currentMusicMap(): MusicMap {
  const m = editor.show.music;
  const bpm = m?.bpm ?? 120;
  const offset = m?.offset ?? 0;
  const key = `${m?.id}|${bpm}|${offset}|${musicBuffer ? 'buf' : 'none'}`;
  if (musicMapCache?.key === key) return musicMapCache.map;
  let map: MusicMap;
  if (musicBuffer) {
    const { samples, rate } = monoForTempo(musicBuffer);
    map = analyzeMusic(samples, rate, bpm, offset);
  } else {
    map = flatMusicMap(Math.max(30, m?.duration ?? 60), bpm, offset);
  }
  musicMapCache = { key, map };
  return map;
}

function autoOptions(seed: number): AutoOptions {
  const o: AutoOptions = { seed, style: autoMood === 'calm' ? 'calm' : 'grand', mood: autoMood, density: Number(el.autoDensity.value) };
  if ($<HTMLInputElement>('auto-effects').checked) o.effects = true;
  if ($<HTMLInputElement>('auto-customs').checked) {
    const mine = drawer.list().filter((x) => !office.isLocked('custom', x.id));
    if (mine.length) o.customs = mine.slice(0, 6).map((x) => ({ id: x.id, size: x.build?.size ?? 5 }));
  }
  // 실전 모드: 갑판에 실린 통 안에서만
  if (isLive(editor.show)) o.tubes = allTubes(editor.show.rig);
  const range = autoRange();
  if (range && $<HTMLInputElement>('auto-range').checked) o.range = range;
  const text = el.autoText.value.trim();
  if (text) o.text = text;
  const c = editor.show.commission;
  if (c) {
    // 의뢰 쇼: 해금한 불꽃과 의뢰 조건, 예산을 지킨다.
    o.allowed = career.state.unlocked;
    o.budget = c.budget;
    for (const r of c.rules) {
      if (r.kind === 'maxSize') o.maxSize = r.size;
      else if (r.kind === 'colorsOnly') o.colors = r.colors;
      else if (r.kind === 'include') (o.include ??= []).push(r.type);
      else if (r.kind === 'endColors') o.endColors = { seconds: r.seconds, colors: r.colors };
      else if (r.kind === 'frameText' && !o.text) o.text = c.client.slice(0, 12);
    }
  }
  return o;
}

/** 고른 불꽃이 있는 구간 (그 앞뒤 박자까지). 고른 것이 없으면 null */
function autoRange(): { from: number; to: number } | null {
  const sel = editor.selectedCues;
  if (!sel.length) return null;
  const ts = sel.map((c) => c.t);
  return { from: Math.max(0, Math.min(...ts) - 0.01), to: Math.max(...ts) + 0.01 };
}

el.autoBtn.addEventListener('click', () => {
  const range = autoRange();
  $<HTMLElement>('auto-range-field').hidden = !range;
  $<HTMLInputElement>('auto-range').checked = !!range;
  if (range) $<HTMLElement>('auto-range-label').textContent = `고른 불꽃이 있는 구간(${fmtTime(range.from)}~${fmtTime(range.to)})만 다시 만들기`;
  $<HTMLElement>('auto-customs-field').hidden = !drawer.list().length;
  const n = editor.show.cues.length;
  el.autoReplace.textContent = n ? `지금 놓인 불꽃 ${n}개를 지우고 새로 만듭니다. 마음에 들지 않으면 「되돌리기」로 되돌릴 수 있습니다.` : '';
  const c = editor.show.commission;
  el.autoLimits.textContent =
    (c ? `의뢰 쇼라서 해금한 불꽃과 의뢰 조건, 예산(${c.budget}) 안에서 만듭니다. ` : '') +
    (isLive(editor.show) ? '실전 모드라서 갑판에 실린 통 안에서만 만듭니다.' : '');
  const hasFrame = editor.show.launchers.some((l) => l.kind === 'frame') && !office.isLocked('lancework');
  el.autoTextField.hidden = !hasFrame;
  if (!el.autoText.value && editor.show.title) el.autoText.placeholder = `예: ${editor.show.title.slice(0, 12)}`;
  el.autoDialog.showModal();
});
el.autoDialog.querySelectorAll<HTMLButtonElement>('[data-mood]').forEach((b) =>
  b.addEventListener('click', () => {
    autoMood = b.dataset.mood as Mood;
    el.autoDialog.querySelectorAll('[data-mood]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }),
);
el.autoDensity.addEventListener('input', () => {
  const d = Number(el.autoDensity.value);
  el.autoDensityOut.value = d < 0.5 ? '드문드문' : d < 0.8 ? '보통' : '촘촘하게';
});
el.autoRun.addEventListener('click', () => {
  const seed = Math.floor(Math.random() * 1e9);
  const o = autoOptions(seed);
  const cues = autoChoreograph(currentMusicMap(), editor.show.launchers, o);
  const range = o.range;
  editor.change((d) => {
    // 구간만 다시 만들면 그 밖의 불꽃은 그대로 둔다.
    d.cues = range ? [...d.cues.filter((c) => c.t < range.from || c.t >= range.to), ...cues].sort((a, b) => a.t - b.t) : cues;
    // 섞어 쓴 내 불꽃은 설계를 쇼 안에 복사해 둔다.
    for (const c of cues) {
      const def = c.custom ? drawer.get(c.custom) : undefined;
      if (def) d.customShells = { ...d.customShells, [def.id]: structuredClone(def) };
    }
  });
  editor.select([]);
  el.autoDialog.close();
  if (transport.playing) togglePlay();
  transport.seek(range ? Math.max(0, range.from - 4) : 0);
  if (!range) timeline.scroll = 0;
  say(
    range
      ? `${fmtTime(range.from)}~${fmtTime(range.to)} 구간에 불꽃 ${cues.length}개를 다시 놓았습니다.`
      : `불꽃 ${cues.length}개를 놓았습니다. ▶ 재생해 보고, 마음에 안 들면 「자동 연출」을 다시 누르면 다른 쇼가 나옵니다.`,
  );
});

// ── 장노출 사진 ──
let shutter = 4;
let photoBlob: Blob | null = null;
el.photoBtn.addEventListener('click', () => {
  if (transport.playing) togglePlay();
  el.photoFrom.textContent = `지금 재생 위치(${fmtTime(transport.time).replace(/\.\d+$/, '')})부터 찍습니다. 시간표에서 위치를 옮긴 뒤 찍어도 됩니다.`;
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
    const t0 = transport.time;
    // 사진·영상 코드는 처음 쓸 때 받아 온다 (편집기를 여는 속도를 위해)
    const { longExposure } = await import('./capture.ts');
    photoBlob = await longExposure(
      { show: editor.show, venue: stage.venue, camera: (t) => stage.cameraAt(t), width: 1920, height: 1080 },
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
const photoName = () => `${(editor.show.title || '밤하늘').replace(/[\\/:*?"<>|]/g, '_')}-장노출.png`;
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
  void navigator.share?.({ files: [file], title: editor.show.title ?? '밤하늘 연출실' }).catch(() => {});
});

// ── 영상 ──
let videoHeight = 720;
let videoBlob: Blob | null = null;
let videoAbort: AbortController | null = null;
el.videoBtn.addEventListener('click', () => {
  if (transport.playing) togglePlay();
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
      show: editor.show,
      venue: stage.venue,
      camera: (t) => stage.cameraAt(t),
      width: w,
      height: h,
      fps: 30,
      from: 0,
      to: duration(),
      music: musicBuffer,
      delayFor: stage.soundDelay,
      crowd: audienceCues(stage.sim.launches),
      fanCount,
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
const videoName = () => `${(editor.show.title || '밤하늘').replace(/[\\/:*?"<>|]/g, '_')}.mp4`;
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
  void navigator.share?.({ files: [file], title: editor.show.title ?? '밤하늘 연출실' }).catch(() => {});
});

// ── 공유 링크 ──
el.shareBtn.addEventListener('click', async () => {
  const code = await encodeShow(editor.show);
  const base = new URL(`${import.meta.env.BASE_URL}v/`, location.origin);
  const link = `${base.href}#s=${code}`;
  el.shareLink.value = link;
  const m = editor.show.music;
  const notes = [`링크 길이 ${link.length.toLocaleString('ko-KR')}자.`];
  if (link.length > 8000) notes.push('링크가 길어서 일부 메신저에서 잘릴 수 있습니다. 그럴 땐 쇼 파일로 내보내 보내 주세요.');
  if (m && !m.id.startsWith('basic-')) {
    notes.push(`음악 파일은 링크에 들어가지 않습니다. 받는 사람이 같은 파일(「${m.title}」, ${fmtTime(m.duration).replace(/\.\d+$/, '')})을 골라야 함께 들립니다. 바로 들려주려면 기본 곡을 쓰세요.`);
  }
  el.shareInfo.textContent = notes.join(' ');
  el.shareNative.hidden = !navigator.share;
  el.shareDialog.showModal();
  el.shareLink.select();
});
el.shareCopy.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(el.shareLink.value);
    el.shareCopy.textContent = '복사했습니다';
  } catch {
    el.shareLink.select();
    el.shareCopy.textContent = '선택했습니다. ⌘C로 복사하세요';
  }
  setTimeout(() => (el.shareCopy.textContent = '링크 복사'), 2500);
});
el.shareNative.addEventListener('click', () => {
  void navigator.share?.({ title: editor.show.title ?? '밤하늘 연출실', url: el.shareLink.value }).catch(() => {});
});

// ── 키보드 ──
const typing = (t: EventTarget | null) =>
  t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement;

document.addEventListener('keydown', (e) => {
  if (typing(e.target) || document.querySelector('dialog[open]')) return;
  if (document.body.classList.contains('watching')) {
    if (e.code === 'Space') {
      e.preventDefault();
      togglePlay();
    } else if (e.key === 'Escape') {
      stopWatching();
    }
    return;
  }
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
  el.title.value = show.title ?? '';
  rememberLastShow(id);
  stage.load(show);
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
let lastClock = '';
let lastHud = 0;

function frame(now: number): void {
  let t = transport.time;
  const end = duration();
  if (transport.playing && t >= end) {
    togglePlay();
    transport.seek(end);
    t = end;
  }
  stage.render(t, transport.playing);
  transport.schedule(stage.sim.launches, fanCount);
  if (transport.playing) timeline.follow(t);
  timeline.draw();

  const { offset, length } = editor.beat;
  const beatNo = Math.floor((t - offset) / length + 1e-6);
  const clock = `${fmtTime(t)} · ${beatNo >= 0 ? `${Math.floor(beatNo / 4) + 1}마디 ${(beatNo % 4) + 1}박` : '시작 전'}`;
  if (clock !== lastClock) el.clock.value = lastClock = clock;

  if (now - lastHud >= 500) {
    el.fps.textContent = stage.fps.toFixed(0);
    el.particles.textContent = stage.count.toLocaleString('ko-KR');
    lastHud = now;
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

requestAnimationFrame(frame);
void boot();
