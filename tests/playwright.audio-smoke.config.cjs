const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: __dirname,
  testMatch: /audio-smoke\.spec\.cjs$/,
  timeout: 45_000,
  reporter: 'line',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.MOFACTS_BASE_URL || 'http://localhost:3200',
    channel: 'chrome',
    permissions: ['microphone'],
    launchOptions: {
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
      ],
    },
  },
});
