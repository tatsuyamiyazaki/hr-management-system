/**
 * Issue #48 / Task 14.2: 1on1ログ タイムライン表示 型定義 (Req 7.3, 7.4, 7.5)
 */
import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// Zod schema
// ─────────────────────────────────────────────────────────────────────────────

export const oneOnOneLogInputSchema = z.object({
  agenda: z.string().max(500).optional(),
  content: z.string().min(1).max(5000),
  nextActions: z.string().max(2000).optional(),
  visibility: z.enum(['MANAGER_ONLY', 'BOTH']).default('MANAGER_ONLY'),
})

export const oneOnOneLogUpdateSchema = z.object({
  agenda: z.string().max(500).optional(),
  content: z.string().min(1).max(5000).optional(),
  nextActions: z.string().max(2000).optional(),
  visibility: z.enum(['MANAGER_ONLY', 'BOTH']).optional(),
})

// ─────────────────────────────────────────────────────────────────────────────
// Domain interfaces
// ─────────────────────────────────────────────────────────────────────────────

export interface OneOnOneLogInput {
  agenda?: string
  content: string
  nextActions?: string
  visibility: 'MANAGER_ONLY' | 'BOTH'
}

export interface OneOnOneLogRecord {
  id: string
  sessionId: string
  agenda: string | null
  content: string
  nextActions: string | null
  visibility: 'MANAGER_ONLY' | 'BOTH'
  recordedBy: string
  recordedAt: Date
}

/** タイムライン表示用（セッション情報付き） */
export interface OneOnOneTimelineEntry {
  sessionId: string
  scheduledAt: Date
  durationMin: number
  log: OneOnOneLogRecord | null // ログ未入力の場合 null
}
