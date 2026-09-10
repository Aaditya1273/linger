import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const deniedGoogleFontResponses = fileURLToPath(
  new URL('./tests/fixtures/deny-google-fonts.cjs', import.meta.url),
);

export default defineConfig({
  testDir: './tests',
  webServer: [
    {
      // Dedicated port so e2e never reuses a developer's plain `next dev` on 3000,
      // which lacks the deterministic-fixture env and fails against dead upstreams.
      command:
        'ANKER_DETERMINISTIC_E2E=true NEXT_PUBLIC_ANKER_DETERMINISTIC_E2E=true npm run dev -- --port 4123',
      // Keep font tests deterministic: a Google-backed next/font declaration
      // must prove it still renders correctly when build-time egress is absent.
      env: {
        NEXT_FONT_GOOGLE_MOCKED_RESPONSES: deniedGoogleFontResponses,
      },
      // Ready only after /en/app compiles — CI was flaking on the landing→app click
      // while Next cold-compiled that route under parallel workers.
      url: 'http://127.0.0.1:4123/en/app',
      reuseExistingServer: !process.env.CI,
    },
    {
      // Real React components for viewport geometry that disconnected page
      // fixtures cannot reach without faking wallet state in production code.
      command: 'npx vite tests/browser-fixture --host 127.0.0.1 --port 4124 --strictPort',
      url: 'http://127.0.0.1:4124',
      reuseExistingServer: !process.env.CI,
    },
  ],
  use: {
    baseURL: 'http://127.0.0.1:4123',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
