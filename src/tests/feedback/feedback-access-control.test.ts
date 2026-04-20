/**
 * Issue #55 / Task 17.2: フィードバック生データアクセス制御テスト
 *
 * Req 10.5: 生の評価コメントは HR_MANAGER 以上のロールのみ参照可能
 */
import { describe, it, expect } from 'vitest'
import { canAccessRawComments } from '@/lib/feedback/feedback-types'

describe('canAccessRawComments', () => {
  it('ADMIN は生データを参照できる', () => {
    expect(canAccessRawComments('ADMIN')).toBe(true)
  })

  it('HR_MANAGER は生データを参照できる', () => {
    expect(canAccessRawComments('HR_MANAGER')).toBe(true)
  })

  it('MANAGER は生データを参照できない', () => {
    expect(canAccessRawComments('MANAGER')).toBe(false)
  })

  it('EMPLOYEE は生データを参照できない', () => {
    expect(canAccessRawComments('EMPLOYEE')).toBe(false)
  })
})
