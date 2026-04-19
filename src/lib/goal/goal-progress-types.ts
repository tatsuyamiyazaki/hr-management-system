/**
 * Issue #44 / Task 13.3: 目標進捗更新・部下目標一覧 の型定義 (Req 6.6, 6.7)
 */
import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// Validation schema
// ─────────────────────────────────────────────────────────────────────────────

export const progressUpdateSchema = z.object({
  progressRate: z.number().int().min(0).max(100),
  comment: z.string().max(1000).optional(),
})

// ─────────────────────────────────────────────────────────────────────────────
// Domain types
// ─────────────────────────────────────────────────────────────────────────────

export interface ProgressUpdate {
  progressRate: number
  comment?: string
}

export interface GoalProgressRecord {
  id: string
  goalId: string
  progressRate: number
  comment: string | null
  recordedBy: string
  recordedAt: Date
}

export interface SubordinateGoalSummary {
  userId: string
  goalId: string
  title: string
  status: string
  currentProgressRate: number
  endDate: Date
}
