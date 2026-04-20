/**
 * Issue #66 / Task 19.1: Total evaluation preview API tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import {
  setTotalEvaluationServiceForTesting,
  clearTotalEvaluationServiceForTesting,
} from '@/lib/total-evaluation/total-evaluation-service-di'
import type { TotalEvaluationService } from '@/lib/total-evaluation/total-evaluation-types'

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}))

const { getServerSession } = await import('next-auth')
const mockedGetServerSession = vi.mocked(getServerSession)

const { GET: previewGET } = await import('@/app/api/total-evaluation/preview/route')

function makeSession(role: string) {
  return {
    user: { email: 'user@example.com' },
    userId: 'user-1',
    role,
  }
}

function makeService(overrides?: Partial<TotalEvaluationService>): TotalEvaluationService {
  return {
    calculateAll: vi.fn(),
    calculateSubject: vi.fn(),
    scheduleCalculateAll: vi.fn(),
    previewBeforeFinalize: vi.fn().mockResolvedValue({
      cycleId: 'cycle-1',
      results: [{ subjectId: 'user-1', finalScore: 80 }],
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
        results: [{ subjectId: 'user-1', finalScore: 80 }],
      },
    })
  })
})
