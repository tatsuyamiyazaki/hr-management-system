/**
 * RBAC Authorizer
 *
 * Task 6.3 — 認可ルールの純粋な判定 (`decide`) と、
 * 拒否時に監査ログを残して例外 throw する強制実行 (`enforce`) を提供する。
 *
 * narrow port (AuditLoggerPort) を注入する設計により、
 * 実体の `AuditLogEmitter` (Prisma 依存) に直接依存せずテスト容易性を保つ。
 *
 * 関連要件:
 * - Req 1.8: HR_MANAGER は人事データの読み取り
 * - Req 1.9: 他者の個人評価アクセス拒否 + 監査ログ記録
 */
import { DEFAULT_POLICY_RULES } from './policy'
import {
  ForbiddenError,
  type Action,
  type AuthSubject,
  type AuthorizationDecision,
  type AuthorizationReason,
  type PolicyRule,
  type ResourceRef,
} from './rbac-types'

// ─────────────────────────────────────────────────────────────────────────────
// narrow port — 外部の監査ログ基盤へ書き出す抽象 (AuditLogEmitter 互換 shape)
// ─────────────────────────────────────────────────────────────────────────────

/** 認可拒否ログ 1 件。実装は Prisma / memory / Null 等で差し替え可能 */
export interface AccessDeniedLogEntry {
  readonly userId: string | null
  readonly action: string
  readonly resourceType: string
  readonly resourceId: string | null
  readonly ipAddress: string
  readonly userAgent: string
  readonly before: Record<string, unknown> | null
  readonly after: Record<string, unknown> | null
}

/**
 * narrow port。`@/lib/audit/audit-log-emitter` の AuditLogEmitter と互換。
 * audit-log-types への直接依存を避け、shape だけを要求する。
 */
export interface AuditLoggerPort {
  emit(entry: AccessDeniedLogEntry): Promise<void>
}

// ─────────────────────────────────────────────────────────────────────────────
// 公開 API
// ─────────────────────────────────────────────────────────────────────────────

export interface Authorizer {
  /** 副作用のない純粋判定 */
  decide(subject: AuthSubject, action: Action, resource: ResourceRef): AuthorizationDecision

  /** 拒否時は auditLogger で記録した上で ForbiddenError を throw */
  enforce(
    subject: AuthSubject,
    action: Action,
    resource: ResourceRef,
    context?: RequestContext,
  ): Promise<void>
}

export interface RequestContext {
  readonly ipAddress?: string
  readonly userAgent?: string
}

export interface CreateAuthorizerOptions {
  /** 未指定時は DEFAULT_POLICY_RULES を使用 */
  readonly rules?: readonly PolicyRule[]
  /** 未指定時は拒否ログを記録しない (ForbiddenError の throw は変わらない) */
  readonly auditLogger?: AuditLoggerPort
}

// ─────────────────────────────────────────────────────────────────────────────
// 内部ヘルパ
// ─────────────────────────────────────────────────────────────────────────────

function findMatchingRule(
  rules: readonly PolicyRule[],
  resourceType: string,
  action: Action,
): PolicyRule | undefined {
  return rules.find((rule) => rule.resourceType === resourceType && rule.action === action)
}

function isRoleAllowed(rule: PolicyRule, subject: AuthSubject): boolean {
  return rule.allowedRoles.includes(subject.role)
}

function isOwner(rule: PolicyRule, subject: AuthSubject, resource: ResourceRef): boolean {
  return rule.ownerCanAccess === true && resource.ownerId === subject.userId
}

/**
 * decide() の本体。純粋関数。
 *
 * - ルール未ヒット: DENIED_NO_RULE
 * - ロール許可: ALLOWED_BY_ROLE
 * - 所有者許可: ALLOWED_AS_OWNER
 * - ownerCanAccess あり + ownerId 不一致: DENIED_NOT_OWNER
 * - それ以外: DENIED_INSUFFICIENT_ROLE
 */
function decideWithRules(
  rules: readonly PolicyRule[],
  subject: AuthSubject,
  action: Action,
  resource: ResourceRef,
): AuthorizationDecision {
  const rule = findMatchingRule(rules, resource.type, action)
  if (!rule) {
    return { allowed: false, reason: 'DENIED_NO_RULE' }
  }

  if (isRoleAllowed(rule, subject)) {
    return { allowed: true, reason: 'ALLOWED_BY_ROLE' }
  }

  if (isOwner(rule, subject, resource)) {
    return { allowed: true, reason: 'ALLOWED_AS_OWNER' }
  }

  // ownerCanAccess=true かつ ownerId が指定されていて本人ではない場合は NOT_OWNER
  if (rule.ownerCanAccess === true && resource.ownerId !== undefined) {
    return { allowed: false, reason: 'DENIED_NOT_OWNER' }
  }

  return { allowed: false, reason: 'DENIED_INSUFFICIENT_ROLE' }
}

function buildAccessDeniedEntry(
  subject: AuthSubject,
  action: Action,
  resource: ResourceRef,
  reason: AuthorizationReason,
  context: RequestContext | undefined,
): AccessDeniedLogEntry {
  return {
    userId: subject.userId,
    action: 'ACCESS_DENIED',
    resourceType: resource.type,
    resourceId: resource.id,
    ipAddress: context?.ipAddress ?? '',
    userAgent: context?.userAgent ?? '',
    before: null,
    after: {
      reason,
      requestedAction: action,
      subjectRole: subject.role,
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 実装
// ─────────────────────────────────────────────────────────────────────────────

class AuthorizerImpl implements Authorizer {
  private readonly rules: readonly PolicyRule[]
  private readonly auditLogger: AuditLoggerPort | undefined

  constructor(rules: readonly PolicyRule[], auditLogger: AuditLoggerPort | undefined) {
    this.rules = rules
    this.auditLogger = auditLogger
  }

  decide(subject: AuthSubject, action: Action, resource: ResourceRef): AuthorizationDecision {
    return decideWithRules(this.rules, subject, action, resource)
  }

  async enforce(
    subject: AuthSubject,
    action: Action,
    resource: ResourceRef,
    context?: RequestContext,
  ): Promise<void> {
    const decision = this.decide(subject, action, resource)
    if (decision.allowed) {
      return
    }

    if (this.auditLogger !== undefined) {
      const entry = buildAccessDeniedEntry(subject, action, resource, decision.reason, context)
      await this.auditLogger.emit(entry)
    }

    throw new ForbiddenError(resource.type, action, decision.reason)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createAuthorizer(opts: CreateAuthorizerOptions): Authorizer {
  const rules = opts.rules ?? DEFAULT_POLICY_RULES
  return new AuthorizerImpl(rules, opts.auditLogger)
}
