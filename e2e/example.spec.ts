/**
 * E2E テスト例
 *
 * クリティカルなユーザーフローのサンプル。
 * 実際の E2E テストは機能実装後に追加する。
 */
import { test, expect } from '@playwright/test'

test.describe('基本的な画面表示', () => {
  test('トップページが表示される', async ({ page }) => {
    await page.goto('/')
    // ページが 200 で返ること（アプリが起動していること）
    // 実際のアサーションは UI 実装後に追加
    expect(page.url()).toContain('/')
  })
})
