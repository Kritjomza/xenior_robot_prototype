import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  expect((await request.post("http://127.0.0.1:8001/api/v1/reset")).ok()).toBe(true);
});
async function ready(page: import('@playwright/test').Page) {
  await page.goto('/');
  await expect(page.getByRole('button', {name: 'UNLOCKED', exact:true})).toBeVisible();
  await expect(page.getByRole('button', {name:'Run', exact:true})).toBeEnabled();
}
async function source(page: import('@playwright/test').Page, value: string) {
  await page.getByLabel('Python program', {exact:true}).fill(value);
}
test('Python sample completes through live executor telemetry', async ({page}) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await ready(page);
  await page.getByRole('button', {name:'Validate',exact:true}).click();
  await expect(page.getByText('Valid program · 9 commands')).toBeVisible();
  await page.getByRole('button', {name:'Run',exact:true}).click();
  await expect(page.getByTestId('run-status')).toHaveText('completed');
  await expect(page.getByTestId('pose-z')).toHaveText('-200');
  await expect(page.getByTestId('progress-count')).toHaveText('9 / 9 commands complete');
  await expect(page.getByTestId('gripper')).toHaveText('released');
  await expect(page.getByLabel('Interactive 3D delta robot')).toBeVisible();
  expect(errors).toEqual([]);
});
test('invalid Python is rejected before any motion', async ({page}) => {
  await ready(page); await source(page, 'grip()\nwait(-1)');
  await page.getByRole('button',{name:'Run',exact:true}).click();
  await expect(page.locator('.request-error[role=alert]')).toContainText('seconds');
  await expect(page.getByTestId('gripper')).toHaveText('released');
  await expect(page.getByTestId('run-status')).toHaveText('idle');
});
test('Stop interrupts Python wait and reset restores state', async ({page}) => {
  await ready(page); await source(page, 'move_to(x=75, y=20, z=-300)\ngrip()\nwait(60)\nrelease()');
  await page.getByRole('button',{name:'Run',exact:true}).click();
  await expect(page.getByTestId('active-command')).toContainText('line-3');
  await page.getByRole('button',{name:'Stop',exact:true}).click();
  await expect(page.getByTestId('run-status')).toHaveText('stopped');
  await expect(page.getByTestId('gripper')).toHaveText('gripped');
  await page.getByRole('button',{name:'Reset',exact:true}).click();
  await expect(page.getByTestId('pose-x')).toHaveText('0');
  await expect(page.getByTestId('gripper')).toHaveText('released');
});
test('manual controls share the workspace, respect steps and update the twin', async ({page}) => {
  await ready(page);
  await expect(page.getByRole('navigation').getByRole('button',{name:'Control',exact:true})).toHaveCount(0);
  await page.getByLabel('Jog step').selectOption('5');
  await page.getByRole('button',{name:'X+',exact:true}).click();
  await expect(page.getByTestId('pose-x')).toHaveText('5');
  await page.getByRole('button',{name:'RZ+',exact:true}).click();
  await expect(page.getByLabel('Manual controls')).toBeVisible();
  await page.getByRole('button',{name:'Grip',exact:true}).click();
  await expect(page.getByTestId('gripper')).toHaveText('gripped');
  await page.getByRole('button',{name:'Home',exact:true}).click();
  await expect(page.getByTestId('pose-x')).toHaveText('0');
  await expect(page.getByLabel('Interactive 3D delta robot')).toBeVisible();
});
test('resize, project navigation, local revision and desktop layout', async ({page}) => {
  await page.setViewportSize({width:1440,height:1000}); await ready(page);
  const divider = page.getByRole('separator'); await divider.focus(); await divider.press('ArrowRight');
  await expect(divider).toHaveAttribute('aria-valuenow','65');
  await page.getByRole('button',{name:'Save Version',exact:true}).click();
  await expect(page.getByText('Version saved.',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('deltax:revisions')!)[0].source)).toContain('home()');
  await page.getByRole('button',{name:'Projects',exact:true}).click();
  await expect(page.getByRole('region',{name:'Version history'})).toBeVisible();
  await page.screenshot({path:'test-results/workspace-history.png',fullPage:true});
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button',{name:'Load into editor',exact:true}).click();
  await expect(page.getByLabel('Manual controls')).toBeVisible();
  await page.screenshot({path:'test-results/workspace-desktop.png',fullPage:true});
});
test('phone layout keeps editor, twin, controls and telemetry usable', async ({page}) => {
  await page.setViewportSize({width:390,height:844}); await ready(page);
  const bounds = await page.locator('body').evaluate(body=>({width:body.scrollWidth, viewport:document.documentElement.clientWidth}));
  expect(bounds.width).toBeLessThanOrEqual(bounds.viewport);
  for (const label of ['Python program','Manual controls','Digital Twin Viewer']) await expect(page.getByLabel(label,{exact:true})).toBeAttached();
  await expect(page.getByLabel('Global speed')).toBeVisible();
  await page.screenshot({path:'test-results/workspace-mobile.png',fullPage:true});
});
test('Stop remains available while Python run response is delayed', async ({page}) => {
  let release!:()=>void; const gate = new Promise<void>(resolve=>release=resolve);
  await page.route('**/api/v1/programs/python/runs',async route=>{const response=await route.fetch();await gate;await route.fulfill({response});});
  await ready(page); await source(page,'wait(60)\ngrip()');
  await page.getByRole('button',{name:'Run',exact:true}).click();
  try {
    await expect(page.getByTestId('run-status')).toHaveText('running');
    await page.getByRole('button',{name:'Stop',exact:true}).click();
    await expect(page.getByTestId('run-status')).toHaveText('stopped');
    await expect(page.getByTestId('gripper')).toHaveText('released');
  } finally {release();}
});

