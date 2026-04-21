import { NextResponse } from 'next/server'
import { getAppSession } from '@/lib/auth/app-session'
import { getDashboardService } from '@/lib/dashboard/dashboard-service-di'
import type { UserRole } from '@/lib/notification/notification-types'

function isUserRole(value: unknown): value is UserRole {
  return value === 'ADMIN' || value === 'HR_MANAGER' || value === 'MANAGER' || value === 'EMPLOYEE'
}

export async function GET(): Promise<NextResponse> {
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

  let service: ReturnType<typeof getDashboardService>
  try {
    service = getDashboardService()
  } catch {
    return NextResponse.json({ error: 'Dashboard service not initialized' }, { status: 503 })
  }

  const result = await service.getKpiSummary(role, userId)
  return NextResponse.json({ success: true, data: result }, { status: 200 })
}
