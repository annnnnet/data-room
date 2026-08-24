import { test, expect } from '@playwright/test';

/**
 * End-to-end smoke test: owner signs in, creates a data room, creates a
 * folder, uploads a PDF, shares that folder by link, and a stranger opening
 * the link in a fresh browser context sees the file read-only.
 *
 * A couple of selectors differ from the brief's sketch to match how the app
 * actually implements sharing:
 *  - The "New folder" dialog's field is labelled "Name" (id="new-folder-name"),
 *    not "Folder name".
 *  - There is no per-row "Share" menu item — the row's kebab menu only has
 *    Rename/Move/Delete. Sharing is a toolbar-level action that shares the
 *    folder currently being viewed (its contents inherit access), so the
 *    test opens Share from the toolbar while inside the "Financials" folder.
 */
test('owner creates, uploads, shares; recipient sees read-only', async ({ page, browser }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(process.env.E2E_EMAIL!);
  await page.getByLabel('Password').fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Let the home page's initial `GET /api/data-rooms` (fired on mount, once
  // `user` becomes truthy) settle before creating anything. There is a real
  // race here worth flagging: TanStack Query's `invalidateQueries` after the
  // create-room mutation dedupes onto that same in-flight mount fetch rather
  // than firing a fresh request, so a room created while the mount fetch is
  // still pending silently fails to appear until something else (e.g. a
  // reload) re-triggers the query. See the task report for details/repro —
  // waiting here is a synchronization fix for the test, not a workaround for
  // the underlying bug, and does not touch application source.
  await page.waitForLoadState('networkidle');

  // Both the header button and the empty-state's own CTA share this
  // accessible name when the account has no rooms yet — the header one is
  // the stable target.
  await page.getByRole('button', { name: 'New data room' }).first().click();
  await page.getByLabel('Name').fill('E2E Acquisition');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('link', { name: 'E2E Acquisition' }).click();

  await page.waitForLoadState('networkidle');

  await page.getByRole('button', { name: 'New folder' }).click();
  await page.getByLabel('Name').fill('Financials');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('cell', { name: 'Financials', exact: true })).toBeVisible();

  // Enter the folder so the upload and the share both target it.
  await page.getByRole('link', { name: 'Financials' }).click();
  await page.waitForLoadState('networkidle');

  // Two `input[type=file]` elements exist (the dropzone's hidden input and
  // the toolbar Upload button's) — `.first()` avoids Playwright's strict-mode
  // violation on the brief's plain selector.
  await page.locator('input[type=file]').first().setInputFiles('e2e/fixtures/sample.pdf');
  await expect(page.getByRole('cell', { name: 'sample.pdf', exact: true })).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Share' }).click();
  await page.getByRole('button', { name: 'Create link' }).click();
  const link = await page.getByLabel('Share link').inputValue();
  expect(link).toContain('/s/');

  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  await guestPage.goto(link);
  await expect(guestPage.getByText('sample.pdf')).toBeVisible();
  await expect(guestPage.getByRole('button', { name: 'Upload' })).toHaveCount(0);
  await expect(guestPage.getByRole('button', { name: 'New folder' })).toHaveCount(0);
  await guest.close();
});
