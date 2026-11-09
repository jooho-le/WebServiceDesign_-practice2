const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'docs/test-results.json' }]],
  use: { baseURL: 'http://127.0.0.1:3000', channel: 'chrome', viewport: { width: 1500, height: 1000 } },
  webServer: { command: 'node server.js', url: 'http://127.0.0.1:3000', reuseExistingServer: false }
});
