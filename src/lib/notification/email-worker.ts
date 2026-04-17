import type { Job, Worker } from 'bullmq'
import { render } from '@react-email/render'
import { createBaseWorker } from '@/lib/jobs/base-worker'
import { jobPayloadSchema } from '@/lib/jobs/job-types'
import type { JobPayloadMap } from '@/lib/jobs/job-types'
import { NotificationEmail } from './email-templates/notification-email'
import type { EmailSender } from './email-sender'
import { createResendEmailSender } from './email-sender'
import type {
  NotificationLogEntry,
  NotificationLogRecorder,
} from './notification-log-recorder'
import { createInMemoryLogRecorder } from './notification-log-recorder'
import type { NotificationCategory } from './notification-types'

// ─────────────────────────────────────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────────────────────────────────────

const QUEUE_NAME = 'send-email'
const CHANNEL_EMAIL = 'EMAIL' as const
const DEFAULT_CATEGORY: NotificationCategory = 'SYSTEM'
/** BullMQ のリトライ上限。job-queue.ts の DEFAULT_JOB_OPTIONS.attempts と一致させる */
const MAX_ATTEMPTS = 3

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type SendEmailPayload = JobPayloadMap['send-email']

export interface EmailWorkerDeps {
  sender: EmailSender
  recorder: NotificationLogRecorder
}

// ─────────────────────────────────────────────────────────────────────────────
// ヘルパー
// ─────────────────────────────────────────────────────────────────────────────

function extractUserId(payload: SendEmailPayload): string {
  // send-email ペイロードが userId を拡張フィールドで持つ可能性を許容する
  const raw = (payload as Record<string, unknown>)['userId']
  return typeof raw === 'string' && raw.length > 0 ? raw : payload.to
}

function extractCategory(payload: SendEmailPayload): NotificationCategory {
  const raw = (payload as Record<string, unknown>)['category']
  return typeof raw === 'string' && isNotificationCategoryString(raw)
    ? raw
    : DEFAULT_CATEGORY
}

function isNotificationCategoryString(value: string): value is NotificationCategory {
  const categories: readonly NotificationCategory[] = [
    'EVAL_INVITATION',
    'EVAL_REMINDER',
    'GOAL_APPROVAL_REQUEST',
    'ONE_ON_ONE_REMINDER',
    'DEADLINE_ALERT',
    'FEEDBACK_PUBLISHED',
    'SYSTEM',
    'CUSTOM',
  ]
  return (categories as readonly string[]).includes(value)
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'Unknown error'
}

function buildLogEntry(args: {
  payload: SendEmailPayload
  attempts: number
  status: NotificationLogEntry['status']
  errorDetail: string | null
}): NotificationLogEntry {
  return {
    userId: extractUserId(args.payload),
    category: extractCategory(args.payload),
    channel: CHANNEL_EMAIL,
    subject: args.payload.subject,
    status: args.status,
    attempts: args.attempts,
    errorDetail: args.errorDetail,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ジョブプロセッサ（純粋に近い関数として切り出し: DI でテスタブル）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * send-email ジョブを処理する。
 * - ペイロードを jobPayloadSchema で境界バリデーション
 * - React Email テンプレートから HTML をレンダリング
 * - EmailSender.send で実送信
 * - 成功時は NotificationLogRecorder に status='SENT' を記録
 * - 失敗時はエラーを throw (BullMQ の attempts で自動リトライ)
 */
export async function processEmailJob(
  job: Job,
  deps: EmailWorkerDeps,
): Promise<void> {
  const parsed = jobPayloadSchema['send-email'].safeParse(job.data)
  if (!parsed.success) {
    throw new Error(
      `EmailWorker: invalid payload for job "${job.id ?? 'unknown'}": ${parsed.error.message}`,
    )
  }

  const payload = parsed.data
  const attempts = typeof job.attemptsMade === 'number' ? job.attemptsMade + 1 : 1

  const html = await render(
    NotificationEmail({
      title: payload.subject,
      body: payload.body,
    }),
  )

  try {
    await deps.sender.send({
      to: payload.to,
      subject: payload.subject,
      html,
    })
  } catch (error: unknown) {
    // 途中失敗はリトライ継続 (RETRYING を記録)。最終失敗は worker 'failed' で FAILED を記録
    if (attempts < MAX_ATTEMPTS) {
      await deps.recorder.record(
        buildLogEntry({
          payload,
          attempts,
          status: 'RETRYING',
          errorDetail: getErrorMessage(error),
        }),
      )
    }
    throw error
  }

  await deps.recorder.record(
    buildLogEntry({
      payload,
      attempts,
      status: 'SENT',
      errorDetail: null,
    }),
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 最終失敗フック (attemptsMade >= MAX_ATTEMPTS で FAILED を記録)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Worker の 'failed' イベントに FAILED ログ記録をフックする。
 * テストから直接呼び出せるよう worker と recorder を引数で受け取る。
 */
export function attachFinalFailureLogging(
  worker: Worker,
  recorder: NotificationLogRecorder,
): void {
  worker.on('failed', (job, err) => {
    if (!job) return
    const attemptsMade = typeof job.attemptsMade === 'number' ? job.attemptsMade : 0
    if (attemptsMade < MAX_ATTEMPTS) return

    // 非同期 record は fire-and-forget (イベントハンドラは同期)。
    // 失敗ログの記録自体が失敗した場合は console へフォールバック。
    const parsed = jobPayloadSchema['send-email'].safeParse(job.data)
    if (!parsed.success) return

    void recorder
      .record(
        buildLogEntry({
          payload: parsed.data,
          attempts: attemptsMade,
          status: 'FAILED',
          errorDetail: getErrorMessage(err),
        }),
      )
      .catch((recordError: unknown) => {
        console.error('[EmailWorker] failed to record FAILED log', {
          jobId: job.id,
          error: getErrorMessage(recordError),
        })
      })
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// ワーカー起動ファクトリ
// ─────────────────────────────────────────────────────────────────────────────

/**
 * EmailWorker を起動する。
 * sender / recorder を省略した場合は env `RESEND_API_KEY` からクライアントを生成し、
 * recorder はインメモリ実装を利用する (本番は Prisma 実装を DI すること)。
 */
export function createEmailWorker(deps?: Partial<EmailWorkerDeps>): Worker {
  const sender = deps?.sender ?? createResendEmailSender(process.env.RESEND_API_KEY ?? '')
  const recorder = deps?.recorder ?? createInMemoryLogRecorder()

  const worker = createBaseWorker(QUEUE_NAME, (job: Job) =>
    processEmailJob(job, { sender, recorder }),
  )
  attachFinalFailureLogging(worker, recorder)
  return worker
}
