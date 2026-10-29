// 처음 시작을 쉽게: 처음에는 꼭 필요한 버튼만 보이고, 할 일을 하나씩 해낼 때마다 다음 기능이 열린다.
// 위 막대의 「다음: …」 버튼이 지금 할 일을 알려 준다. 이 기기의 브라우저에만 저장한다
// (서버판이면 단계에 처음 도달할 때 단계 이름만 이름 없이 알려, 어디서 막히는지 센다: remote.reportStep).

import { reportStep } from './remote.ts';

const KEY = 'nss:progress';

export type Goal = 'auto' | 'watch' | 'shell-saved' | 'delivered' | 'build-saved';

/** 열리는 기능 (화면에서는 이 이름이 붙은 요소를 숨기거나 보인다) */
export type Feature = 'capture' | 'workshop' | 'office' | 'site' | 'build' | 'bench' | 'live';

interface Step {
  goal: Goal;
  /** 「다음:」 버튼에 보일 할 일 */
  todo: string;
  /** 해내면 열리는 기능과 안내 */
  opens: Feature[];
  opened: string;
}

export const STEPS: Step[] = [
  { goal: 'auto', todo: '「자동 연출」로 첫 쇼 만들기', opens: ['capture'], opened: '사진 · 영상 · 나란히 · 직접 쏘기. 쇼를 사진이나 영상으로 남기고, 두 자리에서 나란히 보고, 음악에 맞춰 직접 쏴 볼 수 있습니다.' },
  { goal: 'watch', todo: '「감상」으로 내 쇼 보기', opens: ['workshop'], opened: '공작소. 색과 모양을 골라 내 불꽃을 만들어 보세요.' },
  { goal: 'shell-saved', todo: '공작소에서 내 불꽃을 만들어 서랍에 저장하기', opens: ['office'], opened: '의뢰소. 손님의 의뢰를 받아 쇼를 납품하고 돈과 평판을 모읍니다.' },
  { goal: 'delivered', todo: '의뢰소에서 의뢰 하나 납품하기', opens: ['site', 'build'], opened: '발사장과 공작소의 제작 공방. 바지선 자리를 정하고, 알 속에 별을 직접 붙여 만듭니다.' },
  { goal: 'build-saved', todo: '제작 공방에서 알을 만들어 저장하기', opens: ['bench', 'live'], opened: '작업대와 실전 모드. 배합부터 손으로 만들고, 허가와 장비까지 맞춰 쏘아 보세요.' },
];

/** 기능마다 숨기거나 보일 위 막대 버튼 */
const BUTTONS: Partial<Record<Feature, string[]>> = {
  capture: ['photo-btn', 'video-btn', 'compare-btn', 'fire-btn'],
  workshop: ['workshop-btn'],
  office: ['office-btn'],
  site: ['site-btn'],
};

export class Progress {
  private done = new Set<Goal>();
  private listeners = new Set<() => void>();
  /** 새 기능이 열리면 알린다 */
  onOpen: (message: string) => void = () => {};

  constructor() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        for (const g of JSON.parse(raw) as Goal[]) if (STEPS.some((s) => s.goal === g)) this.done.add(g);
      } else {
        // 이미 쓰던 사람(시작 안내를 봤거나 의뢰 기록이 있음)은 모두 열린 채로 시작한다.
        const career = JSON.parse(localStorage.getItem('nss:career') ?? 'null') as { history?: unknown[] } | null;
        if (localStorage.getItem('nss:guided') === '1' || career?.history?.length) this.openAll(false);
        else reportStep('start');
        this.save();
      }
    } catch {
      // 저장소를 못 쓰면 모두 열어 둔다 (막혀서 못 쓰는 것보다 낫다).
      for (const s of STEPS) this.done.add(s.goal);
    }
  }

  on(fn: () => void): void {
    this.listeners.add(fn);
  }

  /** 지금 몇 걸음째인지: 앞에서부터 연달아 해낸 할 일 수 */
  get level(): number {
    const i = STEPS.findIndex((s) => !this.done.has(s.goal));
    return i < 0 ? STEPS.length : i;
  }

  /** 지금 할 일 (다 했으면 null) */
  get next(): Step | null {
    return STEPS[this.level] ?? null;
  }

  can(f: Feature): boolean {
    return STEPS.slice(0, this.level).some((s) => s.opens.includes(f));
  }

  /** 할 일을 해냈다. 순서보다 먼저 해 둔 것도 기억해 두었다가, 앞 걸음을 마치면 같이 열린다. */
  did(goal: Goal): void {
    if (this.done.has(goal)) return;
    const before = this.level;
    this.done.add(goal);
    reportStep(goal);
    this.save();
    const after = this.level;
    if (after > before) {
      const opened = STEPS.slice(before, after).map((s) => s.opened).join(' ');
      const next = this.next;
      this.onOpen(`새로 열렸습니다: ${opened}${next ? ` 다음 할 일: ${next.todo}` : ' 이제 모든 기능이 열렸습니다.'}`);
    }
  }

  openAll(notify = true): void {
    for (const s of STEPS) this.done.add(s.goal);
    if (notify) this.save();
  }

  restart(): void {
    this.done.clear();
    this.save();
  }

  /** 위 막대 버튼을 지금 걸음에 맞게 숨기거나 보인다 */
  apply(): void {
    for (const [f, ids] of Object.entries(BUTTONS) as [Feature, string[]][]) {
      for (const id of ids) document.getElementById(id)?.classList.toggle('locked', !this.can(f));
    }
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify([...this.done]));
    } catch {
      // 저장하지 못해도 이번 창에서는 계속 쓴다.
    }
    for (const fn of this.listeners) fn();
  }
}

export const progress = new Progress();
