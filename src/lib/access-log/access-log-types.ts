import { z } from 'zod'

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const

// ─────────────────────────────────────────────────────────────────────────────
// アクセスログエントリ（ミドルウェアが記録する1リクエスト分）
// ─────────────────────────────────────────────────────────────────────────────

export const accessLogEntrySchema = z.object({
  method: z.enum(HTTP_METHODS),
  path: z.string().min(1),
  statusCode: z.number().int().min(100).max(599),
  durationMs: z.number().min(0),
  ipAddress: z.string(),
  userAgent: z.string(),
  /** null = 未認証リクエスト */
  userId: z.string().nullable(),
  requestId: z.string(),
})

export type AccessLogEntry = z.infer<typeof accessLogEntrySchema>

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN 向け参照クエリ（Requirement 17.6）
// ─────────────────────────────────────────────────────────────────────────────

export const accessLogQuerySchema = z.object({
  userId: z.string().optional(),
  path: z.string().optional(),
  statusCode: z.number().int().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
})

export type AccessLogQuery = z.infer<typeof accessLogQuerySchema>
