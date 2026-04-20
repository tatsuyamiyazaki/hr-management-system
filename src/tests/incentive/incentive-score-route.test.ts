/**
 * Issue #65 / Task 18.2: GET /api/incentive/score ルートハンドラのテスト (Req 11.4)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import type { IncentiveScore, IncentiveService } from '@/lib/incentive/incentive-types'
import {
  setIncentiveServiceForTesting,
  clearIncentiveServiceForTesting,
} from '@/lib/incentive/incentive-service-di'

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}))

const { getServerSession } = await import('next-auth')
const mockedGetServerSession = vi.mocked(getServerSession)

const { GET } = await import('@/app/api/incentive/score/route')

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeRequest(query = ''): NextRequest {
  return new NextRequest(`http://localhost/api/incentive/score${query}`)
}

function makeEmployeeSession(userId = 'user-1') {
  return {
    user: { email: 'test@example.com' },
    userId,
    role: 'EMPLOYEE',
  }
}

function makeIncentiveService(overrides?: Partial<IncentiveService>): IncentiveService {
  return {
    applyIncentive: vi.fn().mockResolvedValue(undefined),
    getCumulativeScore: vi.fn().mockResolvedValue({ evaluationCount: 0, cumulativeScore: 0 }),
    getAdjustmentForTotalEvaluation: vi.fn().mockResolvedValue(new Map()),
    ...overrides,
  } as unknown as IncentiveService
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  clearIncentiveServiceForTesting()
})

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/incentive/score', () => {
  it('未認証リクエストは 401', async () => {
    mockedGetServerSession.mockResolvedValue(null)

    const req = makeRequest('?cycleId=cycle-1')
    const res = await GET(req)

    expect(res.status).toBe(401)
  })

  it('cycleId パラメータがない場合は 400', async () => {
    mockedGetServerSession.mockResolvedValue(makeEmployeeSession())

    const req = makeRequest()
    const res = await GET(req)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('cycleId is required')
  })

  it('サービス未初期化の場合は 503', async () => {
    mockedGetServerSession.mockResolvedValue(makeEmployeeSession())
    clearIncentiveServiceForTesting()

    const req = makeRequest('?cycleId=cycle-1')
    const res = await GET(req)

    expect(res.status).toBe(503)
  })

  it('正常リクエストでスコアを返す', async () => {
    mockedGetServerSession.mockResolvedValue(makeEmployeeSession('user-1'))

    const expectedScore: IncentiveScore = { evaluationCount: 3, cumulativeScore: 4.5 }
    const mockService = makeIncentiveService({
      getCumulativeScore: vi.fn().mockResolvedValue(expectedScore),
    })
    setIncentiveServiceForTesting(mockService)

    const req = makeRequest('?cycleId=cycle-1')
    const res = await GET(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data).toEqual(expectedScore)
    expect(mockService.getCumulativeScore).toHaveBeenCalledWith('user-1', 'cycle-1')
  })

  it('サービスがエラーをスローした場合は 500', async () => {
    mockedGetServerSession.mockResolvedValue(makeEmployeeSession())

    const mockService = makeIncentiveService({
      getCumulativeScore: vi.fn().mockRejectedValue(new Error('DB error')),
    })
    setIncentiveServiceForTesting(mockService)

    const req = makeRequest('?cycleId=cycle-1')
    const res = await GET(req)

    expect(res.status).toBe(500)
  })
})
