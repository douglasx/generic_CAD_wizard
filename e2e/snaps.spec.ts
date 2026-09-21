import { expect, test, type Page } from '@playwright/test';

/** F-01 slice 4 — object snaps, ortho, grid (REQ-003.3, REQ-003.4). */

type Ent = Record<string, unknown> & { kind: string; start?: number[]; end?: number[] };
type Doc = { entities: Record<string, Ent>; order: string[] };
type Hook = { doc(): Doc; toScreen(x: number, y: number): [number, number] };

async function ready(page: Page) {
  await page.goto('/');
  await expect(page.locator('.app')).toHaveAttribute('data-ready', 'true');
}
async function type(page: Page, ...entries: string[]) {
  for (const e of entries) {
    if (e) await page.keyboard.type(e);
    await page.keyboard.press('Enter');
  }
}
const screen = (page: Page, x: number, y: number) =>
  page.evaluate(([a, b]) => (window as unknown as { __cadw: Hook }).__cadw.toScreen(a!, b!), [x, y]);
const entities = async (page: Page) => {
  const d = await page.evaluate(() => (window as unknown as { __cadw: Hook }).__cadw.doc());
  return d.order.map((id) => d.entities[id]!);
};
/** Move the mouse to a model point plus a pixel offset. */
async function hover(page: Page, x: number, y: number, dx = 0, dy = 0) {
  const [sx, sy] = await screen(page, x, y);
  await page.mouse.move(sx + dx, sy + dy);
}

test('endpoint snap: a click near a line end lands exactly on it, with a marker label', async ({ page }) => {
  await ready(page);
  await type(page, 'L', '0,0', '150,0', '');
  await type(page, 'L');
  await hover(page, 150, 0, 4, -3);
  await expect(page.getByTestId('snap-kind')).toHaveText('Endpoint');
  await page.mouse.down();
  await page.mouse.up();
  await type(page, '@0,80', '');
  const second = (await entities(page))[1]!;
  expect(second.start).toEqual([150, 0, 0]);
});

test('intersection and centre snaps', async ({ page }) => {
  await ready(page);
  await type(page, 'L', '-100,-100', '100,100', '');
  await type(page, 'L', '-100,100', '100,-100', '');
  await type(page, 'C', '200,0', '40');
  // Snap markers show while a tool is active (idle hover shows grips instead, as in AutoCAD).
  await type(page, 'L');
  await hover(page, 0, 0, 3, 2);
  await expect(page.getByTestId('snap-kind')).toHaveText('Intersection');
  await hover(page, 200, 0, 2, 2);
  await expect(page.getByTestId('snap-kind')).toHaveText('Center');
});

test('perpendicular from the base point, while drawing a line', async ({ page }) => {
  await ready(page);
  await type(page, 'L', '0,0', '200,0', '');
  await type(page, 'L', '60,90');
  await hover(page, 60, 0, 3, 3);
  await expect(page.getByTestId('snap-kind')).toHaveText('Perpendicular');
  await page.mouse.down();
  await page.mouse.up();
  await page.keyboard.press('Enter');
  expect((await entities(page))[1]!.end).toEqual([60, 0, 0]);
});

test('F8 ortho forces horizontal/vertical; F3 turns snaps off; F9 snaps to the grid', async ({ page }) => {
  await ready(page);
  await page.keyboard.press('F8');
  await expect(page.getByRole('button', { name: 'ORTHO' })).toHaveAttribute('aria-pressed', 'true');
  await type(page, 'L', '0,0');
  await hover(page, 120, 17);
  await page.mouse.down();
  await page.mouse.up();
  await page.keyboard.press('Enter');
  const [l] = await entities(page);
  expect(l!.end![1]).toBe(0);
  expect(l!.end![0]).toBeGreaterThan(100);

  await page.keyboard.press('F8');
  await page.keyboard.press('F3');
  await page.keyboard.press('F9');
  await expect(page.getByRole('button', { name: 'OSNAP' })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: 'GRID' })).toHaveAttribute('aria-pressed', 'true');
  await type(page, 'L');
  await hover(page, 33.4, 47.1);
  await page.mouse.down();
  await page.mouse.up();
  await type(page, '@10,0', '');
  expect((await entities(page))[1]!.start).toEqual([30, 50, 0]);
});

test('turning a snap kind off in the settings menu disables it', async ({ page }) => {
  await ready(page);
  await type(page, 'L', '0,0', '150,0', '');
  await page.getByRole('button', { name: 'Object snap settings' }).click();
  await page.getByRole('group', { name: 'Object snaps' }).getByLabel('Endpoint').uncheck();
  await page.getByRole('button', { name: 'Object snap settings' }).click();
  await type(page, 'L');
  await hover(page, 150, 0, 3, -2);
  await expect(page.getByTestId('snap-kind')).toHaveText('');
});

test('snap settings persist across reloads', async ({ page }) => {
  await ready(page);
  await page.keyboard.press('F8');
  await expect(page.getByRole('button', { name: 'ORTHO' })).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(300);
  await page.reload();
  await expect(page.locator('.app')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByRole('button', { name: 'ORTHO' })).toHaveAttribute('aria-pressed', 'true');
});
