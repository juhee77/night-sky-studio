// 상영관: 공유 링크(#s=...)로 받은 쇼를 본다. 편집 기능은 없고, 원하면 내 쇼로 가져가 고칠 수 있다.

import './viewer.css';
import { audienceCues, decodeShow, venueOf, type Launch, type Show } from '@nss/engine';
import { openLink, remoteEnabled } from './remote.ts';
import { fmtTime } from './format.ts';
import { importMusicFile, iphoneMusicHint, loadMusic, musicErrorMessage, useDeviceFontForFrames } from './media.ts';
import { runCountdown } from './countdown.ts';
import { CAMERA_SEATS, Stage } from './stage.ts';
import { newId, putShow, rememberLastShow } from './storage.ts';
import { Transport } from './transport.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const el = {
  stage: $<HTMLCanvasElement>('stage'),
  card: $<HTMLElement>('card'),
  title: $<HTMLHeadingElement>('show-title'),
  by: $<HTMLParagraphElement>('show-by'),
  endBy: $<HTMLParagraphElement>('end-by'),
  sameSong: $<HTMLButtonElement>('same-song'),
  corner: $<HTMLAnchorElement>('corner-make'),
  meta: $<HTMLParagraphElement>('show-meta'),
  musicAsk: $<HTMLDivElement>('music-ask'),
  musicAskText: $<HTMLParagraphElement>('music-ask-text'),
  pickMusic: $<HTMLLabelElement>('pick-music'),
  noMusic: $<HTMLButtonElement>('no-music'),
  musicFile: $<HTMLInputElement>('music-file'),
  musicNote: $<HTMLParagraphElement>('music-note'),
  start: $<HTMLButtonElement>('start'),
  endCard: $<HTMLElement>('end-card'),
  again: $<HTMLButtonElement>('again'),
  importEnd: $<HTMLButtonElement>('import-end'),
  bar: $<HTMLFormElement>('bar'),
  play: $<HTMLButtonElement>('play'),
  scrub: $<HTMLInputElement>('scrub'),
  clock: $<HTMLOutputElement>('clock'),
  seat: $<HTMLSelectElement>('seat'),
  sound: $<HTMLButtonElement>('sound'),
  fullscreen: $<HTMLButtonElement>('fullscreen'),
  importBtn: $<HTMLButtonElement>('import'),
  toast: $<HTMLParagraphElement>('toast'),
};

const editorUrl = import.meta.env.BASE_URL;
el.corner.href = editorUrl;
/** 편집기에 「받은 쇼를 가져왔다」고 알린다 (편집기가 맞는 안내를 띄운다) */
const ARRIVED = 'nss:arrived';

let toastTimer = 0;
function say(message: string, ms = 5000): void {
  el.toast.textContent = message;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.toast.hidden = true), ms);
}

function fail(message: string): void {
  el.title.textContent = message;
  el.meta.innerHTML = '';
  const a = document.createElement('a');
  a.href = editorUrl;
  a.className = 'link';
  a.textContent = '밤하늘 연출실로 가서 직접 만들어 보기';
  el.meta.append(a);
  el.start.hidden = true;
}

useDeviceFontForFrames();
const transport = new Transport();
let stage: Stage | null = null;
let show: Show | null = null;
let duration = 0;
let started = false;

