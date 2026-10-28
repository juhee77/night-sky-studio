// 직접 쏘기: 음악이 흐르는 동안 키(1~3 바지선, Space 큰 불꽃)나 무대를 눌러 쏜다.
// 실제처럼 누르는 순간 발사되고 상승 시간(3호 3초 … 10호 7초) 뒤에 터진다. 터지는 순간이 박에 맞으면 「완벽!」.
// 바지선마다 장전된 통만큼만 쏠 수 있고, 다 쓰면 다시 장전하는 동안 기다린다.
// 끝나면 쏜 기록을 이 쇼의 시간표로 바꿀지 묻는다 (바꿔도 「되돌리기」로 되돌릴 수 있다).

import { beatFit, isShell, shellSize, type Cue, type FireworkType, type Launcher, type Show, type Size } from '@nss/engine';
import { launcherLabel, type Editor } from './editor.ts';
import type { Stage } from './stage.ts';
import type { Transport } from './transport.ts';

/** 바지선 하나에 장전된 통 수와, 다 쓴 뒤 다시 장전하는 시간(초) */
const LOADED = 8;
const RELOAD = 5;

export interface LiveFireCtx {
  editor: Editor;
  stage: Stage;
  transport: Transport;
  togglePlay(): void;
  say(message: string, ms?: number): void;
}

interface Rack {
  barge: Launcher;
  label: string;
  left: number;
  /** 다시 장전이 끝나는 쇼 시각 (장전 중이 아니면 0) */
  readyAt: number;
}

export class LiveFire {
  active = false;
  private ctx: LiveFireCtx;
  private shots: Cue[] = [];
  private racks: Rack[] = [];
  private base: Show | null = null;
  private hud: HTMLElement;
  private dialog: HTMLDialogElement;

  constructor(ctx: LiveFireCtx, wrap: HTMLElement) {
    this.ctx = ctx;
    this.hud = document.createElement('div');
    this.hud.className = 'fire-hud';
    this.hud.hidden = true;
    wrap.append(this.hud);
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'fire-dialog';
    this.dialog.setAttribute('aria-labelledby', 'fire-title');
    document.body.append(this.dialog);
  }

  start(): void {
    const { editor, transport } = this.ctx;
    const barges = editor.show.launchers.filter((l) => l.kind === 'barge');
    if (!barges.length) {
      this.ctx.say('바지선이 있는 무대에서 쏠 수 있습니다.');
      return;
    }
    this.active = true;
    document.body.classList.add('firing');
    this.base = editor.show;
    this.shots = [];
    this.racks = barges.slice(0, 3).map((barge) => ({ barge, label: launcherLabel(barge, editor.show.launchers.indexOf(barge)), left: LOADED, readyAt: 0 }));
    this.apply();
    if (transport.playing) this.ctx.togglePlay();
    transport.seek(0);
    this.ctx.togglePlay();
    this.ctx.say('누르는 순간 발사되고, 몇 초 뒤 터집니다. 터지는 순간이 박에 맞게 미리 쏘세요.', 6000);
  }

  /** 바지선 번호(0~2)로 쏘거나, big이면 가장 많이 남은 바지선에서 큰 불꽃 */
  fire(lane: number | 'big'): void {
    const { editor, transport } = this.ctx;
    if (!this.active || !transport.playing) return;
    const now = transport.time;
    for (const r of this.racks) if (r.readyAt && now >= r.readyAt) Object.assign(r, { left: LOADED, readyAt: 0 });
    const rack = lane === 'big' ? [...this.racks].sort((a, b) => b.left - a.left)[0] : this.racks[lane];
    if (!rack) return;
    if (!rack.left) {
      this.ctx.say(`${rack.label} 장전 중… ${Math.ceil(rack.readyAt - now)}초`, 1200);
      return;
    }
    const tpl = editor.template;
    // 하늘 불꽃만 쏜다 (나이아가라·틀불꽃·케이크·내 불꽃은 시간표에서). 큰 불꽃은 쓸 수 있는 가장 큰 국화.
    let type: FireworkType = isShell(tpl.type) && tpl.type !== 'cake' && tpl.type !== 'custom' ? tpl.type : 'chrysanthemum';
    if (!editor.allowType(type)) type = (['chrysanthemum', 'peony'] as const).find((t) => editor.allowType(t)) ?? type;
    const size: Size = lane === 'big' ? 10 : tpl.size;
    const rise = shellSize(type, size).prefire;
    const cue: Cue = { t: Math.round((now + rise) * 1000) / 1000, at: rack.barge.id, type, size, colors: [...tpl.colors] };
    this.shots.push(cue);
    rack.left -= 1;
    if (!rack.left) rack.readyAt = now + RELOAD;
    this.apply();
  }

