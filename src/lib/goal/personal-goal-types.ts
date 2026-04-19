/**
 * Issue #43 / Task 13.2: 個人目標登録と上長承認フロー — 型定義 (Req 6.3, 6.4, 6.5)
 */
import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────────

export const goalTypeSchema = z.enum(['OKR', 'MBO'])
export const goalStatusSchema = z.enum([
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'IN_PROGRESS',
  'COMPLETED',
])

export type GoalType = z.infer<typeof goalTypeSchema>
export type GoalStatus = z.infer<typeof goalStatusSchema>

// ─────────────────────────────────────────────────────────────────────────────
// Input schema
// ─────────────────────────────────────────────────────────────────────────────

export const personalGoalInputSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  goalType: goalTypeSchema,
  /** OKR用: Key Result の説明 */
  keyResult: z.string().optional(),
  /** MBO用: 定量目標値 */
  targetValue: z.number().optional(),
  unit: z.string().optional(),
  parentOrgGoalId: z.string().optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
})

export type PersonalGoalInput = z.infer<typeof personalGoalInputSchema>

// ─────────────────────────────────────────────────────────────────────────────
// Domain record
// ─────────────────────────────────────────────────────────────────────────────

export interface PersonalGoalRecord {
  id: string
  userId: string
  title: string
  description: string | null
  goalType: GoalType
  keyResult: string | null
  targetValue: number | null
  unit: string | null
  status: GoalStatus
  parentOrgGoalId: string | null
  startDate: Date
  endDate: Date
  approvedBy: string | null
  approvedAt: Date | null
  rejectedAt: Date | null
  rejectedReason: string | null
  createdAt: Date
  updatedAt: Date
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain errors
// ─────────────────────────────────────────────────────────────────────────────

export class PersonalGoalNotFoundError extends Error {
  constructor(goalId: string) {
    super(`PersonalGoal not found: ${goalId}`)
    this.name = 'PersonalGoalNotFoundError'
  }
}

export class PersonalGoalInvalidTransitionError extends Error {
  constructor(from: GoalStatus, to: string) {
    super(`Invalid status transition: ${from} → ${to}`)
    this.name = 'PersonalGoalInvalidTransitionError'
  }
}

export class PersonalGoalAccessDeniedError extends Error {
  constructor(message = 'Access denied') {
    super(message)
    this.name = 'PersonalGoalAccessDeniedError'
  }
}
