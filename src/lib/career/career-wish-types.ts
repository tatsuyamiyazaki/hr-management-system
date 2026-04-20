import { z } from 'zod'

export type CareerWishId = string & { readonly __brand: 'CareerWishId' }

export function toCareerWishId(value: string): CareerWishId {
  return value as CareerWishId
}

export interface CareerWishInput {
  desiredRoleId: string
  desiredAt: Date
  comment?: string | null
}

export const careerWishInputSchema = z.object({
  desiredRoleId: z.string().min(1),
  desiredAt: z.coerce.date(),
  comment: z.string().optional().nullable(),
})

export interface CareerWish {
  id: CareerWishId
  userId: string
  desiredRoleId: string
  desiredRoleName: string
  desiredAt: Date
  comment: string | null
  supersededAt: Date | null
  createdAt: Date
}
