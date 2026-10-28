// 의뢰소: 게시판(의뢰 받기), 해금 상점, 장부, 의뢰 진행 막대, 채점 결과.

import {
  DEVELOP_PRICE,
  FIREWORK_TYPES,
  UNLOCK_PRICES,
  RIVALS,
  STORY,
  VENUES,
  contestCommission,
  contestRanking,
  encodeShow,
  gradeOf,
  isoWeekKey,
  ruleLabel,
  scoreShow,
  showCost,
  showMoments,
  typeLabel,
  weeklyChallenge,
  type Commission,
  type CustomShell,
  type FireworkType,
  type ScoreResult,
  type Show,
} from '@nss/engine';
import type { Career } from './career.ts';
import { newShow, type Editor } from './editor.ts';
import { fmtDate } from './format.ts';
import { progress } from './progress.ts';
import { currentAuth, galleryUpload, remoteEnabled } from './remote.ts';
import { BASIC_TRACKS, trackRef } from './tracks.ts';

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
  /** 그 시각으로 옮겨 멈춘다 (성적표의 순간을 눌렀을 때) */
  seek(t: number): void;
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
    !!this.editor.show.commission && !this.editor.show.commission.challenge && !this.career.isUnlocked(t, custom);

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
    const week = isoWeekKey(new Date());
    const challenge = weeklyChallenge(week);
    const pastChallenges = Object.entries(st.challenges).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6);

    const stage = this.career.stage;
    const nextStage = STORY[stage + 1];
    const contest = stage >= STORY.length - 1 ? contestCommission() : null;
    const contestDone = this.career.contestDone;
    body.innerHTML = `
      <section class="story">
        <ol class="story-steps">${STORY.map((s, i) => `<li class="${i < stage ? 'done' : i === stage ? 'now' : ''}">${esc(s.title)}</li>`).join('')}</ol>
        <p class="quote">“${esc(STORY[stage].line)}” <span class="note">— ${esc(STORY[stage].client)}</span></p>
        <p class="note">모은 별 ${this.career.totalStars}개${nextStage ? ` · 「${esc(nextStage.title)}」까지 별 ${nextStage.stars - this.career.totalStars}개` : ''}</p>
      </section>
      ${contest
        ? `<h3>한강 세계불꽃축제 대회</h3>
          ${contestDone
            ? `<p class="note">대회를 마쳤습니다: ${contestDone.total}점, ${contestRanking(contestDone.total).findIndex((r) => r.mine) + 1}위 (${RIVALS.length + 1}팀 중).</p>`
            : `<div class="cards">${this.card(contest, -2)}</div>`}`
        : ''}
      <section class="ledger">
        <div><span class="label">돈</span><b class="num">${st.money}</b></div>
        <div><span class="label">평판</span><b class="num">${st.reputation}</b></div>
        <div><span class="label">등급</span><b>${this.career.tierLabel}</b>${next !== null ? `<span class="note">다음 등급까지 ${next - st.reputation}</span>` : ''}</div>
      </section>

      <h3>이번 주 도전 <span class="note">${week}</span></h3>
      <p class="note">이번 주에는 모두가 같은 곡과 조건으로 겨룹니다. 해금하지 않은 불꽃도 쓸 수 있고, 몇 번이든 다시 내서 최고 점수를 남깁니다.${remoteEnabled() ? ' 채점한 쇼를 상영관 「이번 주 도전」에 올리면 좋아요 순으로 순위가 매겨집니다.' : ''}</p>
      <div class="cards">${this.card(challenge, -1)}</div>

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

      ${pastChallenges.length ? `<h3>내 도전 기록</h3><ul class="history">${pastChallenges
        .map(([w, b]) => `<li><span>${esc(w)}${w === week ? ' (이번 주)' : ''}</span><span class="stars">${stars(b.stars)}</span><span class="num">최고 ${b.total}점</span><span class="note">${fmtDate(b.at)}</span></li>`)
        .join('')}</ul>` : ''}

      ${st.history.length ? `<h3>지난 의뢰</h3><ul class="history">${st.history
        .slice(0, 8)
        .map((h) => `<li><span>${esc(h.title)}</span><span class="stars">${stars(h.stars)}</span><span class="num">${h.total}점 · +${h.reward}</span><span class="note">${fmtDate(h.at)}</span></li>`)
        .join('')}</ul>` : ''}`;

    body.querySelectorAll<HTMLButtonElement>('[data-take]').forEach((b) =>
      b.addEventListener('click', () => void this.take(cards[Number(b.dataset.take)])),
    );
    body.querySelector('[data-challenge]')?.addEventListener('click', () => void this.take(challenge));
    body.querySelector('[data-contest]')?.addEventListener('click', () => void this.take(contestCommission()));
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
    const venue = VENUES[c.venue ?? 'river-bridge-city'] ?? VENUES['river-bridge-city'];
    const seat = (venue.seats[c.seat] ?? Object.values(venue.seats)[0]).label;
    const track = BASIC_TRACKS.find((t) => t.id === c.music);
    return `
      <article class="commission-card tier-${c.tier}">
        <header><h4>${esc(c.title)}${c.custom ? '<span class="custom-badge">맞춤 의뢰</span>' : ''}</h4><span class="note">${esc(c.client)}</span></header>
        ${c.custom ? '<p class="note">맞춤 의뢰는 공작소의 제작 공방과 지상 틀 그림으로 직접 만들어야 납품할 수 있습니다.</p>' : ''}
        <p class="quote">“${esc(c.quote)}”</p>
        <ul class="rules">${c.rules.map((r) => `<li>${esc(ruleLabel(r))}</li>`).join('')}</ul>
        <dl class="facts">
          <div><dt>예산</dt><dd class="num">${c.budget}</dd></div>
          <div><dt>보상</dt><dd class="num">${c.challenge ? '점수 기록' : `최대 ${Math.round(c.reward * 1.2)}`}</dd></div>
          <div><dt>곡</dt><dd>${esc(track?.title ?? c.music)}</dd></div>
          <div><dt>무대</dt><dd>${esc(venue.label)}</dd></div>
          <div><dt>관람석</dt><dd>${esc(seat)}</dd></div>
          <div class="wide"><dt>날씨</dt><dd>${esc(weatherText(c))}</dd></div>
        </dl>
        ${c.challenge ? this.challengeAction(c.challenge) : i === -2 ? '<button type="button" class="primary" data-contest>대회 나가기</button>' : `<button type="button" class="primary" data-take="${i}">의뢰 받기</button>`}
      </article>`;
  }

  private challengeAction(week: string): string {
    const best = this.career.state.challenges[week];
    return `<p class="note">${best ? `내 최고 ${best.total}점 ${stars(best.stars)}` : '아직 도전하지 않았습니다.'}</p>
      <button type="button" class="primary" data-challenge>도전하기</button>`;
  }

  private async take(c: Commission): Promise<void> {
    const track = BASIC_TRACKS.find((t) => t.id === c.music) ?? BASIC_TRACKS[0];
    // 의뢰 무대의 바지선·다리·지상 틀로 시작한다 (그 무대에 없는 관람석이면 첫 관람석)
    const venue = VENUES[c.venue ?? 'river-bridge-city'] ?? VENUES['river-bridge-city'];
    const show = newShow(c.title, venue.id);
    show.music = trackRef(track);
    show.venue = { preset: venue.id, wind: c.wind, ...(c.cloud ? { cloud: c.cloud } : {}) };
    show.seat = { id: venue.seats[c.seat] ? c.seat : Object.keys(venue.seats)[0] };
    show.commission = c;
    // 이번 주 도전은 게시판의 의뢰가 아니라서 받아도 게시판이 그대로다.
    if (!c.challenge) this.career.take(c);
    const id = await this.host.saveNewShow(show);
    this.board.close();
    await this.host.openShow(id, show);
    if (!this.career.isUnlocked(this.editor.template.type)) this.editor.setTemplate({ type: 'chrysanthemum' });
    this.host.say(
      c.challenge
        ? '이번 주 도전을 시작했습니다. 아래 막대에서 예산과 조건을 확인하고, 다 만들면 「점수 기록」을 누르세요.'
        : `「${c.title}」 의뢰를 받았습니다. 아래 막대에서 예산과 조건을 확인하세요.`,
    );
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
          : `<button type="button" data-act="preview">미리 채점</button><button type="button" class="primary" data-act="deliver">${c.challenge ? '점수 기록' : '납품하기'}</button>`}
      </span>`;
    this.bar.querySelector('[data-act="preview"]')?.addEventListener('click', () => this.showResult(false));
    this.bar.querySelector('[data-act="deliver"]')?.addEventListener('click', () => this.showResult(true));
  }

  /** 의뢰 쇼를 끝까지 감상했을 때: 성적표 (미리 채점) */
  report(): void {
    if (this.editor.show.commission) this.showResult(false);
  }

  /** 채점 결과를 보여 준다. deliver면 확인을 받은 뒤 장부에 적는다. */
  private showResult(deliver: boolean): void {
    const c = this.editor.show.commission;
    if (!c) return;
    const r = scoreShow(this.editor.show, c);
    this.lastResult = r;
    const done = c.delivered;
    const body = this.result.querySelector('.result-body')!;
    const grade = gradeOf(r);
    // 최고 기록: 도전은 기록한 점수, 의뢰는 채점해 본 점수 가운데 가장 높은 것
    const prevBest = c.challenge ? this.career.state.challenges[c.challenge]?.total : this.career.state.bests?.[c.id];
    const record = !r.failed && prevBest !== undefined && r.total > prevBest;
    if (!c.challenge && !r.failed) this.career.noteBest(c.id, r.total);
    const head = r.failed
      ? `<p class="verdict fail"><span class="grade grade-F">F</span>의뢰 실패: ${esc(r.failReason ?? '')}</p>`
      : `<p class="verdict"><span class="grade grade-${grade}">${grade}</span><span class="stars big">${stars(r.stars)}</span><b class="num">${r.total}점</b>${record ? '<span class="record">최고 기록!</span>' : prevBest !== undefined ? `<span class="note">내 최고 ${prevBest}점</span>` : ''}</p>`;
    const m = showMoments(this.editor.show);
    const moments = [m.best && { ...m.best, kind: 'best', label: '가장 좋았던 순간' }, m.worst && { ...m.worst, kind: 'worst', label: '가장 아쉬웠던 순간' }].filter((x) => !!x);
    const best = c.challenge ? this.career.state.challenges[c.challenge] : undefined;
    const money = c.challenge
      ? best ? `지금까지 내 최고 ${best.total}점` : '이번 주 첫 기록'
      : r.failed ? '보상 없음, 평판 −5' : `보상 ${r.reward} · 평판 ${r.reputation >= 0 ? '+' : ''}${r.reputation}`;
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
      ${c.id === contestCommission().id && !r.failed
        ? `<ol class="ranking">${contestRanking(r.total).map((x, k) => `<li class="${x.mine ? 'mine' : ''}"><span class="num">${k + 1}위</span><span>${esc(x.team)}</span><span class="num">${x.total}점</span></li>`).join('')}</ol>`
        : ''}
      ${moments.length ? `<ul class="moments">${moments.map((x) => `<li class="${x.kind}"><span class="label">${x.label}</span><button type="button" data-seek="${x.t}">${esc(x.text)} ▸</button></li>`).join('')}</ul>` : ''}
      <ul class="rule-results">${r.rules.map((x) => `<li class="${x.ok ? 'ok' : 'no'}">${x.ok ? '✓' : '✗'} ${esc(x.label)}${x.detail ? ` <span class="note">${esc(x.detail)}</span>` : ''}</li>`).join('')}</ul>
      <p class="money">${c.challenge ? money : done ? `받은 보상 ${done.reward}` : deliver ? `납품하면: ${money}` : `지금 납품하면: ${money}`}</p>
      <div class="dialog-actions">
        ${deliver && !done ? `<button type="button" class="primary" data-act="confirm">${c.challenge ? '이 점수 기록하기' : '이대로 납품하기'}</button><button type="button" data-act="close">더 고치기</button>` : '<button type="button" data-act="close">닫기</button>'}
        <button type="button" data-act="watch">관객과 함께 감상하기</button>
        ${done && !c.challenge ? '<button type="button" data-act="next">다음 의뢰</button>' : ''}
        ${c.challenge && remoteEnabled() && !r.failed ? '<button type="button" data-act="upload">상영관 「이번 주 도전」에 올리기</button>' : ''}
      </div>
      ${c.challenge ? '<p class="note">도전은 몇 번이든 다시 낼 수 있고, 최고 점수만 남습니다.</p>' : deliver && !done ? '<p class="note">납품은 한 번만 할 수 있습니다. 납품한 뒤에도 쇼는 계속 고치고 공유할 수 있습니다.</p>' : ''}`;
    body.querySelector('[data-act="close"]')?.addEventListener('click', () => this.result.close());
    body.querySelector('[data-act="watch"]')?.addEventListener('click', () => {
      this.result.close();
      this.host.watch();
    });
    body.querySelector('[data-act="confirm"]')?.addEventListener('click', () => this.deliver());
    body.querySelector('[data-act="next"]')?.addEventListener('click', () => {
      this.result.close();
      this.openBoard();
    });
    body.querySelectorAll<HTMLButtonElement>('[data-seek]').forEach((b) =>
      b.addEventListener('click', () => {
        this.result.close();
        this.host.seek(Number(b.dataset.seek));
      }),
    );
    body.querySelector('[data-act="upload"]')?.addEventListener('click', () => void this.uploadChallenge());
    this.result.showModal();
  }

  /** 서버판: 도전 쇼를 상영관 「이번 주 도전」에 올린다 (좋아요 순으로 순위) */
  private async uploadChallenge(): Promise<void> {
    const c = this.editor.show.commission;
    if (!c?.challenge) return;
    if (!currentAuth()) {
      this.host.say('「계정」에서 로그인하면 상영관에 올릴 수 있습니다.');
      return;
    }
    try {
      const title = this.editor.show.title || c.title;
      await galleryUpload('show', title, await encodeShow(this.editor.show), c.challenge);
      this.host.say(`「${title}」을 상영관 「이번 주 도전」에 올렸습니다. 좋아요를 많이 받으면 순위가 올라갑니다.`);
    } catch (err) {
      this.host.say((err as Error).message);
    }
  }

  private deliver(): void {
    const c = this.editor.show.commission;
    const r = this.lastResult;
    if (!c || !r || c.delivered) return;
    if (c.challenge) {
      // 도전은 돈·평판 없이 점수만 남기고, 몇 번이든 다시 낸다.
      const rec = this.career.recordChallenge(c.challenge, r.failed ? 0 : r.total, r.failed ? 0 : r.stars);
      this.result.close();
      this.host.say(
        r.failed
          ? `조건을 지키지 못해 기록되지 않았습니다: ${r.failReason ?? ''}`
          : rec.improved
            ? `${r.total}점을 기록했습니다. 이번 주 내 최고 점수입니다!`
            : `${r.total}점. 이번 주 내 최고는 ${rec.best}점입니다.`,
      );
      if (!r.failed) progress.did('delivered');
      return;
    }
    const stageBefore = this.career.stage;
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
    const stage = this.career.stage;
    const rank = c.id === contestCommission().id && !r.failed ? contestRanking(r.total).findIndex((x) => x.mine) + 1 : 0;
    this.host.say(
      r.failed
        ? '의뢰에 실패했습니다. 평판이 조금 내려갔습니다. 게시판에 새 의뢰가 올라왔습니다.'
        : rank
          ? `한강 세계불꽃축제 대회: ${r.total}점으로 ${RIVALS.length + 1}팀 중 ${rank}위${rank === 1 ? '! 우승입니다!' : '.'}`
          : stage > stageBefore
            ? `「${STORY[stage].title}」 단계가 열렸습니다. ${STORY[stage].client}: “${STORY[stage].line}”`
            : `납품했습니다. ${stars(r.stars)} · 보상 ${r.reward} · 평판 +${r.reputation}. 게시판에 새 의뢰가 올라왔습니다.`,
    );
    progress.did('delivered');
  }
}
