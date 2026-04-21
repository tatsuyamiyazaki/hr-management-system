/**
 * requireRole — サービス層/API ルート向けロール強制ヘルパ
 *
 * Task 6.3 — 「このロールのいずれかでないと処理を継続させない」を
 * 1 行で表現するための薄いラッパ。内部では Authorizer のルール機構を使わず、
 * 直接 allowedRoles を判定する (role-only の早期拒否)。
 *
 * 拒否時は ForbiddenError を throw し、auditLogger が注入されていれば
 * action='ACCESS_DENIED' の監査ログを記録する。
 */
import type { AuditLoggerPort } from './authorizer'
import { ForbiddenError, type AuthSubject } from './rbac-types'
import type { UserRole } from '@/lib/notification/notification-types'
import type { SecurityEventRecorderPort } from '@/lib/monitoring/security-monitoring-service'

// ─────────────────────────────────────────────────────────────────────────────
// 型
// ─────────────────────────────────────────────────────────────────────────────

export interface RequireRoleOptions {
  /** 監査ログに乗せるリソース識別子のヒント (省略時は resourceType='ROUTE') */
  readonly resourceHint?: {
    readonly type: string
    readonly id?: string
  }
  /** HTTP コンテキスト (IP / UA) */
  readonly context?: {
    readonly ipAddress?: string
    readonly userAgent?: string
  }
  /** 拒否時に監査ログを記録するためのポート */
  readonly auditLogger?: AuditLoggerPort
  readonly securityMonitor?: SecurityEventRecorderPort
}

/**
 * Next.js Request から認証済み Subject を解決するためのポート。
 * NextAuth / セッションストアの具体実装を抽象化してテスト容易性を確保する。
 */
export interface SubjectProvider {
  getSubject(request: Request): Promise<AuthSubject | null>
}

// ─────────────────────────────────────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_RESOURCE_TYPE = 'ROUTE'
/** requireRole は純粋なロール判定なので、決定理由は常にこれで固定 */
const ROLE_ONLY_DENIED_REASON = 'DENIED_INSUFFICIENT_ROLE'
/** requireRole は HTTP メソッドに非依存なので、拒否時の "要求アクション" は READ 相当で記録 */
const ROLE_CHECK_REQUESTED_ACTION = 'READ'

// ─────────────────────────────────────────────────────────────────────────────
// ヘルパ
// ─────────────────────────────────────────────────────────────────────────────

function isAllowedRole(subject: AuthSubject, allowedRoles: readonly UserRole[]): boolean {
  return allowedRoles.includes(subject.role)
}

// ─────────────────────────────────────────────────────────────────────────────
// 公開 API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * subject.role が allowedRoles のいずれかと一致することを要求する。
 * 一致しない場合は ForbiddenError を throw し、auditLogger があれば ACCESS_DENIED を emit。
 */
export async function requireRole(
  subject: AuthSubject,
  allowedRoles: readonly UserRole[],
  opts: RequireRoleOptions = {},
): Promise<void> {
  if (isAllowedRole(subject, allowedRoles)) {
    return
  }

  const resourceType = opts.resourceHint?.type ?? DEFAULT_RESOURCE_TYPE
  const resourceId = opts.resourceHint?.id ?? null

  if (opts.auditLogger !== undefined) {
    await opts.auditLogger.emit({
      userId: subject.userId,
      action: 'ACCESS_DENIED',
      resourceType,
      resourceId,
      ipAddress: opts.context?.ipAddress ?? '',
      userAgent: opts.context?.userAgent ?? '',
      before: null,
      after: {
        reason: ROLE_ONLY_DENIED_REASON,
        requestedAction: ROLE_CHECK_REQUESTED_ACTION,
        subjectRole: subject.role,
        allowedRoles: [...allowedRoles],
      },
    })
  }

  if (opts.securityMonitor !== undefined) {
    await opts.securityMonitor.record({
      type: 'ACCESS_DENIED',
      occurredAt: new Date(),
      ipAddress: opts.context?.ipAddress,
      userId: subject.userId,
      requestId: undefined,
      path: undefined,
      metadata: {
        resourceType,
        resourceId,
        allowedRoles: [...allowedRoles],
      },
    })
  }

  throw new ForbiddenError(resourceType, ROLE_CHECK_REQUESTED_ACTION, ROLE_ONLY_DENIED_REASON)
}
