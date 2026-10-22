// 의뢰소: 게시판(의뢰 받기), 해금 상점, 장부, 의뢰 진행 막대, 채점 결과.

import {
  DEVELOP_PRICE,
  FIREWORK_TYPES,
  UNLOCK_PRICES,
  VENUES,
  ruleLabel,
  scoreShow,
  showCost,
  typeLabel,
  type Commission,
  type CustomShell,
  type FireworkType,
  type ScoreResult,
  type Show,
} from '@nss/engine';
import type { Career } from './career.ts';
import { newShow, round3, type Editor } from './editor.ts';
import { fmtDate } from './format.ts';
import { BASIC_TRACKS, trackDuration } from './tracks.ts';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const COMPASS = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];

export function weatherText(c: Commission): string {
  const dir = COMPASS[Math.round((((c.wind.dir % 360) + 360) % 360) / 45) % 8];
  const wind = c.wind.speed < 1 ? `바람 거의 없음 (${c.wind.speed}m/s, 연기가 잘 안 빠짐)` : `${dir}풍 ${c.wind.speed}m/s`;
  const cloud = c.cloud ? `구름 ${c.cloud}m (그보다 높이 터지는 불꽃은 묻힘)` : '맑음';
  return `${wind} · ${cloud}`;
}

const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n);

export interface OfficeHost {
  /** 서랍의 내 불꽃 (개발할 수 있는 것) */
  shells(): CustomShell[];
  openShow(id: string, show: Show): Promise<void>;
  saveNewShow(show: Show): Promise<string>;
  say(message: string): void;
  watch(): void;
}

export class Office {
  private editor: Editor;
  private career: Career;
  private host: OfficeHost;
  private board: HTMLDialogElement;
  private result: HTMLDialogElement;
  private bar: HTMLElement;
  private barTimer = 0;
  /** 마지막으로 보여 준 결과 (납품할 때 쓴다) */
  private lastResult: ScoreResult | null = null;

  constructor(editor: Editor, career: Career, host: OfficeHost) {
    this.editor = editor;
    this.career = career;
    this.host = host;
    this.board = document.getElementById('board-dialog') as HTMLDialogElement;
    this.result = document.getElementById('result-dialog') as HTMLDialogElement;
    this.bar = document.getElementById('commission-bar')!;
    editor.on((c) => {
      if (c !== 'show') return;
      clearTimeout(this.barTimer);
      this.barTimer = window.setTimeout(() => this.renderBar(), 150);
    });
    career.on(() => this.board.open && this.renderBoard());
  }

  /** 지금 쇼에서 쓸 수 없는 불꽃인가 (의뢰 쇼에서는 해금·개발한 것만 쓴다) */
  isLocked = (t: FireworkType, custom?: string): boolean =>
    !!this.editor.show.commission && !this.career.isUnlocked(t, custom);

  openBoard(): void {
    this.renderBoard();
    this.board.showModal();
  }

