import { z } from 'zod'
import { exportRequestSchema } from '@/lib/export/export-types'
import { importRequestSchema } from '@/lib/import/import-types'
import { NOTIFICATION_CATEGORIES } from '@/lib/notification/notification-types'
import { feedbackTransformPayloadSchema } from '@/lib/feedback/feedback-types'
import { totalEvaluationCalculationPayloadSchema } from '@/lib/total-evaluation/total-evaluation-types'

// ─────────────────────────────────────────────────────────────────────────────
// Job 名一覧
// ─────────────────────────────────────────────────────────────────────────────

export const JOB_NAMES = [
  'send-email',
  'export-csv',
  'import-csv',
  'anonymize-user',
  'ai-feedback-generation',
  'feedback-transform',
  'total-evaluation-calculate',
  'goal-deadline-alert',
  'one-on-one-reminder',
] as const

export type JobName = (typeof JOB_NAMES)[number]

export function isJobName(value: unknown): value is JobName {
  return typeof value === 'string' && (JOB_NAMES as readonly string[]).includes(value)
}

// ─────────────────────────────────────────────────────────────────────────────
// Job ペイロードスキーマ（ジョブ名ごとに型安全なスキーマ）
// ─────────────────────────────────────────────────────────────────────────────

export const jobPayloadSchema = {
  'send-email': z.object({
    to: z.string().email(),
    subject: z.string().min(1),
    body: z.string().min(1),
    templateId: z.string().optional(),
    variables: z.record(z.string()).optional(),
    // 任意メタデータ: 通知ログ記録時に userId / カテゴリを解決するために使用。
    // NotificationService が emit 時に付与することを想定（後方互換のため optional）。
    userId: z.string().min(1).optional(),
    category: z.enum(NOTIFICATION_CATEGORIES).optional(),
  }),

  'export-csv': exportRequestSchema,

  'import-csv': importRequestSchema,

  'anonymize-user': z.object({
    userId: z.string().min(1),
    requestedBy: z.string().min(1),
  }),

  'ai-feedback-generation': z.object({
    evaluationId: z.string().min(1),
    prompt: z.string().min(1),
    requestedBy: z.string().min(1),
  }),

  'feedback-transform': feedbackTransformPayloadSchema,

  'total-evaluation-calculate': totalEvaluationCalculationPayloadSchema,

  'goal-deadline-alert': z.object({
    triggeredAt: z.string().datetime(),
  }),

  'one-on-one-reminder': z.object({
    triggeredAt: z.string().datetime(),
  }),
} satisfies Record<JobName, z.ZodTypeAny>

export type JobPayloadMap = {
  [K in JobName]: z.infer<(typeof jobPayloadSchema)[K]>
}

// ─────────────────────────────────────────────────────────────────────────────
// Job ステータス
// ─────────────────────────────────────────────────────────────────────────────

export type JobState =
  | 'waiting'
  | 'active'
  | 'completed'
  | 'failed'
  | 'delayed'
  | 'unknown'
  | 'waiting-children'
  | 'prioritized'

export interface JobStatus {
  jobId: string
  /** ジョブ名。未知の名前も含む可能性があるため string。呼び出し側で isJobName() により絞り込むこと */
  name: string
  state: JobState
  returnValue: unknown
  failedReason: string | null
}
