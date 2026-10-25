// 첫 방문: 버튼보다 불꽃을 먼저. 처음 연 브라우저에는 무대 위에 「▶ 불꽃쇼 보기」 한 장만 띄우고,
// 예시 쇼를 감상으로 보여 준 뒤 「이런 쇼를 직접 만들어 볼까요?」로 자동 연출에 이어 준다.

const SEEN = 'nss:guided';

export interface IntroHost {
  /** 예시 쇼를 감상 화면으로 처음부터 튼다 (단계별 열기의 「감상」으로 치지 않는다) */
  watch(): void;
  auto(): void;
  guide(): void;
}

export class Intro {
  private card: HTMLElement;
  private end: HTMLElement;
  /** 예시 쇼를 보는 중인지 (감상이 끝나면 끝 화면을 띄운다) */
  private playing = false;

  constructor(card: HTMLElement, end: HTMLElement, host: IntroHost) {
    this.card = card;
    this.end = end;
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
    // 한 번 보여 주면 본 것으로 친다 (시작 안내는 「도움말」에서 다시 본다).
    try {
      localStorage.setItem(SEEN, '1');
    } catch {
      // 저장하지 못하면 다음에 또 나온다.
    }
    this.card.querySelector<HTMLButtonElement>('#intro-play')!.focus();
  }

  /** 감상이 끝났다 (끝까지 봤거나 닫았다) */
  watched(): void {
    if (!this.playing) return;
    this.playing = false;
    this.end.hidden = false;
    this.end.querySelector<HTMLButtonElement>('#intro-auto')!.focus();
  }
}