  private renderBoard(): void {
    const st = this.career.state;
    const next = this.career.nextTierAt;
    const cards = this.career.board();
    const body = this.board.querySelector('.board-body')!;
    const locked = FIREWORK_TYPES.filter((t) => UNLOCK_PRICES[t] !== undefined && !this.career.isUnlocked(t));

    body.innerHTML = `
      <section class="ledger">
        <div><span class="label">돈</span><b class="num">${st.money}</b></div>
        <div><span class="label">평판</span><b class="num">${st.reputation}</b></div>
        <div><span class="label">등급</span><b>${this.career.tierLabel}</b>${next !== null ? `<span class="note">다음 등급까지 ${next - st.reputation}</span>` : ''}</div>
      </section>

      <h3>게시판</h3>
      <div class="cards">
        ${cards.length ? cards.map((c, i) => this.card(c, i)).join('') : '<p class="note">게시판이 비었습니다. 다른 의뢰를 보거나, 받은 의뢰를 납품하면 새 의뢰가 올라옵니다.</p>'}
      </div>
      <button type="button" class="quiet" data-act="refresh">다른 의뢰 보기</button>

      <h3>불꽃 해금</h3>
      <p class="note">의뢰 쇼에서는 해금한 불꽃만 쓸 수 있습니다. 자유롭게 만드는 쇼에서는 모든 불꽃을 쓸 수 있습니다.</p>
      <ul class="shop">
        ${locked.length
          ? locked
              .map((t) => `<li><span>${typeLabel(t)}</span><span class="num">${UNLOCK_PRICES[t]}</span><button type="button" data-unlock="${t}" ${st.money < UNLOCK_PRICES[t]! ? 'disabled' : ''}>해금</button></li>`)
              .join('')
          : '<li class="note">모든 불꽃을 해금했습니다.</li>'}
      </ul>

      <h3>내 불꽃 개발</h3>
      <p class="note">공작소에서 만든 불꽃을 의뢰에 쓰려면 개발비 ${DEVELOP_PRICE}을 한 번 냅니다. 대신 한 발 값이 기본 불꽃보다 20% 쌉니다.</p>
      <ul class="shop">
        ${this.host.shells().length
          ? this.host
              .shells()
              .map((s) =>
                this.career.isUnlocked('custom', s.id)
                  ? `<li><span>${esc(s.name)}</span><span class="note">개발함</span></li>`
                  : `<li><span>${esc(s.name)}</span><span class="num">${DEVELOP_PRICE}</span><button type="button" data-develop="${s.id}" ${st.money < DEVELOP_PRICE ? 'disabled' : ''}>개발</button></li>`,
              )
              .join('')
          : '<li class="note">서랍이 비었습니다. 「공작소」에서 불꽃을 만들어 서랍에 넣으세요.</li>'}
      </ul>

      ${st.history.length ? `<h3>지난 의뢰</h3><ul class="history">${st.history
        .slice(0, 8)
        .map((h) => `<li><span>${esc(h.title)}</span><span class="stars">${stars(h.stars)}</span><span class="num">${h.total}점 · +${h.reward}</span><span class="note">${fmtDate(h.at)}</span></li>`)
        .join('')}</ul>` : ''}`;

    body.querySelectorAll<HTMLButtonElement>('[data-take]').forEach((b) =>
      b.addEventListener('click', () => void this.take(cards[Number(b.dataset.take)])),
    );
    body.querySelector('[data-act="refresh"]')?.addEventListener('click', () => this.career.refreshBoard());
    body.querySelectorAll<HTMLButtonElement>('[data-develop]').forEach((b) =>
      b.addEventListener('click', () => {
        const s = this.host.shells().find((x) => x.id === b.dataset.develop);
        if (s && this.career.develop(s.id)) {
          this.host.say(`「${s.name}」을 개발했습니다. 이제 의뢰 쇼에서도 쓸 수 있습니다.`);
          this.editor.emit('template');
        }
      }),
    );
    body.querySelectorAll<HTMLButtonElement>('[data-unlock]').forEach((b) =>
      b.addEventListener('click', () => {
        const t = b.dataset.unlock as (typeof FIREWORK_TYPES)[number];
        if (this.career.unlock(t)) {
          this.host.say(`「${typeLabel(t)}」 불꽃을 해금했습니다. 이제 의뢰 쇼에서 쓸 수 있습니다.`);
          this.editor.emit('template');
        }
      }),
    );
  }

  private card(c: Commission, i: number): string {
    const seat = VENUES['river-bridge-city'].seats[c.seat]?.label ?? c.seat;
    const track = BASIC_TRACKS.find((t) => t.id === c.music);
    return `
      <article class="commission-card tier-${c.tier}">
        <header><h4>${esc(c.title)}${c.custom ? '<span class="custom-badge">맞춤 의뢰</span>' : ''}</h4><span class="note">${esc(c.client)}</span></header>
        ${c.custom ? '<p class="note">맞춤 의뢰는 공작소의 제작 공방과 지상 틀 그림으로 직접 만들어야 납품할 수 있습니다.</p>' : ''}
        <p class="quote">“${esc(c.quote)}”</p>
        <ul class="rules">${c.rules.map((r) => `<li>${esc(ruleLabel(r))}</li>`).join('')}</ul>
        <dl class="facts">
          <div><dt>예산</dt><dd class="num">${c.budget}</dd></div>
          <div><dt>보상</dt><dd class="num">최대 ${Math.round(c.reward * 1.2)}</dd></div>
          <div><dt>곡</dt><dd>${esc(track?.title ?? c.music)}</dd></div>
          <div><dt>관람석</dt><dd>${esc(seat)}</dd></div>
          <div class="wide"><dt>날씨</dt><dd>${esc(weatherText(c))}</dd></div>
        </dl>
        <button type="button" class="primary" data-take="${i}">의뢰 받기</button>
      </article>`;
  }

  private async take(c: Commission): Promise<void> {
    const track = BASIC_TRACKS.find((t) => t.id === c.music) ?? BASIC_TRACKS[0];
    const show = newShow(c.title);
    show.music = { id: track.id, title: track.title, bpm: track.bpm, offset: 0, duration: round3(trackDuration(track)) };
    show.venue = { preset: 'river-bridge-city', wind: c.wind, ...(c.cloud ? { cloud: c.cloud } : {}) };
    show.seat = { id: c.seat };
    show.commission = c;
    this.career.take(c);
    const id = await this.host.saveNewShow(show);
    this.board.close();
    await this.host.openShow(id, show);
    if (!this.career.isUnlocked(this.editor.template.type)) this.editor.setTemplate({ type: 'chrysanthemum' });
    this.host.say(`「${c.title}」 의뢰를 받았습니다. 아래 막대에서 예산과 조건을 확인하세요.`);
  }

