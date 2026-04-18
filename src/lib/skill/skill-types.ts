/**
 * Issue #36 / Task 11.2: 社員スキル管理の型定義 (Req 4.4, 4.5)
 *
 * - Zod スキーマ: employeeSkillInputSchema
 * - ブランド型: EmployeeSkillId
 * - ドメインエラー: SkillNotFoundError / SkillAlreadyRegisteredError / SkillAccessDeniedError
 * - 出力型: EmployeeSkill (承認フィールド含む)
 */
import { z } from 'zod'
import { SKILL_LEVEL_MAX, SKILL_LEVEL_MIN } from '@/lib/master/master-types'

// ─────────────────────────────────────────────────────────────────────────────
// Branded ID types
// ─────────────────────────────────────────────────────────────────────────────

export type EmployeeSkillId = string & { readonly __brand: 'EmployeeSkillId' }
export type UserId = string & { readonly __brand: 'UserId' }

export function toEmployeeSkillId(value: string): EmployeeSkillId {
  return value as EmployeeSkillId
}

export function toUserIdBrand(value: string): UserId {
  return value as UserId
}

// ─────────────────────────────────────────────────────────────────────────────
// Input schema (Req 4.4)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 社員スキル登録・更新入力。
 * - skillId: 既存 SkillMaster.id を指定
 * - level: 1〜5 (SKILL_LEVEL_MIN / SKILL_LEVEL_MAX)
 * - acquiredAt: 習得日
 *
 * 文字列で受け取った acquiredAt は z.coerce.date() で Date に変換する。
 */
export const employeeSkillInputSchema = z.object({
  skillId: z.string().min(1),
  level: z.number().int().min(SKILL_LEVEL_MIN).max(SKILL_LEVEL_MAX),
  acquiredAt: z.coerce.date(),
})

export type EmployeeSkillInput = z.infer<typeof employeeSkillInputSchema>

// ─────────────────────────────────────────────────────────────────────────────
// Output types (Req 4.4, 4.5)
// ─────────────────────────────────────────────────────────────────────────────

export interface EmployeeSkill {
  readonly id: EmployeeSkillId
  readonly userId: string
  readonly skillId: string
  readonly level: number
  readonly acquiredAt: Date
  /** 承認したマネージャーの userId。null なら未承認 (Req 4.5) */
  readonly approvedByManagerId: string | null
  /** 承認日時。null なら未承認 (Req 4.5) */
  readonly approvedAt: Date | null
  readonly createdAt: Date
  readonly updatedAt: Date
}

/**
 * スキルが承認済みかを判定するヘルパ (Req 4.5)。
 * approvedByManagerId と approvedAt が両方設定されていれば承認済み。
 */
export function isSkillApproved(skill: EmployeeSkill): boolean {
  return skill.approvedByManagerId !== null && skill.approvedAt !== null
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain exceptions
// ─────────────────────────────────────────────────────────────────────────────

/** 指定されたスキル (SkillMaster または EmployeeSkill) が存在しない */
export class SkillNotFoundError extends Error {
  public readonly resourceId: string
  public readonly kind: 'master' | 'employee-skill'
  constructor(kind: 'master' | 'employee-skill', resourceId: string) {
    super(`Skill not found: ${kind} id=${resourceId}`)
    this.name = 'SkillNotFoundError'
    this.kind = kind
    this.resourceId = resourceId
  }
}

/** 同じユーザー・スキル組み合わせが既に登録済み (upsert 失敗時) */
export class SkillAlreadyRegisteredError extends Error {
  public readonly userId: string
  public readonly skillId: string
  constructor(userId: string, skillId: string) {
    super(`Skill already registered: userId=${userId} skillId=${skillId}`)
    this.name = 'SkillAlreadyRegisteredError'
    this.userId = userId
    this.skillId = skillId
  }
}

/** 他人のスキルを操作しようとした / MANAGER 権限が必要 */
export class SkillAccessDeniedError extends Error {
  public readonly reason: 'not-owner' | 'requires-manager' | 'not-subordinate'
  constructor(reason: 'not-owner' | 'requires-manager' | 'not-subordinate') {
    super(`Skill access denied: ${reason}`)
    this.name = 'SkillAccessDeniedError'
    this.reason = reason
  }
}
