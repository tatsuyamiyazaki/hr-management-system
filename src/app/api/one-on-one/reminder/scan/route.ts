/**
 * Issue #49 / Req 7.6: 1on1繝ｭ繧ｰ譛ｪ蜈･蜉帙Μ繝槭う繝ｳ繝繝ｼ謇句虚繝医Μ繧ｬ繝ｼ API
 *
 * POST /api/one-on-one/reminder/scan
 * - ADMIN 縺ｮ縺ｿ螳溯｡悟庄閭ｽ
 * - 200: { notified: number; skipped: number }
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
// 隱榊庄
// 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

function authorize(
  serverSession: Awaited<ReturnType<typeof getAppSession>>,
): { ok: true } | { ok: false; response: NextResponse } {
  if (!serverSession?.user?.email) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const sess = serverSession as Record<string, unknown>
  const role = typeof sess.role === 'string' ? sess.role : undefined
  if (role !== 'ADMIN') {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { ok: true }
}

// 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
// POST /api/one-on-one/reminder/scan
// 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

export async function POST(_req: NextRequest): Promise<NextResponse> {
  const serverSession = await getAppSession()
  const auth = authorize(serverSession)
  if (!auth.ok) return auth.response

  try {
    const service = getService()
    const result = await service.scanMissingLogs()
    return NextResponse.json(result, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }
}
