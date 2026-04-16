import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// Job 名一覧
// ─────────────────────────────────────────────────────────────────────────────

export const JOB_NAMES = [
  'send-email',
  'export-csv',
  'import-csv',
  'anonymize-user',
  'ai-feedback-generation',
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
  }),

  'export-csv': z.discriminatedUnion('type', [
    z.object({ type: z.literal('MasterCsv'), resource: z.string().min(1) }),
    z.object({ type: z.literal('OrganizationCsv') }),
    z.object({
      type: z.literal('EvaluationReport'),
      cycleId: z.string().min(1),
      format: z.enum(['pdf', 'csv']),
    }),
    z.object({ type: z.literal('AuditLog'), filter: z.record(z.unknown()) }),
  ]),

  'import-csv': z.object({
    resourceType: z.string().min(1),
    fileUrl: z.string().url(),
    requestedBy: z.string().min(1),
  }),

  'anonymize-user': z.object({
    userId: z.string().min(1),
    requestedBy: z.string().min(1),
  }),

  'ai-feedback-generation': z.object({
    evaluationId: z.string().min(1),
    prompt: z.string().min(1),
    requestedBy: z.string().min(1),
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
