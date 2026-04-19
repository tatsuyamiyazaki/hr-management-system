/**
 * Issue #45 / Req 6.8: goal-deadline-alert ジョブワーカー
 *
 * BullMQ の goal-deadline-alert キューからジョブを取り出し、
 * DeadlineAlertService.scanDeadlineAlerts() を呼び出して期限アラートを送信する。
 *
 * cron: '0 0 * * *' (UTC 00:00 = JST 09:00)
 */
import type { Job } from 'bullmq'
import { jobPayloadSchema } from '@/lib/jobs/job-types'
import { createBaseWorker } from '@/lib/jobs/base-worker'
import type { DeadlineAlertService } from '@/lib/goal/deadline-alert-service'

// ─────────────────────────────────────────────────────────────────────────────
// Result type
// ─────────────────────────────────────────────────────────────────────────────

export interface GoalDeadlineAlertJobResult {
  readonly triggeredAt: string
  readonly notified: number
  readonly skipped: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Payload validation
// ─────────────────────────────────────────────────────────────────────────────

function isGoalDeadlineAlertPayload(value: unknown): value is { triggeredAt: string } {
  return jobPayloadSchema['goal-deadline-alert'].safeParse(value).success
}

// ─────────────────────────────────────────────────────────────────────────────
// ジョブプロセッサ（テスト可能な関数として分離）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * goal-deadline-alert ジョブを処理する。
 * DeadlineAlertService は DI で受け取る。
 */
export async function processGoalDeadlineAlertJob(
  job: Job,
  service: DeadlineAlertService,
): Promise<GoalDeadlineAlertJobResult> {
  const payload = job.data as unknown

  if (!isGoalDeadlineAlertPayload(payload)) {
    throw new Error(`GoalDeadlineAlertWorker: invalid payload for job "${job.id ?? 'unknown'}"`)
  }

  const now = new Date(payload.triggeredAt)
  const result = await service.scanDeadlineAlerts(now)

  return {
    triggeredAt: payload.triggeredAt,
    notified: result.notified,
    skipped: result.skipped,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ワーカー起動ファクトリ
// ─────────────────────────────────────────────────────────────────────────────

export function createGoalDeadlineAlertWorker(service: DeadlineAlertService) {
  return createBaseWorker('goal-deadline-alert', (job) =>
    processGoalDeadlineAlertJob(job, service),
  )
}
