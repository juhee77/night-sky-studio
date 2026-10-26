import { expect, test, type Page } from '@playwright/test';

/** 편집기를 열고, 처음 뜨는 예시 쇼 카드를 건너뛴다 */
async function open(page: Page): Promise<void> {
  await page.goto('/');
  const intro = page.locator('#intro');
  await expect(intro).toBeVisible({ timeout: 15_000 });
  await intro.getByRole('button', { name: /건너뛰고/ }).click();
  await expect(intro).toBeHidden();
}

test('첫 방문: 예시 쇼를 보고 나면 자동 연출로 이어 준다', async ({ page }) => {
  await page.goto('/');
  await page.locator('#intro-play').click({ timeout: 15_000 });
  await expect(page.locator('body')).toHaveClass(/watching/);
  await page.waitForTimeout(1500);
  expect(await page.locator('#clock').textContent()).not.toMatch(/^0:00\.00/);
  await page.locator('#watch-exit').click();
  await expect(page.locator('#intro-end')).toBeVisible();
  await page.locator('#intro-auto').click();
  await expect(page.locator('#auto-dialog')).toBeVisible();
  // 예시 쇼를 본 것은 단계별 열기의 「감상」으로 치지 않는다
  await expect(page.locator('#workshop-btn')).toBeHidden();
});

test('편집기가 열리고 무대와 시간표가 보이며, 첫 방문 카드는 한 번만 뜬다', async ({ page }) => {
  await open(page);
  await expect(page.locator('#stage')).toBeVisible();
  // 처음에는 간단 화면: 시간표는 「편집하기」를 눌러야 펼쳐진다
  await expect(page.locator('#timeline')).toBeHidden();
  await page.locator('#edit-btn').click();
  await expect(page.locator('#timeline')).toBeVisible();
  await expect(page.locator('#edit-btn')).toHaveText('간단히');
  expect(await page.evaluate(() => localStorage.getItem('nss:guided'))).toBe('1');
  await page.reload();
  await page.waitForTimeout(1500);
  await expect(page.locator('#intro')).toBeHidden();
  await expect(page.locator('#guide-dialog')).toBeHidden();
  // 고른 화면을 기억한다
  await expect(page.locator('#timeline')).toBeVisible();
});

test('자동 연출로 불꽃을 놓고 재생하면 시계가 간다', async ({ page }) => {
  await open(page);
  await page.locator('#auto-btn').click();
  await page.locator('[data-mood="romantic"]').click();
  await page.locator('#auto-run').click();
  await expect(page.locator('#toast')).toContainText(/불꽃|새로 열렸습니다/);
  await page.locator('#play').click();
  await page.waitForTimeout(2000);
  await page.locator('#play').click();
  const clock = await page.locator('#clock').inputValue().catch(async () => page.locator('#clock').textContent());
  expect(clock).not.toMatch(/^0:00\.00/);
});

test('공유 링크를 만들면 상영관에서 같은 쇼가 열린다', async ({ page }) => {
  await open(page);
  const title = await page.locator('#title').inputValue();
  await page.locator('#share-btn').click();
  await expect(page.locator('#share-link')).toHaveValue(/\/v\/#s=/);
  const link = await page.locator('#share-link').inputValue();
  await page.goto(link);
  await expect(page.locator('body')).toContainText(title || '불꽃쇼', { timeout: 15_000 });
  await expect(page.getByRole('button', { name: /쇼 보기/ })).toBeVisible();
});

test('공유 루프: 만든 사람이 보이고, 받은 쇼를 고쳐 다시 보내면 원작이 함께 간다', async ({ page }) => {
  await open(page);
  await page.locator('#share-btn').click();
  await page.locator('#share-author').fill('주희');
  await expect(page.locator('#share-link')).toHaveValue(/\/v\/#s=/);
  await page.waitForTimeout(500);
  const link = await page.locator('#share-link').inputValue();
  await page.goto(link);
  await expect(page.locator('#show-by')).toHaveText(/주희님이 만든 쇼/, { timeout: 15_000 });
  await page.getByRole('button', { name: /쇼 보기/ }).click();
  await expect(page.locator('#corner-make')).toBeVisible();
  await page.locator('#import').click();
  // 편집기: 받은 쇼 안내가 뜨고, 다시 공유하면 원작이 표시된다
  await expect(page.locator('#arrive')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#arrive-title')).toHaveText('받은 쇼를 가져왔습니다');
  await page.locator('#arrive-go').click();
  await expect(page.locator('#timeline')).toBeVisible();
  await page.locator('#share-btn').click();
  await expect(page.locator('#share-remix')).toContainText('주희님');
});

test('처음에는 꼭 필요한 버튼만 보이고, 할 일을 해내면 다음 기능이 열린다', async ({ page }) => {
  await open(page);
  await expect(page.locator('#workshop-btn')).toBeHidden();
  await expect(page.locator('#office-btn')).toBeHidden();
  const goal = page.locator('#goal-btn');
  await expect(goal).toContainText('자동 연출');
  await goal.click();
  await page.locator('[data-mood="romantic"]').click();
  await page.locator('#auto-run').click();
  await expect(page.locator('#toast')).toContainText('새로 열렸습니다');
  await expect(page.locator('#photo-btn')).toBeVisible();
  await expect(goal).toContainText('감상');
  await page.reload();
  await expect(page.locator('#photo-btn')).toBeVisible();
  await expect(page.locator('#workshop-btn')).toBeHidden();
});

test('공작소·발사장·도움말 창이 열리고 닫힌다', async ({ page }) => {
  await open(page);
  // 도움말에서 모든 기능을 연다
  await page.locator('#help-btn').click();
  await page.locator('#help-open-all').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#goal-btn')).toBeHidden();
  for (const [btn, dialog] of [['#workshop-btn', '#workshop-dialog'], ['#site-btn', '#site-dialog'], ['#help-btn', '#help-dialog']]) {
    await page.locator(btn).click();
    await expect(page.locator(dialog)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator(dialog)).toBeHidden();
  }
  // 공작소의 제작 공방 탭에서 알 단면이 그려진다
  await page.locator('#workshop-btn').click();
  await page.getByRole('tab', { name: '제작 공방' }).click();
  await expect(page.locator('#forge-section')).toBeVisible();
});
