import { defineConfig } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const python = fileURLToPath(new URL(process.platform === 'win32'
  ? '../../.venv/Scripts/python.exe' : '../../.venv/bin/python', import.meta.url))

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 20000,
  use: { baseURL: 'http://127.0.0.1:5174', browserName: 'chromium', trace: 'retain-on-failure' },
  webServer: [
    {
      command: `"${python}" -m uvicorn app.main:app --app-dir ../api --host 127.0.0.1 --port 8001`,
      url: 'http://127.0.0.1:8001/api/v1/state',
      reuseExistingServer: false,
    },
    {
      command: 'npm run build && npm run preview -- --port 5174 --strictPort',
      url: 'http://127.0.0.1:5174',
      env: { API_PROXY_TARGET: 'http://127.0.0.1:8001' },
      reuseExistingServer: false,
    },
  ],
})
