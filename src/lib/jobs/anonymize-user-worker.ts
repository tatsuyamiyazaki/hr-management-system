/**
 * Issue #31 / Req 14.7: anonymize-user ジョブワーカー
 *
 * BullMQ の anonymize-user キューからジョブを取り出し、
 * AnonymizationService.anonymizeUser() を呼び出して個別ユーザーを匿名化する。
 */
import type { Job } from 'bullmq'
import { jobPayloadSchema } from '@/lib/jobs/job-types'
import { createBaseWorker } from '@/lib/jobs/base-worker'
import type { AnonymizationService } from '@/lib/lifecycle/anonymization-service'

// ─────────────────────────────────────────────────────────────────────────────
// Result type
// ─────────────────────────────────────────────────────────────────────────────

export interface AnonymizeUserJobResult {
  readonly userId: string
  readonly anonymizedAt: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Payload validation
// ─────────────────────────────────────────────────────────────────────────────

function isAnonymizeUserPayload(value: unknown): value is { userId: string; requestedBy: string } {
  return jobPayloadSchema['anonymize-user'].safeParse(value).success
}

// ─────────────────────────────────────────────────────────────────────────────
// ジョブプロセッサ（テスト可能な関数として分離）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * anonymize-user ジョブを処理する。
 * AnonymizationService は DI で受け取る。
 */
export async function processAnonymizeUserJob(
  job: Job,
  service: AnonymizationService,
): Promise<AnonymizeUserJobResult> {
  const payload = job.data as unknown

  if (!isAnonymizeUserPayload(payload)) {
    throw new Error(`AnonymizeUserWorker: invalid payload for job "${job.id ?? 'unknown'}"`)
  }

  await service.anonymizeUser(payload.userId, payload.requestedBy)

  return {
    userId: payload.userId,
    anonymizedAt: new Date().toISOString(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ワーカー起動ファクトリ
// ─────────────────────────────────────────────────────────────────────────────

export function createAnonymizeUserWorker(service: AnonymizationService) {
  return createBaseWorker('anonymize-user', (job) => processAnonymizeUserJob(job, service))
}
