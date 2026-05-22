const { test, expect } = require('@playwright/test');

const email = process.env.MOFACTS_SMOKE_EMAIL || 'admin@localhost.test';
const password = process.env.MOFACTS_SMOKE_PASSWORD;
const tdfId = process.env.MOFACTS_SMOKE_TDF_ID || 'sNbWrLfctLpQDrE4N';

if (!password) {
  throw new Error('Set MOFACTS_SMOKE_PASSWORD before running the audio smoke test.');
}

test('audio-enabled lesson launch reaches card and accepts a response', async ({ page, baseURL }) => {
  const rootUrl = baseURL || 'http://localhost:3200';
  await page.goto(rootUrl);

  const emailBox = page.locator('input[placeholder="name@example.com"]');
  await expect(emailBox).toBeVisible({ timeout: 15000 });
  await emailBox.fill(email);
  await page.locator('input[placeholder="Enter your password"]').fill(password);
  await page.getByRole('button', { name: /log in/i }).click();
  await expect(page.getByRole('heading', { name: /sign in/i })).toBeHidden({ timeout: 15000 });

  await page.goto(`${rootUrl}/learningDashboard`);
  const continueButton = page.locator(`button.continue-lesson[data-tdfid="${tdfId}"]`);
  await expect(continueButton).toBeVisible({ timeout: 30000 });
  await continueButton.click();

  await expect(page).toHaveURL(/\/card$/);
  await expect(page.locator('body')).not.toContainText('Audio features require a secure connection');

  await expect(page.locator('body')).toContainText('Say skip or answer', { timeout: 15000 });
  await expect(page.locator('body')).toContainText(/correct answer|Correct|Incorrect/i, { timeout: 30000 });
  await page.waitForTimeout(7000);
});
