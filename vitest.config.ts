import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // E2E テスト（Playwright）は vitest の対象外
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**', '.claude/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        global: {
          lines: 80,
          functions: 80,
          branches: 80,
          statements: 80,
        },
      },
    },
  },
  // Next.js は JSX の自動ランタイムを想定しているため、
  // vitest の esbuild 変換にも同じ設定を与えて React 参照が不要な形でビルドする。
  esbuild: {
    jsx: 'automatic',
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
})
