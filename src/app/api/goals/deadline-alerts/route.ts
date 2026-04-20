/**
 * Issue #45 / Req 6.8: 逶ｮ讓呎悄髯舌い繝ｩ繝ｼ繝域焔蜍輔ヨ繝ｪ繧ｬ繝ｼ API
 *
 * POST /api/goals/deadline-alerts/scan
 * - ADMIN 縺ｮ縺ｿ螳溯｡悟庄閭ｽ
 * - 200: { notified: number; skipped: number }
 * - 401 / 403: 隱崎ｨｼ/隱榊庄繧ｨ繝ｩ繝ｼ
 * - 503: 繧ｵ繝ｼ繝薙せ譛ｪ蛻晄悄蛹・
 */
import { getAppSession } from '@/lib/auth/app-session'
import { type NextRequest, NextResponse } from 'next/server'
import {
  createDeadlineAlertService,
  type DeadlineAlertService,
} from '@/lib/goal/deadline-alert-service'
import { createInMemoryNotificationRepository } from '@/lib/notification/notification-repository'

// 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
// DI・医ユ繧ｹ繝亥ｷｮ縺玲崛縺育畑・・
// 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

function getService(): DeadlineAlertService {
  // 譛ｬ逡ｪ縺ｧ縺ｯ Prisma-backed 繝ｪ繝昴ず繝医Μ繧呈ｳｨ蜈･縺吶ｋ
  // 迴ｾ譎らせ縺ｧ縺ｯ InMemory 螳溯｣・ｒ繝輔か繝ｼ繝ｫ繝舌ャ繧ｯ縺ｨ縺励※菴ｿ逕ｨ
  return createDeadlineAlertService({
    goalRepo: {
      async findInProgressGoalsNearDeadline() {
        return []
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
// POST /api/goals/deadline-alerts/scan
// 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

export async function POST(_req: NextRequest): Promise<NextResponse> {
  const serverSession = await getAppSession()
  const auth = authorize(serverSession)
  if (!auth.ok) return auth.response

  try {
    const service = getService()
    const result = await service.scanDeadlineAlerts()
    return NextResponse.json(result, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }
}
