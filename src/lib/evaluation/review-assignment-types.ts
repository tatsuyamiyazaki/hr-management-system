/**
 * Issue #52 / Task 15.3: 評価対象者選択・辞退・代替評価者 型定義
 * (Req 8.3, 8.4, 8.10, 8.11, 8.12)
 */
import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// Input schemas
// ─────────────────────────────────────────────────────────────────────────────

export const addAssignmentSchema = z.object({
  cycleId: z.string().min(1),
  evaluatorId: z.string().min(1),
  targetUserId: z.string().min(1),
})

export const declineAssignmentSchema = z.object({
  reason: z.string().min(1).max(1000),
  replacementEvaluatorId: z.string().optional(),
})

export type AddAssignmentInput = z.infer<typeof addAssignmentSchema>
export type DeclineAssignmentInput = z.infer<typeof declineAssignmentSchema>

// ─────────────────────────────────────────────────────────────────────────────
// Domain types
// ─────────────────────────────────────────────────────────────────────────────

export type AssignmentStatus = 'ACTIVE' | 'DECLINED' | 'REPLACED'

export interface ReviewDeclineRecord {
  id: string
  assignmentId: string
  reason: string
  replacementEvaluatorId: string | null
  declinedAt: Date
}

export interface ReviewAssignmentRecord {
  id: string
  cycleId: string
  evaluatorId: string
  targetUserId: string
  status: AssignmentStatus
  createdAt: Date
  updatedAt: Date
  decline?: ReviewDeclineRecord
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain errors
// ─────────────────────────────────────────────────────────────────────────────

export class AssignmentNotFoundError extends Error {
  constructor(id: string) {
    super(`ReviewAssignment not found: ${id}`)
    this.name = 'AssignmentNotFoundError'
  }
}

export class MaxTargetsExceededError extends Error {
  constructor(max: number) {
    super(`Evaluator has reached the maximum target limit: ${max}`)
    this.name = 'MaxTargetsExceededError'
  }
}

export class DuplicateAssignmentError extends Error {
  constructor() {
    super('Assignment already exists for this evaluator and target')
    this.name = 'DuplicateAssignmentError'
  }
}

export class AssignmentNotActiveError extends Error {
  constructor(id: string, status: AssignmentStatus) {
    super(`ReviewAssignment ${id} is not ACTIVE (current: ${status})`)
    this.name = 'AssignmentNotActiveError'
  }
}
