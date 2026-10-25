// 처음 쓰는 사람 안내: 처음 열면 네 걸음 시작 안내가 한 번 나오고, 「도움말」에서 다시 보거나 용어 사전을 연다.

const SEEN = 'nss:guided';

export interface Term {
  word: string;
  what: string;
  where: string;
}

/** 불꽃 만드는 사람의 용어 사전 (기획서와 같은 내용) */
export const GLOSSARY: Term[] = [
  { word: '바지선', what: '엔진 없이 바닥이 평평하고 넓은 짐배. 예인선이 끌어다 강이나 바다 위에 묶어 두고 갑판을 발사대로 쓴다. 관객과 거리를 두기 좋고, 불티가 물에 떨어지며, 수면에 불꽃이 비친다.', where: '시간표의 「바지선」 줄, 발사장' },
  { word: '알', what: '하늘로 쏘아 올려 터지는 불꽃 한 발. 종이 공이나 원통 안에 별과 할약을 채운 것.', where: '불꽃 한 발, 공작소의 제작 공방' },
  { word: '호', what: '알의 크기 단위. 1호가 지름 약 3cm, 10호는 약 30cm. 클수록 높이, 크게 터진다.', where: '크기 3·5·7·10호' },
  { word: '별', what: '알 안의 화약 알갱이. 하늘에서 빛나는 점 하나하나가 별 하나. 굴리거나 찍거나 잘라 만들고 잘 말려야 불이 붙는다.', where: '별 만들기, 배합실' },
  { word: '할약', what: '알 가운데에 채워 알을 터뜨리고 별을 사방으로 밀어내는 화약. 많으면 크게 퍼지지만 찌그러지기 쉽다.', where: '할약 양, 할약 붓기' },
  { word: '심', what: '바깥 별 안쪽에 넣는 작은 알. 터지면 가운데에 작은 원이 하나 더 핀다.', where: '심 넣기' },
  { word: '도화선', what: '발사할 때 불이 붙어 알이 꼭대기에 닿을 즈음 할약에 불을 옮기는 줄. 길이가 터지는 때를 정한다.', where: '도화선 길이' },
  { word: '발사약', what: '발사통 바닥에서 터져 알을 하늘로 밀어 올리는 화약. 모자라면 낮게 터진다.', where: '발사약 양' },
  { word: '상승 시간', what: '점화부터 꼭대기에서 터질 때까지 걸리는 시간. 그래서 박자보다 먼저 쏜다.', where: '시간표의 가는 선' },
  { word: '랙', what: '발사통 여러 개를 묶은 틀. 부채꼴 랙은 만들 때 통 각도를 고정한다. 큰 알은 모래 드럼에 묻은 단통을 쓴다.', where: '발사장 갑판' },
  { word: '장전', what: '쇼에서 쏠 알을 통에 넣는 일. 전자 점화 쇼는 한 통에 한 발만 넣고 쇼 중에 다시 넣지 않는다.', where: '장전 계획' },
  { word: '점화 모듈·핀', what: '통마다 연결한 전기 점화 장치. 정해진 시각에 핀에 전기를 보내 불을 붙인다.', where: '배선, 회로 점검' },
  { word: '발사 스크립트', what: '몇 초에 어느 모듈의 어느 핀을 쏠지 적은 표. 점화 장치가 이대로 쏜다.', where: 'CSV 내보내기' },
  { word: '허가 구역·척수', what: '바지선을 묶어 둘 수 있게 허가받은 물 위 구역과 띄울 수 있는 척수.', where: '평면도의 초록 칸, 실전 모드' },
  { word: '안전거리', what: '알 크기마다 관객과 떨어져야 하는 거리. 실제 규정은 나라와 행사마다 다르다.', where: '평면도의 점선 원 (게임용 근사)' },
  { word: '케이크', what: '작은 통 여러 개를 한 상자에 묶어 한 번 불붙이면 정해진 순서로 차례로 나가는 상품.', where: '케이크 상품' },
  { word: '나이아가라', what: '다리 같은 높은 곳에 줄지어 걸어 불티가 폭포처럼 흘러내리게 하는 불꽃.', where: '다리 줄' },
  { word: '틀불꽃', what: '물 위나 땅에 세운 틀에 가는 불꽃(심지)을 붙여 글자나 그림을 태워 보이는 불꽃.', where: '지상 틀 줄, 글자와 틀 그림' },
  { word: '카무로', what: '굵은 금빛 꼬리가 아주 길게 늘어지며 천천히 떨어지는 버들 불꽃.', where: '별 종류 「긴 버들 (카무로)」' },
];

