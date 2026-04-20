/**
 * Issue #58 / Task 16.2: POST /api/evaluation/ai-coach/validate ルートテスト
 * (Requirements: 9.1, 9.3, 9.5, 9.6)
 *
 * - 認証ガード (401)
 * - バリデーション (422)
 * - 品質OK → canSubmit: true (Req 9.6)
 * - 品質NG → canSubmit: false (Req 9.3)
 * - タイムアウト → 手動モード (Req 9.7)
 * - サービス未初期化 (503)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import type { AICoachService } from '@/lib/ai-coach/ai-coach-service'
import {
  setAICoachServiceForTesting,
  clearAICoachServiceForTesting,
} from '@/lib/ai-coach/ai-coach-service-di'
import type { ValidateResult, AITimeoutResult } from '@/lib/ai-coach/ai-coach-types'

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}))

const { getServerSession } = await import('next-auth')
const mockedGetServerSession = vi.mocked(getServerSession)

const { POST } = await import('@/app/api/evaluation/ai-coach/validate/route')

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/evaluation/ai-coach/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeEmployeeSession(userId = 'user-eval-1') {
  return { user: { email: 'emp@example.com' }, role: 'EMPLOYEE', userId }
}

function makeValidRequestBody() {
  return {
    cycleId: 'cycle-1',
    subjectRoleContext: 'エンジニア / シニア',
    draftComment: '4月のプロジェクトで、メンバーの担当を調整してくれました。',
    conversationHistory: [],
  }
}

function makeQualityOkResult(): ValidateResult {
  return {
    qualityOk: true,
    missingAspects: [],
    suggestions: '',
    turnNumber: 1,
  }
}

function makeQualityNgResult(): ValidateResult {
  return {
    qualityOk: false,
    missingAspects: ['具体的なエピソードが不足しています'],
    suggestions: '具体的な場面や行動を追記してください。',
    turnNumber: 1,
  }
}

function makeTimeoutResult(): AITimeoutResult {
  return {
    timeout: true,
    elapsedMs: 5200,
    fallbackToManual: true,
  }
}

function makeMockService(
  overrides?: Partial<AICoachService>,
): AICoachService {
  return {
    validateComment: vi.fn().mockResolvedValue(makeQualityOkResult()),
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup / Teardown
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  clearAICoachServiceForTesting()
})

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/evaluation/ai-coach/validate', () => {
  it('未認証なら 401 を返す', async () => {
    mockedGetServerSession.mockResolvedValue(null)

    const res = await POST(makeRequest(makeValidRequestBody()))
    expect(res.status).toBe(401)
  })

  it('不正なリクエストボディなら 422 を返す', async () => {
    mockedGetServerSession.mockResolvedValue(makeEmployeeSession())
    setAICoachServiceForTesting(makeMockService())

    const res = await POST(makeRequest({ cycleId: '' }))
    expect(res.status).toBe(422)
  })

  it('サービス未初期化なら 503 を返す', async () => {
    mockedGetServerSession.mockResolvedValue(makeEmployeeSession())
    // clearAICoachServiceForTesting() は afterEach で呼ばれるので、setしない

    const res = await POST(makeRequest(makeValidRequestBody()))
    expect(res.status).toBe(503)
  })

  it('品質OK の場合 success: true と data を返す (Req 9.6)', async () => {
    mockedGetServerSession.mockResolvedValue(makeEmployeeSession())
    const mockService = makeMockService({
      validateComment: vi.fn().mockResolvedValue(makeQualityOkResult()),
    })
    setAICoachServiceForTesting(mockService)

    const res = await POST(makeRequest(makeValidRequestBody()))
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.data.qualityOk).toBe(true)
    expect(json.data.turnNumber).toBe(1)
  })

  it('品質NG の場合 success: true と suggestions を返す (Req 9.3)', async () => {
    mockedGetServerSession.mockResolvedValue(makeEmployeeSession())
    const mockService = makeMockService({
      validateComment: vi.fn().mockResolvedValue(makeQualityNgResult()),
    })
    setAICoachServiceForTesting(mockService)

    const res = await POST(makeRequest(makeValidRequestBody()))
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.data.qualityOk).toBe(false)
    expect(json.data.missingAspects).toContain('具体的なエピソードが不足しています')
    expect(json.data.suggestions).toBe('具体的な場面や行動を追記してください。')
  })

  it('タイムアウト時は timeout フィールドを返す (Req 9.7)', async () => {
    mockedGetServerSession.mockResolvedValue(makeEmployeeSession())
    const mockService = makeMockService({
      validateComment: vi.fn().mockResolvedValue(makeTimeoutResult()),
    })
    setAICoachServiceForTesting(mockService)

    const res = await POST(makeRequest(makeValidRequestBody()))
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.timeout).toBeDefined()
    expect(json.timeout.timeout).toBe(true)
    expect(json.timeout.fallbackToManual).toBe(true)
  })

  it('conversationHistory を含むリクエストが受け付けられる', async () => {
    mockedGetServerSession.mockResolvedValue(makeEmployeeSession())
    const mockService = makeMockService()
    setAICoachServiceForTesting(mockService)

    const body = {
      ...makeValidRequestBody(),
      conversationHistory: [
        { role: 'user' as const, content: '前回のコメント' },
        { role: 'assistant' as const, content: '具体的なエピソードを追加してください' },
      ],
    }

    const res = await POST(makeRequest(body))
    expect(res.status).toBe(200)
    expect(mockService.validateComment).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationHistory: body.conversationHistory,
      }),
    )
  })

  it('evaluatorId はセッションの userId から自動設定される', async () => {
    mockedGetServerSession.mockResolvedValue(makeEmployeeSession('user-abc'))
    const mockService = makeMockService()
    setAICoachServiceForTesting(mockService)

    await POST(makeRequest(makeValidRequestBody()))

    expect(mockService.validateComment).toHaveBeenCalledWith(
      expect.objectContaining({ evaluatorId: 'user-abc' }),
    )
  })
})