  /** 매 프레임: 장전 상태 표시와 다 쓴 통 다시 채우기 */
  update(): void {
    if (!this.active) return;
    const now = this.ctx.transport.time;
    for (const r of this.racks) if (r.readyAt && now >= r.readyAt) Object.assign(r, { left: LOADED, readyAt: 0 });
    const music = this.base?.music;
    const perfect = music ? this.shots.filter((c) => beatFit(c.t, music) > 0.8).length : 0;
    const html =
      this.racks
        .map(
          (r, i) => `<div class="fire-rack${r.left ? '' : ' empty'}">
            <kbd>${i + 1}</kbd><span>${r.label}</span>
            <span class="fire-ammo">${r.left ? '●'.repeat(r.left) + '○'.repeat(LOADED - r.left) : `장전 중 ${Math.ceil(r.readyAt - now)}초`}</span>
          </div>`,
        )
        .join('') +
      `<div class="fire-rack"><kbd>Space</kbd><span>큰 불꽃 (10호)</span></div>
       <div class="fire-score">쏜 불꽃 ${this.shots.length}발${music ? ` · 박자 딱 ${perfect}발` : ''} · <kbd>Esc</kbd> 끝내기</div>`;
    if (this.hud.innerHTML !== html) this.hud.innerHTML = html;
    this.hud.hidden = false;
  }

  /** 무대에 쏜 기록만 보이게 (편집 중인 쇼는 그대로 둔다) */
  private apply(): void {
    if (!this.base) return;
    this.ctx.stage.setShow({ ...this.base, cues: [...this.shots].sort((a, b) => a.t - b.t) });
  }

  /** 끝내기: 쏜 기록을 시간표로 저장할지 묻는다 */
  finish(): void {
    if (!this.active) return;
    this.active = false;
    document.body.classList.remove('firing');
    this.hud.hidden = true;
    if (this.ctx.transport.playing) this.ctx.togglePlay();
    const shots = [...this.shots].sort((a, b) => a.t - b.t);
    const music = this.base?.music;
    const perfect = music ? shots.filter((c) => beatFit(c.t, music) > 0.8).length : 0;
    const restore = () => this.ctx.stage.setShow(this.ctx.editor.show);
    if (!shots.length) {
      restore();
      return;
    }
    this.dialog.innerHTML = `
      <h2 id="fire-title">직접 쏜 불꽃 ${shots.length}발</h2>
      <p>${music ? `박자에 딱 맞게 터진 불꽃 ${perfect}발 (${Math.round((perfect / shots.length) * 100)}%).` : ''}</p>
      <p class="note">이 쇼의 시간표를 쏜 기록으로 바꾸면 지금 놓인 불꽃 ${this.ctx.editor.show.cues.length}개는 지워집니다. 「되돌리기」로 되돌릴 수 있습니다.</p>
      <div class="dialog-actions">
        <button type="button" class="primary" data-act="keep">시간표로 저장</button>
        <button type="button" data-act="drop">버리기</button>
      </div>`;
    this.dialog.querySelector('[data-act="keep"]')!.addEventListener('click', () => {
      this.dialog.close();
      this.ctx.editor.change((d) => {
        d.cues = shots;
      });
      restore();
      this.ctx.say(`쏜 불꽃 ${shots.length}발을 시간표에 놓았습니다. 박이 어긋난 불꽃은 끌어서 고칠 수 있습니다.`);
    });
    this.dialog.querySelector('[data-act="drop"]')!.addEventListener('click', () => this.dialog.close());
    this.dialog.addEventListener('close', restore, { once: true });
    this.dialog.showModal();
  }
}
