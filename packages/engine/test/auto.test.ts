import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeMusic, autoChoreograph, flatMusicMap } from '../src/auto.ts';
import { commissionAutoOptions } from '../src/autorules.ts';
import { defaultBuild, buildToShell } from '../src/build.ts';
import type { FireworkType } from '../src/catalog.ts';
import { STARTER_TYPES, UNLOCK_PRICES, generateCommissions, showCost, weeklyChallenge } from '../src/commission.ts';
import { newCustomShell } from '../src/custom.ts';
import { applyLive } from '../src/live.ts';
import { rigForShow } from '../src/loading.ts';
import { allTubes } from '../src/rig.ts';
import { scoreShow } from '../src/score.ts';
import { fixFaults } from '../src/wiring.ts';
import { expandShow, type Launcher, type Show } from '../src/show.ts';

const RATE = 11025;
const launchers: Launcher[] = [
  { id: 'barge-1', kind: 'barge', pos: [-220, 0, 0] },
  { id: 'barge-2', kind: 'barge', pos: [0, 0, -80] },
  { id: 'barge-3', kind: 'barge', pos: [220, 0, 60] },
  { id: 'bridge', kind: 'bridge', pos: [0, 18, 258], from: [-500, 18, 258], to: [500, 18, 258] },
  { id: 'ground', kind: 'frame', pos: [0, 0, -330] },
];

/** 앞 절반은 조용하고 뒤 절반은 큰 112 BPM 북소리 */
function quietThenLoud(seconds: number): Float32Array {
  const out = new Float32Array(RATE * seconds);
  const beat = 60 / 112;
  for (let t = 0; t < seconds; t += beat) {
    const amp = t < seconds / 2 ? 0.15 : 0.9;
    const s = Math.floor(t * RATE);
    for (let i = 0; i < RATE * 0.12 && s + i < out.length; i++) out[s + i] += Math.sin((2 * Math.PI * 70 * i) / RATE) * Math.exp(-i / (RATE * 0.04)) * amp;
  }
  return out;
}

const showOf = (cues: Show['cues']): Show => ({
  version: 1, seed: 1, music: { id: 'x', title: 'x', bpm: 112, offset: 0, duration: 60 },
  venue: { preset: 'river-bridge-city' }, launchers, cues,
});

test('곡이 커지는 곳에 불꽃이 더 촘촘하고, 불꽃은 박에 붙는다', () => {
  const map = analyzeMusic(quietThenLoud(60), RATE, 112, 0);
  const cues = autoChoreograph(map, launchers, { seed: 3, style: 'grand', density: 0.8 });
  const firstHalf = cues.filter((c) => c.t < 25).length;
  const secondHalf = cues.filter((c) => c.t >= 30 && c.t < 50).length;
  assert.ok(secondHalf > firstHalf, `앞 ${firstHalf}, 뒤 ${secondHalf}`);
  const beat = 60 / 112;
  const off = cues.filter((c) => {
    const k = c.t / beat;
    return Math.abs(k * 2 - Math.round(k * 2)) > 0.01; // 반 박 단위까지 허용
  });
  assert.equal(off.length, 0);
  const { warnings } = expandShow(showOf(cues));
  assert.equal(warnings.length, 0, warnings[0]?.message);
});

