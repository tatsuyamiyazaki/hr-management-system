/**
 * Issue #24: マスタ管理 API ルートの共通ヘルパ
 *
 * - ADMIN セッションガード
 * - 監査コンテキスト抽出 (ipAddress / userAgent)
 * - ドメインエラー → NextResponse マッピング
 */
import { getServerSession } from 'next-auth'
import { type NextRequest, NextResponse } from 'next/server'
import { GradeWeightSumError, MasterNameConflictError, MasterNotFoundError } from './master-types'
import type { MasterAuditContext } from './master-service'

export interface AdminSession {
  readonly userId: string
}

/**
 * ADMIN セッションを検証して userId を返す。
 * 401 / 403 の場合は NextResponse を返すので呼び出し側で即 return すること。
 */
export async function requireAdmin(): Promise<
  { ok: true; session: AdminSession } | { ok: false; response: NextResponse }
> {
  const serverSession = await getServerSession()
  if (!serverSession?.user?.email) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const sess = serverSession as Record<string, unknown>
  const role = typeof sess.role === 'string' ? sess.role : undefined
  const userId = typeof sess.userId === 'string' ? sess.userId : undefined
  if (role !== 'ADMIN' || !userId) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { ok: true, session: { userId } }
}

/** リクエストから監査コンテキスト (ipAddress / userAgent) を抽出する */
export function extractAuditContext(req: NextRequest): MasterAuditContext {
  const ipAddress =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  const userAgent = req.headers.get('user-agent') ?? 'unknown'
  return { ipAddress, userAgent }
}

/** リクエストボディを JSON としてパースする */
export async function parseJsonBody(
  req: NextRequest,
): Promise<{ ok: true; body: unknown } | { ok: false; response: NextResponse }> {
  try {
    const body = (await req.json()) as unknown
    return { ok: true, body }
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }),
    }
  }
}

/**
 * マスタドメイン例外を HTTP レスポンスに変換する。
 * 未知のエラーは 500 を返す (rethrow はしない)。
 */
export function masterErrorToResponse(err: unknown): NextResponse {
  if (err instanceof MasterNotFoundError) {
    return NextResponse.json(
      { error: 'Not found', resource: err.resource, id: err.resourceId },
      { status: 404 },
    )
  }
  if (err instanceof MasterNameConflictError) {
    return NextResponse.json(
      { error: 'Name conflict', resource: err.resource, name: err.conflictingName },
      { status: 409 },
    )
  }
  if (err instanceof GradeWeightSumError) {
    return NextResponse.json(
      { error: 'Grade weights must sum to 1', actualSum: err.actualSum },
      { status: 422 },
    )
  }
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}
