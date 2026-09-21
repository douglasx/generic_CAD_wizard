import { expect, test, type Page } from '@playwright/test';

/** F-01 slice 8 — layers (REQ-003.8). */

type Ent = Record<string, unknown> & { kind: string; layer: string; style?: { color?: string } };
type Doc = { entities: Record<string, Ent>; order: string[]; layers: Record<string, { name: string; visible: boolean; locked: boolean; color: string; linetype: string; lineweightMm: number }>; currentLayer: string };
type Hook = { doc(): Doc; toScreen(x: number, y: number): [number, number]; selection(): string[] };

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
const doc = (page: Page) => page.evaluate(() => (window as unknown as { __cadw: Hook }).__cadw.doc());
const scr = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => (window as unknown as { __cadw: Hook }).__cadw.toScreen(a!, b!), [x, y]);
const layerByName = async (page: Page, name: string) => {
  const d = await doc(page);
  return Object.entries(d.layers).find(([, l]) => l.name === name);
};
/** Create a layer and give it a name. */
async function newLayer(page: Page, name: string) {
  await page.getByRole('button', { name: 'New layer' }).click();
  const input = page.getByLabel('Layer name');
  await input.fill(name);
  await input.press('Enter');
  await expect(page.locator(`tr[data-layer="${name}"]`)).toBeVisible();
}

test('create, rename and make a layer current; new objects go on it', async ({ page }) => {
  await ready(page);
  await newLayer(page, 'Stiffeners');
  await page.getByLabel('Make Stiffeners current').check();
  await expect(page.getByTestId('current-layer')).toHaveText('Layer: Stiffeners');
  await page.locator('canvas').click({ position: { x: 5, y: 5 } }); // back to the drawing
  await page.keyboard.press('Escape');
  await type(page, 'L', '0,0', '100,0', '');
  const d = await doc(page);
  const [id] = (await layerByName(page, 'Stiffeners'))!;
  expect(d.entities[d.order[0]!]!.layer).toBe(id);
  await expect(page.locator('tr[data-layer="Stiffeners"] .count')).toHaveText('1');
});

test('hiding a layer hides its objects from selection; locking refuses edits', async ({ page }) => {
  await ready(page);
  await type(page, 'L', '0,0', '100,0', '');
  await page.getByLabel('0 locked').check();
  await page.locator('canvas').click({ position: { x: 5, y: 5 } });
  await type(page, 'L', '0,50', '100,50', '');
  await expect(page.getByTestId('command-log')).toContainText('locked');
  expect((await doc(page)).order).toHaveLength(1);
  await page.getByLabel('0 locked').uncheck();
  await page.getByLabel('0 visible').uncheck();
  const [sx, sy] = await scr(page, 50, 0);
  await page.mouse.click(sx, sy);
  expect(await page.evaluate(() => (window as unknown as { __cadw: Hook }).__cadw.selection())).toEqual([]);
});

test('move the selection to another layer, override its colour; one undo each', async ({ page }) => {
  await ready(page);
  await type(page, 'C', '0,0', '40');
  await newLayer(page, 'Holes');
  const [sx, sy] = await scr(page, 40, 0);
  await page.mouse.click(sx, sy);
  const [holesId] = (await layerByName(page, 'Holes'))!;
  await page.getByLabel('Selection layer').selectOption(holesId);
  let d = await doc(page);
  expect(d.entities[d.order[0]!]!.layer).toBe(holesId);
  await page.getByTestId('properties').getByLabel('ByLayer').uncheck();
  d = await doc(page);
  expect(d.entities[d.order[0]!]!.style?.color).toBe('#ffffff');
  await page.locator('canvas').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  d = await doc(page);
  expect(d.entities[d.order[0]!]!.layer).toBe('0');
});

test('layer colour, lineweight and linetype; delete only an empty layer', async ({ page }) => {
  await ready(page);
  await newLayer(page, 'Hidden lines');
  await page.getByLabel('Hidden lines linetype').selectOption('hidden');
  await page.getByLabel('Hidden lines lineweight').selectOption('0.5');
  const [, l] = (await layerByName(page, 'Hidden lines'))!;
  expect(l).toMatchObject({ linetype: 'hidden', lineweightMm: 0.5 });
  await expect(page.getByLabel('Delete 0')).toBeDisabled();
  await page.getByLabel('Delete Hidden lines').click();
  expect(await layerByName(page, 'Hidden lines')).toBeUndefined();
});

test('LA on the command line toggles the panel', async ({ page }) => {
  await ready(page);
  await expect(page.getByTestId('layers-table')).toBeVisible();
  await type(page, 'LA');
  await expect(page.getByTestId('layers-table')).toBeHidden();
  await type(page, 'LAYER');
  await expect(page.getByTestId('layers-table')).toBeVisible();
});
