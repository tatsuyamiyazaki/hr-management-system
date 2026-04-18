/**
 * Issue #27 / Req 3.3, 3.4, 3.6, 3.7, 3.8: 組織管理ドメインの型定義
 *
 * - ブランド型 ID: DepartmentId / PositionId / TransferRecordId
 * - 集約型: Department / Position / TransferRecord / OrgNode / OrgTree / OrgTreePreview
 * - 変更コマンド (判別共用体): OrgChange
 * - Zod スキーマ: orgChangeSchema / changePositionInputSchema
 * - ドメインエラー: CyclicReferenceError
 */
import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// Branded ID types
// ─────────────────────────────────────────────────────────────────────────────

export type DepartmentId = string & { readonly __brand: 'DepartmentId' }
export type PositionId = string & { readonly __brand: 'PositionId' }
export type TransferRecordId = string & { readonly __brand: 'TransferRecordId' }
export type UserId = string & { readonly __brand: 'UserId' }

export function toDepartmentId(value: string): DepartmentId {
  return value as DepartmentId
}
export function toPositionId(value: string): PositionId {
  return value as PositionId
}
export function toTransferRecordId(value: string): TransferRecordId {
  return value as TransferRecordId
}
export function toUserId(value: string): UserId {
  return value as UserId
}

// ─────────────────────────────────────────────────────────────────────────────
// Entity shapes
// ─────────────────────────────────────────────────────────────────────────────

/** 部署 (Requirement 3.6) */
export interface Department {
  readonly id: DepartmentId
  readonly name: string
  readonly parentId: DepartmentId | null
  readonly createdAt: Date
  readonly deletedAt: Date | null
}

/** ポジション (Requirement 3.6) */
export interface Position {
  readonly id: PositionId
  readonly departmentId: DepartmentId
  readonly roleId: string
  readonly holderUserId: string | null
  readonly supervisorPositionId: PositionId | null
}

/** 異動履歴 (Requirement 3.7) */
export interface TransferRecord {
  readonly id: TransferRecordId
  readonly userId: string
  readonly fromPositionId: PositionId | null
  readonly toPositionId: PositionId | null
  readonly effectiveDate: Date
  readonly changedBy: string
  readonly createdAt: Date
}

// ─────────────────────────────────────────────────────────────────────────────
// Tree shape (Requirement 3.6)
// ─────────────────────────────────────────────────────────────────────────────

/** 組織ツリーのノード (Department を中心に構成) */
export interface OrgNode {
  readonly department: Department
  readonly positions: readonly Position[]
  readonly children: readonly OrgNode[]
}

/** 組織ツリー全体 */
export interface OrgTree {
  readonly roots: readonly OrgNode[]
  readonly capturedAt: Date
}

/** プレビューは OrgTree に warnings を付加した形で返す */
export interface OrgTreePreview {
  readonly tree: OrgTree
  /** 適用予定変更の摘要 (UI 表示用) */
  readonly summary: readonly string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// OrgChange (判別共用体 — HR_MANAGER が送るコマンド)
// ─────────────────────────────────────────────────────────────────────────────

export const orgChangeSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('CreateDepartment'),
    tempId: z.string().min(1),
    name: z.string().min(1).max(120),
    parentId: z.string().min(1).nullable(),
  }),
  z.object({
    type: z.literal('RenameDepartment'),
    departmentId: z.string().min(1),
    name: z.string().min(1).max(120),
  }),
  z.object({
    type: z.literal('MoveDepartment'),
    departmentId: z.string().min(1),
    newParentId: z.string().min(1).nullable(),
  }),
  z.object({
    type: z.literal('DeleteDepartment'),
    departmentId: z.string().min(1),
  }),
  z.object({
    type: z.literal('ChangeSupervisor'),
    positionId: z.string().min(1),
    newSupervisorPositionId: z.string().min(1).nullable(),
  }),
])

export type OrgChange = z.infer<typeof orgChangeSchema>

// ─────────────────────────────────────────────────────────────────────────────
// changePosition input (Requirement 3.7)
// ─────────────────────────────────────────────────────────────────────────────

export const changePositionInputSchema = z.object({
  userId: z.string().min(1),
  newPositionId: z.string().min(1).nullable(),
  effectiveDate: z
    .string()
    .datetime()
    .optional()
    .transform((value) => (value ? new Date(value) : new Date())),
})

export type ChangePositionInput = z.infer<typeof changePositionInputSchema>

// ─────────────────────────────────────────────────────────────────────────────
// Domain errors
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 組織変更時の循環参照エラー (Requirement 3.4)
 *
 * path は循環が検出されたノード ID の経路。
 * - Department ツリー: parentId 辿りで自己に戻った場合
 * - Position の supervisor: supervisorPositionId 辿りで自己に戻った場合
 */
export class CyclicReferenceError extends Error {
  public readonly kind: 'department' | 'position'
  public readonly path: readonly string[]

  constructor(kind: 'department' | 'position', path: readonly string[]) {
    super(`Cyclic reference detected in ${kind}: ${path.join(' -> ')}`)
    this.name = 'CyclicReferenceError'
    this.kind = kind
    this.path = path
  }
}

/** Department が存在しない */
export class DepartmentNotFoundError extends Error {
  public readonly departmentId: string
  constructor(departmentId: string) {
    super(`Department not found: ${departmentId}`)
    this.name = 'DepartmentNotFoundError'
    this.departmentId = departmentId
  }
}

/** Position が存在しない */
export class PositionNotFoundError extends Error {
  public readonly positionId: string
  constructor(positionId: string) {
    super(`Position not found: ${positionId}`)
    this.name = 'PositionNotFoundError'
    this.positionId = positionId
  }
}
