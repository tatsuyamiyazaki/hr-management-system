/**
 * Task 1.5: テスト環境の整備 — 設定検証テスト
 *
 * RED → GREEN: これらのテストがすべて通過すれば Task 1.5 完了
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '../../../')

// ─────────────────────────────────────────────
// Vitest 設定
// ─────────────────────────────────────────────
describe('Vitest 設定', () => {
  it('vitest.config.ts が存在する', () => {
    expect(existsSync(resolve(root, 'vitest.config.ts'))).toBe(true)
  })

  it('カバレッジプロバイダーが v8 に設定されている', () => {
    const config = readFileSync(resolve(root, 'vitest.config.ts'), 'utf-8')
    expect(config).toContain("provider: 'v8'")
  })

  it('カバレッジ閾値 80% が設定されている', () => {
    const config = readFileSync(resolve(root, 'vitest.config.ts'), 'utf-8')
    expect(config).toContain('80')
    expect(config).toContain('thresholds')
  })

  it('@/ パスエイリアスが設定されている', () => {
    const config = readFileSync(resolve(root, 'vitest.config.ts'), 'utf-8')
    expect(config).toContain("'@'")
    expect(config).toContain('./src')
  })

  it('@vitest/coverage-v8 が devDependencies に含まれている', () => {
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8'))
    expect(pkg.devDependencies).toHaveProperty('@vitest/coverage-v8')
  })
})

// ─────────────────────────────────────────────
// Playwright 設定
// ─────────────────────────────────────────────
describe('Playwright 設定', () => {
  it('playwright.config.ts が存在する', () => {
    expect(existsSync(resolve(root, 'playwright.config.ts'))).toBe(true)
  })

  it('@playwright/test が devDependencies に含まれている', () => {
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8'))
    expect(pkg.devDependencies).toHaveProperty('@playwright/test')
  })

  it('playwright.config.ts が baseURL を含む', () => {
    const config = readFileSync(resolve(root, 'playwright.config.ts'), 'utf-8')
    expect(config).toContain('baseURL')
  })

  it('E2E テストスクリプトが package.json に定義されている', () => {
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8'))
    expect(pkg.scripts['test:e2e']).toBeDefined()
  })
})

// ─────────────────────────────────────────────
// テスト DB セットアップスクリプト
// ─────────────────────────────────────────────
describe('テスト DB スクリプト', () => {
  it('scripts/test-db-setup.ts が存在する', () => {
    expect(existsSync(resolve(root, 'scripts/test-db-setup.ts'))).toBe(true)
  })

  it('scripts/test-db-teardown.ts が存在する', () => {
    expect(existsSync(resolve(root, 'scripts/test-db-teardown.ts'))).toBe(true)
  })
})

// ─────────────────────────────────────────────
// CI 設定（GitHub Actions）
// ─────────────────────────────────────────────
describe('CI 設定', () => {
  it('.github/workflows/ci.yml が存在する', () => {
    expect(existsSync(resolve(root, '.github/workflows/ci.yml'))).toBe(true)
  })

  it('CI でカバレッジ検証が設定されている', () => {
    const ci = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf-8')
    expect(ci).toContain('coverage')
  })

  it('CI で E2E テストが設定されている', () => {
    const ci = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf-8')
    expect(ci).toContain('playwright')
  })
})

// ─────────────────────────────────────────────
// E2E テストディレクトリ
// ─────────────────────────────────────────────
describe('E2E テスト構造', () => {
  it('e2e/ ディレクトリが存在する', () => {
    expect(existsSync(resolve(root, 'e2e'))).toBe(true)
  })

  it('e2e/example.spec.ts が存在する', () => {
    expect(existsSync(resolve(root, 'e2e/example.spec.ts'))).toBe(true)
  })
})