async function boot(): Promise<void> {
  const params = new URLSearchParams(location.hash.slice(1));
  const short = params.get('l');
  try {
    // 짧은 링크(#l=)는 서버에서 쇼를 받아 온다.
    const code = short && remoteEnabled() ? await openLink(short) : params.get('s');
    if (!code) return fail(short ? '이 짧은 링크는 서버판에서만 열 수 있습니다.' : '링크에 쇼가 들어 있지 않습니다.');
    show = await decodeShow(code);
  } catch (err) {
    return fail(`${(err as Error).message} 보낸 사람에게 링크를 다시 받아 주세요.`);
  }
  document.title = `${show.title || '불꽃쇼'} · 밤하늘 연출실`;
  el.title.textContent = show.title || '제목 없는 불꽃쇼';
  const by = byline(show);
  for (const p of [el.by, el.endBy]) {
    p.hidden = !by;
    p.textContent = by;
  }

  try {
    stage = new Stage(el.stage, show);
  } catch (err) {
    return fail(`${(err as Error).message} 최신 Chrome, Safari, Firefox에서 열어 주세요.`);
  }
  stage.onDensityLowered = () => say('화면이 느려서 불꽃 밀도를 낮췄습니다.');
  duration = Math.max(stage.sim.duration, 5);

  const venue = venueOf(show);
  for (const [id, seat] of Object.entries(venue?.seats ?? {})) el.seat.add(new Option(seat.label, id));
  for (const s of CAMERA_SEATS) el.seat.add(new Option(s.label, s.id));
  stage.attachControls(() => {});
  // 보낸 사람이 위에서 보기로 편집했더라도, 받는 사람은 관람석에서 보게 한다.
  if (stage.seat.plan) stage.setSeat('front-near');
  el.seat.value = stage.seatId;

  const m = show.music;
  duration = Math.max(duration, m?.duration ?? 0);
  el.meta.textContent = `${fmtTime(duration).replace(/\.\d+$/, '')} · 불꽃 ${show.cues.length}개${m ? ` · 음악 「${m.title}」` : ''}`;

  if (!m) return ready();
  const buf = await loadMusic(m);
  if (buf) {
    transport.setMusic(buf);
    duration = Math.max(duration, buf.duration);
    return ready();
  }
  // 받는 사람 기기에 없는 음악 파일: 같은 파일을 골라 달라고 한다.
  el.musicAsk.hidden = false;
  el.musicAskText.textContent = `이 쇼는 「${m.title}」(${fmtTime(m.duration).replace(/\.\d+$/, '')})에 맞춰 만들었습니다. 같은 음악 파일이 있으면 골라 주세요.`;
}

/** 「OO님이 만든 쇼 · 원작 「…」(OO님)」 */
function byline(s: Show): string {
  const parts: string[] = [];
  if (s.author) parts.push(`${s.author}님이 만든 쇼`);
  if (s.remixOf) parts.push(`원작 「${s.remixOf.title}」${s.remixOf.author ? `(${s.remixOf.author}님)` : ''}`);
  return parts.join(' · ');
}

function ready(): void {
  el.start.disabled = false;
  el.start.focus();
}

el.pickMusic.addEventListener('click', iphoneMusicHint);
el.musicFile.addEventListener('change', async () => {
  const file = el.musicFile.files?.[0];
  el.musicFile.value = '';
  if (!file || !show?.music) return;
  try {
    const { ref, buffer } = await importMusicFile(file);
    transport.setMusic(buffer);
    duration = Math.max(duration, buffer.duration);
    const want = show.music.duration;
    const same = ref.id === show.music.id || Math.abs(buffer.duration - want) < 1.5;
    el.musicNote.hidden = false;
    el.musicNote.className = same ? 'note' : 'note warn';
    el.musicNote.textContent = same
      ? `「${ref.title}」을 골랐습니다.`
      : `고른 파일은 ${fmtTime(buffer.duration).replace(/\.\d+$/, '')}로, 원래 곡(${fmtTime(want).replace(/\.\d+$/, '')})과 길이가 다릅니다. 다른 곡이면 박자가 맞지 않을 수 있어요.`;
    el.musicAsk.hidden = true;
    ready();
  } catch (err) {
    say(musicErrorMessage(err));
  }
});
el.noMusic.addEventListener('click', () => {
  el.musicAsk.hidden = true;
  el.musicNote.hidden = false;
  el.musicNote.textContent = '음악 없이 불꽃 소리만 들립니다.';
  ready();
});

function setPlaying(on: boolean): void {
  if (on && !transport.playing) {
    if (transport.time >= duration - 0.05) transport.seek(0);
    transport.play();
  } else if (!on && transport.playing) {
    transport.pause();
  }
  el.play.textContent = transport.playing ? '❚❚' : '▶';
  el.play.setAttribute('aria-label', transport.playing ? '일시정지' : '재생');
}

el.start.addEventListener('click', () => {
  if (!stage) return;
  started = true;
  el.card.hidden = true;
  el.bar.hidden = false;
  el.corner.hidden = false;
  el.scrub.max = duration.toFixed(2);
  transport.delayFor = stage.soundDelay;
  transport.crowd = audienceCues(stage.sim.launches);
  transport.seek(0);
  if (show?.countdown) runCountdown(transport, () => setPlaying(true));
  else setPlaying(true);
  poke();
});

