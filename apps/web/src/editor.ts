// 편집 중인 쇼와 선택, 되돌리기. 화면 부품들은 여기서 바뀐 것을 듣고 다시 그린다.

import type { ColorName, Cue, Launcher, ShellType, Show, Size } from '@nss/engine';

export type Change = 'show' | 'selection' | 'template';

/** 새로 놓을 불꽃의 설정 */
export interface Template {
  type: ShellType;
  size: Size;
  colors: ColorName[];
  angle: number;
  fanCount: number;
  fanSpread: number;
}

export type Snap = 'beat' | 'half' | 'off';

const HISTORY_LIMIT = 200;

export class Editor {
  id: string;
  show: Show;
  selection = new Set<number>();
  template: Template = { type: 'chrysanthemum', size: 5, colors: ['gold'], angle: 0, fanCount: 1, fanSpread: 40 };
  snap: Snap = 'beat';

  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private batchStart: string | null = null;
  private listeners = new Set<(c: Change) => void>();

  constructor(id: string, show: Show) {
    this.id = id;
    this.show = show;
  }

  on(fn: (c: Change) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(c: Change): void {
    for (const fn of this.listeners) fn(c);
  }

  /** 다른 쇼를 연다. 되돌리기 기록은 비운다. */
  load(id: string, show: Show): void {
    this.id = id;
    this.show = show;
    this.selection.clear();
    this.undoStack = [];
    this.redoStack = [];
    this.emit('show');
    this.emit('selection');
  }

  /** 되돌리기 한 칸으로 기록되는 변경 */
  change(mutate: (draft: Show) => void): void {
    const before = JSON.stringify(this.show);
    const draft = structuredClone(this.show);
    mutate(draft);
    const after = JSON.stringify(draft);
    if (after === before) return;
    if (this.batchStart === null) this.pushUndo(before);
    this.show = draft;
    this.emit('show');
  }

  /** 끌기처럼 여러 번 바뀌어도 되돌리기는 한 칸이 되게 묶는다. */
  beginBatch(): void {
    this.batchStart ??= JSON.stringify(this.show);
  }

  endBatch(): void {
    if (this.batchStart !== null && this.batchStart !== JSON.stringify(this.show)) this.pushUndo(this.batchStart);
    this.batchStart = null;
  }

  private pushUndo(snapshot: string): void {
    this.undoStack.push(snapshot);
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack = [];
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(JSON.stringify(this.show));
    this.restore(prev);
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(JSON.stringify(this.show));
    this.restore(next);
  }

  private restore(json: string): void {
    this.show = JSON.parse(json);
    this.selection.clear();
    this.emit('show');
    this.emit('selection');
  }

  /** 제목은 글자마다 되돌리기 기록을 남기지 않는다. */
  setTitle(title: string): void {
    this.show = { ...this.show, title };
    this.emit('show');
  }

  select(indices: Iterable<number>): void {
    this.selection = new Set(indices);
    this.emit('selection');
  }

  toggle(index: number): void {
    if (this.selection.has(index)) this.selection.delete(index);
    else this.selection.add(index);
    this.emit('selection');
  }

  get selectedCues(): Cue[] {
    return [...this.selection].map((i) => this.show.cues[i]).filter(Boolean);
  }

  setTemplate(patch: Partial<Template>): void {
    this.template = { ...this.template, ...patch };
    this.emit('template');
  }

  /** 설정대로 새 불꽃 하나를 놓고 선택한다. */
  addCue(t: number, launcherId: string): void {
    const tpl = this.template;
    const cue: Cue = { t: round3(Math.max(0, t)), at: launcherId, type: tpl.type, size: tpl.size, colors: [...tpl.colors] };
    if (tpl.angle) cue.angle = tpl.angle;
    if (tpl.fanCount > 1) cue.fan = { count: tpl.fanCount, spread: tpl.fanSpread };
    this.change((d) => d.cues.push(cue));
    this.select([this.show.cues.length - 1]);
  }

  deleteSelected(): void {
    if (!this.selection.size) return;
    const gone = this.selection;
    this.change((d) => {
      d.cues = d.cues.filter((_, i) => !gone.has(i));
    });
    this.select([]);
  }

  /** 선택한 불꽃을 at초에 붙여 넣는다. 서로의 시간 차이와 발사 위치는 그대로. */
  paste(cues: Cue[], at: number): void {
    if (!cues.length) return;
    const first = Math.min(...cues.map((c) => c.t));
    const start = this.show.cues.length;
    this.change((d) => {
      for (const c of cues) d.cues.push({ ...structuredClone(c), t: round3(Math.max(0, at + c.t - first)) });
    });
    this.select(cues.map((_, i) => start + i));
  }

  /** 박자 눈금 (음악이 없으면 120 BPM으로 본다) */
  get beat(): { bpm: number; offset: number; length: number } {
    const bpm = this.show.music?.bpm ?? 120;
    return { bpm, offset: this.show.music?.offset ?? 0, length: 60 / bpm };
  }

  /** 설정에 따라 가장 가까운 박에 붙인다. */
  snapTime(t: number, mode: Snap = this.snap): number {
    if (mode === 'off') return round3(t);
    const { offset, length } = this.beat;
    const step = mode === 'half' ? length / 2 : length;
    return round3(offset + Math.round((t - offset) / step) * step);
  }

  laneOf(cue: Cue): number {
    return Math.max(0, this.show.launchers.findIndex((l) => l.id === cue.at));
  }
}

export function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

export function launcherLabel(l: Launcher, index: number): string {
  if (l.kind === 'barge') return `바지선 ${l.id.match(/\d+/)?.[0] ?? index + 1}`;
  if (l.kind === 'bridge') return '다리';
  return '지상 틀';
}

export function newShow(title: string): Show {
  return {
    version: 1,
    title,
    seed: Math.floor(Math.random() * 1e9),
    music: { id: 'basic-1', title: '밤하늘 행진', bpm: 112, offset: 0, duration: 61.5 },
    venue: { preset: 'river-bridge-city', wind: { dir: 250, speed: 2 } },
    seat: { id: 'front-near' },
    launchers: [
      { id: 'barge-1', kind: 'barge', pos: [-220, 0, 0] },
      { id: 'barge-2', kind: 'barge', pos: [0, 0, -80] },
      { id: 'barge-3', kind: 'barge', pos: [220, 0, 60] },
    ],
    cues: [],
  };
}
