/**
 * Issue #42 / Task 13.1: 多階層目標ツリーの型定義 (Req 6.1, 6.2, 6.10)
 *
 * - Zod スキーマ: orgGoalInputSchema, personalGoalInputSchema
 * - ブランド型: OrgGoalId, PersonalGoalId
 * - ドメインエラー: GoalNotFoundError, GoalAccessDeniedError
 * - 出力型: OrgGoalRecord, PersonalGoalRecord, OrgGoalTree
 */
import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// Enum re-exports (mirroring Prisma enums)
// ─────────────────────────────────────────────────────────────────────────────

export type GoalType = 'OKR' | 'MBO'
export type GoalStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
export type GoalOwnerType = 'ORGANIZATION' | 'DEPARTMENT' | 'TEAM'

// ─────────────────────────────────────────────────────────────────────────────
// Branded ID types
// ─────────────────────────────────────────────────────────────────────────────

export type OrgGoalId = string & { readonly __brand: 'OrgGoalId' }
export type PersonalGoalId = string & { readonly __brand: 'PersonalGoalId' }

export function toOrgGoalId(value: string): OrgGoalId {
  return value as OrgGoalId
}

export function toPersonalGoalId(value: string): PersonalGoalId {
  return value as PersonalGoalId
}

// ─────────────────────────────────────────────────────────────────────────────
// Input schemas
// ─────────────────────────────────────────────────────────────────────────────

/** 組織目標作成・更新入力 (Req 6.1, 6.2) */
export const orgGoalInputSchema = z.object({
  parentId: z.string().optional(),
  ownerType: z.enum(['ORGANIZATION', 'DEPARTMENT', 'TEAM']),
  ownerId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  goalType: z.enum(['OKR', 'MBO']),
  keyResult: z.string().optional(),
  targetValue: z.number().optional(),
  unit: z.string().optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
})

export type OrgGoalInput = z.infer<typeof orgGoalInputSchema>

/** 個人目標作成・更新入力 (Req 6.3, 6.4) */
export const personalGoalInputSchema = z.object({
  parentOrgGoalId: z.string().optional(),
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  goalType: z.enum(['OKR', 'MBO']),
  keyResult: z.string().optional(),
  targetValue: z.number().optional(),
  unit: z.string().optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
})

export type PersonalGoalInput = z.infer<typeof personalGoalInputSchema>

// ─────────────────────────────────────────────────────────────────────────────
// Output types
// ─────────────────────────────────────────────────────────────────────────────

/** 組織目標レコード (Req 6.1, 6.2) */
export interface OrgGoalRecord {
  readonly id: OrgGoalId
  readonly parentId: string | null
  readonly ownerType: GoalOwnerType
  readonly ownerId: string
  readonly title: string
  readonly description: string | null
  readonly goalType: GoalType
  readonly keyResult: string | null
  readonly targetValue: number | null
  readonly unit: string | null
  readonly startDate: Date
  readonly endDate: Date
  readonly createdAt: Date
  readonly updatedAt: Date
}

/** 組織目標ツリーノード（親子関係を含む）(Req 6.1, 6.2) */
export interface OrgGoalTree extends OrgGoalRecord {
  readonly children: OrgGoalTree[]
}

/** 個人目標レコード (Req 6.3, 6.4, 6.5) */
export interface PersonalGoalRecord {
  readonly id: PersonalGoalId
  readonly userId: string
  readonly parentOrgGoalId: string | null
  readonly title: string
  readonly description: string | null
  readonly goalType: GoalType
  readonly keyResult: string | null
  readonly targetValue: number | null
  readonly unit: string | null
  readonly status: GoalStatus
  readonly startDate: Date
  readonly endDate: Date
  readonly approvedBy: string | null
  readonly approvedAt: Date | null
  readonly rejectedAt: Date | null
  readonly rejectedReason: string | null
  readonly createdAt: Date
  readonly updatedAt: Date
}

// ─────────────────────────────────────────────────────────────────────────────
// List filters
// ─────────────────────────────────────────────────────────────────────────────

export interface OrgGoalFilters {
  readonly ownerType?: GoalOwnerType
  readonly ownerId?: string
  readonly goalType?: GoalType
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain exceptions
// ─────────────────────────────────────────────────────────────────────────────

/** 指定された目標が存在しない */
export class GoalNotFoundError extends Error {
  public readonly resourceId: string
  public readonly kind: 'org-goal' | 'personal-goal'
  constructor(kind: 'org-goal' | 'personal-goal', resourceId: string) {
    super(`Goal not found: ${kind} id=${resourceId}`)
    this.name = 'GoalNotFoundError'
    this.kind = kind
    this.resourceId = resourceId
  }
}

/** 目標操作の権限がない */
export class GoalAccessDeniedError extends Error {
  public readonly reason: 'not-owner' | 'requires-hr-manager-or-above'
  constructor(reason: 'not-owner' | 'requires-hr-manager-or-above') {
    super(`Goal access denied: ${reason}`)
    this.name = 'GoalAccessDeniedError'
    this.reason = reason
  }
}
