import { z } from 'zod'

export const APPEAL_TARGET_TYPES = ['FEEDBACK', 'TOTAL_EVALUATION'] as const
export type AppealTargetType = (typeof APPEAL_TARGET_TYPES)[number]

export const APPEAL_STATUSES = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'ACCEPTED',
  'REJECTED',
  'WITHDRAWN',
] as const
export type AppealStatus = (typeof APPEAL_STATUSES)[number]

export interface Appeal {
  readonly id: string
  readonly appellantId: string
  readonly cycleId: string
  readonly subjectId: string
  readonly targetType: AppealTargetType
  readonly targetId: string
  readonly reason: string
  readonly desiredOutcome: string | null
  readonly status: AppealStatus
  readonly reviewerId: string | null
  readonly reviewComment: string | null
  readonly reviewedAt: Date | null
  readonly submittedAt: Date
}

export interface AppealReviewInput {
  readonly status: Extract<AppealStatus, 'UNDER_REVIEW' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN'>
  readonly reviewComment: string
}

export interface AppealableTarget {
  readonly cycleId: string
  readonly subjectId: string
  readonly targetId: string
  readonly publishedAt: Date
}

export interface AppealRepository {
  createAppeal(
    input: Omit<
      Appeal,
      'id' | 'status' | 'reviewerId' | 'reviewComment' | 'reviewedAt' | 'submittedAt'
    >,
  ): Promise<Appeal>
  findPublishedFeedbackTarget(
    targetId: string,
    appellantId: string,
  ): Promise<AppealableTarget | null>
  findFinalizedTotalEvaluationTarget(
    targetId: string,
    appellantId: string,
  ): Promise<AppealableTarget | null>
  listHrManagerIds(): Promise<string[]>
  listAppeals(): Promise<Appeal[]>
  findAppealById(appealId: string): Promise<Appeal | null>
  updateAppealReview(
    appealId: string,
    input: {
      status: AppealStatus
      reviewerId: string
      reviewComment: string
      reviewedAt: Date
    },
  ): Promise<Appeal>
}

export interface AppealNotificationPort {
  emit(event: {
    userId: string
    category: 'SYSTEM'
    title: string
    body: string
    payload?: Record<string, unknown>
  }): Promise<void>
}

export const appealInputSchema = z.object({
  targetType: z.enum(APPEAL_TARGET_TYPES),
  targetId: z.string().min(1),
  reason: z.string().trim().min(1).max(2000),
  desiredOutcome: z.string().trim().max(1000).optional(),
})

export type AppealInput = z.infer<typeof appealInputSchema>

export const appealReviewInputSchema = z.object({
  status: z.enum(['UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'WITHDRAWN']),
  reviewComment: z.string().trim().min(1).max(2000),
})

export interface AppealService {
  submitAppeal(appellantId: string, input: AppealInput): Promise<Appeal>
  listPending(hrManagerId: string): Promise<Appeal[]>
  review(hrManagerId: string, appealId: string, input: AppealReviewInput): Promise<Appeal>
}

export class AppealTargetNotFoundError extends Error {
  constructor(targetType: AppealTargetType, targetId: string) {
    super(`Appeal target not found: type="${targetType}", targetId="${targetId}"`)
    this.name = 'AppealTargetNotFoundError'
  }
}

export class AppealDeadlineExceededError extends Error {
  readonly deadline: Date

  constructor(deadline: Date) {
    super(`Appeal deadline exceeded: deadline="${deadline.toISOString()}"`)
    this.name = 'AppealDeadlineExceededError'
    this.deadline = deadline
  }
}

export class AppealNotFoundError extends Error {
  constructor(appealId: string) {
    super(`Appeal not found: appealId="${appealId}"`)
    this.name = 'AppealNotFoundError'
  }
}

export class AppealInvalidStatusTransitionError extends Error {
  constructor(current: AppealStatus, next: AppealStatus) {
    super(`Invalid appeal status transition: current="${current}", next="${next}"`)
    this.name = 'AppealInvalidStatusTransitionError'
  }
}
