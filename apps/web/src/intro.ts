// 첫 방문: 버튼보다 불꽃을 먼저. 처음 연 브라우저에는 무대 위에 「▶ 불꽃쇼 보기」 한 장만 띄우고,
// 예시 쇼를 감상으로 보여 준 뒤 「이런 쇼를 직접 만들어 볼까요?」로 자동 연출에 이어 준다.

const SEEN = 'nss:guided';
/** 상영관에서 받은 쇼를 가져왔을 때 상영관이 남기는 표시 */
const ARRIVED = 'nss:arrived';
export type Arrival = 'remix' | 'fresh';

const ARRIVAL_TEXT: Record<Arrival, { title: string; text: string; go: string }> = {
  remix: {
    title: '받은 쇼를 가져왔습니다',
    text: '「편집하기」로 불꽃을 더하거나 고친 뒤, 「공유」로 다시 보내 보세요. 원작 제목과 만든 사람이 함께 표시됩니다.',
    go: '편집하기',
  },
  fresh: {
    title: '같은 곡으로 새 쇼를 시작합니다',
    text: '무대와 곡은 받은 쇼와 같고 불꽃은 비어 있습니다. 「자동 연출」로 불꽃을 놓고 마음에 들 때까지 고쳐 보세요.',
    go: '자동 연출로 만들기',
  },
};

export interface IntroHost {
  /** 편집 화면 펴기 */
  edit(): void;
  /** 예시 쇼를 감상 화면으로 처음부터 튼다 (단계별 열기의 「감상」으로 치지 않는다) */
  watch(): void;
  auto(): void;
  guide(): void;
}

export class Intro {
  private card: HTMLElement;
  private end: HTMLElement;
  private arrive: HTMLElement;
  private arrival: Arrival = 'remix';
  /** 예시 쇼를 보는 중인지 (감상이 끝나면 끝 화면을 띄운다) */
  private playing = false;

  constructor(card: HTMLElement, end: HTMLElement, arrive: HTMLElement, host: IntroHost) {
    this.card = card;
    this.end = end;
    this.arrive = arrive;
    arrive.querySelector('#arrive-go')!.addEventListener('click', () => {
      this.arrive.hidden = true;
      if (this.arrival === 'remix') host.edit();
      else host.auto();
    });
    arrive.querySelector('#arrive-close')!.addEventListener('click', () => (this.arrive.hidden = true));
    card.querySelector('#intro-play')!.addEventListener('click', () => {
      this.card.hidden = true;
      this.playing = true;
      host.watch();
    });
    card.querySelector('#intro-skip')!.addEventListener('click', () => (this.card.hidden = true));
    end.querySelector('#intro-auto')!.addEventListener('click', () => {
      this.end.hidden = true;
      host.auto();
    });
    end.querySelector('#intro-look')!.addEventListener('click', () => (this.end.hidden = true));
    end.querySelector('#intro-guide')!.addEventListener('click', () => {
      this.end.hidden = true;
      host.guide();
    });
  }

  /** 처음 연 브라우저인지 (시작 안내를 본 적이 없음) */
  static isNew(): boolean {
    try {
      return localStorage.getItem(SEEN) !== '1';
    } catch {
      return false;
    }
  }

  open(): void {
    this.card.hidden = false;
    markSeen();
    this.card.querySelector<HTMLButtonElement>('#intro-play')!.focus();
  }

  /** 상영관에서 넘어왔는지 (한 번 읽으면 지운다) */
  static takeArrival(): Arrival | null {
    try {
      const v = localStorage.getItem(ARRIVED);
      localStorage.removeItem(ARRIVED);
      return v === 'remix' || v === 'fresh' ? v : null;
    } catch {
      return null;
    }
  }

  /** 받은 쇼를 가져온 사람에게: 무엇을 하면 되는지 한 장으로 */
  arrived(kind: Arrival): void {
    this.arrival = kind;
    const t = ARRIVAL_TEXT[kind];
    this.arrive.querySelector('#arrive-title')!.textContent = t.title;
    this.arrive.querySelector('#arrive-text')!.textContent = t.text;
    const go = this.arrive.querySelector<HTMLButtonElement>('#arrive-go')!;
    go.textContent = t.go;
    this.arrive.hidden = false;
    markSeen();
    go.focus();
  }

  /** 감상이 끝났다 (끝까지 봤거나 닫았다) */
  watched(): void {
    if (!this.playing) return;
    this.playing = false;
    this.end.hidden = false;
    this.end.querySelector<HTMLButtonElement>('#intro-auto')!.focus();
  }
}

/** 한 번 보여 주면 본 것으로 친다 (시작 안내는 「도움말」에서 다시 본다). */
function markSeen(): void {
  try {
    localStorage.setItem(SEEN, '1');
  } catch {
    // 저장하지 못하면 다음에 또 나온다.
  }
}
