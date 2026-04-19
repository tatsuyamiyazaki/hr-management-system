/**
 * Issue #46 / Task 13.5: 評価サイクルとの目標達成率連携 — 型定義 (Req 6.9)
 */
import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// Input validation schemas
// ─────────────────────────────────────────────────────────────────────────────

export const evaluationCycleInputSchema = z.object({
  name: z.string().min(1).max(200),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
})

export type EvaluationCycleInput = z.infer<typeof evaluationCycleInputSchema>

// ─────────────────────────────────────────────────────────────────────────────
// Domain records
// ─────────────────────────────────────────────────────────────────────────────

export interface EvaluationCycleRecord {
  id: string
  name: string
  startDate: Date
  endDate: Date
  createdAt: Date
}

export interface GoalAchievementRecord {
  id: string
  cycleId: string
  goalId: string
  userId: string
  finalProgress: number
  isCompleted: boolean
  achievementNote: string | null
  linkedAt: Date
}

export interface GoalAchievementSummary {
  userId: string
  totalGoals: number
  completedGoals: number
  /** 平均進捗率 0-100 */
  averageProgress: number
  achievements: GoalAchievementRecord[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain errors
// ─────────────────────────────────────────────────────────────────────────────

export class EvaluationCycleNotFoundError extends Error {
  readonly cycleId: string
  constructor(cycleId: string) {
    super(`EvaluationCycle not found: ${cycleId}`)
    this.name = 'EvaluationCycleNotFoundError'
    this.cycleId = cycleId
  }
}
