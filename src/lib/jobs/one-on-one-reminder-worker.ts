/**
 * Issue #49 / Req 7.6: one-on-one-reminder ジョブワーカー
 *
 * BullMQ の one-on-one-reminder キューからジョブを取り出し、
 * OneOnOneReminderService.scanMissingLogs() を呼び出して
 * 30日以上ログがない部下を検出し通知を送信する。
 *
 * cron: '0 9 * * *' (JST 09:00)
 */
import type { Job } from 'bullmq'
import { jobPayloadSchema } from '@/lib/jobs/job-types'
import { createBaseWorker } from '@/lib/jobs/base-worker'
import type { OneOnOneReminderService } from '@/lib/one-on-one/one-on-one-reminder-service'

// ─────────────────────────────────────────────────────────────────────────────
// Result type
// ─────────────────────────────────────────────────────────────────────────────

export interface OneOnOneReminderJobResult {
  readonly triggeredAt: string
  readonly notified: number
  readonly skipped: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Payload validation
// ─────────────────────────────────────────────────────────────────────────────

function isOneOnOneReminderPayload(value: unknown): value is { triggeredAt: string } {
  return jobPayloadSchema['one-on-one-reminder'].safeParse(value).success
}

// ─────────────────────────────────────────────────────────────────────────────
// ジョブプロセッサ（テスト可能な関数として分離）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * one-on-one-reminder ジョブを処理する。
 * OneOnOneReminderService は DI で受け取る。
 */
export async function processOneOnOneReminderJob(
  job: Job,
  service: OneOnOneReminderService,
): Promise<OneOnOneReminderJobResult> {
  const payload = job.data as unknown

  if (!isOneOnOneReminderPayload(payload)) {
    throw new Error(`OneOnOneReminderWorker: invalid payload for job "${job.id ?? 'unknown'}"`)
  }

  const now = new Date(payload.triggeredAt)
  const result = await service.scanMissingLogs(now)

  return {
    triggeredAt: payload.triggeredAt,
    notified: result.notified,
    skipped: result.skipped,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ワーカー起動ファクトリ
// ─────────────────────────────────────────────────────────────────────────────

export function createOneOnOneReminderWorker(service: OneOnOneReminderService) {
  return createBaseWorker('one-on-one-reminder', (job) => processOneOnOneReminderJob(job, service))
}
