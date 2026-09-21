import { expect, test, type Page } from '@playwright/test';

/** F-01 slice 3 — arc, circle, ellipse and spline tools (REQ-003.1). */

type Ent = Record<string, unknown> & { kind: string };
type Doc = { entities: Record<string, Ent>; order: string[] };

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
const only = async (page: Page): Promise<Ent> => {
  const d = await page.evaluate(() => (window as unknown as { __cadw: { doc(): Doc } }).__cadw.doc());
  expect(d.order).toHaveLength(1);
  return d.entities[d.order[0]!]!;
};

test('ARC by three points, from the keyboard', async ({ page }) => {
  await ready(page);
  await type(page, 'A', '100,0', '0,100', '-100,0');
  const a = await only(page);
  expect(a.kind).toBe('arc');
  expect(a.radius as number).toBeCloseTo(100, 9);
});

test('ARC by mouse: toolbar button, three clicks', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Arc', exact: true }).click();
  const box = (await page.getByTestId('viewport').boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.click(cx - 150, cy);
  await page.mouse.click(cx, cy - 150);
  await page.mouse.click(cx + 150, cy);
  const a = await only(page);
  expect(a.kind).toBe('arc');
});

test('CIRCLE by centre and typed radius, and by 2P', async ({ page }) => {
  await ready(page);
  await type(page, 'C', '0,0', '75');
  const c = await only(page);
  expect(c.kind).toBe('circle');
  expect(c.radius as number).toBeCloseTo(75, 9);
  await type(page, 'U', 'C', '2P', '0,0', '@200,0');
  const d = await only(page);
  expect(d.center).toEqual([100, 0, 0]);
});
