// 오프라인·설치(PWA): 빌드한 정적판에서만 service worker를 등록한다.
// 새 버전을 받으면 아래에 「새 버전이 있습니다 · 새로고침」을 띄우고, 누르면 바꾸고 다시 연다.

export function registerPwa(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  let asked = false;
  // 사용자가 새로고침을 눌렀을 때만 다시 연다 (처음 설치할 때는 그대로).
  navigator.serviceWorker.addEventListener('controllerchange', () => asked && location.reload());
  const offer = (worker: ServiceWorker) =>
    showUpdate(() => {
      asked = true;
      worker.postMessage('skip-waiting');
    });
  navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`)
    .then((reg) => {
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => w.state === 'installed' && navigator.serviceWorker.controller && offer(w));
      });
    })
    .catch(() => {
      // 등록하지 못해도 온라인에서는 그대로 쓴다.
    });
}

function showUpdate(apply: () => void): void {
  if (document.getElementById('pwa-update')) return;
  const bar = document.createElement('div');
  bar.id = 'pwa-update';
  bar.setAttribute('role', 'status');
  bar.style.cssText =
    'position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 16px);transform:translateX(-50%);z-index:50;display:flex;gap:10px;align-items:center;padding:8px 10px 8px 16px;border-radius:12px;background:#1d2045;border:1px solid rgba(255,255,255,0.14);color:#eceaf6;font-size:14px;box-shadow:0 6px 18px rgba(0,0,0,0.4)';
  bar.innerHTML = '<span>새 버전이 있습니다</span><button type="button" style="background:#fb923c;color:#1a0d03;border:0;border-radius:8px;padding:6px 12px;font-weight:700;cursor:pointer">새로고침</button>';
  bar.querySelector('button')!.addEventListener('click', apply);
  document.body.append(bar);
}
