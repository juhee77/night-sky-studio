import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const page = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/** public 폴더에서 그대로 옮겨지는, 오프라인에도 필요한 파일 */
const PUBLIC_FILES = ['manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-64.png'];

/**
 * 오프라인(PWA): 빌드한 파일 목록으로 service worker(sw.js)를 만든다.
 * 파일 이름에 내용 지문이 들어 있어서, 바뀐 것이 있으면 버전도 바뀌고 새 버전 안내가 뜬다.
 */
function serviceWorker(): Plugin {
  return {
    name: 'nss-service-worker',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const built = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      // 미리 받아 두는 것은 첫 화면(편집기·상영관)이 바로 쓰는 것만. 처음 열 때 받는 창·지도·영상은 쓸 때 저장한다.
      const first = new Set<string>();
      const visit = (name: string) => {
        const c = bundle[name];
        if (!c || first.has(name)) return;
        first.add(name);
        if (c.type !== 'chunk') return;
        for (const css of c.viteMetadata?.importedCss ?? []) first.add(css);
        for (const dep of c.imports) visit(dep);
      };
      for (const [name, c] of Object.entries(bundle)) if (c.type === 'chunk' && c.isEntry) visit(name);
      const files = ['./', 'v/', ...PUBLIC_FILES, ...built.filter((f) => first.has(f) || f.endsWith('.html'))];
      // 빌드한 파일 이름(내용 지문)과 이 service worker 코드가 바뀌면 버전이 바뀐다.
      const version = createHash('sha1').update(built.sort().join('|') + SW_TEMPLATE).digest('hex').slice(0, 10);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: SW_TEMPLATE.replace('__VERSION__', version).replace('__FILES__', JSON.stringify(files)) });
    },
  };
}

// 화면은 그물망 먼저(새 것), 없으면 저장해 둔 것. 나머지 파일·글꼴은 저장해 둔 것 먼저.
// 서버판 API와 지도 타일은 건드리지 않는다. 새 버전은 사용자가 「새로고침」을 누를 때 바꾼다.
const SW_TEMPLATE = `// 밤하늘 연출실 오프라인 (빌드할 때 만들어짐)
const CACHE = 'nss-__VERSION__';
const FILES = __FILES__;
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES))));
self.addEventListener('activate', (e) =>
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('nss-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())),
);
self.addEventListener('message', (e) => e.data === 'skip-waiting' && self.skipWaiting());
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const font = url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com';
  if (url.origin !== location.origin && !font) return;
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(async () => (await caches.match(req, { ignoreSearch: true, ignoreVary: true })) || caches.match(url.pathname.includes('/v/') ? 'v/' : './', { ignoreVary: true })),
    );
    return;
  }
  e.respondWith(
    // 미리 받아 둔 것과 화면이 부른 것은 머리글(Origin)이 달라, Vary는 보지 않고 찾는다.
    caches.match(req, { ignoreVary: true }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok || res.type === 'opaque') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
`;

// 정적판은 GitHub Pages의 /night-sky-studio/ 아래에 올라간다.
// 편집기(index.html)와 상영관(v/index.html, 공유 링크로 여는 화면) 두 페이지를 만든다.
export default defineConfig(({ mode }) => ({
  base: mode === 'pages' ? '/night-sky-studio/' : '/',
  server: { host: true },
  // 지도(MapLibre)는 자기 파일 옆의 작업자(worker) 파일을 찾으므로 미리 묶지 않는다.
  optimizeDeps: { exclude: ['maplibre-gl'] },
  plugins: [serviceWorker()],
  build: {
    target: 'es2022',
    // 1MB가 넘는 것은 지도(MapLibre) 하나뿐이고, 지도 무대를 열 때만 받는다.
    chunkSizeWarningLimit: 1100,
    rollupOptions: { input: { editor: page('./index.html'), viewer: page('./v/index.html') } },
  },
}));
