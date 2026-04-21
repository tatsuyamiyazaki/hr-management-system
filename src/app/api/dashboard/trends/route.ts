import { NextResponse } from 'next/server'
import { getAppSession } from '@/lib/auth/app-session'
import { getDashboardService } from '@/lib/dashboard/dashboard-service-di'
import { dashboardTrendQuerySchema } from '@/lib/dashboard/dashboard-types'
import type { UserRole } from '@/lib/notification/notification-types'

function isUserRole(value: unknown): value is UserRole {
  return value === 'ADMIN' || value === 'HR_MANAGER' || value === 'MANAGER' || value === 'EMPLOYEE'
}

function parseCsvParam(value: string | null): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function parseDateParam(value: string | null): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? new Date('invalid') : date
}

export async function GET(request: Request): Promise<NextResponse> {
  const session = await getAppSession()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sess = session as Record<string, unknown>
  const userId = typeof sess.userId === 'string' ? sess.userId : undefined
  const role = sess.role
  if (!userId || !isUserRole(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const parsed = dashboardTrendQuerySchema.safeParse({
    departmentIds: parseCsvParam(url.searchParams.get('departmentIds')),
    cycleIds: parseCsvParam(url.searchParams.get('cycleIds')),
    from: parseDateParam(url.searchParams.get('from')),
    to: parseDateParam(url.searchParams.get('to')),
  })
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid dashboard trend query', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  let service: ReturnType<typeof getDashboardService>
  try {
    service = getDashboardService()
  } catch {
    return NextResponse.json({ error: 'Dashboard service not initialized' }, { status: 503 })
  }

  const result = await service.getTrendSummary(role, userId, parsed.data)
  return NextResponse.json({ success: true, data: result }, { status: 200 })
}
