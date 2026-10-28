// 편집기 화면을 조립한다: 무대(불꽃), 시간표, 설정 칸, 음악과 재생, 자동 저장.

import './style.css';
import {
  SKIES,
  SKY_IDS,
  VENUES,
  venueOf,
  analyzeMusic,
  audienceCues,
  detectTempo,
  flatMusicMap,
  type MusicMap,
  launcherKindFor,
  tapTempo,
  type Cue,
  type Launch,
  type Show,
} from '@nss/engine';
import { Career } from './career.ts';
import { demoShow } from './demo-show.ts';
import { Editor, moveToMapVenue, moveToVenue, newShow, round3, withDefaultLaunchers, type Snap } from './editor.ts';
import { fmtDate, fmtTime } from './format.ts';
import { importMusicFile, iphoneMusicHint, loadMusic, monoForTempo, musicErrorMessage, useDeviceFontForFrames } from './media.ts';
import { Drawer } from './drawer.ts';
import { Office } from './office.ts';
import { Workshop } from './workshop.ts';
import { SitePlanner } from './siteplan.ts';
import { AccountPanel } from './account.ts';
import { Gallery } from './gallery.ts';
import { ArtEditor } from './artedit.ts';
import { Guide } from './guide.ts';
import { Intro } from './intro.ts';
import { Coach } from './coach.ts';
import { Compare } from './compare.ts';
import { CrowdHud } from './crowd-hud.ts';
import { remoteEnabled } from './remote.ts';
import { Panel } from './panel.ts';
import { registerPwa } from './pwa.ts';
import { STEPS, progress, type Goal } from './progress.ts';
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
import { BASIC_TRACKS, loadBasicTrack, trackRef } from './tracks.ts';
import { Transport, waveformPeaks } from './transport.ts';
import { $, el, say } from './ui.ts';
import { wireAuto } from './auto-ui.ts';
import { wireCapture } from './capture-ui.ts';
import { wireShare } from './share-ui.ts';

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

// ── 서버판: 계정과 클라우드 (서버가 있을 때만) ──
if (remoteEnabled()) {
  const account = new AccountPanel($<HTMLDialogElement>('account-dialog'), editor, drawer, { openShow: (id, show) => openShow(id, show), say });
  el.accountBtn.hidden = false;
  el.accountBtn.addEventListener('click', () => {
    if (transport.playing) togglePlay();
    account.open();
  });
  const gallery = new Gallery($<HTMLDialogElement>('gallery-dialog'), editor, drawer, {
    openShow: (id, show) => openShow(id, show),
    say,
    login: () => account.open(),
  });
  const galleryBtn = $<HTMLButtonElement>('gallery-btn');
  galleryBtn.hidden = false;
  galleryBtn.addEventListener('click', () => {
    if (transport.playing) togglePlay();
    gallery.open();
  });
}

// ── 여러 관람석에서 나란히 보기 ──
const compare = new Compare($<HTMLDialogElement>('compare-dialog'), {
  show: () => editor.show,
  time: () => transport.time,
  playing: () => transport.playing,
  togglePlay: () => togglePlay(),
  seek: (t) => transport.seek(t),
});
$<HTMLButtonElement>('compare-btn').addEventListener('click', () => compare.show());

// ── 처음 쓰는 사람 안내와 용어 사전 ──
const guide = new Guide($<HTMLDialogElement>('guide-dialog'), $<HTMLDialogElement>('glossary-dialog'));
const helpDialog = $<HTMLDialogElement>('help-dialog');
$<HTMLButtonElement>('help-btn').addEventListener('click', () => helpDialog.showModal());
$<HTMLButtonElement>('help-guide').addEventListener('click', () => {
  helpDialog.close();
  guide.open();
});
$<HTMLButtonElement>('help-glossary').addEventListener('click', () => {
  helpDialog.close();
  guide.openGlossary();
});

