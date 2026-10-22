// 화면 자동 테스트: 개발 서버를 띄우고 진짜 브라우저(Chromium)로 주요 흐름을 눌러 본다.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './apps/web/e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://127.0.0.1:5180',
    viewport: { width: 1280, height: 800 },
    // 화면 카드가 없는 CI에서도 WebGL2가 돌게 소프트웨어 렌더러를 쓴다
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: {
    command: 'npm run dev -w @nss/web -- --port 5180 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:5180',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
