/**
 * Next.js middleware 向け ルートガードヘルパ
 *
 * Task 6.3 — URL ルート単位でロール判定を行う「多層防御の第 1 層」。
 * 実際の `src/middleware.ts` への組み込みは後続タスクで行う。ここでは
 * フレームワーク非依存なヘルパ (Request/Response Fetch API) のみを提供する。
 *
 * 関連要件:
 * - Req 1.7: 4 ロール管理
 * - Req 1.9: 他者の個人評価へのアクセスは 403 拒否 + 監査ログ記録
 */
import type { AuditLoggerPort } from './authorizer'
import type { AuthSubject } from './rbac-types'
import type { UserRole } from '@/lib/notification/notification-types'

// ─────────────────────────────────────────────────────────────────────────────
// 公開型
// ─────────────────────────────────────────────────────────────────────────────

export interface RoutePolicy {
  /** 対象パスの正規表現 (pathname に対してマッチ) */
  readonly pathPattern: RegExp
  /** このパスへのアクセスを許可するロール */
  readonly allowedRoles: readonly UserRole[]
  /** 拒否ログに乗せるリソース識別子 (省略時は 'ROUTE') */
  readonly resourceType?: string
}

/**
 * Next.js Request から認証済み Subject を解決するためのポート。
 * NextAuth / セッションストアの具体実装を抽象化してテスト容易性を確保する。
 * (require-role.ts の SubjectProvider と同一形状だが、モジュール独立性のため個別定義)
 */
export interface SubjectProvider {
  getSubject(request: Request): Promise<AuthSubject | null>
}

export interface RouteGuardDeps {
  readonly policies: readonly RoutePolicy[]
  readonly subjectProvider: SubjectProvider
  readonly auditLogger?: AuditLoggerPort
}

export interface RouteGuard {
  /** 通過するなら null / 停止するなら Response (401 or 403) を返す */
  guard(request: Request): Promise<Response | null>
}

// ─────────────────────────────────────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_RESOURCE_TYPE = 'ROUTE'
const ROLE_ONLY_DENIED_REASON = 'DENIED_INSUFFICIENT_ROLE'
const ROUTE_REQUESTED_ACTION = 'READ'
const JSON_CONTENT_TYPE = 'application/json'

// ─────────────────────────────────────────────────────────────────────────────
// ポリシーマッチャ
// ─────────────────────────────────────────────────────────────────────────────

/**
 * policies の先頭から順に pathPattern.test(pathname) を試し、
 * 最初にマッチした RoutePolicy を返す。どれにもマッチしなければ null。
 */
export function matchRoutePolicy(
  pathname: string,
  policies: readonly RoutePolicy[],
): RoutePolicy | null {
  for (const policy of policies) {
    if (policy.pathPattern.test(pathname)) {
      return policy
    }
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Response ヘルパ
// ─────────────────────────────────────────────────────────────────────────────

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': JSON_CONTENT_TYPE },
  })
}

function unauthorizedResponse(): Response {
  return jsonResponse(401, { error: 'Unauthorized' })
}

function forbiddenResponse(resourceType: string): Response {
  return jsonResponse(403, { error: 'Forbidden', resourceType })
}

// ─────────────────────────────────────────────────────────────────────────────
// コンテキスト抽出
// ─────────────────────────────────────────────────────────────────────────────

function extractIpAddress(request: Request): string {
  const xff = request.headers.get('x-forwarded-for')
  if (xff !== null && xff.length > 0) {
    // 先頭の IP のみ採用 (X-Forwarded-For: client, proxy1, proxy2)
    const firstIp = xff.split(',')[0]
    return firstIp !== undefined ? firstIp.trim() : ''
  }
  return request.headers.get('x-real-ip') ?? ''
}

function extractUserAgent(request: Request): string {
  return request.headers.get('user-agent') ?? ''
}

// ─────────────────────────────────────────────────────────────────────────────
// Guard 実装
// ─────────────────────────────────────────────────────────────────────────────

async function emitAccessDenied(
  auditLogger: AuditLoggerPort | undefined,
  subject: AuthSubject,
  policy: RoutePolicy,
  request: Request,
): Promise<void> {
  if (auditLogger === undefined) {
    return
  }
  const resourceType = policy.resourceType ?? DEFAULT_RESOURCE_TYPE
  await auditLogger.emit({
    userId: subject.userId,
    action: 'ACCESS_DENIED',
    resourceType,
    resourceId: null,
    ipAddress: extractIpAddress(request),
    userAgent: extractUserAgent(request),
    before: null,
    after: {
      reason: ROLE_ONLY_DENIED_REASON,
      requestedAction: ROUTE_REQUESTED_ACTION,
      subjectRole: subject.role,
      allowedRoles: [...policy.allowedRoles],
      path: new URL(request.url).pathname,
    },
  })
}

function isRoleAllowed(subject: AuthSubject, policy: RoutePolicy): boolean {
  return policy.allowedRoles.includes(subject.role)
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Next.js middleware から呼び出すためのガード factory。
 *
 * 戻り値 guard(request) は:
 * - policy 未マッチ → null (通過)
 * - subject 解決失敗 → 401 Response
 * - subject.role が許可ロール → null (通過)
 * - そうでない → 403 Response (+ 監査ログ emit)
 */
export function createRouteGuard(deps: RouteGuardDeps): RouteGuard {
  const { policies, subjectProvider, auditLogger } = deps

  return {
    async guard(request: Request): Promise<Response | null> {
      const pathname = new URL(request.url).pathname
      const policy = matchRoutePolicy(pathname, policies)
      if (policy === null) {
        return null
      }

      const subject = await subjectProvider.getSubject(request)
      if (subject === null) {
        return unauthorizedResponse()
      }

      if (isRoleAllowed(subject, policy)) {
        return null
      }

      await emitAccessDenied(auditLogger, subject, policy, request)
      return forbiddenResponse(policy.resourceType ?? DEFAULT_RESOURCE_TYPE)
    },
  }
}
