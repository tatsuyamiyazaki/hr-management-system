/**
 * Issue #67 / Task 19.2: Total evaluation routes tests.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import {
  clearTotalEvaluationServiceForTesting,
  setTotalEvaluationServiceForTesting,
} from '@/lib/total-evaluation/total-evaluation-service-di'
import type { TotalEvaluationService } from '@/lib/total-evaluation/total-evaluation-types'

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}))

const { getServerSession } = await import('next-auth')
const mockedGetServerSession = vi.mocked(getServerSession)

const { GET: previewGET } = await import('@/app/api/total-evaluation/preview/route')
const { GET: overrideGET, PUT: overridePUT } =
  await import('@/app/api/total-evaluation/override/route')

function makeSession(role: string, userId = 'user-1') {
  return {
    user: { email: 'user@example.com' },
    userId,
    role,
  }
}

function makeJsonRequest(url: string, method: 'PUT', body: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeService(overrides?: Partial<TotalEvaluationService>): TotalEvaluationService {
  return {
    calculateAll: vi.fn(),
    calculateSubject: vi.fn(),
    scheduleCalculateAll: vi.fn(),
    previewBeforeFinalize: vi.fn().mockResolvedValue({
      cycleId: 'cycle-1',
      results: [
        {
          subjectId: 'user-1',
          finalScore: 80,
          hasWeightOverride: false,
          isNearGradeThreshold: false,
        },
      ],
    }),
    getWeightOverride: vi.fn().mockResolvedValue(null),
    overrideWeight: vi.fn().mockResolvedValue({
      cycleId: 'cycle-1',
      subjectId: 'user-1',
      finalScore: 79,
      performanceWeight: 0.4,
      goalWeight: 0.4,
      feedbackWeight: 0.2,
    }),
    ...overrides,
  } as TotalEvaluationService
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  clearTotalEvaluationServiceForTesting()
})

describe('GET /api/total-evaluation/preview', () => {
  it('未認証は401', async () => {
    mockedGetServerSession.mockResolvedValue(null)

    const res = await previewGET(
      new NextRequest('http://localhost/api/total-evaluation/preview?cycleId=cycle-1'),
    )

    expect(res.status).toBe(401)
  })

  it('EMPLOYEEは403', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('EMPLOYEE'))
    setTotalEvaluationServiceForTesting(makeService())

    const res = await previewGET(
      new NextRequest('http://localhost/api/total-evaluation/preview?cycleId=cycle-1'),
    )

    expect(res.status).toBe(403)
  })

  it('cycleId未指定は400', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('HR_MANAGER'))
    setTotalEvaluationServiceForTesting(makeService())

    const res = await previewGET(new NextRequest('http://localhost/api/total-evaluation/preview'))

    expect(res.status).toBe(400)
  })

  it('HR_MANAGERが確定前プレビューを取得できる', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('HR_MANAGER'))
    const service = makeService()
    setTotalEvaluationServiceForTesting(service)

    const res = await previewGET(
      new NextRequest('http://localhost/api/total-evaluation/preview?cycleId=cycle-1'),
    )

    expect(res.status).toBe(200)
    expect(service.previewBeforeFinalize).toHaveBeenCalledWith('cycle-1')
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: {
        cycleId: 'cycle-1',
        results: [
          {
            subjectId: 'user-1',
            finalScore: 80,
            hasWeightOverride: false,
            isNearGradeThreshold: false,
          },
        ],
      },
    })
  })
})

describe('GET /api/total-evaluation/override', () => {
  it('HR_MANAGERが上書き設定を取得できる', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('HR_MANAGER', 'hr-1'))
    const service = makeService({
      getWeightOverride: vi.fn().mockResolvedValue({
        cycleId: 'cycle-1',
        subjectId: 'user-1',
        performanceWeight: 0.4,
        goalWeight: 0.4,
        feedbackWeight: 0.2,
        reason: '評価会議で調整',
        adjustedBy: 'hr-1',
      }),
    })
    setTotalEvaluationServiceForTesting(service)

    const res = await overrideGET(
      new NextRequest(
        'http://localhost/api/total-evaluation/override?cycleId=cycle-1&subjectId=user-1',
      ),
    )

    expect(res.status).toBe(200)
    expect(service.getWeightOverride).toHaveBeenCalledWith('cycle-1', 'user-1')
  })
})

describe('PUT /api/total-evaluation/override', () => {
  it('EMPLOYEEは403', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('EMPLOYEE'))
    setTotalEvaluationServiceForTesting(makeService())

    const res = await overridePUT(
      makeJsonRequest('http://localhost/api/total-evaluation/override', 'PUT', {
        cycleId: 'cycle-1',
        subjectId: 'user-1',
        performanceWeight: 0.4,
        goalWeight: 0.4,
        feedbackWeight: 0.2,
        reason: '評価会議で調整',
      }),
    )

    expect(res.status).toBe(403)
  })

  it('不正なウェイト合計は422', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('HR_MANAGER', 'hr-1'))
    setTotalEvaluationServiceForTesting(makeService())

    const res = await overridePUT(
      makeJsonRequest('http://localhost/api/total-evaluation/override', 'PUT', {
        cycleId: 'cycle-1',
        subjectId: 'user-1',
        performanceWeight: 0.5,
        goalWeight: 0.4,
        feedbackWeight: 0.2,
        reason: '評価会議で調整',
      }),
    )

    expect(res.status).toBe(422)
  })

  it('HR_MANAGERがウェイト上書きを更新できる', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession('HR_MANAGER', 'hr-1'))
    const service = makeService()
    setTotalEvaluationServiceForTesting(service)

    const res = await overridePUT(
      makeJsonRequest('http://localhost/api/total-evaluation/override', 'PUT', {
        cycleId: 'cycle-1',
        subjectId: 'user-1',
        performanceWeight: 0.4,
        goalWeight: 0.4,
        feedbackWeight: 0.2,
        reason: '評価会議で調整',
      }),
    )

    expect(res.status).toBe(200)
    expect(service.overrideWeight).toHaveBeenCalledWith(
      expect.objectContaining({
        cycleId: 'cycle-1',
        subjectId: 'user-1',
        performanceWeight: 0.4,
        goalWeight: 0.4,
        feedbackWeight: 0.2,
        reason: '評価会議で調整',
        adjustedBy: 'hr-1',
      }),
    )
  })
})
