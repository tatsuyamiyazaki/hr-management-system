/**
 * Issue #55 / Task 17.1: feedback-transform ジョブワーカー
 *
 * BullMQ の feedback-transform キューからジョブを取り出し、
 * AIGateway でネガティブ表現を建設的表現にマイルド化変換する。
 *
 * 関連要件: Req 10.1, 10.2
 */
import type { Job } from 'bullmq'
import type { AIGateway } from '@/lib/ai-gateway/ai-gateway'
import { createBaseWorker } from '@/lib/jobs/base-worker'
import type { FeedbackRepository, FeedbackTransformJobResult } from './feedback-types'
import { feedbackTransformPayloadSchema } from './feedback-types'
import { buildMildifyPrompt, parseMildifyResponse } from './feedback-prompt'

// ─────────────────────────────────────────────────────────────────────────────
// Dependencies
// ─────────────────────────────────────────────────────────────────────────────

export interface FeedbackWorkerDeps {
  readonly aiGateway: AIGateway
  readonly feedbackRepository: FeedbackRepository
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

  const results = rawComments.map((original, i) => ({
    original,
    transformed: transformed[i]!,
  }))

  return {
    cycleId,
    subjectId,
    results,
    transformedAt: new Date().toISOString(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ワーカー起動ファクトリ
// ─────────────────────────────────────────────────────────────────────────────

export function createFeedbackTransformWorker(deps: FeedbackWorkerDeps) {
  return createBaseWorker('feedback-transform', (job) => processFeedbackTransformJob(job, deps))
}
