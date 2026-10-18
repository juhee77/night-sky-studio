// 새해 카운트다운: 화면 가운데 큰 숫자로 10부터 1까지 세고, 끝나면 쇼를 시작한다.

import type { Transport } from './transport.ts';

export function runCountdown(transport: Transport, onDone: () => void, from = 10): () => void {
  const el = document.createElement('div');
  el.className = 'countdown';
  el.setAttribute('role', 'timer');
  el.setAttribute('aria-live', 'assertive');
  document.body.append(el);
  let n = from;
  let timer = 0;
  const step = () => {
    if (n === 0) {
      el.remove();
      onDone();
      return;
    }
    el.textContent = String(n);
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
    transport.beep(n === 1);
    n--;
    timer = window.setTimeout(step, 1000);
  };
  step();
  // 중간에 그만두기
  return () => {
    clearTimeout(timer);
    el.remove();
  };
}
