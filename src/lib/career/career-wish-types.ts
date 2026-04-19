import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// Branded ID
// ─────────────────────────────────────────────────────────────────────────────

export type CareerWishId = string & { readonly __brand: 'CareerWishId' }

export function toCareerWishId(value: string): CareerWishId {
  return value as CareerWishId
}

// ─────────────────────────────────────────────────────────────────────────────
// Input schema
// ─────────────────────────────────────────────────────────────────────────────

export const careerWishInputSchema = z.object({
  desiredRoleId: z.string().min(1),
  desiredAt: z.coerce.date(),
  comment: z.string().optional(),
})

export type CareerWishInput = z.infer<typeof careerWishInputSchema>

// ─────────────────────────────────────────────────────────────────────────────
// Output type
// ─────────────────────────────────────────────────────────────────────────────

export interface CareerWish {
  readonly id: CareerWishId
  readonly userId: string
  readonly desiredRoleId: string
  readonly desiredRoleName: string
  readonly desiredAt: Date
  readonly comment: string | null
  readonly supersededAt: Date | null
  readonly createdAt: Date
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain exceptions
// ─────────────────────────────────────────────────────────────────────────────

export class CareerWishNotFoundError extends Error {
  constructor(userId: string) {
    super(`Career wish not found for userId=${userId}`)
    this.name = 'CareerWishNotFoundError'
  }
}

export class CareerWishAccessDeniedError extends Error {
  constructor() {
    super('Career wish access denied')
    this.name = 'CareerWishAccessDeniedError'
  }
}
