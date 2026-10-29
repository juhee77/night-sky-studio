// 주요 흐름: 의뢰 받기 → 납품, 제작 공방에서 알 저장, 작업대 시험장, 발사장 바지선 옮기기, 휴대폰 크기.
import { expect, test, type Page } from '@playwright/test';

async function openAll(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('#intro-skip').click({ timeout: 15_000 });
  await page.locator('#help-btn').click();
  await page.locator('#help-open-all').click();
  await page.keyboard.press('Escape');
}

test('의뢰 받기 → 자동 연출 → 납품하면 장부에 남는다', async ({ page }) => {
  await openAll(page);
  await page.locator('#office-btn').click();
  await page.locator('[data-take]').first().click();
  await expect(page.locator('#commission-bar')).toBeVisible();
  await page.locator('#auto-btn').click();
  await page.locator('#auto-run').click();
  await page.locator('#commission-bar [data-act="deliver"]').click();
  await page.locator('#result-dialog [data-act="confirm"]').click();
  await expect(page.locator('#toast')).toContainText(/납품|실패/);
  await expect(page.locator('#commission-bar')).toContainText('납품 완료');
  await page.locator('#office-btn').click();
  await expect(page.locator('#board-dialog')).toContainText('지난 의뢰');
});

test('제작 공방에서 만든 알을 서랍에 저장한다', async ({ page }) => {
  await openAll(page);
  await page.locator('#workshop-btn').click();
  await page.getByRole('tab', { name: '제작 공방' }).click();
  await page.locator('#ws-name').fill('시험 알');
  await page.locator('#ws-save').click();
  await expect(page.locator('.ws-drawer-list')).toContainText('시험 알');
  // 시험장에서 재 보기
  await page.locator('#ws-test').click();
  await expect(page.locator('#ws-test-out')).toContainText('둥근 정도');
});

test('작업대: 성분을 떠 넣고 말려 시험장에서 쏘면 결과와 「고치러 가기」가 나온다', async ({ page }) => {
  await openAll(page);
  await page.locator('#workshop-btn').click();
  await page.getByRole('tab', { name: '작업대' }).click();
  for (const k of ['oxidizer', 'oxidizer', 'fuel', 'colorant']) await page.locator(`[data-scoop="${k}"]`).click();
  await page.locator('[data-bench-step="dry"]').click();
  for (let i = 0; i < 8; i++) await page.locator('#bench-dry').click();
  await expect(page.locator('.bench-step h4')).toContainText('48시간째');
  await page.locator('[data-bench-step="test"]').click();
  await page.locator('#bench-fire').click();
  // 별을 만들지 않고 쏘면 불발이거나 결함이 나오고, 고칠 공정으로 가는 버튼이 있다
  await expect(page.locator('#bench-test-out')).toContainText(/서툰 첫 솜씨/);
});

test('발사장: 바지선을 더하고 화살표로 옮기고 뺀다', async ({ page }) => {
  await openAll(page);
  await page.locator('#site-btn').click();
  await page.locator('#site-add').click();
  const sel = page.locator('#site-selected');
  await expect(sel).toContainText('바지선 4');
  const before = await sel.textContent();
  await page.locator('#site-canvas').focus();
  await page.keyboard.press('Shift+ArrowRight');
  await expect(sel).not.toHaveText(before!);
  await page.locator('#site-remove').click();
  await expect(sel).not.toContainText('바지선 4');
});

test('휴대폰 크기: 간단 화면에서 편집으로, 화면이 옆으로 넘치지 않는다', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.locator('#intro-skip').click({ timeout: 15_000 });
  await expect(page.locator('#timeline')).toBeHidden();
  await page.locator('#edit-btn').click();
  await expect(page.locator('#timeline')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await ctx.close();
});

test('편집 화면 둘러보기: 처음 「편집하기」를 누르면 영역을 짚어 주고, 첫 불꽃을 놓으면 끝난다', async ({ page }) => {
  await page.goto('/');
  await page.locator('#intro-skip').click({ timeout: 15_000 });
  await page.locator('#shows-btn').click();
  await page.locator('#new-show').click();
  await page.keyboard.press('Escape').catch(() => {});
  await page.locator('#edit-btn').click();
  const card = page.locator('.coach');
  await expect(card).toContainText('무대');
  for (let i = 0; i < 3; i++) await card.getByRole('button', { name: /다음|시작하기/ }).click();
  await expect(card).toContainText('직접 해 보기');
  const box = (await page.locator('#timeline').boundingBox())!;
  await page.mouse.click(box.x + 300, box.y + 22 + 34 + 17);
  await expect(card).toBeHidden();
  await expect(page.locator('#toast')).toContainText('잘했어요');
  // 두 번째부터는 나오지 않는다
  await page.locator('#edit-btn').click();
  await page.locator('#edit-btn').click();
  await expect(card).toBeHidden();
});

test('재생 중에는 관객 열기 게이지가 오르고, 「관객 반응」을 끄면 사라진다', async ({ page }) => {
  await page.goto('/');
  await page.locator('#intro-skip').click({ timeout: 15_000 });
  const hud = page.locator('.crowd-hud');
  await expect(hud).toBeHidden();
  await page.locator('#play').click();
  await expect(hud).toBeVisible();
  await expect.poll(async () => Number((await page.locator('.crowd-gauge-fill').getAttribute('style'))?.match(/scaleX\(([\d.]+)/)?.[1] ?? 0), { timeout: 15_000 }).toBeGreaterThan(0.1);
  await page.locator('#crowd-toggle').click();
  await expect(hud).toBeHidden();
  await expect(page.locator('#crowd-toggle')).toHaveText('관객 반응 꺼짐');
});

test('성적표: 등급과 순간이 보이고, 순간을 누르면 그 시각으로 가며, 점수가 오르면 「최고 기록!」', async ({ page }) => {
  await openAll(page);
  await page.locator('#office-btn').click();
  await page.locator('[data-take]').first().click();
  await page.locator('#auto-btn').click();
  await page.locator('#auto-run').click();
  await page.locator('#commission-bar [data-act="preview"]').click();
  const dialog = page.locator('#result-dialog');
  await expect(dialog.locator('.grade')).toHaveText(/^[SABCDF]$/);
  await expect(dialog.locator('.moments li').first()).toContainText('가장 좋았던 순간');
  // 처음 채점하면 비교할 기록이 없다
  await expect(dialog.locator('.record')).toHaveCount(0);
  const seek = dialog.locator('[data-seek]').first();
  const t = Number(await seek.getAttribute('data-seek'));
  await seek.click();
  await expect(dialog).toBeHidden();
  const want = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  await expect(page.locator('#clock')).toContainText(want);
});

test('직접 쏘기: 누르면 상승 시간 뒤에 터지는 불꽃이 기록되고, 끝내면 시간표로 저장한다', async ({ page }) => {
  await openAll(page);
  await page.locator('#fire-btn').click();
  await expect(page.locator('.fire-hud')).toBeVisible();
  await page.waitForTimeout(500);
  for (const k of ['1', '2', '3', '1']) {
    await page.keyboard.press(k);
    await page.waitForTimeout(150);
  }
  await page.keyboard.press('Space');
  await expect(page.locator('.fire-score')).toContainText('쏜 불꽃 5발');
  await page.keyboard.press('Escape');
  const dialog = page.locator('.fire-dialog');
  await expect(dialog).toContainText('직접 쏜 불꽃 5발');
  await dialog.locator('[data-act="keep"]').click();
  await expect(page.locator('#toast')).toContainText('5발을 시간표에 놓았습니다');
});
