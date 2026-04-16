import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// ImportJobId（ブランド型）
// ─────────────────────────────────────────────────────────────────────────────

/** インポートジョブID（BullMQ が発行する文字列 jobId のエイリアス） */
export type ImportJobId = string

// ─────────────────────────────────────────────────────────────────────────────
// ImportJobStatus
// ─────────────────────────────────────────────────────────────────────────────

export const IMPORT_JOB_STATUSES = ['queued', 'processing', 'ready', 'failed'] as const
export type ImportJobStatus = (typeof IMPORT_JOB_STATUSES)[number]

export function isImportJobStatus(value: unknown): value is ImportJobStatus {
  return typeof value === 'string' && (IMPORT_JOB_STATUSES as readonly string[]).includes(value)
}

// ─────────────────────────────────────────────────────────────────────────────
// ImportRequest スキーマ（各ドメインのバリアント）
// ─────────────────────────────────────────────────────────────────────────────

const masterCsvSchema = z.object({
  type: z.literal('MasterCsv'),
  resource: z.string().min(1),
})

const employeeCsvSchema = z.object({
  type: z.literal('EmployeeCsv'),
})

export const importRequestSchema = z.discriminatedUnion('type', [
  masterCsvSchema,
  employeeCsvSchema,
])

export type ImportRequest = z.infer<typeof importRequestSchema>

export function isImportRequest(value: unknown): value is ImportRequest {
  return importRequestSchema.safeParse(value).success
}

// ─────────────────────────────────────────────────────────────────────────────
// ImportRowError（エラー行詳細）
// ─────────────────────────────────────────────────────────────────────────────

export interface ImportRowError {
  rowNumber: number
  field: string
  message: string
}

// ─────────────────────────────────────────────────────────────────────────────
// ImportResult（ワーカーの戻り値）
// ─────────────────────────────────────────────────────────────────────────────

export interface ImportResult {
  totalRows: number
  successCount: number
  failureCount: number
  errors: ImportRowError[]
}

export const importRowErrorSchema = z.object({
  rowNumber: z.number().int().min(1),
  field: z.string().min(1),
  message: z.string().min(1),
})

export const importResultSchema = z.object({
  totalRows: z.number().int().min(0),
  successCount: z.number().int().min(0),
  failureCount: z.number().int().min(0),
  errors: z.array(importRowErrorSchema),
})
