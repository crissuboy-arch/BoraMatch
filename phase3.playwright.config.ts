import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e", testMatch: "phase3.spec.ts", workers: 1, retries: 0,
  reporter: [["list"], ["json", { outputFile: "test-results/phase3-summary.json" }]],
  outputDir: "test-results/phase3-artifacts",
  use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:3000", serviceWorkers: "block", screenshot: "only-on-failure", trace: "retain-on-failure" },
  webServer: { command: "node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3000", url: "http://127.0.0.1:3000", reuseExistingServer: false, timeout: 120000 },
});
