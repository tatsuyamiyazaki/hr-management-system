/**
 * Task 6.1 / Req 1.11: PasswordHasher の単体テスト
 */
import { describe, it, expect } from 'vitest'
import { BCRYPT_MIN_COST, createBcryptPasswordHasher } from '@/lib/auth/password-hasher'

describe('createBcryptPasswordHasher', () => {
  it('cost 未指定時は最小コストでインスタンス化できる', () => {
    const hasher = createBcryptPasswordHasher()
    expect(hasher).toBeDefined()
  })

  it('cost が BCRYPT_MIN_COST (12) 未満だとエラー', () => {
    expect(() => createBcryptPasswordHasher({ cost: 11 })).toThrow(
      /bcrypt cost must be an integer >= 12/,
    )
  })

  it('cost が整数以外だとエラー', () => {
    expect(() => createBcryptPasswordHasher({ cost: 12.5 })).toThrow(
      /bcrypt cost must be an integer >= 12/,
    )
  })

  it('cost が BCRYPT_MIN_COST 以上なら成功', () => {
    expect(() => createBcryptPasswordHasher({ cost: BCRYPT_MIN_COST })).not.toThrow()
    expect(() => createBcryptPasswordHasher({ cost: 13 })).not.toThrow()
  })

  describe('hash / verify の往復', () => {
    it('同じパスワードで verify が true', async () => {
      const hasher = createBcryptPasswordHasher({ cost: 12 })
      const hash = await hasher.hash('correct-horse-battery-staple')
      expect(hash).toMatch(/^\$2[aby]\$12\$/)
      await expect(hasher.verify('correct-horse-battery-staple', hash)).resolves.toBe(true)
    })

    it('異なるパスワードでは verify が false', async () => {
      const hasher = createBcryptPasswordHasher({ cost: 12 })
      const hash = await hasher.hash('correct-horse-battery-staple')
      await expect(hasher.verify('wrong-password', hash)).resolves.toBe(false)
    })

    it('hash は呼び出し毎に異なる (ソルト付与)', async () => {
      const hasher = createBcryptPasswordHasher({ cost: 12 })
      const [h1, h2] = await Promise.all([hasher.hash('same-input'), hasher.hash('same-input')])
      expect(h1).not.toBe(h2)
    })
  })

  describe('入力バリデーション', () => {
    it('空文字のハッシュ化はエラー', async () => {
      const hasher = createBcryptPasswordHasher()
      await expect(hasher.hash('')).rejects.toThrow(/non-empty/)
    })

    it('空文字の verify は false', async () => {
      const hasher = createBcryptPasswordHasher()
      await expect(hasher.verify('', '$2b$12$invalid')).resolves.toBe(false)
    })

    it('壊れたハッシュ形式で verify しても例外を投げず false を返す', async () => {
      const hasher = createBcryptPasswordHasher()
      await expect(hasher.verify('password', 'not-a-valid-hash')).resolves.toBe(false)
    })
  })
})
