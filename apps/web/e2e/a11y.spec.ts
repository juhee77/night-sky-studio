// 접근성: 주요 화면을 axe-core(WCAG 2.1 A·AA)로 검사하고, 키보드만으로 주요 흐름이 되는지 본다.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function noViolations(page: Page, where: string): Promise<void> {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const found = r.violations.map((v) => `${where}: ${v.id} (${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')})`);
  expect(found).toEqual([]);
}

async function openAll(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('#intro-skip').click({ timeout: 15_000 });
  await page.locator('#help-btn').click();
  await page.locator('#help-open-all').click();
  await page.keyboard.press('Escape');
}

test('주요 화면에 접근성 위반이 없다', async ({ page }) => {
  await page.goto('/');
  await page.locator('#intro').waitFor({ timeout: 15_000 });
  await noViolations(page, '첫 방문');
  await page.locator('#intro-skip').click();
  await page.locator('#help-btn').click();
  await page.locator('#help-open-all').click();
  await page.keyboard.press('Escape');
  await page.locator('#edit-btn').click();
  await noViolations(page, '편집 화면');
  for (const [btn, dialog] of [['#workshop-btn', '#workshop-dialog'], ['#office-btn', '#board-dialog'], ['#site-btn', '#site-dialog'], ['#auto-btn', '#auto-dialog'], ['#share-btn', '#share-dialog'], ['#help-btn', '#help-dialog']]) {
    await page.locator(btn).click();
    await page.locator(dialog).waitFor();
    await page.waitForTimeout(300);
    await noViolations(page, dialog);
    await page.keyboard.press('Escape');
  }
  await page.locator('#workshop-btn').click();
  for (const tab of ['제작 공방', '작업대']) {
    await page.getByRole('tab', { name: tab }).click();
    await page.waitForTimeout(300);
    await noViolations(page, tab);
  }
});

test('상영관에 접근성 위반이 없다', async ({ page }) => {
  await openAll(page);
  await page.locator('#share-btn').click();
  await expect(page.locator('#share-link')).toHaveValue(/\/v\/#s=/);
  await page.goto(await page.locator('#share-link').inputValue());
  await expect(page.getByRole('button', { name: /쇼 보기/ })).toBeEnabled({ timeout: 15_000 });
  await noViolations(page, '상영관');
});

test('키보드만으로: 자동 연출을 열어 만들고, 버튼에서 Space는 그 버튼을 누른다', async ({ page }) => {
  await page.goto('/');
  // 첫 방문 카드는 「불꽃쇼 보기」에 초점이 있다 → Tab으로 「건너뛰고」, Enter
  await expect(page.locator('#intro-play')).toBeFocused({ timeout: 15_000 });
  await page.keyboard.press('Tab');
  await expect(page.locator('#intro-skip')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#intro')).toBeHidden();
  await page.locator('#auto-btn').focus();
  await page.keyboard.press('Space');
  await expect(page.locator('#auto-dialog')).toBeVisible();
  await page.locator('#auto-run').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#auto-dialog')).toBeHidden();
  // 재생 중이 아니어야 한다 (Space가 재생으로 새지 않음)
  await expect(page.locator('#play')).toHaveAttribute('aria-label', '재생');
});
