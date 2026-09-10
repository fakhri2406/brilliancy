import { expect, test } from '@playwright/test';

test('the app shell loads, renders, and reports no errors', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  const response = await page.goto('/');

  expect(response, 'the preview server returned no response').not.toBeNull();
  expect(response?.status()).toBe(200);
  await expect(page.locator('#root main')).toBeAttached();
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