// ── 하나씩 열기: 지금 할 일과 열린 기능 ──
const goalBtn = $<HTMLButtonElement>('goal-btn');
/** 「다음:」 버튼을 누르면 그 할 일을 하는 버튼을 대신 누른다 */
const GOAL_TARGET: Record<Goal, () => void> = {
  auto: () => el.autoBtn.click(),
  watch: () => el.watch.click(),
  'shell-saved': () => el.workshopBtn.click(),
  delivered: () => el.officeBtn.click(),
  'build-saved': () => {
    el.workshopBtn.click();
    el.workshopDialog.querySelector<HTMLButtonElement>('[data-mode="build"]')?.click();
  },
};
function renderProgress(): void {
  progress.apply();
  const next = progress.next;
  goalBtn.hidden = !next;
  goalBtn.textContent = next ? `다음: ${next.todo}` : '';
  $('help-progress').textContent = next
    ? `${progress.level} / ${STEPS.length}걸음. 할 일을 해낼 때마다 기능이 하나씩 열립니다. 지금 할 일: ${next.todo}`
    : '모든 기능이 열려 있습니다.';
}
goalBtn.addEventListener('click', () => {
  const next = progress.next;
  if (next) GOAL_TARGET[next.goal]();
});
progress.onOpen = (message) => say(message, 9000);

