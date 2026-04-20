/**
 * Issue #55 / Task 17.1, 17.2: feedback-transform ジョブワーカー
 *
 * BullMQ の feedback-transform キューからジョブを取り出し、
 * AIGateway でネガティブ表現を建設的表現にマイルド化変換する。
 * さらにコメント群から要約を生成し、FeedbackTransformResult に保存する。
 *
 * 関連要件: Req 10.1, 10.2, 10.3, 10.5
 */
import type { Job } from 'bullmq'
import type { AIGateway } from '@/lib/ai-gateway/ai-gateway'
import { createBaseWorker } from '@/lib/jobs/base-worker'
import type {
  FeedbackRepository,
  FeedbackResultRepository,
  FeedbackTransformJobResult,
} from './feedback-types'
import { feedbackTransformPayloadSchema } from './feedback-types'
import {
  buildMildifyPrompt,
  parseMildifyResponse,
  buildSummaryPrompt,
  parseSummaryResponse,
} from './feedback-prompt'

// ─────────────────────────────────────────────────────────────────────────────
// Dependencies
// ─────────────────────────────────────────────────────────────────────────────

export interface FeedbackWorkerDeps {
  readonly aiGateway: AIGateway
  readonly feedbackRepository: FeedbackRepository
  readonly feedbackResultRepository: FeedbackResultRepository
  readonly generateId?: () => string
}

// ─────────────────────────────────────────────────────────────────────────────
// Payload validation
// ─────────────────────────────────────────────────────────────────────────────

function isFeedbackTransformPayload(
  value: unknown,
): value is { cycleId: string; subjectId: string } {
  return feedbackTransformPayloadSchema.safeParse(value).success
}

// ─────────────────────────────────────────────────────────────────────────────
// ジョブプロセッサ（テスト可能な関数として分離）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * feedback-transform ジョブを処理する。
 * AIGateway と FeedbackRepository は DI で受け取る。
 * マイルド化変換 → 要約生成 → FeedbackTransformResult 保存。
 */
export async function processFeedbackTransformJob(
  job: Job,
  deps: FeedbackWorkerDeps,
): Promise<FeedbackTransformJobResult> {
  const payload = job.data as unknown

  if (!isFeedbackTransformPayload(payload)) {
    throw new Error(`FeedbackTransformWorker: invalid payload for job "${job.id ?? 'unknown'}"`)
  }

  const { cycleId, subjectId } = payload
  const rawComments = await deps.feedbackRepository.findRawComments(cycleId, subjectId)

  if (rawComments.length === 0) {
    return {
      cycleId,
      subjectId,
      results: [],
      summary: '',
      transformedAt: new Date().toISOString(),
    }
  }

  // AIGateway でマイルド化変換
  const messages = buildMildifyPrompt({ rawComments })
  const response = await deps.aiGateway.chat({
    domain: 'feedback',
    messages,
    temperature: 0.3,
  })

  const transformed = parseMildifyResponse(response.content)

  if (!transformed || transformed.length !== rawComments.length) {
    throw new Error(
      `FeedbackTransformWorker: AI response mismatch for job "${job.id ?? 'unknown'}" ` +
        `(expected ${rawComments.length} items, got ${transformed?.length ?? 0})`,
    )
  }

  // AIGateway で要約生成（Req 10.3: 強み・改善点を200〜300字で要約）
  const summaryMessages = buildSummaryPrompt({ transformedComments: transformed })
  const summaryResponse = await deps.aiGateway.chat({
    domain: 'feedback',
    messages: summaryMessages,
    temperature: 0.5,
  })

  const summary = parseSummaryResponse(summaryResponse.content)

  if (!summary) {
    throw new Error(
      `FeedbackTransformWorker: summary generation failed for job "${job.id ?? 'unknown'}"`,
    )
  }

  const results = rawComments.map((original, i) => ({
    original,
    transformed: transformed[i]!,
  }))

  // FeedbackTransformResult に生データと変換後を保存（Req 10.5）
  const id = deps.generateId ? deps.generateId() : `ftr-${cycleId}-${subjectId}`
  await deps.feedbackResultRepository.save({
    id,
    cycleId,
    subjectId,
    rawCommentBatch: rawComments,
    transformedBatch: transformed,
    summary,
    status: 'PENDING_HR_APPROVAL',
  })

  return {
    cycleId,
    subjectId,
    results,
    summary,
    transformedAt: new Date().toISOString(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ワーカー起動ファクトリ
// ─────────────────────────────────────────────────────────────────────────────

export function createFeedbackTransformWorker(deps: FeedbackWorkerDeps) {
  return createBaseWorker('feedback-transform', (job) => processFeedbackTransformJob(job, deps))
}
