/**
 * Task 1.4: DomainError / Result 型のテスト
 */
import { describe, it, expect } from 'vitest'

describe('DomainError 型', () => {
  it('ValidationError が正しく生成できる', async () => {
    const { err } = await import('@/lib/shared/domain-error')
    const error = err({ _tag: 'ValidationError', field: 'email', message: 'メールが不正です' })
    expect(error.isOk()).toBe(false)
    if (error.isErr()) {
      expect(error.error._tag).toBe('ValidationError')
    }
  })

  it('ok() で成功 Result が生成できる', async () => {
    const { ok } = await import('@/lib/shared/domain-error')
    const result = ok({ id: '1', name: 'test' })
    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value.id).toBe('1')
    }
  })

  it('err() で失敗 Result が生成できる', async () => {
    const { err } = await import('@/lib/shared/domain-error')
    const result = err({ _tag: 'NotFound', resource: 'User', id: '99' })
    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error._tag).toBe('NotFound')
      expect(result.error.resource).toBe('User')
    }
  })

  it('すべての DomainError タグが型として使用できる', async () => {
    const { err } = await import('@/lib/shared/domain-error')
    // 各タグを網羅的にチェック
    const errors = [
      err({ _tag: 'ValidationError', field: 'f', message: 'm' }),
      err({ _tag: 'Unauthorized', reason: 'NO_SESSION' as const }),
      err({ _tag: 'Forbidden', reason: 'ロール不足' }),
      err({ _tag: 'AccountLocked', unlockAt: new Date() }),
      err({ _tag: 'PasswordPolicyViolation', rule: 'LENGTH' as const }),
      err({ _tag: 'NotFound', resource: 'User', id: '1' }),
      err({ _tag: 'Conflict', detail: '競合しました' }),
      err({ _tag: 'CyclicReference', path: ['A', 'B', 'A'] }),
      err({ _tag: 'TargetLimitExceeded', max: 5 }),
      err({ _tag: 'MinimumEvaluatorNotMet', current: 1, required: 3 }),
      err({ _tag: 'QualityGateNotPassed', missingAspects: ['具体性'] }),
      err({ _tag: 'CycleStateInvalid', current: 'OPEN' as never, attempted: 'finalize' }),
      err({ _tag: 'AppealDeadlineExceeded', deadline: new Date() }),
      err({ _tag: 'AITimeout', elapsedMs: 6000 }),
      err({ _tag: 'AIQuotaExceeded', currentUsagePct: 101 }),
      err({ _tag: 'AIProviderError', providerMessage: 'upstream error' }),
      err({ _tag: 'RateLimited', retryAfterSec: 60 }),
    ]
    for (const e of errors) {
      expect(e.isErr()).toBe(true)
    }
  })
})
