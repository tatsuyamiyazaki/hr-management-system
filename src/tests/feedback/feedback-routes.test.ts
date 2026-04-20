/**
 * Issue #55 / Task 17.3: フィードバック承認・プレビュー・公開 API ルートテスト
 *
 * - GET /api/feedback/preview (HR_MANAGER プレビュー)
 * - POST /api/feedback/approve (HR_MANAGER 承認・公開)
 * - GET /api/feedback/published (被評価者の公開フィードバック閲覧)
 *
 * 関連要件: Req 10.4, 10.6
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import {
  setFeedbackServiceForTesting,
  clearFeedbackServiceForTesting,
} from '@/lib/feedback/feedback-service-di'
import type { FeedbackService, FeedbackPreview, PublishedFeedback } from '@/lib/feedback/feedback-types'
import { FeedbackNotFoundError, FeedbackInvalidStatusError } from '@/lib/feedback/feedback-service'

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}))

const { getServerSession } = await import('next-auth')
const mockedGetServerSession = vi.mocked(getServerSession)

const { GET: previewGET } = await import('@/app/api/feedback/preview/route')
const { POST: approvePost } = await import('@/app/api/feedback/approve/route')
const { GET: publishedGET } = await import('@/app/api/feedback/published/route')

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeHrManagerSession(userId = 'hr-mgr-1') {
  return {
    user: { email: 'hr@example.com' },
    userId,
    role: 'HR_MANAGER',
  }
}

function makeEmployeeSession(userId = 'emp-1') {
  return {
    user: { email: 'emp@example.com' },
    userId,
    role: 'EMPLOYEE',
  }
}

function makeMockFeedbackService(overrides?: Partial<FeedbackService>): FeedbackService {
  return {
    scheduleTransform: vi.fn().mockResolvedValue(undefined),
    previewTransformed: vi.fn().mockResolvedValue(null),
    approveAndPublish: vi.fn().mockResolvedValue(undefined),
    getPublishedFor: vi.fn().mockResolvedValue([]),
    ...overrides,
  }
}

function makeSamplePreview(): FeedbackPreview {
  return {
    cycleId: 'cycle-1',
    subjectId: 'user-1',
    transformedBatch: ['Great team player'],
    summary: 'Shows strong collaboration skills',
    status: 'PENDING_HR_APPROVAL',
  }
}

function makeSamplePublished(): PublishedFeedback {
  return {
    id: 'ftr-1',
    cycleId: 'cycle-1',
    subjectId: 'emp-1',
    transformedBatch: ['Great team player'],
    summary: 'Shows strong collaboration skills',
    publishedAt: '2025-01-15T10:00:00.000Z',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  clearFeedbackServiceForTesting()
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/feedback/preview
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/feedback/preview', () => {
  it('未認証リクエストは 401', async () => {
    mockedGetServerSession.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/feedback/preview?cycleId=c1&subjectId=s1')
    const res = await previewGET(req)
    expect(res.status).toBe(401)
  })

  it('EMPLOYEE ロールは 403', async () => {
    mockedGetServerSession.mockResolvedValue(makeEmployeeSession())
    setFeedbackServiceForTesting(makeMockFeedbackService())

    const req = new NextRequest('http://localhost/api/feedback/preview?cycleId=c1&subjectId=s1')
    const res = await previewGET(req)
    expect(res.status).toBe(403)
  })

  it('cycleId/subjectId 未指定は 400', async () => {
    mockedGetServerSession.mockResolvedValue(makeHrManagerSession())
    setFeedbackServiceForTesting(makeMockFeedbackService())

    const req = new NextRequest('http://localhost/api/feedback/preview')
    const res = await previewGET(req)
    expect(res.status).toBe(400)
  })

  it('結果が存在しない場合 404', async () => {
    mockedGetServerSession.mockResolvedValue(makeHrManagerSession())
    setFeedbackServiceForTesting(makeMockFeedbackService({ previewTransformed: vi.fn().mockResolvedValue(null) }))

    const req = new NextRequest('http://localhost/api/feedback/preview?cycleId=c1&subjectId=s1')
    const res = await previewGET(req)
    expect(res.status).toBe(404)
  })

  it('HR_MANAGER がプレビューを取得できる', async () => {
    mockedGetServerSession.mockResolvedValue(makeHrManagerSession())
    const preview = makeSamplePreview()
    setFeedbackServiceForTesting(makeMockFeedbackService({ previewTransformed: vi.fn().mockResolvedValue(preview) }))

    const req = new NextRequest('http://localhost/api/feedback/preview?cycleId=cycle-1&subjectId=user-1')
    const res = await previewGET(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data).toEqual(preview)
  })

  it('サービス未初期化は 503', async () => {
    mockedGetServerSession.mockResolvedValue(makeHrManagerSession())
    // サービスをセットしない

    const req = new NextRequest('http://localhost/api/feedback/preview?cycleId=c1&subjectId=s1')
    const res = await previewGET(req)
    expect(res.status).toBe(503)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/feedback/approve
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/feedback/approve', () => {
  it('未認証リクエストは 401', async () => {
    mockedGetServerSession.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/feedback/approve', {
      method: 'POST',
      body: JSON.stringify({ cycleId: 'c1', subjectId: 's1' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await approvePost(req)
    expect(res.status).toBe(401)
  })

  it('EMPLOYEE ロールは 403', async () => {
    mockedGetServerSession.mockResolvedValue(makeEmployeeSession())
    setFeedbackServiceForTesting(makeMockFeedbackService())

    const req = new NextRequest('http://localhost/api/feedback/approve', {
      method: 'POST',
      body: JSON.stringify({ cycleId: 'c1', subjectId: 's1' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await approvePost(req)
    expect(res.status).toBe(403)
  })

  it('不正なリクエストボディは 422', async () => {
    mockedGetServerSession.mockResolvedValue(makeHrManagerSession())
    setFeedbackServiceForTesting(makeMockFeedbackService())

    const req = new NextRequest('http://localhost/api/feedback/approve', {
      method: 'POST',
      body: JSON.stringify({ cycleId: '' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await approvePost(req)
    expect(res.status).toBe(422)
  })

  it('フィードバックが存在しない場合 404', async () => {
    mockedGetServerSession.mockResolvedValue(makeHrManagerSession())
    setFeedbackServiceForTesting(
      makeMockFeedbackService({
        approveAndPublish: vi.fn().mockRejectedValue(new FeedbackNotFoundError('c1', 's1')),
      }),
    )

    const req = new NextRequest('http://localhost/api/feedback/approve', {
      method: 'POST',
      body: JSON.stringify({ cycleId: 'c1', subjectId: 's1' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await approvePost(req)
    expect(res.status).toBe(404)
  })

  it('ステータスが不正な場合 409', async () => {
    mockedGetServerSession.mockResolvedValue(makeHrManagerSession())
    setFeedbackServiceForTesting(
      makeMockFeedbackService({
        approveAndPublish: vi.fn().mockRejectedValue(new FeedbackInvalidStatusError('PENDING_HR_APPROVAL', 'PUBLISHED')),
      }),
    )

    const req = new NextRequest('http://localhost/api/feedback/approve', {
      method: 'POST',
      body: JSON.stringify({ cycleId: 'c1', subjectId: 's1' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await approvePost(req)
    expect(res.status).toBe(409)
  })

  it('HR_MANAGER が正常に承認・公開できる', async () => {
    mockedGetServerSession.mockResolvedValue(makeHrManagerSession())
    const mockApprove = vi.fn().mockResolvedValue(undefined)
    setFeedbackServiceForTesting(makeMockFeedbackService({ approveAndPublish: mockApprove }))

    const req = new NextRequest('http://localhost/api/feedback/approve', {
      method: 'POST',
      body: JSON.stringify({ cycleId: 'cycle-1', subjectId: 'user-1' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await approvePost(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(mockApprove).toHaveBeenCalledWith('cycle-1', 'user-1', 'hr-mgr-1')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/feedback/published
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/feedback/published', () => {
  it('未認証リクエストは 401', async () => {
    mockedGetServerSession.mockResolvedValue(null)

    const res = await publishedGET()
    expect(res.status).toBe(401)
  })

  it('認証済みユーザーの公開フィードバックを取得できる（匿名）', async () => {
    mockedGetServerSession.mockResolvedValue(makeEmployeeSession('emp-1'))
    const published = makeSamplePublished()
    setFeedbackServiceForTesting(makeMockFeedbackService({ getPublishedFor: vi.fn().mockResolvedValue([published]) }))

    const res = await publishedGET()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data).toHaveLength(1)
    expect(body.data[0]).toEqual(published)
    // evaluatorId が含まれないことを確認（匿名性保証）
    expect(body.data[0]).not.toHaveProperty('evaluatorId')
    expect(body.data[0]).not.toHaveProperty('rawCommentBatch')
    expect(body.data[0]).not.toHaveProperty('approvedBy')
  })

  it('userId が取得できない場合 401', async () => {
    mockedGetServerSession.mockResolvedValue({ user: { email: 'test@example.com' } })
    setFeedbackServiceForTesting(makeMockFeedbackService())

    const res = await publishedGET()
    expect(res.status).toBe(401)
  })
})
