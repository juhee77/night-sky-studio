// 배선과 발사 스크립트: 통마다 점화 모듈의 핀을 연결하고, 실제 장비처럼 발사 스크립트(CSV)를 뽑는다.
// 같은 때 같은 불꽃(부채꼴)은 한 핀에 묶어 동시에 쏜다. 다리·지상 틀도 모듈 핀 하나로 불을 붙인다.
// 회로 점검: 선이 끊긴 핀은 쏘아지지 않는다. 점검으로 찾아 고칠 수 있다 (게임용 확률).

import { typeLabel } from './catalog.ts';
import { loadPlan, type LoadPlan } from './loading.ts';
import { tubeLabel } from './rig.ts';
import { hash32, rand01 } from './rng.ts';
import { expandShow, type Show } from './show.ts';

/** 핀 하나에 선이 끊겨 있을 확률 */
export const FAULT_RATE = 0.05;

export interface Fire {
  cueIndex: number;
  sub: number;
  fireAt: number;
  launcher: string;
  product: string;
  size: number;
  angle: number;
  /** 바지선 통 (다리·지상 틀은 null) */
  tube: string | null;
  module: number | null;
  pin: number | null;
}

export interface Wiring {
  fires: Fire[];
  modules: { id: number; launcher: string; used: number }[];
  /** 끊긴 선 (고친 것은 빠진다) */
  faults: { module: number; pin: number }[];
  /** 한 핀에 여러 발을 묶은 핀 수 */
  chained: number;
}

const pinKey = (m: number, p: number) => `${m}-${p}`;

/** 배선 계획: 위치마다 점화 시각 순서로 핀을 잇는다. */
export function wirePlan(show: Show, plan: LoadPlan = loadPlan(show)): Wiring {
  const pinsPer = show.rig?.pins ?? 18;
  const chain = show.rig?.chain !== false;
  const loaded = new Map(plan.rows.map((r) => [`${r.cueIndex}:${r.sub}`, r]));
  const barges = new Set(show.launchers.filter((l) => l.kind === 'barge').map((l) => l.id));
  const fires: Fire[] = [];
  for (const l of expandShow(show).launches) {
    const cue = show.cues[l.cueIndex];
    if (!cue) continue;
    // 케이크는 상자 하나에 불을 한 번 붙인다.
    if (l.type === 'cake' && l.sub > 0) continue;
    const row = loaded.get(`${l.cueIndex}:${l.sub}`);
    fires.push({
      cueIndex: l.cueIndex,
      sub: l.sub,
      fireAt: l.fireAt,
      launcher: cue.at,
      product: (l.customDef ? `내 불꽃 「${l.customDef.name}」` : typeLabel(l.type)) + (cue.text ? ` "${cue.text}"` : ''),
      size: l.size,
      angle: l.angle,
      tube: barges.has(cue.at) ? (row?.tube ?? null) : null,
      module: null,
      pin: null,
    });
  }
  const modules: Wiring['modules'] = [];
  let chained = 0;
  for (const launcher of show.launchers) {
    // 통이 없는 바지선 발사는 이을 곳이 없다.
    const mine = fires
      .filter((f) => f.launcher === launcher.id && (f.tube || !barges.has(launcher.id)))
      .sort((a, b) => a.fireAt - b.fireAt || a.cueIndex - b.cueIndex || a.sub - b.sub);
    let mod: (typeof modules)[number] | null = null;
    let last: Fire | null = null;
    for (const f of mine) {
      if (chain && last && last.cueIndex === f.cueIndex && Math.abs(last.fireAt - f.fireAt) < 1e-6) {
        f.module = last.module;
        f.pin = last.pin;
        if (fires.filter((x) => x.module === f.module && x.pin === f.pin).length === 2) chained++;
        continue;
      }
      if (!mod || mod.used >= pinsPer) {
        mod = { id: modules.length + 1, launcher: launcher.id, used: 0 };
        modules.push(mod);
      }
      mod.used++;
      f.module = mod.id;
      f.pin = mod.used;
      last = f;
    }
  }
  const fixed = new Set(show.rig?.fixed ?? []);
  const faults: Wiring['faults'] = [];
  for (const m of modules) {
    for (let p = 1; p <= m.used; p++) {
      if (rand01(hash32(show.seed, m.id * 100 + p, 61)) < FAULT_RATE && !fixed.has(pinKey(m.id, p))) faults.push({ module: m.id, pin: p });
    }
  }
  return { fires, modules, faults, chained };
}

/** 끊긴 선을 모두 고친 장비 (점검 완료) */
export function fixFaults(show: Show, w: Wiring = wirePlan(show)): void {
  show.rig ??= { decks: {} };
  show.rig.checked = true;
  show.rig.fixed = [...new Set([...(show.rig.fixed ?? []), ...w.faults.map((f) => pinKey(f.module, f.pin))])];
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** 발사 스크립트 CSV: 시각, 모듈, 핀, 위치, 통, 상품, 크기, 각도, 불꽃 번호. 엑셀에서 한글이 깨지지 않게 BOM을 붙인다. */
export function fireScript(show: Show, w: Wiring = wirePlan(show)): string {
  const name = (id: string) => {
    const l = show.launchers.find((x) => x.id === id);
    if (!l) return id;
    return l.kind === 'barge' ? `바지선 ${id.match(/\d+/)?.[0] ?? ''}` : l.kind === 'bridge' ? '다리' : '지상 틀';
  };
  const rows = [...w.fires].sort((a, b) => a.fireAt - b.fireAt || (a.module ?? 999) - (b.module ?? 999) || (a.pin ?? 0) - (b.pin ?? 0));
  const lines = [['시각(초)', '모듈', '핀', '위치', '통', '상품', '크기', '각도', '불꽃 번호'].join(',')];
  for (const f of rows) {
    lines.push(
      [
        f.fireAt.toFixed(3),
        f.module ?? '연결 안 됨',
        f.pin ?? '',
        name(f.launcher),
        f.tube ? tubeLabel(f.tube) : '',
        f.product,
        `${f.size}호`,
        f.angle,
        `${f.cueIndex + 1}${f.sub ? `-${f.sub + 1}` : ''}`,
      ].map(csvCell).join(','),
    );
  }
  return '﻿' + lines.join('\n') + '\n';
}
