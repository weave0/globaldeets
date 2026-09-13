const { defineConfig, devices } = require('@playwright/test');

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5500';
const shouldStartLocalServer = !process.env.PLAYWRIGHT_BASE_URL;
const mobileChromium = {
  ...devices['Desktop Chrome'],
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
};

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  expect: {
    timeout: 10000,
  },
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /mobile-reader\.spec\.js/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-iphone',
      testMatch: /mobile-reader\.spec\.js/,
      use: {
        ...mobileChromium,
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: 'mobile-android-narrow',
      testMatch: /mobile-reader\.spec\.js/,
      use: {
        ...mobileChromium,
        viewport: { width: 360, height: 800 },
      },
    },
  ],
  webServer: shouldStartLocalServer
    ? {
        command: 'npx vite --host 127.0.0.1 --port 5500',
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120000,
      }
    : undefined,
});
