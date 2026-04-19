/**
 * Issue #51 / Task 15.2: 360度評価サイクル型定義 (Req 8.1, 8.2)
 */
import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// Input schema
// ─────────────────────────────────────────────────────────────────────────────

export const reviewCycleInputSchema = z.object({
  name: z.string().min(1).max(200),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  items: z.array(z.string().min(1)).min(1).max(20),
  incentiveK: z.number().positive().max(10),
  minReviewers: z.number().int().min(1).max(50),
  maxTargets: z.number().int().min(1).max(1000),
})

export type ReviewCycleInput = z.infer<typeof reviewCycleInputSchema>

// ─────────────────────────────────────────────────────────────────────────────
// Domain types
// ─────────────────────────────────────────────────────────────────────────────

export type ReviewCycleStatus =
  | 'DRAFT'
  | 'ACTIVE'
  | 'AGGREGATING'
  | 'PENDING_FEEDBACK_APPROVAL'
  | 'FINALIZED'
  | 'CLOSED'

export interface ReviewCycleRecord {
  id: string
  name: string
  status: ReviewCycleStatus
  startDate: Date
  endDate: Date
  items: string[]
  incentiveK: number
  minReviewers: number
  maxTargets: number
  activatedAt: Date | null
  finalizedAt: Date | null
  closedAt: Date | null
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain errors
// ─────────────────────────────────────────────────────────────────────────────

export class ReviewCycleNotFoundError extends Error {
  constructor(id: string) {
    super(`ReviewCycle not found: ${id}`)
    this.name = 'ReviewCycleNotFoundError'
  }
}

export class ReviewCycleInvalidTransitionError extends Error {
  constructor(
    public readonly from: ReviewCycleStatus,
    public readonly to: ReviewCycleStatus,
  ) {
    super(`Invalid transition: ${from} → ${to}`)
    this.name = 'ReviewCycleInvalidTransitionError'
  }
}
