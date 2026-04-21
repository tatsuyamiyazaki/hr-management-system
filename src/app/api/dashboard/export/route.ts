import { NextRequest, NextResponse } from 'next/server'
import { getAppSession } from '@/lib/auth/app-session'
import { getDashboardService } from '@/lib/dashboard/dashboard-service-di'
import { dashboardExportBodySchema } from '@/lib/dashboard/dashboard-types'
import type { UserRole } from '@/lib/notification/notification-types'

function isUserRole(value: unknown): value is UserRole {
  return value === 'ADMIN' || value === 'HR_MANAGER' || value === 'MANAGER' || value === 'EMPLOYEE'
}

export async function POST(request: NextRequest): Promise<NextResponse> {
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
  if (role !== 'ADMIN' && role !== 'HR_MANAGER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const parsed = dashboardExportBodySchema.safeParse({
    format: body?.format,
    cycleId: body?.cycleId ?? null,
    departmentIds: Array.isArray(body?.departmentIds) ? body.departmentIds : [],
    from: body?.from ? new Date(body.from as string) : null,
    to: body?.to ? new Date(body.to as string) : null,
  })
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid dashboard export body', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  let service: ReturnType<typeof getDashboardService>
  try {
    service = getDashboardService()
  } catch {
    return NextResponse.json({ error: 'Dashboard service not initialized' }, { status: 503 })
  }

  const result = await service.exportReport(role, userId, parsed.data, {
    userId,
    ipAddress: request.headers.get('x-forwarded-for') ?? 'unknown',
    userAgent: request.headers.get('user-agent') ?? 'unknown',
  })
  return NextResponse.json({ success: true, data: result }, { status: 202 })
}