test('같은 시드면 같은 쇼, 다른 시드면 다른 쇼', () => {
  const map = flatMusicMap(60, 112);
  const a = autoChoreograph(map, launchers, { seed: 1, style: 'grand', density: 0.7 });
  const b = autoChoreograph(map, launchers, { seed: 1, style: 'grand', density: 0.7 });
  const c = autoChoreograph(map, launchers, { seed: 2, style: 'grand', density: 0.7 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test('의뢰 조건을 따른다: 해금한 종류, 크기 제한, 색, 꼭 넣을 것, 예산', () => {
  const map = flatMusicMap(60, 84);
  const allowed = ['chrysanthemum', 'peony', 'willow', 'ring', 'heart'] as const;
  const cues = autoChoreograph(map, launchers, {
    seed: 5, style: 'calm', density: 1, allowed: [...allowed], maxSize: 5,
    colors: ['pink', 'white', 'gold'], include: ['heart'], endColors: { seconds: 10, colors: ['gold'] }, budget: 100,
  });
  assert.ok(cues.length > 10);
  assert.ok(cues.every((c) => (allowed as readonly string[]).includes(c.type)), cues.map((c) => c.type).join());
  assert.ok(cues.every((c) => c.size <= 5));
  assert.ok(cues.every((c) => (c.colors ?? []).every((x) => ['pink', 'white', 'gold'].includes(x))));
  assert.ok(cues.some((c) => c.type === 'heart'));
  assert.ok(cues.filter((c) => c.t >= 50).every((c) => c.colors![0] === 'gold'));
  assert.ok(showCost(showOf(cues)) <= 100, `값 ${showCost(showOf(cues))}`);
});

test('모양 불꽃(하트·별·웃는 얼굴)은 방향을 정할 수 없어 세 발을 함께 쏜다', () => {
  const cues = autoChoreograph(flatMusicMap(60, 112), launchers, { seed: 3, style: 'calm', mood: 'romantic', density: 0.8 });
  const hearts = cues.filter((c) => c.type === 'heart');
  assert.ok(hearts.length > 0);
  assert.ok(hearts.every((c) => c.fan?.count === 3), hearts.map((c) => c.fan?.count).join());
});

test('다리와 지상 틀이 있으면 피날레 나이아가라와 글자를 넣는다', () => {
  const cues = autoChoreograph(flatMusicMap(60, 112), launchers, { seed: 9, style: 'grand', density: 0.8, text: '축하해' });
  assert.ok(cues.some((c) => c.type === 'niagara' && c.t > 45));
  assert.ok(cues.some((c) => c.type === 'lancework' && c.text === '축하해'));
  assert.ok(cues.filter((c) => c.t > 50).length > cues.filter((c) => c.t > 20 && c.t < 30).length);
});

test('틀 그림 조건: 주제에 맞는 본보기 그림을 지상 틀에 세운다', async () => {
  const { artFor } = await import('../src/autorules.ts');
  const { ART_PRESETS } = await import('../src/art.ts');
  assert.equal(artFor('별 모양 카페 로고'), '별');
  assert.equal(artFor('결혼 기념 하트'), '하트');
  const art = ART_PRESETS['별']();
  const cues = autoChoreograph(flatMusicMap(60, 112), launchers, { seed: 9, style: 'grand', density: 0.8, text: '축하해', art });
  const frames = cues.filter((c) => c.type === 'lancework');
  assert.ok(frames.some((c) => c.art?.cells === art.cells && !c.text));
  assert.ok(frames.some((c) => c.text === '축하해'));
  // 같은 틀에서 겹치지 않는다
  const [a, b] = frames.map((c) => c.t).sort((x, y) => x - y);
  assert.ok(b - a >= 10, `${a} ${b}`);
});

test('모든 의뢰와 이번 주 도전: 자동 연출로 만들면 사람이 할 일을 뺀 조건은 다 지킨다', () => {
  const kamuro = newCustomShell('kamuro', '긴 버들');
  kamuro.layers[0].star = 'kamuro';
  const pop = newCustomShell('pop', '차례로 톡톡');
  pop.layers[0].sequence = { order: 'random', span: 1.2, mode: 'pop' };
  const built = buildToShell(defaultBuild(5), newCustomShell('built', '공방 불꽃'));
  const shells = [kamuro, pop, built];
  const all = [...STARTER_TYPES, ...(Object.keys(UNLOCK_PRICES) as FireworkType[])];
  const commissions = [
    ...Array.from({ length: 30 }, (_, k) => generateCommissions(1000 + k, 100, 3)).flat(),
    ...Array.from({ length: 20 }, (_, k) => weeklyChallenge(`2026-W${String(k + 1).padStart(2, '0')}`)),
  ];
  const seen = new Set<string>();
  for (const c of commissions) {
    const key = `${c.title}|${JSON.stringify(c.rules)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const show: Show = {
      ...showOf([]),
      music: { id: c.music, title: c.music, bpm: 112, offset: 0, duration: 90 },
      venue: { preset: 'river-bridge-city', wind: c.wind },
      seat: { id: c.seat },
      commission: c,
      customShells: Object.fromEntries(shells.map((s) => [s.id, s])),
    };
    const { options, manual } = commissionAutoOptions(c, show, all, shells);
    show.cues = autoChoreograph(flatMusicMap(90, 112), launchers, { seed: 3, style: c.taste.style, density: 0.8, ...options });
    const r = scoreShow(show, c);
    const skip = new Set(manual.map((m) => m.rule.kind));
    const broken = r.rules.filter((x) => !x.ok && !skip.has(x.rule.kind));
    assert.deepEqual(broken.map((x) => `${x.label}: ${x.detail}`), [], c.title);
    assert.ok(r.cost <= c.budget * 1.1, `${c.title} 값 ${r.cost}/${c.budget}`);
  }
  assert.ok(seen.size > 15);
});

test('3/4 곡: 구간 경계와 마디 첫 박의 큰 불꽃이 세 박 마디에 맞는다', () => {
  const beat = 60 / 108;
  const map = flatMusicMap(80, 108, 0, 3);
  /** 박 수가 m의 배수에 가까운지 */
  const onGrid = (t: number, m: number) => Math.abs(t / beat / m - Math.round(t / beat / m)) < 1e-3;
  for (const s of map.sections!.slice(1)) assert.ok(onGrid(s.start, 3), `${s.kind} ${s.start}`);
  const cues = autoChoreograph(map, launchers, { seed: 2, style: 'grand', density: 1 });
  // 양쪽 바지선이 마주 보는 큰 마디 첫 박 (각도 ±10)은 두 마디(여섯 박)마다
  const mirrored = cues.filter((c) => c.angle === -10 && c.t < map.duration * 0.8);
  assert.ok(mirrored.length > 0);
  for (const c of mirrored) assert.ok(onGrid(c.t, 6), `${c.t}`);
});

test('자동 연출 품질: 의뢰를 자동 연출로 만들면 평균 별 1.5개 이상, 빈 하늘과 연기도 기준 이상', () => {
  const cs = [...Array.from({ length: 6 }, (_, k) => generateCommissions(700 + k, 100, 3)).flat(), ...Array.from({ length: 6 }, (_, k) => weeklyChallenge(`2026-W${String(k + 30)}`))];
  const all = [...STARTER_TYPES, ...(Object.keys(UNLOCK_PRICES) as FireworkType[])];
  let stars = 0;
  let gaps = 0;
  let smoke = 0;
  let n = 0;
  for (const c of cs) {
    for (const [dur, bpm] of [[60, 84], [100, 124]]) {
      const show: Show = {
        ...showOf([]),
        music: { id: 'x', title: 'x', bpm, offset: 0, duration: dur },
        venue: { preset: 'river-bridge-city', wind: c.wind, ...(c.cloud ? { cloud: c.cloud } : {}) },
        commission: c,
      };
      const { options } = commissionAutoOptions(c, show, all, []);
      show.cues = autoChoreograph(flatMusicMap(dur, bpm), launchers, { seed: n, style: c.taste.style, density: 0.7, ...options });
      const r = scoreShow(show, c);
      stars += r.stars;
      gaps += r.items.find((i) => i.key === 'gaps')!.score;
      smoke += r.items.find((i) => i.key === 'smoke')!.score;
      n++;
    }
  }
  assert.ok(stars / n >= 1.5, `평균 별 ${(stars / n).toFixed(2)}`);
  assert.ok(gaps / n >= 85, `빈 하늘 ${(gaps / n).toFixed(1)}`);
  assert.ok(smoke / n >= 40, `연기 ${(smoke / n).toFixed(1)}`);
});

test('실전 모드: 빈 갑판에서 자동 연출 → 랙 채우기 → 실린 통 안에서 다시 만들기 → 회로 점검이면 모두 쏘아진다', () => {
  const map = flatMusicMap(60, 112);
  const base: Show = { ...showOf([]), rig: { decks: {}, live: true } };
  const first = autoChoreograph(map, launchers, { seed: 4, style: 'grand', density: 0.8 });
  const { rig, missing } = rigForShow({ ...base, cues: first });
  const cues = autoChoreograph(map, launchers, { seed: 4, style: 'grand', density: 0.8, tubes: allTubes({ decks: rig.decks }) });
  const show: Show = { ...base, cues, rig: { decks: rig.decks, live: true } };
  fixFaults(show);
  const { blocked } = applyLive(show, expandShow(show).launches);
  assert.ok(cues.length > 20, `${cues.length}`);
  assert.equal(blocked.filter((b) => /통|핀/.test(b.reason)).length, 0, `${missing.join(' ')} / ${blocked.slice(0, 3).map((b) => b.reason).join(', ')}`);
});
