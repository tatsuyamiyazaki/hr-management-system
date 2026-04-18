/**
 * Issue #24 / Req 2: スキル・役職・等級マスタの型定義
 *
 * - Zod スキーマ: skillMasterInputSchema / roleMasterInputSchema / gradeMasterInputSchema
 * - ドメインエラー: MasterNotFoundError / MasterNameConflictError / GradeWeightSumError
 * - 出力型: SkillMaster / RoleMaster / GradeMaster
 */
import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// Branded ID types
// ─────────────────────────────────────────────────────────────────────────────

export type SkillMasterId = string & { readonly __brand: 'SkillMasterId' }
export type RoleMasterId = string & { readonly __brand: 'RoleMasterId' }
export type GradeMasterId = string & { readonly __brand: 'GradeMasterId' }

export function toSkillMasterId(value: string): SkillMasterId {
  return value as SkillMasterId
}
export function toRoleMasterId(value: string): RoleMasterId {
  return value as RoleMasterId
}
export function toGradeMasterId(value: string): GradeMasterId {
  return value as GradeMasterId
}

/** マスタリソース種別 */
export type MasterResource = 'skill' | 'role' | 'grade'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** 等級のウェイトは合計 1.0 になる必要がある (Req 2.3) */
export const GRADE_WEIGHT_SUM = 1
/** 浮動小数点誤差の許容範囲 */
export const GRADE_WEIGHT_EPSILON = 1e-6
/** スキル必要レベルの範囲 (1〜5) */
export const SKILL_LEVEL_MIN = 1
export const SKILL_LEVEL_MAX = 5

// ─────────────────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────────────────

/** スキルマスタ入力 (Req 2.1, 2.4) */
export const skillMasterInputSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1).max(120),
  category: z.string().min(1).max(60),
  description: z.string().max(2000).nullable().optional(),
  deprecated: z.boolean().optional(),
})

export type SkillMasterInput = z.infer<typeof skillMasterInputSchema>

/** 役職が必要とするスキル要件 (Req 2.2, 2.5) */
export const roleSkillRequirementInputSchema = z.object({
  skillId: z.string().min(1),
  requiredLevel: z.number().int().min(SKILL_LEVEL_MIN).max(SKILL_LEVEL_MAX),
})

export type RoleSkillRequirementInput = z.infer<typeof roleSkillRequirementInputSchema>

/** 役職マスタ入力 (Req 2.2) */
export const roleMasterInputSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1).max(120),
  gradeId: z.string().min(1),
  skillRequirements: z.array(roleSkillRequirementInputSchema).default([]),
})

export type RoleMasterInput = z.infer<typeof roleMasterInputSchema>

/** 等級マスタ入力 (Req 2.3) */
export const gradeMasterInputSchema = z
  .object({
    id: z.string().min(1).optional(),
    label: z.string().min(1).max(60),
    performanceWeight: z.number().min(0).max(1),
    goalWeight: z.number().min(0).max(1),
    feedbackWeight: z.number().min(0).max(1),
  })
  .superRefine((value, ctx) => {
    const sum = value.performanceWeight + value.goalWeight + value.feedbackWeight
    if (Math.abs(sum - GRADE_WEIGHT_SUM) > GRADE_WEIGHT_EPSILON) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Grade weights must sum to 1 (got ${sum})`,
        path: ['performanceWeight'],
      })
    }
  })

export type GradeMasterInput = z.infer<typeof gradeMasterInputSchema>

// ─────────────────────────────────────────────────────────────────────────────
// Output types
// ─────────────────────────────────────────────────────────────────────────────

export interface SkillMaster {
  readonly id: SkillMasterId
  readonly name: string
  readonly category: string
  readonly description: string | null
  readonly deprecated: boolean
  readonly createdAt: Date
}

export interface RoleSkillRequirement {
  readonly skillId: SkillMasterId
  readonly requiredLevel: number
}

export interface RoleMaster {
  readonly id: RoleMasterId
  readonly name: string
  readonly gradeId: GradeMasterId
  readonly skillRequirements: readonly RoleSkillRequirement[]
}

export interface GradeMaster {
  readonly id: GradeMasterId
  readonly label: string
  readonly performanceWeight: number
  readonly goalWeight: number
  readonly feedbackWeight: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain exceptions
// ─────────────────────────────────────────────────────────────────────────────

/** マスタレコードが存在しない */
export class MasterNotFoundError extends Error {
  public readonly resource: MasterResource
  public readonly resourceId: string
  constructor(resource: MasterResource, resourceId: string) {
    super(`Master not found: ${resource} id=${resourceId}`)
    this.name = 'MasterNotFoundError'
    this.resource = resource
    this.resourceId = resourceId
  }
}

/** マスタ名の一意制約違反 */
export class MasterNameConflictError extends Error {
  public readonly resource: MasterResource
  public readonly conflictingName: string
  constructor(resource: MasterResource, conflictingName: string) {
    super(`Master name already exists: ${resource} name=${conflictingName}`)
    this.name = 'MasterNameConflictError'
    this.resource = resource
    this.conflictingName = conflictingName
  }
}

/**
 * 等級ウェイトの合計が 1 にならない (Req 2.3)。
 * Zod の superRefine でも検出するが、ドメイン層からも明示的に throw する。
 */
export class GradeWeightSumError extends Error {
  public readonly actualSum: number
  constructor(actualSum: number) {
    super(`Grade weights must sum to 1 (got ${actualSum})`)
    this.name = 'GradeWeightSumError'
    this.actualSum = actualSum
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * アプリケーション層で明示的にウェイト合計を検証する。
 * Zod 通過後の値に対しても、Service 層で防御的に呼ぶ用途を想定。
 */
export function assertGradeWeightsSumToOne(input: {
  performanceWeight: number
  goalWeight: number
  feedbackWeight: number
}): void {
  const sum = input.performanceWeight + input.goalWeight + input.feedbackWeight
  if (Math.abs(sum - GRADE_WEIGHT_SUM) > GRADE_WEIGHT_EPSILON) {
    throw new GradeWeightSumError(sum)
  }
}
