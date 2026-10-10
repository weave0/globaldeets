const { expect, test } = require('@playwright/test');

const STORY = '/story/santa-ynez-pipeline/';
const KEY = 'globaldeets:saved-story:v1';
const STORY_ID = 'santa-ynez-pipeline';

test('saving the maintained record is an explicit on-device action and survives a page return', async ({ page }) => {
  await page.goto(STORY);
  const save = page.getByRole('button', { name: 'Save story on this device' });
  await expect(save).toBeEnabled();
  await expect(page.locator('#saved-story-status')).toContainText('No alerts or account');
  await save.click();
  await expect(page.getByRole('button', { name: 'Remove saved story' })).toBeEnabled();
  await expect(page.locator('#saved-story-status')).toContainText('Saved on this device');

  const stored = await page.evaluate(key => window.localStorage.getItem(key), KEY);
  const record = JSON.parse(stored);
  expect(Object.keys(record).sort()).toEqual(['id', 'version']);
  expect(record.id).toBe(STORY_ID);
  expect(record.version).toMatch(/^\d{4}-\d{2}-\d{2}\.\d{1,4}$/);

  await page.goto('/index.html');
  const saved = page.locator('#saved-story-panel');
  await expect(saved).toBeVisible();
  await expect(saved.getByRole('link', { name: 'Continue this record' }))
    .toHaveAttribute('href', STORY);
  await expect(saved).toContainText('does not receive alerts');

  await page.reload();
  await expect(saved).toBeVisible();
  await saved.getByRole('button', { name: 'Remove saved story' }).click();
  await expect(saved).toBeHidden();
  expect(await page.evaluate(key => window.localStorage.getItem(key), KEY)).toBe(null);
  await page.goto(STORY);
  await expect(page.getByRole('button', { name: 'Save story on this device' })).toBeEnabled();
});

test('two open pages stay in sync without a server account', async ({ context }) => {
  const home = await context.newPage();
  const story = await context.newPage();
  try {
    await home.goto('/index.html');
    await story.goto(STORY);
    await expect(home.locator('#saved-story-panel')).toBeHidden();
    await story.getByRole('button', { name: 'Save story on this device' }).click();
    await expect(home.locator('#saved-story-panel')).toBeVisible();
    await story.getByRole('button', { name: 'Remove saved story' }).click();
    await expect(home.locator('#saved-story-panel')).toBeHidden();
  } finally {
    await Promise.all([home.close(), story.close()]);
  }
});

test('an unrecognized or malicious saved entry cannot create a link', async ({ page }) => {
  await page.addInitScript(key => {
    window.localStorage.setItem(key, JSON.stringify({
      id: '<img src=x onerror=alert(1)>',
      version: 'javascript:alert(1)',
      url: 'javascript:alert(1)',
    }));
  }, KEY);
  await page.goto('/index.html');
  await expect(page.locator('#saved-story-panel')).toBeHidden();
  await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
  await page.goto(STORY);
  await expect(page.getByRole('button', { name: 'Save story on this device' })).toBeEnabled();
});

test('a previously saved version only compares to the loaded record, never promises an update alert', async ({ page }) => {
  await page.addInitScript(({ key, id }) => {
    window.localStorage.setItem(key, JSON.stringify({ id, version: '2026-08-01.1' }));
  }, { key: KEY, id: STORY_ID });
  await page.goto(STORY);
  await expect(page.getByRole('button', { name: 'Remove saved story' })).toBeVisible();
  const note = page.locator('#saved-story-status');
  await expect(note).toContainText('saved version 2026-08-01.1');
  await expect(note).toContainText('differs from the currently loaded record');
  await expect(note).toContainText('does not imply live monitoring');
  expect(JSON.parse(await page.evaluate(key => window.localStorage.getItem(key), KEY)).version)
    .toBe('2026-08-01.1');
});

test('blocked local storage degrades to an honest browser-bookmark option', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new Error('Storage denied for this browser'); },
    });
  });
  await page.goto(STORY);
  await expect(page.getByRole('button', { name: 'Saving unavailable' })).toBeDisabled();
  await expect(page.locator('#saved-story-status')).toContainText('Use a browser bookmark instead');
  await expect(page.getByRole('link', { name: /Read at Los Angeles Times/ }).first()).toBeVisible();
});

test('saved reading does not send click events or customer identifiers', async ({ page }) => {
  await page.goto(STORY);
  const save = page.getByRole('button', { name: 'Save story on this device' });
  await expect(save).toBeEnabled();
  const requests = [];
  page.on('request', req => {
    if (req.method() !== 'GET') requests.push(req.url());
  });
  await save.click();
  await expect(page.getByRole('button', { name: 'Remove saved story' })).toBeVisible();
  expect(requests).toEqual([]);
});