// ── 간단 화면과 편집 화면: 처음에는 무대만 크게, 「편집하기」로 시간표와 설정 칸을 편다 ──
const LAYOUT = 'nss:layout';
const editBtn = $<HTMLButtonElement>('edit-btn');
function setEditing(on: boolean): void {
  document.body.classList.toggle('simple', !on);
  editBtn.textContent = on ? '간단히' : '편집하기';
  editBtn.setAttribute('aria-pressed', String(on));
  try {
    localStorage.setItem(LAYOUT, on ? 'edit' : 'simple');
  } catch {
    // 저장하지 못하면 다음에 처음 화면으로 연다.
  }
}
// 처음 「편집하기」를 누르면 편집 화면을 둘러보고 첫 불꽃을 직접 놓아 보게 한다.
const coach = new Coach(() => editor.show.cues.length, (m) => say(m, 7000));
editor.on((c) => c === 'show' && coach.showChanged());
editBtn.addEventListener('click', () => {
  const open = document.body.classList.contains('simple');
  setEditing(open);
  if (open && Coach.isNew()) setTimeout(() => coach.start(), 250);
});
$<HTMLButtonElement>('help-coach').addEventListener('click', () => {
  helpDialog.close();
  setEditing(true);
  setTimeout(() => coach.start(), 250);
});
{
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(LAYOUT);
  } catch {
    // 아래 기본값을 쓴다.
  }
  // 처음 쓰는 사람은 간단 화면, 모든 기능을 연 사람은 편집 화면으로 시작한다.
  setEditing(saved ? saved === 'edit' : !progress.next);
}
// 의뢰를 받으면 예산·조건 막대가 시간표 위에 있으니 편집 화면을 편다.
let commissionSeen = editor.show.commission?.id;
editor.on((c) => {
  if (c !== 'show') return;
  const id = editor.show.commission?.id;
  if (id && id !== commissionSeen) setEditing(true);
  commissionSeen = id;
});
progress.on(renderProgress);
renderProgress();
$<HTMLButtonElement>('help-open-all').addEventListener('click', () => {
  progress.openAll();
  say('모든 기능을 열었습니다.');
});
$<HTMLButtonElement>('help-restart').addEventListener('click', () => {
  progress.restart();
  say(`처음 단계로 돌아갔습니다. 다음 할 일: ${progress.next?.todo}`);
});
// 첫 방문: 예시 쇼부터 보여 주고 자동 연출로 잇는다 (boot에서 연다).
const intro = new Intro($('intro'), $('intro-end'), $('arrive'), {
  edit: () => setEditing(true),
  watch: () => {
    // 예시 쇼는 연출 카메라로 보여 준다.
    el.seat.value = 'director';
    el.seat.dispatchEvent(new Event('change'));
    startWatching(false);
  },
  auto: () => el.autoBtn.click(),
  guide: () => guide.open(),
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
const panel = new Panel(el.panel, editor, office.isLocked, () => drawer.list());
const artEditor = new ArtEditor($<HTMLDialogElement>('art-dialog'));
panel.editArt = (art) => {
  if (transport.playing) togglePlay();
  return artEditor.edit(art);
};
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
const meterSel = $<HTMLSelectElement>('meter');
meterSel.addEventListener('change', () => {
  editor.change((d) => {
    if (!d.music) return;
    if (meterSel.value === '3') d.music.beatsPerBar = 3;
    else delete d.music.beatsPerBar;
  });
});
function syncTempoInputs(): void {
  const m = editor.show.music;
  if (document.activeElement !== el.bpm) el.bpm.value = m ? String(m.bpm) : '120';
  if (document.activeElement !== el.offset) el.offset.value = m ? m.offset.toFixed(2) : '0.00';
  meterSel.value = String(m?.beatsPerBar ?? 4);
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
    editor.change((d) => (d.music = trackRef(basic, buf.duration)));
  } else {
    const rec = await getMusic(v);
    if (!rec) return;
    editor.change((d) => (d.music = { id: rec.id, title: rec.name, bpm: rec.bpm, offset: rec.offset, duration: rec.duration, ...(rec.beatsPerBar === 3 ? { beatsPerBar: 3 as const } : {}) }));
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
  // 기본 곡은 빠르기·첫 박·박자표를 알고 있다.
  const basic = BASIC_TRACKS.find((t) => t.id === editor.show.music?.id);
  const found = basic ? trackRef(basic) : null;
  const { samples, rate } = monoForTempo(musicBuffer);
  const tempo = found ? { bpm: found.bpm, offset: found.offset, beatsPerBar: found.beatsPerBar ?? 4 } : detectTempo(samples, rate);
  editor.change((d) => {
    if (!d.music) return;
    Object.assign(d.music, { bpm: tempo.bpm, offset: round3(tempo.offset) });
    if (tempo.beatsPerBar === 3) d.music.beatsPerBar = 3;
    else delete d.music.beatsPerBar;
  });
  say(`${tempo.bpm} BPM, ${tempo.beatsPerBar}/4 박자, 첫 박 ${tempo.offset.toFixed(2)}초로 맞췄습니다.${basic ? ' (기본 곡이라 정확한 값)' : ' 틀리면 BPM·박자표를 직접 고치거나 「박자 두드리기」를 써 보세요.'}`, 7000);
});

// 박자 두드리기: 재생 중에 박마다 누른다. 두드리는 동안은 버튼에 예상 BPM만 보이고,
// 손을 멈추면(1.5초) 한 번에 적용한다 (시간표 눈금이 두드리는 내내 흔들리지 않게).
let taps: number[] = [];
let tapIdle = 0;
let tapLabel = 0;
function tap(e?: Event): void {
  if (!editor.show.music) return say('음악을 먼저 골라 주세요.');
  if (!transport.playing) return say('재생을 시작한 뒤 박자에 맞춰 눌러 주세요.');
  // 누른 순간의 시각: 이벤트가 처리되기까지 걸린 만큼 앞당긴다.
  const lag = e ? Math.max(0, Math.min(0.1, (performance.now() - e.timeStamp) / 1000)) : 0;
  const now = transport.time - lag;
  if (taps.length && now - taps[taps.length - 1] > 2) taps = [];
  taps.push(now);
  const r = tapTempo(taps);
  clearTimeout(tapLabel);
  el.tap.textContent = r ? `${r.bpm} BPM · ${taps.length}번` : `${taps.length}번째… (4번 이상)`;
  clearTimeout(tapIdle);
  tapIdle = window.setTimeout(applyTaps, 1500);
}
function applyTaps(): void {
  const r = tapTempo(taps);
  taps = [];
  if (!r) {
    el.tap.textContent = '박자 두드리기';
    return say('4번 이상 박에 맞춰 두드려 주세요.');
  }
  editor.change((d) => d.music && Object.assign(d.music, { bpm: r.bpm, offset: round3(r.offset) }));
  el.tap.textContent = `✓ ${r.bpm} BPM`;
  tapLabel = window.setTimeout(() => (el.tap.textContent = '박자 두드리기'), 4000);
  say(
    `${r.bpm} BPM, 첫 박 ${r.offset.toFixed(2)}초로 맞췄습니다.${r.used < 8 ? ' 8번 이상 두드리면 더 정확해요.' : ''} 재생하면 「박자 두드리기」가 박마다 깜빡이니 맞는지 보세요. 틀리면 「되돌리기」.`,
    7000,
  );
}
// 버튼은 누르는 순간에 센다 (떼는 순간은 늦다). 키보드로 누른 것은 click으로.
el.tap.addEventListener('pointerdown', (e) => tap(e));
el.tap.addEventListener('click', (e) => e.detail === 0 && tap(e));

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
el.venue.add(new Option('지도에서 고르기…', '__map'));

/** 무대에 맞게 관람석 목록을 다시 채운다. */
function syncVenueInputs(): void {
  const venue = venueOf(editor.show) ?? VENUES['river-bridge-city'];
  // 지도 무대는 고른 장소 이름으로 한 줄
  let mapOpt = el.venue.querySelector<HTMLOptionElement>('option[value="map"]');
  if (venue.id === 'map') {
    if (!mapOpt) el.venue.add((mapOpt = new Option('', 'map')), el.venue.querySelector('option[value="__map"]'));
    mapOpt.textContent = `${venue.label} (지도)`;
  } else mapOpt?.remove();
  el.venue.value = venue.id;
  if (el.seat.dataset.venue === 'map') el.seat.dataset.venue = '';
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
// 소리 장치가 응답하지 않으면 화면은 벽시계로 계속 가고, 한 번 알린다.
transport.onAudioStall = () => say('소리 장치가 응답하지 않아 소리 없이 재생합니다. 스피커·이어폰 연결을 확인해 주세요.', 6000);
// 화질: 이 기기에만 기억한다 (쇼에는 넣지 않는다).
const qualitySel = $<HTMLSelectElement>('quality');
qualitySel.value = stage.qualityPref;
qualitySel.addEventListener('change', () => stage.setQuality(qualitySel.value as typeof stage.qualityPref));
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

let mapStage: import('./mapstage.ts').MapStage | null = null;
async function pickOnMap(): Promise<void> {
  try {
    if (!mapStage) {
      const { MapStage } = await import('./mapstage.ts');
      mapStage = new MapStage($<HTMLDialogElement>('map-dialog'));
    }
  } catch {
    say('지도를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.');
    syncVenueInputs();
    return;
  }
  const r = await mapStage.pick(editor.show);
  if (!r) {
    syncVenueInputs();
    return;
  }
  let dropped = 0;
  editor.change((d) => (dropped = moveToMapVenue(d, r.venue, r.launchers)));
  stage.setSeat('front-near');
  syncVenueInputs();
  say(`무대를 「${r.venue.name}」(지도)로 옮겼습니다. 건물 ${r.venue.buildings.length}채로 스카이라인을 만들었습니다.${dropped ? ` 다리·지상 틀이 없어 불꽃 ${dropped}개를 뺐습니다.` : ''}`);
}

el.venue.addEventListener('change', () => {
  const id = el.venue.value;
  if (id === '__map' || id === 'map') {
    void pickOnMap();
    return;
  }
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
function startWatching(countGoal = true): void {
  document.body.classList.add('watching');
  if (countGoal) progress.did('watch');
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
  intro.watched();
}

el.watch.addEventListener('click', () => startWatching());
el.watchExit.addEventListener('click', stopWatching);
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) stopWatching();
});

// ── 자동 연출 ──
function currentMusicMap(): MusicMap {
  const m = editor.show.music;
  const bpm = m?.bpm ?? 120;
  const offset = m?.offset ?? 0;
  const per = m?.beatsPerBar ?? 4;
  const key = `${m?.id}|${bpm}|${offset}|${per}|${musicBuffer ? 'buf' : 'none'}`;
  if (musicMapCache?.key === key) return musicMapCache.map;
  let map: MusicMap;
  if (musicBuffer) {
    const { samples, rate } = monoForTempo(musicBuffer);
    map = analyzeMusic(samples, rate, bpm, offset, per);
  } else {
    map = flatMusicMap(Math.max(30, m?.duration ?? 60), bpm, offset, per);
  }
  musicMapCache = { key, map };
  return map;
}

// ── 자동 연출·사진·영상·공유 (각자 파일) ──
wireAuto({ editor, drawer, office, career, transport, timeline, togglePlay: () => togglePlay(), musicMap: () => currentMusicMap() });
wireCapture({ editor, stage, transport, togglePlay: () => togglePlay(), duration: () => duration(), music: () => musicBuffer, fanCount: (l) => fanCount(l) });
wireShare({ editor });

// ── 키보드 ──
const typing = (t: EventTarget | null) =>
  t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement;
/** 버튼·링크에 초점이 있으면 Space·Enter는 그것을 누르는 키다 (재생 단축키로 가로채지 않는다). */
const pressable = (t: EventTarget | null) => t instanceof HTMLButtonElement || t instanceof HTMLAnchorElement || (t instanceof HTMLElement && t.getAttribute('role') === 'tab');

document.addEventListener('keydown', (e) => {
  if (typing(e.target) || document.querySelector('dialog[open]')) return;
  if ((e.code === 'Space' || e.key === 'Enter') && pressable(e.target)) return;
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
    tap(e);
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

// 재생 중 관객 반응 (관객 실루엣·열기 게이지·판정 글자)
const crowdHud = new CrowdHud(el.stageWrap);

// ── 매 프레임 ──
const fanCount = (l: Launch) => editor.show.cues[l.cueIndex]?.fan?.count ?? 1;
let lastClock = '';
let lastHud = 0;
let lastBeatNo = -1;

function frame(now: number): void {
  let t = transport.time;
  const end = duration();
  if (transport.playing && t >= end) {
    togglePlay();
    transport.seek(end);
    t = end;
    // 감상으로 끝까지 봤으면 감상 화면을 닫는다 (첫 방문이면 끝 화면이 뜬다).
    stopWatching();
  }
  // 나란히 보기 창이 열려 있으면 편집 무대는 쉬고, 그 창이 무대를 그린다.
  if (!compare.open) stage.render(t, transport.playing);
  crowdHud.update(stage, stage.sim.show, t, transport.playing && !compare.open);
  transport.schedule(stage.sim.launches, fanCount);
  if (transport.playing) timeline.follow(t);
  timeline.draw();

  const { offset, length, perBar } = editor.beat;
  const beatNo = Math.floor((t - offset) / length + 1e-6);
  const clock = `${fmtTime(t)} · ${beatNo >= 0 ? `${Math.floor(beatNo / perBar) + 1}마디 ${(beatNo % perBar) + 1}박` : '시작 전'}`;
  if (clock !== lastClock) el.clock.value = lastClock = clock;
  // 박마다 「박자 두드리기」를 깜빡여 박자가 음악과 맞는지 눈으로 본다 (마디 첫 박은 더 밝게).
  if (transport.playing && beatNo >= 0 && beatNo !== lastBeatNo) {
    el.tap.classList.remove('beat', 'bar');
    void el.tap.offsetWidth;
    el.tap.classList.add('beat');
    if (beatNo % perBar === 0) el.tap.classList.add('bar');
  }
  lastBeatNo = beatNo;

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
  // 상영관에서 받은 쇼를 가져왔으면 그에 맞는 안내를, 처음 연 브라우저면 예시 쇼부터 보여 준다.
  const arrival = Intro.takeArrival();
  if (arrival) intro.arrived(arrival);
  else if (Intro.isNew() && !document.querySelector('dialog[open]')) {
    if (!rec) intro.open();
    else guide.openIfNew();
  }
}

requestAnimationFrame(frame);
void boot();
registerPwa();
