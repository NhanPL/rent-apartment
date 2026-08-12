import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { loginBrowser } from './helpers';

const seriousViolations = async (page: Page) => {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return result.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      targets: violation.nodes.map((node) => node.target.join(' '))
    }));
};

const expectAccessible = async (page: Page) => {
  await page.addStyleTag({ content: '*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }' });
  await expect(page.locator('body')).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
};

test.describe('accessibility smoke', () => {
  test('public login meets WCAG A and AA critical checks', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expectAccessible(page);
  });

  test('manager operational pages meet critical accessibility checks', async ({ page }) => {
    await loginBrowser(page, 'e2e-manager');
    for (const path of ['/dashboard', '/invoices', '/imports', '/feature-flags']) {
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
      await expectAccessible(page);
    }
  });

  test('tenant room page meets critical accessibility checks', async ({ page }) => {
    await loginBrowser(page, 'e2e-available');
    await expect(page).toHaveURL(/\/my-room$/);
    await expectAccessible(page);
  });
});

test.describe('mobile accessibility smoke', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('login and dashboard remain accessible on mobile', async ({ page }) => {
    await page.goto('/login');
    await expectAccessible(page);
    await loginBrowser(page, 'e2e-manager');
    await page.goto('/dashboard');
    await expectAccessible(page);
  });
});
