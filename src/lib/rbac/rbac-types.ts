/**
 * RBAC (Role-Based Access Control) 共通型
 *
 * Task 6.3 — ADMIN / HR_MANAGER / MANAGER / EMPLOYEE の 4 ロールを軸に、
 * 「誰が (Subject)・何を (Resource)・どう操作できるか (Action)」を表現する。
 *
 * 関連要件:
 * - Req 1.7: 4 ロールで権限を管理
 * - Req 1.8: HR_MANAGER は全社員の評価・配置・目標を読める
 * - Req 1.9: EMPLOYEE は他者の個人評価へアクセスすると 403
 */
import type { UserRole } from '@/lib/notification/notification-types'

// ─────────────────────────────────────────────────────────────────────────────
// Subject / Resource
// ─────────────────────────────────────────────────────────────────────────────

/** 認証済みプリンシパル (セッション相当) */
export interface AuthSubject {
  readonly userId: string
  readonly role: UserRole
}

/**
 * リソース参照。所有権判定 (ownerCanAccess) のためのヒントを含む。
 * type は 'EVALUATION' | 'GOAL' | ... を想定するが、ポリシーで自由に拡張できるよう
 * string として扱う (DEFAULT_POLICY_RULES と同じ識別子を使うのが前提)。
 */
export interface ResourceRef {
  readonly type: string
  readonly id: string
  /** リソースの所有者 userId。未指定時は所有権チェック不可 */
  readonly ownerId?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Action
// ─────────────────────────────────────────────────────────────────────────────

export const ACTIONS = ['READ', 'CREATE', 'UPDATE', 'DELETE', 'MANAGE'] as const
export type Action = (typeof ACTIONS)[number]

export function isAction(value: unknown): value is Action {
  return typeof value === 'string' && (ACTIONS as readonly string[]).includes(value)
}

// ─────────────────────────────────────────────────────────────────────────────
// Policy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 認可ルール。
 * - allowedRoles: このアクションを許可するロールの集合
 * - ownerCanAccess: true の場合、ロールに含まれないユーザーでも
 *   resource.ownerId === subject.userId なら許可する (本人アクセス)
 */
export interface PolicyRule {
  readonly resourceType: string
  readonly action: Action
  readonly allowedRoles: readonly UserRole[]
  readonly ownerCanAccess?: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// 認可判定結果
// ─────────────────────────────────────────────────────────────────────────────

/** 認可決定の理由コード (UI/audit ログで分析可能にするため文字列で公開) */
export type AuthorizationReason =
  | 'ALLOWED_BY_ROLE'
  | 'ALLOWED_AS_OWNER'
  | 'DENIED_NO_RULE'
  | 'DENIED_INSUFFICIENT_ROLE'
  | 'DENIED_NOT_OWNER'

export interface AuthorizationDecision {
  readonly allowed: boolean
  readonly reason: AuthorizationReason
}

// ─────────────────────────────────────────────────────────────────────────────
// ドメイン例外
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 認可拒否例外。
 * - resourceType / action / reason を保持し、呼び出し側で 403 応答や監査ログの
 *   分岐に使えるようにする
 */
export class ForbiddenError extends Error {
  public readonly resourceType: string
  public readonly action: Action
  public readonly reason: AuthorizationReason

  constructor(resourceType: string, action: Action, reason: AuthorizationReason) {
    super(`Forbidden: ${action} on ${resourceType} (${reason})`)
    this.name = 'ForbiddenError'
    this.resourceType = resourceType
    this.action = action
    this.reason = reason
  }
}