  renderBar(): void {
    const c = this.editor.show.commission;
    this.bar.hidden = !c;
    if (!c) return;
    const r = scoreShow(this.editor.show, c);
    const cost = showCost(this.editor.show);
    const pct = Math.min(100, (cost / c.budget) * 100);
    const over = cost > c.budget;
    const done = c.delivered;
    this.bar.innerHTML = `
      <span class="tag">의뢰</span>
      <b class="title">${esc(c.title)}</b>
      <span class="budget ${over ? 'over' : ''}" title="쓴 값 / 예산">
        <span class="meter"><i style="width:${pct}%"></i></span>
        <span class="num">${cost} / ${c.budget}</span>
      </span>
      <ul class="checks">${r.rules
        .map((x) => `<li class="${x.ok ? 'ok' : 'no'}" title="${esc(x.detail ?? '지켰습니다')}">${x.ok ? '✓' : '✗'} ${esc(x.label)}</li>`)
        .join('')}</ul>
      <span class="weather note">${esc(weatherText(c))}</span>
      <span class="actions">
        ${done
          ? `<span class="delivered">납품 완료 ${stars(done.stars)} ${done.total}점</span><button type="button" data-act="preview">결과 보기</button>`
          : `<button type="button" data-act="preview">미리 채점</button><button type="button" class="primary" data-act="deliver">납품하기</button>`}
      </span>`;
    this.bar.querySelector('[data-act="preview"]')?.addEventListener('click', () => this.showResult(false));
    this.bar.querySelector('[data-act="deliver"]')?.addEventListener('click', () => this.showResult(true));
  }

  /** 채점 결과를 보여 준다. deliver면 확인을 받은 뒤 장부에 적는다. */
  private showResult(deliver: boolean): void {
    const c = this.editor.show.commission;
    if (!c) return;
    const r = scoreShow(this.editor.show, c);
    this.lastResult = r;
    const done = c.delivered;
    const body = this.result.querySelector('.result-body')!;
    const head = r.failed
      ? `<p class="verdict fail">의뢰 실패: ${esc(r.failReason ?? '')}</p>`
      : `<p class="verdict"><span class="stars big">${stars(r.stars)}</span><b class="num">${r.total}점</b></p>`;
    const money = r.failed ? '보상 없음, 평판 −5' : `보상 ${r.reward} · 평판 ${r.reputation >= 0 ? '+' : ''}${r.reputation}`;
    body.innerHTML = `
      <h2 id="result-title">${esc(c.title)} ${done ? '· 납품한 결과' : deliver ? '· 납품 전 확인' : '· 미리 채점'}</h2>
      ${head}
      <ul class="score-items">${r.items
        .map(
          (i) => `<li>
            <span class="name">${esc(i.label)}</span>
            <span class="meter"><i style="width:${Math.round(i.score)}%"></i></span>
            <span class="num">${Math.round(i.score)}</span>
            <p class="note">${esc(i.comment)}</p>
          </li>`,
        )
        .join('')}</ul>
      <ul class="rule-results">${r.rules.map((x) => `<li class="${x.ok ? 'ok' : 'no'}">${x.ok ? '✓' : '✗'} ${esc(x.label)}${x.detail ? ` <span class="note">${esc(x.detail)}</span>` : ''}</li>`).join('')}</ul>
      <p class="money">${done ? `받은 보상 ${done.reward}` : deliver ? `납품하면: ${money}` : `지금 납품하면: ${money}`}</p>
      <div class="dialog-actions">
        ${deliver && !done ? '<button type="button" class="primary" data-act="confirm">이대로 납품하기</button><button type="button" data-act="close">더 고치기</button>' : '<button type="button" data-act="close">닫기</button>'}
        <button type="button" data-act="watch">관객과 함께 감상하기</button>
      </div>
      ${deliver && !done ? '<p class="note">납품은 한 번만 할 수 있습니다. 납품한 뒤에도 쇼는 계속 고치고 공유할 수 있습니다.</p>' : ''}`;
    body.querySelector('[data-act="close"]')?.addEventListener('click', () => this.result.close());
    body.querySelector('[data-act="watch"]')?.addEventListener('click', () => {
      this.result.close();
      this.host.watch();
    });
    body.querySelector('[data-act="confirm"]')?.addEventListener('click', () => this.deliver());
    this.result.showModal();
  }

  private deliver(): void {
    const c = this.editor.show.commission;
    const r = this.lastResult;
    if (!c || !r || c.delivered) return;
    this.career.settle({
      commissionId: c.id,
      title: c.title,
      stars: r.stars,
      total: r.total,
      reward: r.reward,
      reputation: r.reputation,
      at: Date.now(),
    });
    this.editor.change((d) => {
      if (d.commission) d.commission.delivered = { total: r.total, stars: r.stars, reward: r.reward, at: Date.now() };
    });
    this.result.close();
    this.host.say(
      r.failed
        ? '의뢰에 실패했습니다. 평판이 조금 내려갔습니다. 게시판에 새 의뢰가 올라왔습니다.'
        : `납품했습니다. ${stars(r.stars)} · 보상 ${r.reward} · 평판 +${r.reputation}. 게시판에 새 의뢰가 올라왔습니다.`,
    );
  }
}
