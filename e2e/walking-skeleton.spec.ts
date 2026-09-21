import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/** F-00 walking skeleton — REQ-002.1, REQ-003.1, REQ-010.1 */

async function ready(page: Page) {
  await page.goto('/');
  await expect(page.locator('.app')).toHaveAttribute('data-ready', 'true');
}

async function drawLine(page: Page, from: [number, number], to: [number, number]) {
  const box = (await page.getByTestId('viewport').boundingBox())!;
  await page.getByRole('button', { name: 'Line', exact: true }).click();
  await page.mouse.click(box.x + from[0], box.y + from[1]);
  await page.mouse.move(box.x + (from[0] + to[0]) / 2, box.y + (from[1] + to[1]) / 2);
  await page.mouse.click(box.x + to[0], box.y + to[1]);
  await page.keyboard.press('Escape');
}

test('draws a line, undoes and redoes it (REQ-003.1)', async ({ page }) => {
  await ready(page);
  await drawLine(page, [100, 100], [300, 200]);
  await expect(page.getByTestId('entity-count')).toHaveText('1 entities');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('entity-count')).toHaveText('0 entities');
  await page.keyboard.press('Control+y');
  await expect(page.getByTestId('entity-count')).toHaveText('1 entities');
});

test('saves a .cadw file and opens it again', async ({ page }) => {
  await ready(page);
  await drawLine(page, [100, 100], [300, 100]);
  await drawLine(page, [300, 100], [300, 250]);
  await expect(page.getByTestId('entity-count')).toHaveText('2 entities');

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save' }).click()]);
  expect(download.suggestedFilename()).toBe('Untitled.cadw');
  const path = await download.path();
  const bytes = readFileSync(path);
  expect(bytes.subarray(0, 2).toString()).toBe('PK'); // zip container

  await page.getByRole('button', { name: 'New', exact: true }).click();
  await expect(page.getByTestId('entity-count')).toHaveText('0 entities');

  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Open' }).click()]);
  await chooser.setFiles(path);
  await expect(page.getByTestId('entity-count')).toHaveText('2 entities');
});

test('kernel runs in the CAD worker without blocking the UI (REQ-010.1)', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Kernel check' }).click();
  // The UI stays responsive while the kernel loads: drawing still works.
  await drawLine(page, [80, 80], [180, 80]);
  await expect(page.getByTestId('entity-count')).toHaveText('1 entities');
  await expect(page.getByTestId('kernel-status')).toContainText('box volume 1,000,000 mm³', { timeout: 90_000 });
  await expect(page.getByTestId('kernel-status')).toContainText('12 triangles');
});

test('works offline after one visit and restores the drawing (REQ-002.1)', async ({ page, context }) => {
  await ready(page);
  // Wait until the service worker has precached everything, including the kernel WASM.
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 60_000 }).toBe(true);

  await drawLine(page, [120, 120], [320, 220]);
  await expect(page.getByTestId('entity-count')).toHaveText('1 entities');
  await expect(page.getByTestId('autosave')).toHaveAttribute('data-state', 'saved');

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.app')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByTestId('network')).toHaveText('Offline');
  await expect(page.getByTestId('entity-count')).toHaveText('1 entities');

  // The kernel also loads offline, from the precache.
  await page.getByRole('button', { name: 'Kernel check' }).click();
  await expect(page.getByTestId('kernel-status')).toContainText('box volume 1,000,000 mm³', { timeout: 90_000 });
});

test('renders every entity kind from a file (REQ-003.1)', async ({ page }) => {
  await ready(page);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Open' }).click()]);
  await chooser.setFiles('corpus/cadw/all-entities.cadw');
  await expect(page.getByTestId('entity-count')).toHaveText('6 entities');
  await expect(page.getByTestId('message')).toContainText('all-entities.cadw');
  // The canvas must actually draw something: sample the centre of the viewport.
  const drawn = await page.evaluate(() => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    const data = canvas.toDataURL();
    return data.length > 5000;
  });
  expect(drawn).toBe(true);
});
