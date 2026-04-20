/**
 * Issue #55 / Task 17.1: feedback-transform ワーカー単体テスト
 *
 * - ペイロード検証
 * - AIGateway 呼び出しとマイルド化変換の検証
 * - 不正ペイロードのエラーハンドリング
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { processFeedbackTransformJob } from '@/lib/feedback/feedback-worker'
import type { FeedbackWorkerDeps } from '@/lib/feedback/feedback-worker'
import type { FeedbackRepository } from '@/lib/feedback/feedback-types'
import type { AIGateway } from '@/lib/ai-gateway/ai-gateway'
import type { Job } from 'bullmq'

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeJob(data: unknown, id = 'job-1'): Job {
  return { id, data, name: 'feedback-transform' } as unknown as Job
}

function makeMockAIGateway(responseContent = '["transformed1"]'): AIGateway {
  return {
    chat: vi.fn().mockResolvedValue({
      content: responseContent,
      provider: 'claude',
      usage: { promptTokens: 100, completionTokens: 50 },
      cached: false,
    }),
    getCurrentProvider: vi.fn().mockReturnValue('claude'),
  }
}

function makeMockFeedbackRepository(comments: string[] = []): FeedbackRepository {
  return {
    findSubjectsByCycleId: vi.fn().mockResolvedValue([]),
    findRawComments: vi.fn().mockResolvedValue(comments),
  }
}

function makeDeps(
  overrides: Partial<FeedbackWorkerDeps> = {},
): FeedbackWorkerDeps {
  return {
    aiGateway: overrides.aiGateway ?? makeMockAIGateway(),
    feedbackRepository: overrides.feedbackRepository ?? makeMockFeedbackRepository(),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
// processFeedbackTransformJob
// ─────────────────────────────────────────────────────────────────────────────

describe('processFeedbackTransformJob', () => {
  it('有効なペイロードで AIGateway を呼び出しマイルド化変換する', async () => {
    const comments = ['彼の仕事は雑すぎる', 'やる気が全くない']
    const transformedResponse = '["丁寧さを意識するとさらに良くなります", "モチベーション向上のサポートが有効かもしれません"]'
    const aiGateway = makeMockAIGateway(transformedResponse)
    const repo = makeMockFeedbackRepository(comments)
    const deps = makeDeps({ aiGateway, feedbackRepository: repo })
    const job = makeJob({ cycleId: 'cycle-1', subjectId: 'user-1' })

    const result = await processFeedbackTransformJob(job, deps)

    expect(repo.findRawComments).toHaveBeenCalledWith('cycle-1', 'user-1')
    expect(aiGateway.chat).toHaveBeenCalledOnce()
    expect(result.cycleId).toBe('cycle-1')
    expect(result.subjectId).toBe('user-1')
    expect(result.results).toHaveLength(2)
    expect(result.results[0]!.original).toBe('彼の仕事は雑すぎる')
    expect(result.results[0]!.transformed).toBe('丁寧さを意識するとさらに良くなります')
    expect(result.results[1]!.original).toBe('やる気が全くない')
    expect(result.results[1]!.transformed).toBe('モチベーション向上のサポートが有効かもしれません')
    expect(result.transformedAt).toBeDefined()
  })

  it('コメントが空の場合は AI を呼ばずに空結果を返す', async () => {
    const aiGateway = makeMockAIGateway()
    const repo = makeMockFeedbackRepository([])
    const deps = makeDeps({ aiGateway, feedbackRepository: repo })
    const job = makeJob({ cycleId: 'cycle-1', subjectId: 'user-1' })

    const result = await processFeedbackTransformJob(job, deps)

    expect(aiGateway.chat).not.toHaveBeenCalled()
    expect(result.results).toHaveLength(0)
  })

  it('不正なペイロード（cycleId 欠落）はエラーをスローする', async () => {
    const deps = makeDeps()
    const job = makeJob({ subjectId: 'user-1' })

    await expect(processFeedbackTransformJob(job, deps)).rejects.toThrow(
      'FeedbackTransformWorker: invalid payload',
    )
  })

  it('不正なペイロード（subjectId 欠落）はエラーをスローする', async () => {
    const deps = makeDeps()
    const job = makeJob({ cycleId: 'cycle-1' })

    await expect(processFeedbackTransformJob(job, deps)).rejects.toThrow(
      'FeedbackTransformWorker: invalid payload',
    )
  })

  it('空のペイロードはエラーをスローする', async () => {
    const deps = makeDeps()
    const job = makeJob({})

    await expect(processFeedbackTransformJob(job, deps)).rejects.toThrow(
      'FeedbackTransformWorker: invalid payload',
    )
  })

  it('null ペイロードはエラーをスローする', async () => {
    const deps = makeDeps()
    const job = makeJob(null)

    await expect(processFeedbackTransformJob(job, deps)).rejects.toThrow(
      'FeedbackTransformWorker: invalid payload',
    )
  })

  it('AI レスポンスが配列数不一致の場合はエラーをスローする', async () => {
    const comments = ['コメント1', 'コメント2']
    const aiGateway = makeMockAIGateway('["変換1"]') // 2件のうち1件しか返さない
    const repo = makeMockFeedbackRepository(comments)
    const deps = makeDeps({ aiGateway, feedbackRepository: repo })
    const job = makeJob({ cycleId: 'cycle-1', subjectId: 'user-1' })

    await expect(processFeedbackTransformJob(job, deps)).rejects.toThrow(
      'AI response mismatch',
    )
  })

  it('AI レスポンスが不正なJSONの場合はエラーをスローする', async () => {
    const comments = ['コメント1']
    const aiGateway = makeMockAIGateway('invalid json response')
    const repo = makeMockFeedbackRepository(comments)
    const deps = makeDeps({ aiGateway, feedbackRepository: repo })
    const job = makeJob({ cycleId: 'cycle-1', subjectId: 'user-1' })

    await expect(processFeedbackTransformJob(job, deps)).rejects.toThrow(
      'AI response mismatch',
    )
  })

  it('AIGateway がエラーを投げた場合はそのまま伝播する', async () => {
    const comments = ['コメント1']
    const aiGateway = makeMockAIGateway()
    vi.mocked(aiGateway.chat).mockRejectedValue(new Error('AI provider timeout'))
    const repo = makeMockFeedbackRepository(comments)
    const deps = makeDeps({ aiGateway, feedbackRepository: repo })
    const job = makeJob({ cycleId: 'cycle-1', subjectId: 'user-1' })

    await expect(processFeedbackTransformJob(job, deps)).rejects.toThrow('AI provider timeout')
  })
})
