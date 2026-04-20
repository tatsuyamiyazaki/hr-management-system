/**
 * Issue #55 / Task 17.1, 17.2: feedback-transform ワーカー単体テスト
 *
 * - ペイロード検証
 * - AIGateway 呼び出しとマイルド化変換の検証
 * - 要約生成の検証
 * - FeedbackResultRepository 保存の検証
 * - 不正ペイロードのエラーハンドリング
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { processFeedbackTransformJob } from '@/lib/feedback/feedback-worker'
import type { FeedbackWorkerDeps } from '@/lib/feedback/feedback-worker'
import type { FeedbackRepository, FeedbackResultRepository } from '@/lib/feedback/feedback-types'
import type { AIGateway } from '@/lib/ai-gateway/ai-gateway'
import type { Job } from 'bullmq'

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeJob(data: unknown, id = 'job-1'): Job {
  return { id, data, name: 'feedback-transform' } as unknown as Job
}

function makeMockAIGateway(
  mildifyResponse = '["transformed1"]',
  summaryResponse = 'この被評価者は丁寧なコミュニケーションが強みです。一方で、タスクの優先順位付けにおいて改善の余地があります。全体として成長意欲が高く、フィードバックを前向きに受け止める姿勢が評価されています。今後は計画的な業務遂行を意識することで、さらなる成長が期待できます。',
): AIGateway {
  const chatFn = vi
    .fn()
    .mockResolvedValueOnce({
      content: mildifyResponse,
      provider: 'claude',
      usage: { promptTokens: 100, completionTokens: 50 },
      cached: false,
    })
    .mockResolvedValueOnce({
      content: summaryResponse,
      provider: 'claude',
      usage: { promptTokens: 150, completionTokens: 80 },
      cached: false,
    })

  return {
    chat: chatFn,
    getCurrentProvider: vi.fn().mockReturnValue('claude'),
  }
}

function makeMockFeedbackRepository(comments: string[] = []): FeedbackRepository {
  return {
    findSubjectsByCycleId: vi.fn().mockResolvedValue([]),
    findRawComments: vi.fn().mockResolvedValue(comments),
  }
}

function makeMockFeedbackResultRepository(): FeedbackResultRepository {
  return {
    save: vi.fn().mockResolvedValue(undefined),
    findByCycleAndSubject: vi.fn().mockResolvedValue(null),
    findByCycleId: vi.fn().mockResolvedValue([]),
    findPublishedBySubject: vi.fn().mockResolvedValue([]),
    findPublishedBefore: vi.fn().mockResolvedValue([]),
    updateStatus: vi.fn().mockResolvedValue(undefined),
  }
}

function makeDeps(overrides: Partial<FeedbackWorkerDeps> = {}): FeedbackWorkerDeps {
  return {
    aiGateway: overrides.aiGateway ?? makeMockAIGateway(),
    feedbackRepository: overrides.feedbackRepository ?? makeMockFeedbackRepository(),
    feedbackResultRepository:
      overrides.feedbackResultRepository ?? makeMockFeedbackResultRepository(),
    generateId: overrides.generateId ?? (() => 'test-id-1'),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
// processFeedbackTransformJob
// ─────────────────────────────────────────────────────────────────────────────

describe('processFeedbackTransformJob', () => {
  it('有効なペイロードで AIGateway を呼び出しマイルド化変換と要約生成を行う', async () => {
    const comments = ['彼の仕事は雑すぎる', 'やる気が全くない']
    const transformedResponse =
      '["丁寧さを意識するとさらに良くなります", "モチベーション向上のサポートが有効かもしれません"]'
    const summaryResponse =
      '強みとして誠実な取り組み姿勢が見られます。改善点として、作業の丁寧さとモチベーション管理に課題があります。'
    const aiGateway = makeMockAIGateway(transformedResponse, summaryResponse)
    const repo = makeMockFeedbackRepository(comments)
    const resultRepo = makeMockFeedbackResultRepository()
    const deps = makeDeps({
      aiGateway,
      feedbackRepository: repo,
      feedbackResultRepository: resultRepo,
    })
    const job = makeJob({ cycleId: 'cycle-1', subjectId: 'user-1' })

    const result = await processFeedbackTransformJob(job, deps)

    expect(repo.findRawComments).toHaveBeenCalledWith('cycle-1', 'user-1')
    expect(aiGateway.chat).toHaveBeenCalledTimes(2)
    expect(result.cycleId).toBe('cycle-1')
    expect(result.subjectId).toBe('user-1')
    expect(result.results).toHaveLength(2)
    expect(result.results[0]!.original).toBe('彼の仕事は雑すぎる')
    expect(result.results[0]!.transformed).toBe('丁寧さを意識するとさらに良くなります')
    expect(result.results[1]!.original).toBe('やる気が全くない')
    expect(result.results[1]!.transformed).toBe('モチベーション向上のサポートが有効かもしれません')
    expect(result.summary).toBe(summaryResponse)
    expect(result.transformedAt).toBeDefined()
  })

  it('要約生成後に FeedbackResultRepository に保存される', async () => {
    const comments = ['良い仕事をしている']
    const transformedResponse = '["引き続き良い仕事を続けてください"]'
    const summaryResponse =
      '丁寧な業務遂行が強みとして評価されています。今後も継続的な成長が期待されます。'
    const aiGateway = makeMockAIGateway(transformedResponse, summaryResponse)
    const repo = makeMockFeedbackRepository(comments)
    const resultRepo = makeMockFeedbackResultRepository()
    const deps = makeDeps({
      aiGateway,
      feedbackRepository: repo,
      feedbackResultRepository: resultRepo,
    })
    const job = makeJob({ cycleId: 'cycle-1', subjectId: 'user-1' })

    await processFeedbackTransformJob(job, deps)

    expect(resultRepo.save).toHaveBeenCalledOnce()
    expect(resultRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'test-id-1',
        cycleId: 'cycle-1',
        subjectId: 'user-1',
        rawCommentBatch: ['良い仕事をしている'],
        transformedBatch: ['引き続き良い仕事を続けてください'],
        summary: summaryResponse,
        status: 'PENDING_HR_APPROVAL',
      }),
    )
  })

  it('コメントが空の場合は AI を呼ばずに空結果を返す', async () => {
    const aiGateway = makeMockAIGateway()
    const repo = makeMockFeedbackRepository([])
    const resultRepo = makeMockFeedbackResultRepository()
    const deps = makeDeps({
      aiGateway,
      feedbackRepository: repo,
      feedbackResultRepository: resultRepo,
    })
    const job = makeJob({ cycleId: 'cycle-1', subjectId: 'user-1' })

    const result = await processFeedbackTransformJob(job, deps)

    expect(aiGateway.chat).not.toHaveBeenCalled()
    expect(result.results).toHaveLength(0)
    expect(result.summary).toBe('')
    expect(resultRepo.save).not.toHaveBeenCalled()
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

    await expect(processFeedbackTransformJob(job, deps)).rejects.toThrow('AI response mismatch')
  })

  it('AI レスポンスが不正なJSONの場合はエラーをスローする', async () => {
    const comments = ['コメント1']
    const aiGateway = makeMockAIGateway('invalid json response')
    const repo = makeMockFeedbackRepository(comments)
    const deps = makeDeps({ aiGateway, feedbackRepository: repo })
    const job = makeJob({ cycleId: 'cycle-1', subjectId: 'user-1' })

    await expect(processFeedbackTransformJob(job, deps)).rejects.toThrow('AI response mismatch')
  })

  it('要約生成が失敗した場合はエラーをスローする', async () => {
    const comments = ['コメント1']
    const aiGateway = makeMockAIGateway('["変換1"]', '')
    const repo = makeMockFeedbackRepository(comments)
    const deps = makeDeps({ aiGateway, feedbackRepository: repo })
    const job = makeJob({ cycleId: 'cycle-1', subjectId: 'user-1' })

    await expect(processFeedbackTransformJob(job, deps)).rejects.toThrow(
      'summary generation failed',
    )
  })

  it('AIGateway がエラーを投げた場合はそのまま伝播する', async () => {
    const comments = ['コメント1']
    const aiGateway: AIGateway = {
      chat: vi.fn().mockRejectedValue(new Error('AI provider timeout')),
      getCurrentProvider: vi.fn().mockReturnValue('claude'),
    }
    const repo = makeMockFeedbackRepository(comments)
    const deps = makeDeps({ aiGateway, feedbackRepository: repo })
    const job = makeJob({ cycleId: 'cycle-1', subjectId: 'user-1' })

    await expect(processFeedbackTransformJob(job, deps)).rejects.toThrow('AI provider timeout')
  })
})
