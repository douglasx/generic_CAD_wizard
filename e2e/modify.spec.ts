import { expect, test, type Page } from '@playwright/test';

/** F-01 slice 6 — modify commands (REQ-003.6). */

type Ent = Record<string, unknown> & { kind: string; start?: number[]; end?: number[]; center?: number[]; radius?: number };
type Doc = { entities: Record<string, Ent>; order: string[] };
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
const scr = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => (window as unknown as { __cadw: Hook }).__cadw.toScreen(a!, b!), [x, y]);
const ents = async (page: Page) => {
  const d = await page.evaluate(() => (window as unknown as { __cadw: Hook }).__cadw.doc());
  return d.order.map((id) => d.entities[id]!);
};
async function clickAt(page: Page, x: number, y: number) {
  const [sx, sy] = await scr(page, x, y);
  await page.mouse.click(sx, sy);
}

async function scene(page: Page) {
  await ready(page);
  await type(page, 'L', '0,0', '100,0', '');
  await type(page, 'C', '200,0', '30');
}

test('select, then MOVE by typed points; one Ctrl+Z undoes it', async ({ page }) => {
  await scene(page);
  await clickAt(page, 50, 0);
  await type(page, 'M', '0,0', '@0,-80');
  let [l, c] = await ents(page);
  expect(l!.start).toEqual([0, -80, 0]);
  expect(c!.center).toEqual([200, 0, 0]); // not selected, not moved
  await expect(page.getByTestId('selection-count')).toHaveText('');
  await page.keyboard.press('Control+z');
  [l] = await ents(page);
  expect(l!.start).toEqual([0, 0, 0]);
});

test('MOVE first, then select with clicks (they accumulate) and Enter', async ({ page }) => {
  await scene(page);
  await type(page, 'M');
  await expect(page.getByTestId('command-prompt')).toHaveText('MOVE Select objects, then press Enter:');
  await clickAt(page, 50, 0);
  await clickAt(page, 230, 0);
  await expect(page.getByTestId('selection-count')).toHaveText('2 selected');
  await type(page, '', '0,0', '@10,10');
  const [l, c] = await ents(page);
  expect(l!.start).toEqual([10, 10, 0]);
  expect(c!.center).toEqual([210, 10, 0]);
});

test('COPY places several copies; Delete erases the selection', async ({ page }) => {
  await scene(page);
  await clickAt(page, 230, 0);
  await type(page, 'CO', '200,0', '@0,100', '@0,200', '');
  expect(await ents(page)).toHaveLength(4);
  await clickAt(page, 50, 0);
  await page.keyboard.press('Delete');
  const left = await ents(page);
  expect(left).toHaveLength(3);
  expect(left.every((e) => e.kind === 'circle')).toBe(true);
});

test('ERASE by window selection inside the command', async ({ page }) => {
  await scene(page);
  await type(page, 'E');
  const [ax, ay] = await scr(page, -20, -20);
  const [bx, by] = await scr(page, 120, 20);
  await page.mouse.move(ax, ay);
  await page.mouse.down();
  await page.mouse.move(bx, by, { steps: 6 });
  await page.mouse.up();
  await type(page, '');
  const left = await ents(page);
  expect(left.map((e) => e.kind)).toEqual(['circle']);
});
