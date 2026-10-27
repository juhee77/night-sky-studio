// 로컬 서버판 시험 데이터: 시험 계정 둘, 상영관 예시 쇼·내 불꽃, 이번 주 도전 글.
// 여러 번 돌려도 같은 것을 두 번 올리지 않는다. 로컬에서만 쓰는 시험 계정이다.
//   node scripts/seed-local.mjs [서버 주소]

import {
  autoChoreograph,
  commissionAutoOptions,
  encodeShow,
  flatMusicMap,
  isoWeekKey,
  newCustomShell,
  weeklyChallenge,
} from '@nss/engine';
import { demoShow } from '../apps/web/src/demo-show.ts';
import { BASIC_TRACKS, trackRef } from '../apps/web/src/tracks.ts';

const API = (process.argv[2] ?? process.env.API_URL ?? 'http://127.0.0.1:8080').replace(/\/$/, '');

/** README에도 적어 둔 로컬 시험 계정 */
export const TEST_ACCOUNTS = [
  { name: '별빛연출가', password: 'night-sky-local-1' },
  { name: '불꽃장인', password: 'night-sky-local-2' },
];

async function call(method, path, body, token) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw Object.assign(new Error(data?.message ?? `${res.status}`), { status: res.status });
  return data;
}

/** 로그인해 보고, 없는 계정이면 만든다 */
async function account({ name, password }) {
  try {
    return (await call('POST', '/api/auth/login', { name, password })).token;
  } catch {
    return (await call('POST', '/api/auth/signup', { name, password })).token;
  }
}

/** 기본 곡에 자동 연출로 만든 쇼 (의뢰가 있으면 그 조건대로) */
function autoShow(title, trackId, seed, commission) {
  const music = trackRef(BASIC_TRACKS.find((t) => t.id === trackId));
  const show = { ...structuredClone(demoShow), title, seed, music, cues: [] };
  delete show.commission;
  const rules = commission ? commissionAutoOptions(commission, show, [], []).options : {};
  show.cues = autoChoreograph(flatMusicMap(music.duration, music.bpm, 0, music.beatsPerBar ?? 4), show.launchers, {
    seed, style: 'grand', mood: commission ? undefined : 'festive', density: 0.8, effects: true, ...rules,
  });
  return show;
}

async function main() {
  const [a, b] = [await account(TEST_ACCOUNTS[0]), await account(TEST_ACCOUNTS[1])];
  const week = isoWeekKey(new Date());
  const challenge = weeklyChallenge(week);

  const kamuro = newCustomShell('seed-kamuro', '금빛 긴 버들');
  kamuro.layers[0].star = 'kamuro';
  kamuro.layers[0].color = 'gold';
  const pop = newCustomShell('seed-pop', '차례로 톡톡');
  pop.layers[0].color = 'cyan';
  pop.layers[0].sequence = { order: 'down', span: 1.2, mode: 'pop' };

  const posts = [
    { who: a, kind: 'show', title: '예시 쇼: 밤하늘 행진', data: await encodeShow(demoShow) },
    { who: b, kind: 'show', title: '강물 위 축제', data: await encodeShow(autoShow('강물 위 축제', 'basic-3', 7)) },
    { who: a, kind: 'show', title: '별빛 왈츠 한 곡', data: await encodeShow(autoShow('별빛 왈츠 한 곡', 'basic-4', 11)) },
    { who: a, kind: 'shell', title: kamuro.name, data: JSON.stringify(kamuro) },
    { who: b, kind: 'shell', title: pop.name, data: JSON.stringify(pop) },
    { who: a, kind: 'show', title: `${week} 도전: 첫 번째`, data: await encodeShow(autoShow(`${week} 도전: 첫 번째`, challenge.music, 3, challenge)), challenge: week },
    { who: b, kind: 'show', title: `${week} 도전: 두 번째`, data: await encodeShow(autoShow(`${week} 도전: 두 번째`, challenge.music, 5, challenge)), challenge: week },
  ];

  let added = 0;
  const ids = {};
  for (const p of posts) {
    // 같은 계정이 같은 제목으로 올린 것이 있으면 다시 올리지 않는다.
    const list = await call('GET', `/api/gallery?kind=${p.kind}&sort=new`, null, p.who);
    const mine = list.find((x) => x.mine && x.title === p.title);
    if (mine) {
      ids[p.title] = mine.id;
      continue;
    }
    const { id } = await call('POST', '/api/gallery', { kind: p.kind, title: p.title, data: p.data, ...(p.challenge ? { challenge: p.challenge } : {}) }, p.who);
    ids[p.title] = id;
    added++;
  }
  // 서로 좋아요 하나씩 (도전 순위가 갈리게) — 이미 눌렀으면 그대로 둔다.
  for (const [title, who] of [[`${week} 도전: 두 번째`, a], ['강물 위 축제', a], ['예시 쇼: 밤하늘 행진', b]]) {
    const item = (await call('GET', `/api/gallery/${ids[title]}`, null, who)).item;
    if (!item.liked) await call('POST', `/api/gallery/${ids[title]}/like`, null, who);
  }
  console.log(`시험 데이터: 새로 올린 것 ${added}개 (전체 ${posts.length}개), 이번 주 도전 ${week}`);
}

main().catch((err) => {
  console.error(`시험 데이터를 넣지 못했습니다: ${err.message}`);
  process.exit(1);
});
