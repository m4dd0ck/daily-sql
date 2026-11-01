import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
// Reason: LIVE_URL points the same tests at the deployed site, after a deploy.
const LIVE_URL = process.env.LIVE_URL;

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  expect: { timeout: 60_000 },
  fullyParallel: false,
  reporter: 'list',
  use: { baseURL: LIVE_URL ?? `http://127.0.0.1:${PORT}/`, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  // Reason: test the production build, which is what GitHub Pages serves.
  webServer: LIVE_URL
    ? []
    : {
        command: `npm run build && npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
        url: `http://127.0.0.1:${PORT}/`,
        timeout: 180_000,
        reuseExistingServer: false,
      },
});
