import { defineConfig, devices } from '@playwright/test'

// Every acceptance byte lives under tests/. The run judges the BUILT bundle served
// over a real loopback origin, so the spec owns starting the stack, building and
// serving; there is no webServer entry and no dev server.
export default defineConfig({
  testDir: './acceptance',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  // Bringing up Docker, resetting the database and running a production build all
  // happen inside the run, so the budget is generous.
  timeout: 300_000,
  expect: { timeout: 15_000 },
  projects: [
    {
      name: 'phone-chromium',
      use: {
        ...devices['Desktop Chrome'],
        // A phone, as the brief describes the only client.
        viewport: { width: 360, height: 780 },
        isMobile: false,
        trace: 'retain-on-failure',
      },
    },
  ],
})
