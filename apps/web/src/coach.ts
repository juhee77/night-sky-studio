// 편집 화면 둘러보기: 처음 「편집하기」를 누르면 무대·시간표·설정 칸을 차례로 짚어 주고,
// 마지막에는 시간표에 첫 불꽃을 직접 놓아 보게 한다 (놓으면 저절로 다음으로).

const SEEN = 'nss:coached';

interface Step {
  /** 짚을 곳 */
  target: string;
  title: string;
  text: string;
  /** 이 일을 해내면 다음으로 (없으면 「다음」 버튼) */
  waitFor?: 'cue';
}

const STEPS: Step[] = [
  { target: '#stage', title: '무대', text: '불꽃이 터지는 밤하늘입니다. 재생 중에 누르면 가까운 바지선에서 지금 시각에 불꽃을 놓습니다.' },
  { target: '.timeline-scroll', title: '시간표', text: '줄마다 발사 위치(바지선·다리·지상 틀), 가로는 시간입니다. 세로 눈금은 음악의 박이라 불꽃이 박에 붙습니다.' },
  { target: '#panel', title: '설정 칸', text: '새로 놓을 불꽃의 종류·크기·색을 고릅니다. 시간표에서 불꽃을 누르면 여기서 그 불꽃을 고칩니다.' },
  { target: '.timeline-scroll', title: '직접 해 보기', text: '「바지선 1」 줄의 빈 곳을 눌러 첫 불꽃을 놓아 보세요.', waitFor: 'cue' },
];

export class Coach {
  private card: HTMLElement;
  private step = -1;
  private cueCount: () => number;
  private say: (message: string) => void;

  constructor(cueCount: () => number, say: (message: string) => void) {
    this.cueCount = cueCount;
    this.say = say;
    this.card = document.createElement('div');
    this.card.className = 'coach';
    this.card.setAttribute('role', 'dialog');
    this.card.setAttribute('aria-live', 'polite');
    this.card.hidden = true;
    document.body.append(this.card);
    window.addEventListener('resize', () => this.place());
  }

  /** 처음 편집 화면을 펼친 사람인지 */
  static isNew(): boolean {
    try {
      return localStorage.getItem(SEEN) !== '1';
    } catch {
      return false;
    }
  }

  start(): void {
    try {
      localStorage.setItem(SEEN, '1');
    } catch {
      // 기억하지 못하면 다음에 또 보여 준다.
    }
    this.go(0);
  }

  /** 쇼가 바뀌었다: 첫 불꽃을 기다리는 걸음이면 놓였는지 본다 */
  showChanged(): void {
    const s = STEPS[this.step];
    if (s?.waitFor === 'cue' && this.cueCount() > this.startCount) this.finish('잘했어요! ▶ 재생으로 들어 보고, 불꽃을 끌어 옮기거나 눌러 고쳐 보세요.');
  }

  private startCount = 0;

  private go(i: number): void {
    if (i >= STEPS.length) return this.finish();
    this.step = i;
    const s = STEPS[i];
    if (s.waitFor === 'cue') this.startCount = this.cueCount();
    this.card.innerHTML = `
      <p class="coach-count">${i + 1} / ${STEPS.length}</p>
      <h3>${s.title}</h3>
      <p>${s.text}</p>
      <div class="coach-actions">
        <button type="button" data-coach="skip" class="quiet">그만 보기</button>
        ${s.waitFor ? '' : `<button type="button" data-coach="next" class="primary">${i === STEPS.length - 1 ? '시작하기' : '다음'}</button>`}
      </div>`;
    this.card.querySelector('[data-coach="skip"]')!.addEventListener('click', () => this.finish());
    this.card.querySelector('[data-coach="next"]')?.addEventListener('click', () => this.go(i + 1));
    this.card.hidden = false;
    this.place();
    this.card.querySelector<HTMLButtonElement>('[data-coach="next"], [data-coach="skip"]')?.focus();
  }

  private finish(message?: string): void {
    this.step = -1;
    this.card.hidden = true;
    document.querySelectorAll('.coach-target').forEach((e) => e.classList.remove('coach-target'));
    if (message) this.say(message);
  }

  /** 짚을 곳을 테두리로 밝히고, 카드를 그 옆(위나 아래)에 둔다 */
  private place(): void {
    const s = STEPS[this.step];
    if (!s) return;
    document.querySelectorAll('.coach-target').forEach((e) => e.classList.remove('coach-target'));
    const t = document.querySelector<HTMLElement>(s.target);
    if (!t) return;
    t.classList.add('coach-target');
    const r = t.getBoundingClientRect();
    const card = this.card.getBoundingClientRect();
    const below = r.bottom + card.height + 16 < window.innerHeight;
    const top = below ? r.bottom + 10 : Math.max(10, r.top - card.height - 10);
    const left = Math.min(window.innerWidth - card.width - 10, Math.max(10, r.left + r.width / 2 - card.width / 2));
    this.card.style.top = `${Math.round(top)}px`;
    this.card.style.left = `${Math.round(left)}px`;
  }
}
