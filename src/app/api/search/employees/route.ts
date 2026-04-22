/**
 * Issue #174 / Req 16.1, 16.3, 16.4, 16.5, 16.6: 社員検索 API
 *
 * GET /api/search/employees?keyword=...&departmentIds[]=...&statuses[]=...&limit=...
 * - 全ロール参照可能
 * - デフォルトで ACTIVE 社員のみ返却（退職・休職は除外）
 * - 200: { success: true, data: EmployeeSearchResult[], meta: { total } }
 * - 401: 未認証
 * - 422: バリデーションエラー
 * - 503: サービス未初期化
 */
import { getAppSession } from '@/lib/auth/app-session'
import { type NextRequest, NextResponse } from 'next/server'
import { getSearchService } from '@/lib/search/search-service-di'
import { employeeSearchQuerySchema, EMPLOYEE_STATUSES } from '@/lib/search/search-types'
import type { EmployeeStatus } from '@/lib/search/search-types'

function getAuthorizedUserId(
  serverSession: Awaited<ReturnType<typeof getAppSession>>,
): { ok: true; userId: string } | { ok: false; response: NextResponse } {
  if (!serverSession?.user?.email) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const sess = serverSession as Record<string, unknown>
  const userId = typeof sess.userId === 'string' ? sess.userId : undefined
  if (!userId) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  return { ok: true, userId }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = getAuthorizedUserId(await getAppSession())
  if (!auth.ok) return auth.response

  const { searchParams } = request.nextUrl
  const keyword = searchParams.get('keyword') ?? ''
  const departmentIds = searchParams.getAll('departmentIds[]')
  const rawStatuses = searchParams.getAll('statuses[]')
  const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined

  const validStatuses = rawStatuses.filter((s): s is EmployeeStatus =>
    (EMPLOYEE_STATUSES as readonly string[]).includes(s),
  )

  const queryResult = employeeSearchQuerySchema.safeParse({
    keyword,
    departmentIds: departmentIds.length > 0 ? departmentIds : undefined,
    statuses: validStatuses.length > 0 ? validStatuses : undefined,
    limit,
  })

  if (!queryResult.success) {
    return NextResponse.json({ error: queryResult.error.flatten() }, { status: 422 })
  }

  let svc: ReturnType<typeof getSearchService>
  try {
    svc = getSearchService()
  } catch {
    return NextResponse.json({ error: 'Search service not initialized' }, { status: 503 })
  }

  const result = await svc.queryEmployees(queryResult.data, auth.userId)
  if (result.isErr()) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }
  return NextResponse.json({
    success: true,
    data: result.value,
    meta: { total: result.value.length },
  })
}
