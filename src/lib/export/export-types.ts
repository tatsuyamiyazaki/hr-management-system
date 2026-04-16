import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// ExportJobId（ブランド型）
// ─────────────────────────────────────────────────────────────────────────────

/** エクスポートジョブID（BullMQ が発行する文字列 jobId のエイリアス） */
export type ExportJobId = string

// ─────────────────────────────────────────────────────────────────────────────
// ExportJobStatus
// ─────────────────────────────────────────────────────────────────────────────

export const EXPORT_JOB_STATUSES = ['queued', 'processing', 'ready', 'failed'] as const
export type ExportJobStatus = (typeof EXPORT_JOB_STATUSES)[number]

export function isExportJobStatus(value: unknown): value is ExportJobStatus {
  return typeof value === 'string' && (EXPORT_JOB_STATUSES as readonly string[]).includes(value)
}

// ─────────────────────────────────────────────────────────────────────────────
// ExportRequest スキーマ（各ドメインのバリアント）
// ─────────────────────────────────────────────────────────────────────────────

const masterCsvSchema = z.object({
  type: z.literal('MasterCsv'),
  resource: z.string().min(1),
})

const organizationCsvSchema = z.object({
  type: z.literal('OrganizationCsv'),
})

const evaluationReportSchema = z.object({
  type: z.literal('EvaluationReport'),
  cycleId: z.string().min(1),
  format: z.enum(['pdf', 'csv']),
})

const auditLogSchema = z.object({
  type: z.literal('AuditLog'),
  filter: z.record(z.unknown()),
})

export const exportRequestSchema = z.discriminatedUnion('type', [
  masterCsvSchema,
  organizationCsvSchema,
  evaluationReportSchema,
  auditLogSchema,
])

export type ExportRequest = z.infer<typeof exportRequestSchema>

export function isExportRequest(value: unknown): value is ExportRequest {
  return exportRequestSchema.safeParse(value).success
}

// ─────────────────────────────────────────────────────────────────────────────
// ExportJobResult（ワーカーの戻り値）
// ─────────────────────────────────────────────────────────────────────────────

export interface ExportJobResult {
  /** Blob ストレージ上のキー（署名付き URL 取得に使用） */
  blobKey: string
}

export const exportJobResultSchema = z.object({
  blobKey: z.string().min(1),
})
