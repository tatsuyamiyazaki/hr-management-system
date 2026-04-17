/**
 * Task 6.2 / Req 1.12: パスワード強度ポリシーの単体テスト
 */
import { describe, expect, it } from 'vitest'
import { PasswordPolicyViolationError } from '@/lib/auth/auth-types'
import {
  PASSWORD_HISTORY_SIZE,
  PASSWORD_MIN_LENGTH,
  PASSWORD_REQUIRED_CHAR_CLASSES,
  assertPasswordStrong,
  classifyPassword,
  isPasswordStrong,
} from '@/lib/auth/password-policy'

describe('password-policy constants', () => {
  it('Req 1.12 / 1.13 の閾値が定数として公開されている', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(12)
    expect(PASSWORD_REQUIRED_CHAR_CLASSES).toBe(3)
    expect(PASSWORD_HISTORY_SIZE).toBe(5)
  })
})

describe('classifyPassword', () => {
  it('空文字は空集合', () => {
    expect(classifyPassword('').size).toBe(0)
  })

  it('小文字のみは LOWERCASE のみ', () => {
    const classes = classifyPassword('abcdefghijkl')
    expect([...classes]).toEqual(['LOWERCASE'])
  })

  it('4 クラス全てを認識する', () => {
    const classes = classifyPassword('Abcdefghij1!')
    expect(classes.has('UPPERCASE')).toBe(true)
    expect(classes.has('LOWERCASE')).toBe(true)
    expect(classes.has('DIGIT')).toBe(true)
    expect(classes.has('SYMBOL')).toBe(true)
  })

  it('Unicode 記号は SYMBOL に含めない (ASCII 記号のみ)', () => {
    // 日本語の「！」(U+FF01) は ASCII 記号ではない
    const classes = classifyPassword('Abcdefghij1！')
    expect(classes.has('SYMBOL')).toBe(false)
  })
})

describe('isPasswordStrong', () => {
  it('空文字は false', () => {
    expect(isPasswordStrong('')).toBe(false)
  })

  it("'Short1!' は長さ不足で false", () => {
    expect(isPasswordStrong('Short1!')).toBe(false)
  })

  it("'abcdefghijkl' は 1 クラスのみで false", () => {
    expect(isPasswordStrong('abcdefghijkl')).toBe(false)
  })

  it("'Abcdefghijkl' は 2 クラスで false", () => {
    expect(isPasswordStrong('Abcdefghijkl')).toBe(false)
  })

  it("'Abcdefghijk1' は 3 クラスで true", () => {
    expect(isPasswordStrong('Abcdefghijk1')).toBe(true)
  })

  it("'Abcdefghij1!' は 4 クラスで true", () => {
    expect(isPasswordStrong('Abcdefghij1!')).toBe(true)
  })
})

describe('assertPasswordStrong', () => {
  it('長さ不足は PasswordPolicyViolationError(LENGTH)', () => {
    try {
      assertPasswordStrong('Short1!')
      throw new Error('should have thrown')
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(PasswordPolicyViolationError)
      if (error instanceof PasswordPolicyViolationError) {
        expect(error.rule).toBe('LENGTH')
      }
    }
  })

  it('クラス不足は PasswordPolicyViolationError(COMPLEXITY)', () => {
    try {
      assertPasswordStrong('Abcdefghijkl') // 12 文字, 2 クラス
      throw new Error('should have thrown')
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(PasswordPolicyViolationError)
      if (error instanceof PasswordPolicyViolationError) {
        expect(error.rule).toBe('COMPLEXITY')
      }
    }
  })

  it('12 文字未満は COMPLEXITY より LENGTH が優先される', () => {
    try {
      assertPasswordStrong('Ab1!')
      throw new Error('should have thrown')
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(PasswordPolicyViolationError)
      if (error instanceof PasswordPolicyViolationError) {
        expect(error.rule).toBe('LENGTH')
      }
    }
  })

  it('強度を満たす場合は例外を出さない', () => {
    expect(() => assertPasswordStrong('Abcdefghijk1')).not.toThrow()
    expect(() => assertPasswordStrong('Abcdefghij1!')).not.toThrow()
  })
})
