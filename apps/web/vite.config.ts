import { defineConfig } from 'vite';

// 정적판은 GitHub Pages의 /night-sky-studio/ 아래에 올라간다.
export default defineConfig(({ mode }) => ({
  base: mode === 'pages' ? '/night-sky-studio/' : '/',
  server: { host: true },
  build: { target: 'es2022' },
}));
