import { expect, test, type Page } from '@playwright/test';

/** F-01 slice 5 — selection and grips (REQ-003.5, REQ-003.7). */

type Ent = Record<string, unknown> & { kind: string; start?: number[]; end?: number[]; radius?: number };
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
const hook = <T,>(page: Page, fn: (h: Hook) => T) => page.evaluate(fn as never) as Promise<T>;
const scr = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => (window as unknown as { __cadw: Hook }).__cadw.toScreen(a!, b!), [x, y]);
const doc = (page: Page) => page.evaluate(() => (window as unknown as { __cadw: Hook }).__cadw.doc());
const selected = (page: Page) => page.evaluate(() => (window as unknown as { __cadw: Hook }).__cadw.selection());
async function clickAt(page: Page, x: number, y: number, modifiers: ('Shift')[] = []) {
  const [sx, sy] = await scr(page, x, y);
  // page.mouse.click ignores `modifiers`; hold the key on the keyboard instead.
  for (const m of modifiers) await page.keyboard.down(m);
  await page.mouse.click(sx, sy);
  for (const m of modifiers) await page.keyboard.up(m);
}
async function drag(page: Page, from: [number, number], to: [number, number]) {
  const [ax, ay] = await scr(page, ...from);
  const [bx, by] = await scr(page, ...to);
  await page.mouse.move(ax, ay);
  await page.mouse.down();
  await page.mouse.move((ax + bx) / 2, (ay + by) / 2, { steps: 4 });
  await page.mouse.move(bx, by, { steps: 4 });
  await page.mouse.up();
}

/** Three entities: two lines and a circle. */
async function scene(page: Page) {
  await ready(page);
  await type(page, 'L', '-200,0', '-100,0', '');
  await type(page, 'L', '-50,-50', '-50,50', '');
  await type(page, 'C', '150,0', '60');
  const d = await doc(page);
  return d.order;
}

test('click selects one; Shift+click toggles; click on empty space clears', async ({ page }) => {
  const [l1, l2] = await scene(page);
  await clickAt(page, -150, 0);
  expect(await selected(page)).toEqual([l1]);
  await expect(page.getByTestId('selection-count')).toHaveText('1 selected');
  await clickAt(page, -50, 20, ['Shift']);
  expect((await selected(page)).sort()).toEqual([l1, l2].sort());
  await clickAt(page, -150, 0, ['Shift']);
  expect(await selected(page)).toEqual([l2]);
  await clickAt(page, 0, 150);
  expect(await selected(page)).toEqual([]);
});

test('window (left→right) selects only enclosed; crossing (right→left) selects touched', async ({ page }) => {
  const [l1, l2, c] = await scene(page);
  await drag(page, [-220, -80], [-30, 80]); // encloses both lines, not the circle
  expect((await selected(page)).sort()).toEqual([l1, l2].sort());
  await drag(page, [100, 20], [-60, -20]); // right→left, cuts the vertical line and the circle
  expect((await selected(page)).sort()).toEqual([l2, c].sort());
});

test('dragging a grip edits the entity as one undoable step', async ({ page }) => {
  const [l1, , c] = await scene(page);
  await clickAt(page, -150, 0);
  const [gx, gy] = await scr(page, -100, 0); // end grip
  const [tx, ty] = await scr(page, -100, 80);
  await page.mouse.move(gx, gy);
  await page.mouse.down();
  await page.mouse.move(tx, ty, { steps: 6 });
  await page.mouse.up();
  let d = await doc(page);
  expect(d.entities[l1!]!.end![1]).toBeGreaterThan(60);
  await page.keyboard.press('Control+z');
  d = await doc(page);
  expect(d.entities[l1!]!.end).toEqual([-100, 0, 0]);

  // Circle quadrant grip changes the radius; snapping to the other line's endpoint is exact.
  await clickAt(page, 90, 0);
  const [qx, qy] = await scr(page, 210, 0);
  const [sx, sy] = await scr(page, -50, 50); // top of the vertical line
  await page.mouse.move(qx, qy);
  await page.mouse.down();
  await page.mouse.move(sx + 2, sy + 2, { steps: 8 });
  await page.mouse.up();
  d = await doc(page);
  expect(d.entities[c!]!.radius).toBeCloseTo(Math.hypot(200, 50), 6);
});

test('Esc clears the selection; undo of an add drops it from the selection', async ({ page }) => {
  const [l1] = await scene(page);
  await clickAt(page, -150, 0);
  await page.keyboard.press('Escape');
  expect(await selected(page)).toEqual([]);
  await clickAt(page, 150 + 60, 0);
  expect((await selected(page)).length).toBe(1);
  await page.keyboard.press('Control+z'); // removes the circle
  expect(await selected(page)).toEqual([]);
  expect(l1).toBeTruthy();
});
