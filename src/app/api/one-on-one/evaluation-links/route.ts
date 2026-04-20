/**
 * Issue #49 / Req 7.7: 隧穂ｾ｡繝輔か繝ｼ繝逕ｨ 1on1 繝ｭ繧ｰ蜿ら・繝ｪ繝ｳ繧ｯ API
 *
 * GET /api/one-on-one/evaluation-links?employeeId=...&from=...&to=...
 * - 譛ｬ莠ｺ 縺ｾ縺溘・ MANAGER 莉･荳翫・縺ｿ蜿ら・蜿ｯ閭ｽ
 * - 200: EvaluationLogLink[]
 * - 400: 繧ｯ繧ｨ繝ｪ繝代Λ繝｡繝ｼ繧ｿ荳肴ｭ｣
 * - 401 / 403: 隱崎ｨｼ/隱榊庄繧ｨ繝ｩ繝ｼ
 * - 503: 繧ｵ繝ｼ繝薙せ譛ｪ蛻晄悄蛹・
 */
import { getAppSession } from '@/lib/auth/app-session'
import { type NextRequest, NextResponse } from 'next/server'
import {
  createOneOnOneReminderService,
  type OneOnOneReminderService,
} from '@/lib/one-on-one/one-on-one-reminder-service'
import { createInMemoryNotificationRepository } from '@/lib/notification/notification-repository'

// 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
// DI・医ユ繧ｹ繝亥ｷｮ縺玲崛縺育畑・・
// 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

function getService(): OneOnOneReminderService {
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

// 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
// 隱榊庄: 譛ｬ莠ｺ 縺ｾ縺溘・ MANAGER 莉･荳・
// 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

const ALLOWED_ROLES = new Set(['ADMIN', 'HR_MANAGER', 'MANAGER'])

function authorize(
  serverSession: Awaited<ReturnType<typeof getAppSession>>,
  employeeId: string,
): { ok: true } | { ok: false; response: NextResponse } {
  if (!serverSession?.user?.email) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const sess = serverSession as Record<string, unknown>
  const role = typeof sess.role === 'string' ? sess.role : undefined
  const userId = typeof sess.id === 'string' ? sess.id : undefined

  const isSelf = userId === employeeId
  const isManagerOrAbove = role !== undefined && ALLOWED_ROLES.has(role)

  if (!isSelf && !isManagerOrAbove) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { ok: true }
}

// 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
// GET /api/one-on-one/evaluation-links
// 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl
  const employeeId = searchParams.get('employeeId')
  const fromStr = searchParams.get('from')
  const toStr = searchParams.get('to')

  if (!employeeId || !fromStr || !toStr) {
    return NextResponse.json(
      { error: 'Missing required query parameters: employeeId, from, to' },
      { status: 400 },
    )
  }

  const from = new Date(fromStr)
  const to = new Date(toStr)

  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return NextResponse.json({ error: 'Invalid date format for from or to' }, { status: 400 })
  }

  const serverSession = await getAppSession()
  const auth = authorize(serverSession, employeeId)
  if (!auth.ok) return auth.response

  try {
    const service = getService()
    const links = await service.getEvaluationLinks(employeeId, from, to)
    return NextResponse.json(links, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }
}
