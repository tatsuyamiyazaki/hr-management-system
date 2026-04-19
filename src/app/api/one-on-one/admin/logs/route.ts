/**
 * Issue #49 / Req 7.8: HR_MANAGER 向け全 1on1 ログ一覧 API
 *
 * GET /api/one-on-one/admin/logs?page=1&limit=20&from=...&to=...
 * - HR_MANAGER 以上のみ参照可能
 * - 200: { data: AllLogEntry[]; total: number }
 * - 400: クエリパラメータ不正
 * - 401 / 403: 認証/認可エラー
 * - 503: サービス未初期化
 */
import { getServerSession } from 'next-auth'
import { type NextRequest, NextResponse } from 'next/server'
import {
  createOneOnOneReminderService,
  type OneOnOneReminderService,
} from '@/lib/one-on-one/one-on-one-reminder-service'
import { createInMemoryNotificationRepository } from '@/lib/notification/notification-repository'

// ─────────────────────────────────────────────────────────────────────────────
// DI（テスト差し替え用）
// ─────────────────────────────────────────────────────────────────────────────

let _service: OneOnOneReminderService | null = null

export function setAdminLogsServiceForTesting(s: OneOnOneReminderService): void {
  _service = s
}

export function clearAdminLogsServiceForTesting(): void {
  _service = null
}

function getService(): OneOnOneReminderService {
  if (_service) return _service
  return createOneOnOneReminderService({
    subordinateRepo: {
      async findAllSubordinatesWithLastLog() {
        return []
      },
    },
    sessionRepo: {
      async findSessionsInRange() {
        return []
      },
      async listAllLogs() {
        return { data: [], total: 0 }
      },
    },
    notificationRepo: createInMemoryNotificationRepository(),
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 認可: HR_MANAGER 以上
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_ROLES = new Set(['ADMIN', 'HR_MANAGER'])

function authorize(
  serverSession: Awaited<ReturnType<typeof getServerSession>>,
): { ok: true } | { ok: false; response: NextResponse } {
  if (!serverSession?.user?.email) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const sess = serverSession as Record<string, unknown>
  const role = typeof sess.role === 'string' ? sess.role : undefined
  if (role === undefined || !ALLOWED_ROLES.has(role)) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/one-on-one/admin/logs
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const serverSession = await getServerSession()
  const auth = authorize(serverSession)
  if (!auth.ok) return auth.response

  const { searchParams } = req.nextUrl
  const pageStr = searchParams.get('page') ?? '1'
  const limitStr = searchParams.get('limit') ?? '20'
  const fromStr = searchParams.get('from')
  const toStr = searchParams.get('to')

  const page = parseInt(pageStr, 10)
  const limit = parseInt(limitStr, 10)

  if (isNaN(page) || page < 1 || isNaN(limit) || limit < 1) {
    return NextResponse.json(
      { error: 'Invalid page or limit parameter' },
      { status: 400 },
    )
  }

  const from = fromStr ? new Date(fromStr) : undefined
  const to = toStr ? new Date(toStr) : undefined

  if (from && isNaN(from.getTime())) {
    return NextResponse.json({ error: 'Invalid date format for from' }, { status: 400 })
  }
  if (to && isNaN(to.getTime())) {
    return NextResponse.json({ error: 'Invalid date format for to' }, { status: 400 })
  }

  try {
    const service = getService()
    const result = await service.listAllLogs({ page, limit, from, to })
    return NextResponse.json(result, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }
}
