import type { JobQueue } from '@/lib/jobs/job-queue'
import { createJobQueue } from '@/lib/jobs/job-queue'
import type { JobName, JobPayloadMap } from '@/lib/jobs/job-types'
import { notificationEventSchema } from './notification-types'
import type { NotificationEvent } from './notification-types'

// ─────────────────────────────────────────────────────────────────────────────
// Interface
// ─────────────────────────────────────────────────────────────────────────────

export interface NotificationEmitter {
  /**
   * 通知イベントを送信キューに投入する（fire-and-forget）
   * 不正なイベントの場合はバリデーションエラーをスローする
   */
  emit(event: NotificationEvent): Promise<void>
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

const SEND_EMAIL_JOB: JobName = 'send-email'

class BullMQNotificationEmitter implements NotificationEmitter {
  constructor(private readonly queue: JobQueue) {}

  async emit(event: NotificationEvent): Promise<void> {
    const parsed = notificationEventSchema.parse(event)
    // 通知イベントを send-email ジョブとしてキューに投入する
    // NOTE: send-email ペイロードは将来的に NotificationEvent 形式に統一予定
    await this.queue.enqueue(
      SEND_EMAIL_JOB,
      parsed as unknown as JobPayloadMap[typeof SEND_EMAIL_JOB],
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createNotificationEmitter(queue?: JobQueue): NotificationEmitter {
  return new BullMQNotificationEmitter(queue ?? createJobQueue())
}
