/**
 * Task 1.3: Prisma 6 の初期化とベースモデル定義
 * 暗号化ユーティリティのテスト (RED → GREEN)
 */
import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────
// HMAC ブラインドインデックスのテスト
// ─────────────────────────────────────────────
describe('createBlindIndex (HMAC-SHA256)', () => {
  it('同じ入力から同じハッシュが生成される', async () => {
    const { createBlindIndex } = await import('@/lib/shared/crypto')
    const hash1 = await createBlindIndex('test@example.com', 'test-secret-key')
    const hash2 = await createBlindIndex('test@example.com', 'test-secret-key')
    expect(hash1).toBe(hash2)
  })

  it('異なる入力からは異なるハッシュが生成される', async () => {
    const { createBlindIndex } = await import('@/lib/shared/crypto')
    const hash1 = await createBlindIndex('user1@example.com', 'test-secret-key')
    const hash2 = await createBlindIndex('user2@example.com', 'test-secret-key')
    expect(hash1).not.toBe(hash2)
  })

  it('異なるシークレットからは異なるハッシュが生成される', async () => {
    const { createBlindIndex } = await import('@/lib/shared/crypto')
    const hash1 = await createBlindIndex('user@example.com', 'secret-a')
    const hash2 = await createBlindIndex('user@example.com', 'secret-b')
    expect(hash1).not.toBe(hash2)
  })

  it('hex 文字列を返す', async () => {
    const { createBlindIndex } = await import('@/lib/shared/crypto')
    const hash = await createBlindIndex('user@example.com', 'test-secret')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('空文字入力でも動作する', async () => {
    const { createBlindIndex } = await import('@/lib/shared/crypto')
    const hash = await createBlindIndex('', 'test-secret')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })
})

// ─────────────────────────────────────────────
// メール正規化のテスト
// ─────────────────────────────────────────────
describe('normalizeEmail', () => {
  it('小文字に正規化される', async () => {
    const { normalizeEmail } = await import('@/lib/shared/crypto')
    expect(normalizeEmail('User@Example.COM')).toBe('user@example.com')
  })

  it('前後の空白がトリムされる', async () => {
    const { normalizeEmail } = await import('@/lib/shared/crypto')
    expect(normalizeEmail('  user@example.com  ')).toBe('user@example.com')
  })
})

// ─────────────────────────────────────────────
// emailHash / employeeCodeHash ヘルパーのテスト
// ─────────────────────────────────────────────
describe('computeEmailHash', () => {
  it('正規化されたメールのHMACを返す', async () => {
    const { computeEmailHash, normalizeEmail, createBlindIndex } = await import('@/lib/shared/crypto')
    const email = 'User@Example.COM'
    const secret = 'test-app-secret'
    const expected = await createBlindIndex(normalizeEmail(email), secret)
    const actual = await computeEmailHash(email, secret)
    expect(actual).toBe(expected)
  })
})

describe('computeEmployeeCodeHash', () => {
  it('社員番号のHMACを返す', async () => {
    const { computeEmployeeCodeHash, createBlindIndex } = await import('@/lib/shared/crypto')
    const code = 'EMP001'
    const secret = 'test-app-secret'
    const expected = await createBlindIndex(code, secret)
    const actual = await computeEmployeeCodeHash(code, secret)
    expect(actual).toBe(expected)
  })
})
