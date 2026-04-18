/**
 * Issue #29 / Req 14.2, 14.3, 14.4: PATCH /api/lifecycle/employees/{id}/status ルートハンドラのテスト
 *
 * - 200: 正常なステータス更新
 * - 422: バリデーションエラー
 * - 401: 未認証
 * - 403: ADMIN / HR_MANAGER 以外
 * - 404: 社員が存在しない
 * - 409: 不正なステータス遷移
 * - 503: サービス未初期化
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import type { LifecycleService } from '@/lib/lifecycle/lifecycle-service'
import {
  EmployeeNotFoundError,
  InvalidStatusTransitionError,
} from '@/lib/lifecycle/lifecycle-types'
import {
  setLifecycleServiceForTesting,
  clearLifecycleServiceForTesting,
} from '@/lib/lifecycle/lifecycle-service-di'

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}))

const { getServerSession } = await import('next-auth')
const mockedGetServerSession = vi.mocked(getServerSession)

const { PATCH } = await import('@/app/api/lifecycle/employees/[id]/status/route')

const VALID_BODY = {
  newStatus: 'ON_LEAVE',
  effectiveDate: '2026-05-01',
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/lifecycle/employees/user-1/status', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeSession(role: string, userId = 'actor-1') {
  return { user: { email: 'actor@example.com' }, role, userId }
}

function makeLifecycleService(overrides?: Partial<LifecycleService>): LifecycleService {
  return {
    createEmployee: vi.fn(),
    bulkImportUsers: vi.fn(),
    updateStatus: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as LifecycleService
}

function callPATCH(request: NextRequest) {
  return PATCH(request, { params: Promise.resolve({ id: 'user-1' }) })
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  clearLifecycleServiceForTesting()
})

describe('PATCH /api/lifecycle/employees/{id}/status', () => {
  it('200: HR_MANAGER の正常なステータス更新', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('HR_MANAGER'))
    setLifecycleServiceForTesting(makeLifecycleService())
    const res = await callPATCH(makeRequest(VALID_BODY))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean }
    expect(body.success).toBe(true)
  })

  it('200: ADMIN も更新可能', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('ADMIN'))
    setLifecycleServiceForTesting(makeLifecycleService())
    const res = await callPATCH(makeRequest(VALID_BODY))
    expect(res.status).toBe(200)
  })

  it('401: 未認証は 401', async () => {
    mockedGetServerSession.mockResolvedValue(null)
    const res = await callPATCH(makeRequest(VALID_BODY))
    expect(res.status).toBe(401)
  })

  it('403: MANAGER は 403', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('MANAGER'))
    setLifecycleServiceForTesting(makeLifecycleService())
    const res = await callPATCH(makeRequest(VALID_BODY))
    expect(res.status).toBe(403)
  })

  it('403: EMPLOYEE は 403', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('EMPLOYEE'))
    setLifecycleServiceForTesting(makeLifecycleService())
    const res = await callPATCH(makeRequest(VALID_BODY))
    expect(res.status).toBe(403)
  })

  it('422: newStatus が不正な値', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('ADMIN'))
    setLifecycleServiceForTesting(makeLifecycleService())
    const res = await callPATCH(makeRequest({ ...VALID_BODY, newStatus: 'INVALID' }))
    expect(res.status).toBe(422)
  })

  it('422: effectiveDate が不正な形式', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('ADMIN'))
    setLifecycleServiceForTesting(makeLifecycleService())
    const res = await callPATCH(makeRequest({ ...VALID_BODY, effectiveDate: '2026/05/01' }))
    expect(res.status).toBe(422)
  })

  it('422: 必須フィールド欠如 (newStatus)', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('ADMIN'))
    setLifecycleServiceForTesting(makeLifecycleService())
    const res = await callPATCH(makeRequest({ effectiveDate: '2026-05-01' }))
    expect(res.status).toBe(422)
  })

  it('400: Invalid JSON は 400', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('ADMIN'))
    setLifecycleServiceForTesting(makeLifecycleService())
    const req = new NextRequest('http://localhost/api/lifecycle/employees/user-1/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'user-1' }) })
    expect(res.status).toBe(400)
  })

  it('404: 社員が存在しない', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('ADMIN'))
    setLifecycleServiceForTesting(
      makeLifecycleService({
        updateStatus: vi.fn().mockRejectedValue(new EmployeeNotFoundError('user-1')),
      }),
    )
    const res = await callPATCH(makeRequest(VALID_BODY))
    expect(res.status).toBe(404)
    const body = (await res.json()) as { userId: string }
    expect(body.userId).toBe('user-1')
  })

  it('409: 不正なステータス遷移', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('ADMIN'))
    setLifecycleServiceForTesting(
      makeLifecycleService({
        updateStatus: vi
          .fn()
          .mockRejectedValue(new InvalidStatusTransitionError('RESIGNED', 'ACTIVE')),
      }),
    )
    const res = await callPATCH(makeRequest({ newStatus: 'ACTIVE', effectiveDate: '2026-05-01' }))
    expect(res.status).toBe(409)
    const body = (await res.json()) as { from: string; to: string }
    expect(body.from).toBe('RESIGNED')
    expect(body.to).toBe('ACTIVE')
  })

  it('503: サービス未初期化', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('ADMIN'))
    // setLifecycleServiceForTesting を呼ばない
    const res = await callPATCH(makeRequest(VALID_BODY))
    expect(res.status).toBe(503)
  })

  it('500: 未知のエラーは 500', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('ADMIN'))
    setLifecycleServiceForTesting(
      makeLifecycleService({
        updateStatus: vi.fn().mockRejectedValue(new Error('boom')),
      }),
    )
    const res = await callPATCH(makeRequest(VALID_BODY))
    expect(res.status).toBe(500)
  })

  it('200: reason 付きのステータス更新', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('HR_MANAGER'))
    const mockSvc = makeLifecycleService()
    setLifecycleServiceForTesting(mockSvc)
    const res = await callPATCH(makeRequest({ ...VALID_BODY, reason: '病気療養のため' }))
    expect(res.status).toBe(200)
  })
})