interface Step {
  title: string;
  text: string;
  /** 이 걸음에서 눌러 볼 버튼 (없으면 설명만) */
  button?: { label: string; target: string };
}

const STEPS: Step[] = [
  { title: '곡 고르기', text: '위 막대의 「음악」에서 기본 곡이나 내 음악 파일을 고릅니다. 박자를 찾아 시간표에 눈금을 깔아 줍니다.' },
  { title: '자동 연출로 시작하기', text: '「자동 연출」을 누르면 곡의 구간과 박자에 맞춰 불꽃을 놓아 줍니다. 마음에 안 들면 다시 누르면 다른 쇼가 나옵니다.', button: { label: '자동 연출 열기', target: 'auto-btn' } },
  { title: '감상하기', text: '「감상」을 누르면 무대만 화면 가득, 처음부터 재생합니다. 시간표를 눌러 불꽃을 직접 더하고 고칠 수도 있습니다.' },
  { title: '링크로 보내기', text: '「공유」로 링크를 만들어 보내면 받는 사람이 설치 없이 바로 봅니다. 더 해 보고 싶으면 공작소에서 내 불꽃을 만들고, 발사장에서 바지선을 배치해 보세요.' },
];

export class Guide {
  private dialog: HTMLDialogElement;
  private glossary: HTMLDialogElement;
  private step = 0;

  constructor(dialog: HTMLDialogElement, glossary: HTMLDialogElement) {
    this.dialog = dialog;
    this.glossary = glossary;
    dialog.querySelector('#guide-next')!.addEventListener('click', () => this.go(this.step + 1));
    dialog.querySelector('#guide-prev')!.addEventListener('click', () => this.go(this.step - 1));
    dialog.querySelector('#guide-try')!.addEventListener('click', () => {
      const target = STEPS[this.step].button?.target;
      this.dialog.close();
      if (target) document.getElementById(target)?.click();
    });
    const search = glossary.querySelector<HTMLInputElement>('#glossary-search')!;
    search.addEventListener('input', () => this.renderGlossary(search.value.trim()));
  }

  /** 처음 연 브라우저면 시작 안내를 연다 */
  openIfNew(): void {
    let seen = false;
    try {
      seen = localStorage.getItem(SEEN) === '1';
    } catch {
      seen = true;
    }
    if (!seen) this.open();
  }

  open(): void {
    this.go(0);
    this.dialog.showModal();
    // 한 번 보여 주면 본 것으로 친다 (다음부터는 「도움말」에서)
    try {
      localStorage.setItem(SEEN, '1');
    } catch {
      // 저장하지 못하면 다음에 또 나온다.
    }
  }

  openGlossary(): void {
    (this.glossary.querySelector('#glossary-search') as HTMLInputElement).value = '';
    this.renderGlossary('');
    this.glossary.showModal();
  }

  private go(i: number): void {
    if (i >= STEPS.length) {
      this.dialog.close();
      return;
    }
    this.step = Math.max(0, i);
    const s = STEPS[this.step];
    this.dialog.querySelector('#guide-count')!.textContent = `${this.step + 1} / ${STEPS.length}`;
    this.dialog.querySelector('#guide-step-title')!.textContent = s.title;
    this.dialog.querySelector('#guide-text')!.textContent = s.text;
    const tryBtn = this.dialog.querySelector<HTMLButtonElement>('#guide-try')!;
    tryBtn.hidden = !s.button;
    tryBtn.textContent = s.button?.label ?? '';
    (this.dialog.querySelector('#guide-prev') as HTMLButtonElement).disabled = this.step === 0;
    this.dialog.querySelector('#guide-next')!.textContent = this.step === STEPS.length - 1 ? '시작하기' : '다음';
  }

  private renderGlossary(q: string): void {
    const list = GLOSSARY.filter((t) => !q || t.word.includes(q) || t.what.includes(q) || t.where.includes(q));
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    this.glossary.querySelector('#glossary-list')!.innerHTML = list.length
      ? list.map((t) => `<li><b>${esc(t.word)}</b><span>${esc(t.what)}</span><span class="note">앱에서는: ${esc(t.where)}</span></li>`).join('')
      : '<li class="note">찾는 말이 없습니다.</li>';
  }
}
