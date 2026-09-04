import { expect, test, type WebSocketRoute } from '@playwright/test'

test.beforeEach(async ({ request }) => {
  expect((await request.post('http://127.0.0.1:8001/api/v1/reset')).ok()).toBe(true)
})

test('sample pick-and-place completes with live pose, grip and command telemetry', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByText('Live connection')).toBeVisible()
  await page.getByRole('button', { name: 'Validate', exact: true }).click()
  await expect(page.getByText('Valid program · 9 commands')).toBeVisible()
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(page.getByTestId('active-command')).toHaveText('c5 · wait')
  await expect(page.getByTestId('pose-x')).toHaveText('100')
  await expect(page.getByTestId('gripper')).toHaveText('gripped')
  await expect(page.getByTestId('run-status')).toHaveText('completed')
  await expect(page.getByTestId('progress-count')).toHaveText('9 / 9 commands complete')
  await expect(page.getByTestId('pose-x')).toHaveText('0')
  await expect(page.getByTestId('pose-z')).toHaveText('-200')
  await expect(page.getByTestId('gripper')).toHaveText('released')
  await expect(page.getByTestId('mode')).toHaveText('Mock mode')
  await page.screenshot({ path: 'test-results/workspace-desktop.png', fullPage: true })
  expect(errors).toEqual([])
})

test('invalid commands are rejected before execution', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Live connection')).toBeVisible()
  await page.getByLabel('RobotProgramV1 JSON').fill(JSON.stringify({ version: 1, name: 'invalid',
    commands: [{ id: 'c1', type: 'grip' }, { id: 'c2', type: 'wait', seconds: -1 }] }))
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('seconds')
  await expect(page.getByTestId('run-status')).toHaveText('idle')
  await expect(page.getByTestId('gripper')).toHaveText('released')
})

test('Stop interrupts a long wait and Reset restores defaults', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Live connection')).toBeVisible()
  await page.getByLabel('RobotProgramV1 JSON').fill(JSON.stringify({ version: 1, name: 'stop demo',
    commands: [
      { id: 'speed', type: 'set_speed', speed_mm_s: 20 },
      { id: 'move', type: 'move_xyz', x_mm: 75, y_mm: 20, z_mm: -300 },
      { id: 'hold', type: 'grip' }, { id: 'long-wait', type: 'wait', seconds: 60 },
      { id: 'must-not-run', type: 'release' },
    ] }))
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(page.getByTestId('active-command')).toHaveText('long-wait · wait')
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(page.getByTestId('run-status')).toHaveText('stopped', { timeout: 2000 })
  await expect(page.getByTestId('gripper')).toHaveText('gripped')
  await expect(page.getByTestId('pose-x')).toHaveText('75')
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await expect(page.getByTestId('run-status')).toHaveText('idle')
  await expect(page.getByTestId('pose-x')).toHaveText('0')
  await expect(page.getByTestId('pose-z')).toHaveText('-200')
  await expect(page.getByTestId('speed')).toHaveText('100 mm/s')
  await expect(page.getByTestId('gripper')).toHaveText('released')
})

test('Reset cancels an active wait without executing later commands', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Live connection')).toBeVisible()
  await page.getByLabel('RobotProgramV1 JSON').fill(JSON.stringify({ version: 1, name: 'reset demo',
    commands: [{ id: 'waiting', type: 'wait', seconds: 60 }, { id: 'never', type: 'grip' }] }))
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(page.getByTestId('active-command')).toHaveText('waiting · wait')
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await expect(page.getByTestId('run-status')).toHaveText('idle', { timeout: 2000 })
  await expect(page.getByTestId('gripper')).toHaveText('released')
  await expect(page.getByTestId('progress-count')).toHaveText('0 / 0 commands complete')
})

test('WebSocket loss shows stale state, reconnects and receives fresh server state', async ({ page, request }) => {
  const sockets: WebSocketRoute[] = []
  await page.routeWebSocket('**/api/v1/ws/state', socket => {
    socket.connectToServer()
    sockets.push(socket)
  })
  await page.goto('/')
  await expect(page.getByText('Live connection')).toBeVisible()
  sockets.at(-1)!.close({ code: 1012, reason: 'Reconnect acceptance test' })
  await expect(page.getByText('Disconnected · retrying…')).toBeVisible()
  await expect(page.getByText('Last received state · stale')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeDisabled()
  const result = await request.post('http://127.0.0.1:8001/api/v1/runs', { data: {
    version: 1, name: 'while disconnected', commands: [
      { id: 'move', type: 'move_xyz', x_mm: 123, y_mm: 0, z_mm: -250 },
    ],
  } })
  expect(result.status()).toBe(202)
  await expect(page.getByText('Live connection')).toBeVisible({ timeout: 5000 })
  await expect(page.getByTestId('pose-x')).toHaveText('123')
  await expect(page.getByTestId('run-status')).toHaveText('completed')
  expect(sockets.length).toBeGreaterThanOrEqual(2)
})

test('mobile layout keeps every panel and control usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.getByText('Live connection')).toBeVisible()
  for (const heading of ['Programming', 'Digital Twin / Status', 'Controls']) {
    await expect(page.getByRole('heading', { name: heading })).toBeVisible()
  }
  await page.getByRole('button', { name: 'Validate', exact: true }).click()
  await expect(page.getByText('Valid program · 9 commands')).toBeVisible()
  const bounds = await page.locator('main').boundingBox()
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390)
  await page.screenshot({ path: 'test-results/workspace-mobile.png', fullPage: true })
})

test('Stop stays available while the accepted Run response is delayed', async ({ page }) => {
  let releaseResponse!: () => void
  const responseGate = new Promise<void>(resolve => { releaseResponse = resolve })
  await page.route('**/api/v1/runs', async route => {
    const response = await route.fetch()
    await responseGate
    await route.fulfill({ response })
  })
  await page.goto('/')
  await expect(page.getByText('Live connection')).toBeVisible()
  await page.getByLabel('RobotProgramV1 JSON').fill(JSON.stringify({ version: 1, name: 'slow response',
    commands: [{ id: 'wait', type: 'wait', seconds: 60 }, { id: 'never', type: 'grip' }] }))
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  try {
    await expect(page.getByTestId('active-command')).toHaveText('wait · wait')
    await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeEnabled()
    await page.getByRole('button', { name: 'Stop', exact: true }).click()
    await expect(page.getByTestId('run-status')).toHaveText('stopped', { timeout: 2000 })
    await expect(page.getByTestId('gripper')).toHaveText('released')
  } finally { releaseResponse() }
})
