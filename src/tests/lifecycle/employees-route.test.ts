/**
 * Issue #29 / Req 14.1: POST /api/lifecycle/employees ルートハンドラのテスト
 *
 * - 201: 正常作成
 * - 422: バリデーションエラー
 * - 401: 未認証
 * - 403: ADMIN / HR_MANAGER 以外
 * - 409: email 重複
 * - 503: サービス未初期化
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { EmployeeAlreadyExistsError, type Employee } from '@/lib/lifecycle/lifecycle-types'
import type { LifecycleService } from '@/lib/lifecycle/lifecycle-service'

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}))

const { getServerSession } = await import('next-auth')
const mockedGetServerSession = vi.mocked(getServerSession)

const { POST } = await import('@/app/api/lifecycle/employees/route')
const { setLifecycleServiceForTesting, clearLifecycleServiceForTesting } =
  await import('@/lib/lifecycle/lifecycle-service-di')

const VALID_BODY = {
  email: 'alice@example.com',
  firstName: 'Alice',
  lastName: 'Anderson',
  role: 'EMPLOYEE',
  hireDate: '2026-04-01',
  departmentId: 'dept-001',
  positionId: 'pos-001',
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/lifecycle/employees', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeSession(role: string, userId = 'actor-1') {
  return { user: { email: 'actor@example.com' }, role, userId }
}

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: 'user-1',
    email: 'alice@example.com',
    firstName: 'Alice',
    lastName: 'Anderson',
    role: 'EMPLOYEE',
    hireDate: new Date('2026-04-01T00:00:00.000Z'),
    departmentId: 'dept-001',
    positionId: 'pos-001',
    ...overrides,
  }
}

function makeLifecycleService(overrides?: Partial<LifecycleService>): LifecycleService {
  return {
    createEmployee: vi.fn().mockResolvedValue(makeEmployee()),
    bulkImportUsers: vi.fn(),
    ...overrides,
  } as unknown as LifecycleService
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  clearLifecycleServiceForTesting()
})

describe('POST /api/lifecycle/employees', () => {
  it('201: ADMIN の正常作成', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('ADMIN'))
    setLifecycleServiceForTesting(makeLifecycleService())
    const res = await POST(makeRequest(VALID_BODY))
    expect(res.status).toBe(201)
    const body = (await res.json()) as { id: string; hireDate: string }
    expect(body.id).toBe('user-1')
    expect(body.hireDate).toBe('2026-04-01')
  })

  it('201: HR_MANAGER も作成可能', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('HR_MANAGER'))
    setLifecycleServiceForTesting(makeLifecycleService())
    const res = await POST(makeRequest(VALID_BODY))
    expect(res.status).toBe(201)
  })

  it('401: 未認証は 401', async () => {
    mockedGetServerSession.mockResolvedValue(null)
    const res = await POST(makeRequest(VALID_BODY))
    expect(res.status).toBe(401)
  })

  it('403: MANAGER は 403', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('MANAGER'))
    setLifecycleServiceForTesting(makeLifecycleService())
    const res = await POST(makeRequest(VALID_BODY))
    expect(res.status).toBe(403)
  })

  it('403: EMPLOYEE は 403', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('EMPLOYEE'))
    setLifecycleServiceForTesting(makeLifecycleService())
    const res = await POST(makeRequest(VALID_BODY))
    expect(res.status).toBe(403)
  })

  it('422: email が不正な場合', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('ADMIN'))
    setLifecycleServiceForTesting(makeLifecycleService())
    const res = await POST(makeRequest({ ...VALID_BODY, email: 'not-email' }))
    expect(res.status).toBe(422)
  })

  it('422: hireDate が不正な形式', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('ADMIN'))
    setLifecycleServiceForTesting(makeLifecycleService())
    const res = await POST(makeRequest({ ...VALID_BODY, hireDate: '2026/04/01' }))
    expect(res.status).toBe(422)
  })

  it('422: role が不正', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('ADMIN'))
    setLifecycleServiceForTesting(makeLifecycleService())
    const res = await POST(makeRequest({ ...VALID_BODY, role: 'INTERN' }))
    expect(res.status).toBe(422)
  })

  it('422: 必須フィールド欠如 (firstName)', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('ADMIN'))
    setLifecycleServiceForTesting(makeLifecycleService())
    const { firstName: _omitted, ...rest } = VALID_BODY
    void _omitted
    const res = await POST(makeRequest(rest))
    expect(res.status).toBe(422)
  })

  it('400: Invalid JSON は 400', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('ADMIN'))
    setLifecycleServiceForTesting(makeLifecycleService())
    const req = new NextRequest('http://localhost/api/lifecycle/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('409: email 重複', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('ADMIN'))
    setLifecycleServiceForTesting(
      makeLifecycleService({
        createEmployee: vi
          .fn()
          .mockRejectedValue(new EmployeeAlreadyExistsError('alice@example.com')),
      }),
    )
    const res = await POST(makeRequest(VALID_BODY))
    expect(res.status).toBe(409)
    const body = (await res.json()) as { email: string }
    expect(body.email).toBe('alice@example.com')
  })

  it('503: サービス未初期化', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('ADMIN'))
    // setLifecycleServiceForTesting を呼ばない
    const res = await POST(makeRequest(VALID_BODY))
    expect(res.status).toBe(503)
  })

  it('500: 未知のエラーは 500', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('ADMIN'))
    setLifecycleServiceForTesting(
      makeLifecycleService({
        createEmployee: vi.fn().mockRejectedValue(new Error('boom')),
      }),
    )
    const res = await POST(makeRequest(VALID_BODY))
    expect(res.status).toBe(500)
  })
})
