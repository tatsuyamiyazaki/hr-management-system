import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E テスト設定
 *
 * - ローカル: `pnpm test:e2e`
 * - CI: 自動的に Next.js dev server を起動してテスト
 */
export default defineConfig({
  // E2E テストファイルのディレクトリ
  testDir: './e2e',

  // 並列実行（CI ではシリアル実行も可）
  fullyParallel: true,

  // CI 環境でのリトライ回数
  retries: process.env.CI ? 2 : 0,

  // 並列ワーカー数（CI では制限）
  workers: process.env.CI ? 1 : undefined,

  // レポーター設定
  reporter: [['html', { outputFolder: 'playwright-report', open: 'never' }], ['list']],

  // 全テスト共通設定
  use: {
    // テスト対象の URL
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',

    // テスト失敗時のスクリーンショット
    screenshot: 'only-on-failure',

    // テスト失敗時のトレース
    trace: 'on-first-retry',

    // タイムアウト設定
    actionTimeout: 10_000,
  },

  // テスト対象ブラウザ
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // CI 以外では Firefox も実行
    ...(process.env.CI
      ? []
      : [
          {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'] },
          },
        ]),
  ],

  // ローカル開発時は Next.js dev server を自動起動
  webServer: process.env.CI
    ? undefined
    : {
        command: 'pnpm dev',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
        timeout: 60_000,
      },

  // テスト結果の出力ディレクトリ
  outputDir: 'test-results',
})