el.play.addEventListener('click', () => setPlaying(!transport.playing));
el.scrub.addEventListener('input', () => transport.seek(Number(el.scrub.value)));
el.seat.addEventListener('change', () => stage?.setSeat(el.seat.value));
el.sound.addEventListener('click', () => {
  transport.soundOn = !transport.soundOn;
  el.sound.setAttribute('aria-pressed', String(transport.soundOn));
  el.sound.textContent = transport.soundOn ? '소리 켜짐' : '소리 꺼짐';
});
el.fullscreen.addEventListener('click', () => {
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  else void document.documentElement.requestFullscreen?.().catch(() => say('이 브라우저에서는 전체 화면을 쓸 수 없습니다.'));
});
el.again.addEventListener('click', () => {
  el.endCard.hidden = true;
  transport.seek(0);
  setPlaying(true);
});

/** 받은 쇼를 내 쇼로: 고쳐 만들기(원작을 기록한다) 또는 같은 곡·같은 무대로 빈 쇼 */
async function importShow(mode: 'remix' | 'fresh'): Promise<void> {
  if (!show) return;
  const id = newId();
  let mine: Show;
  if (mode === 'remix') {
    mine = { ...show, title: show.title ? `${show.title} (받은 쇼)` : '받은 쇼', remixOf: { title: show.title || '제목 없는 쇼', ...(show.author ? { author: show.author } : {}) } };
    // 고친 쇼를 다시 보낼 때는 보내는 사람이 만든 사람이 된다.
    delete mine.author;
  } else {
    mine = {
      version: 1,
      title: show.music ? `「${show.music.title}」으로 만든 쇼` : '새 불꽃쇼',
      seed: Math.floor(Math.random() * 1e9),
      ...(show.music ? { music: show.music } : {}),
      venue: show.venue,
      ...(show.seat ? { seat: show.seat } : {}),
      launchers: show.launchers,
      cues: [],
    };
  }
  await putShow({ id, updatedAt: Date.now(), show: mine });
  rememberLastShow(id);
  try {
    localStorage.setItem(ARRIVED, mode);
  } catch {
    // 안내 없이 편집기로 간다.
  }
  location.href = editorUrl;
}
el.importBtn.addEventListener('click', () => void importShow('remix'));
el.importEnd.addEventListener('click', () => void importShow('remix'));
el.sameSong.addEventListener('click', () => void importShow('fresh'));

// 조작 막대는 재생 중 3초 동안 손대지 않으면 숨긴다.
let idleTimer = 0;
function poke(): void {
  el.bar.classList.remove('idle');
  el.corner.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => {
    if (!transport.playing) return;
    el.bar.classList.add('idle');
    el.corner.classList.add('idle');
  }, 3000);
}
for (const ev of ['pointermove', 'pointerdown', 'keydown'] as const) document.addEventListener(ev, poke);

document.addEventListener('keydown', (e) => {
  if (!started || e.target instanceof HTMLSelectElement) return;
  if (e.code === 'Space') {
    e.preventDefault();
    setPlaying(!transport.playing);
  }
});

const fanCount = (l: Launch) => show?.cues[l.cueIndex]?.fan?.count ?? 1;
let lastClock = '';

function frame(): void {
  if (stage) {
    let t = transport.time;
    if (transport.playing && t >= duration) {
      setPlaying(false);
      transport.seek(duration);
      t = duration;
      el.endCard.hidden = false;
      el.bar.classList.remove('idle');
      el.corner.classList.remove('idle');
    }
    stage.render(t, transport.playing);
    transport.schedule(stage.sim.launches, fanCount);
    if (started) {
      if (document.activeElement !== el.scrub) el.scrub.value = t.toFixed(2);
      const clock = `${fmtTime(t).replace(/\.\d+$/, '')} / ${fmtTime(duration).replace(/\.\d+$/, '')}`;
      if (clock !== lastClock) el.clock.value = lastClock = clock;
    }
  }
  requestAnimationFrame(frame);
}

// 다른 쇼 링크로 바뀌면 처음부터 다시 연다.
window.addEventListener('hashchange', () => location.reload());

requestAnimationFrame(frame);
void boot();
