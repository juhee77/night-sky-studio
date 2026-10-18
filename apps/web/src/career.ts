// 1인 불꽃 연출 회사의 장부: 돈, 평판, 해금한 불꽃, 지금 게시판의 의뢰, 지난 의뢰 기록.
// 이 기기의 브라우저에만 저장한다.

import {
  STARTER_TYPES,
  UNLOCK_PRICES,
  generateCommissions,
  tierFor,
  type Commission,
  type FireworkType,
} from '@nss/engine';

export interface HistoryEntry {
  commissionId: string;
  title: string;
  stars: number;
  total: number;
  reward: number;
  reputation: number;
  at: number;
}

export interface CareerState {
  money: number;
  reputation: number;
  unlocked: FireworkType[];
  /** 게시판을 만드는 시드. 의뢰를 납품하거나 새로 고치면 바뀐다. */
  boardSeed: number;
  /** 받아 간 의뢰 (게시판에서 빠진다) */
  taken: string[];
  history: HistoryEntry[];
}

const KEY = 'nss:career';
const TIER_LABEL = ['동네 의뢰', '지역 의뢰', '큰 행사'];

function fresh(): CareerState {
  return { money: 100, reputation: 0, unlocked: [...STARTER_TYPES], boardSeed: Date.now() % 1e9, taken: [], history: [] };
}

export class Career {
  state: CareerState;
  private listeners = new Set<() => void>();

  constructor() {
    this.state = fresh();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.state = { ...fresh(), ...JSON.parse(raw) };
    } catch {
      // 저장소를 못 쓰면 이번 창에서만 유지한다.
    }
  }

  on(fn: () => void): void {
    this.listeners.add(fn);
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.state));
    } catch {
      // 저장하지 못해도 계속 쓸 수 있다.
    }
    for (const fn of this.listeners) fn();
  }

  get tierLabel(): string {
    return TIER_LABEL[tierFor(this.state.reputation)];
  }

  /** 다음 등급까지 필요한 평판 (마지막 등급이면 null) */
  get nextTierAt(): number | null {
    const r = this.state.reputation;
    return r < 20 ? 20 : r < 60 ? 60 : null;
  }

  board(): Commission[] {
    return generateCommissions(this.state.boardSeed, this.state.reputation, 3).filter((c) => !this.state.taken.includes(c.id));
  }

  take(c: Commission): void {
    this.state.taken.push(c.id);
    this.save();
  }

  refreshBoard(): void {
    this.state.boardSeed = (this.state.boardSeed * 1103515245 + 12345) % 2147483647;
    this.state.taken = [];
    this.save();
  }

  isUnlocked(t: FireworkType): boolean {
    return this.state.unlocked.includes(t);
  }

  unlock(t: FireworkType): boolean {
    const price = UNLOCK_PRICES[t];
    if (price === undefined || this.isUnlocked(t) || this.state.money < price) return false;
    this.state.money -= price;
    this.state.unlocked.push(t);
    this.save();
    return true;
  }

  /** 납품 결과를 장부에 적는다. 같은 의뢰는 한 번만 받는다. */
  settle(entry: HistoryEntry): void {
    if (this.state.history.some((h) => h.commissionId === entry.commissionId)) return;
    this.state.money += entry.reward;
    this.state.reputation = Math.max(0, this.state.reputation + entry.reputation);
    this.state.history.unshift(entry);
    // 납품하면 게시판에 새 의뢰가 올라온다.
    this.refreshBoard();
  }
}
