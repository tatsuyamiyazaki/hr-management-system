/**
 * Issue #47 / Task 14.1: 1on1 予定登録と通知 — 型定義 (Req 7.1, 7.2)
 */
import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// Input schema
// ─────────────────────────────────────────────────────────────────────────────

export const oneOnOneSessionInputSchema = z.object({
  employeeId: z.string().min(1),
  scheduledAt: z.coerce.date(),
  durationMin: z.number().int().min(15).max(240),
  agenda: z.string().max(1000).optional(),
})

export interface OneOnOneSessionInput {
  employeeId: string
  scheduledAt: Date
  durationMin: number
  agenda?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Record type
// ─────────────────────────────────────────────────────────────────────────────

export interface OneOnOneSessionRecord {
  id: string
  managerId: string
  employeeId: string
  scheduledAt: Date
  durationMin: number
  agenda: string | null
  createdAt: Date
  updatedAt: Date
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain errors
// ─────────────────────────────────────────────────────────────────────────────

export class OneOnOneSessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`OneOnOneSession not found: ${sessionId}`)
    this.name = 'OneOnOneSessionNotFoundError'
  }
}

export class OneOnOneSessionAccessDeniedError extends Error {
  constructor(reason: string) {
    super(`Access denied: ${reason}`)
    this.name = 'OneOnOneSessionAccessDeniedError'
  }
}
