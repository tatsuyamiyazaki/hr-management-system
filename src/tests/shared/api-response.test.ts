/**
 * Task 1.4: API レスポンスラッパーのテスト
 */
import { describe, it, expect } from 'vitest'

describe('apiSuccess', () => {
  it('success=true でデータを含む形式を返す', async () => {
    const { apiSuccess } = await import('@/lib/shared/api-response')
    const res = apiSuccess({ id: '1' }, 'req-001')
    expect(res.success).toBe(true)
    expect(res.data).toEqual({ id: '1' })
    expect(res.error).toBeNull()
    expect(res.meta.requestId).toBe('req-001')
    expect(typeof res.meta.timestamp).toBe('string')
  })

  it('ページネーション付きで meta に total/page/pageSize が含まれる', async () => {
    const { apiSuccess } = await import('@/lib/shared/api-response')
    const res = apiSuccess([{ id: '1' }], 'req-002', { page: 1, pageSize: 20, total: 100 })
    expect(res.meta.page).toBe(1)
    expect(res.meta.pageSize).toBe(20)
    expect(res.meta.total).toBe(100)
  })
})

describe('apiError', () => {
  it('success=false でエラーを含む形式を返す', async () => {
    const { apiError } = await import('@/lib/shared/api-response')
    const res = apiError('VALIDATION_ERROR', 'メールが不正です', 'req-003', { field: 'email' })
    expect(res.success).toBe(false)
    expect(res.data).toBeNull()
    expect(res.error).toBeDefined()
    expect(res.error?.code).toBe('VALIDATION_ERROR')
    expect(res.error?.message).toBe('メールが不正です')
    expect(res.error?.details).toEqual({ field: 'email' })
    expect(res.meta.requestId).toBe('req-003')
  })

  it('details なしでも動作する', async () => {
    const { apiError } = await import('@/lib/shared/api-response')
    const res = apiError('NOT_FOUND', 'リソースが見つかりません', 'req-004')
    expect(res.error?.details).toBeUndefined()
  })
})

describe('domainErrorToApiResponse', () => {
  it('DomainError から API エラーレスポンスを生成できる', async () => {
    const { domainErrorToApiResponse } = await import('@/lib/shared/api-response')
    const res = domainErrorToApiResponse(
      { _tag: 'NotFound', resource: 'User', id: '1' },
      'req-005'
    )
    expect(res.success).toBe(false)
    expect(res.error?.code).toBe('NOT_FOUND')
  })

  it('ValidationError のフィールド情報が詳細に含まれる', async () => {
    const { domainErrorToApiResponse } = await import('@/lib/shared/api-response')
    const res = domainErrorToApiResponse(
      { _tag: 'ValidationError', field: 'email', message: 'メールが不正です' },
      'req-006'
    )
    expect(res.error?.details).toHaveProperty('field', 'email')
  })
})
