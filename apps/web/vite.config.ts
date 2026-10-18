import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const page = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// 정적판은 GitHub Pages의 /night-sky-studio/ 아래에 올라간다.
// 편집기(index.html)와 상영관(v/index.html, 공유 링크로 여는 화면) 두 페이지를 만든다.
export default defineConfig(({ mode }) => ({
  base: mode === 'pages' ? '/night-sky-studio/' : '/',
  server: { host: true },
  build: {
    target: 'es2022',
    rollupOptions: { input: { editor: page('./index.html'), viewer: page('./v/index.html') } },
  },
}));
