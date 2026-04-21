import { NextResponse } from 'next/server'
import { getAppSession } from '@/lib/auth/app-session'
import { AIDashboardForbiddenError } from '@/lib/ai-monitoring/ai-dashboard-service'
import { getAIDashboardService } from '@/lib/ai-monitoring/ai-dashboard-service-di'
import type { Granularity } from '@/lib/ai-monitoring/ai-dashboard-types'
import type { UserRole } from '@/lib/notification/notification-types'

function isUserRole(value: unknown): value is UserRole {
  return value === 'ADMIN' || value === 'HR_MANAGER' || value === 'MANAGER' || value === 'EMPLOYEE'
}

function parseRange(input: string | null): { from: Date; to: Date; granularity: Granularity } {
  const to = new Date()
  if (input === '7d') {
    return { from: new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000), to, granularity: 'DAY' }
  }
  if (input === '90d') {
    return { from: new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000), to, granularity: 'WEEK' }
  }
  return { from: new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000), to, granularity: 'DAY' }
}

export async function GET(request: Request): Promise<NextResponse> {
  const session = await getAppSession()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const raw = session as Record<string, unknown>
  const userId = typeof raw.userId === 'string' ? raw.userId : null
  const role = raw.role
  if (!userId || !isUserRole(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const url = new URL(request.url)
    const range = parseRange(url.searchParams.get('range'))
    const service = getAIDashboardService()
    const data = await service.getSnapshot({
      requester: { userId, role },
      range,
      topUsersLimit: 5,
    })
    return NextResponse.json({ success: true, data })
  } catch (error) {
    if (error instanceof AIDashboardForbiddenError) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json({ error: 'AI dashboard service not initialized' }, { status: 503 })
  }
}