test('stale telemetry is visibly identified after a connection loss', async ({page}) => {
  let connection: import('@playwright/test').WebSocketRoute | undefined;
  await page.routeWebSocket('**/api/v1/ws/state*', socket => {
    socket.connectToServer(); connection = socket;
  });
  await ready(page);
  connection!.close({code:1012,reason:'Freshness check'});
  await expect(page.getByText('Last received telemetry (stale)',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Run',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'X+',exact:true})).toBeDisabled();
  await page.screenshot({path:'test-results/workspace-stale.png',fullPage:true});
});

test('Blockly and Python toggle preserve the shared editable program', async ({page}) => {
  await page.setViewportSize({width:1440,height:1000});
  await ready(page);
  const original = await page.getByLabel('Python program',{exact:true}).inputValue();
  await page.getByRole('button',{name:'Blockly',exact:true}).click();
  await expect(page.getByLabel('Blockly workspace',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Blockly',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Python',exact:true}).click();
  await expect(page.getByLabel('Python program',{exact:true})).toHaveValue(original);
  await page.getByRole('button',{name:'Blockly',exact:true}).click();
  const move = page.locator('.blocklyDraggable[data-id="block-line-3"]');
  await move.locator(':scope > .blocklyEditableField').first().click();
  await page.locator('.blocklyHtmlInput').fill('25');
  await page.locator('.blocklyHtmlInput').press('Enter');
  await page.getByRole('button',{name:'Python',exact:true}).click();
  await expect(page.getByLabel('Python program',{exact:true})).toHaveValue(/move_to\(x=25, y=30, z=-250\)/);
  await page.getByRole('button',{name:'Blockly',exact:true}).click();
  await page.getByRole('button',{name:'Validate',exact:true}).click();
  await expect(page.getByText('Valid program · 9 commands')).toBeVisible();
  await page.screenshot({path:'test-results/workspace-blockly.png',fullPage:true});
  await page.getByRole('button',{name:'Python',exact:true}).click();
  await page.screenshot({path:'test-results/workspace-reference-proportions.png',fullPage:true});
});
