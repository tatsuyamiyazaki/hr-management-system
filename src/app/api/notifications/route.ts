import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAppSession } from '@/lib/auth/app-session'
import { getNotificationService } from '@/lib/notification/notification-service-di'
import { notificationPreferencesSchema } from '@/lib/notification/notification-types'

function getUserId(session: Record<string, unknown>): string | null {
  return typeof session.userId === 'string' ? session.userId : null
}

export async function GET(): Promise<NextResponse> {
  const session = await getAppSession()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = getUserId(session)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const service = getNotificationService()
    const [list, preferences] = await Promise.all([
      service.listForUser(userId),
      service.getPreferences(userId),
    ])

    return NextResponse.json({
      success: true,
      data: {
        notifications: list.notifications,
        unreadCount: list.unreadCount,
        preferences,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Notification service not initialized' }, { status: 503 })
  }
}

const updateBodySchema = z.object({
  preferences: notificationPreferencesSchema,
})

export async function PUT(request: Request): Promise<NextResponse> {
  const session = await getAppSession()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = getUserId(session)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = updateBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  try {
    const service = getNotificationService()
    await service.updatePreferences(userId, parsed.data.preferences)
    const preferences = await service.getPreferences(userId)
    return NextResponse.json({ success: true, data: { preferences } })
  } catch {
    return NextResponse.json({ error: 'Notification service not initialized' }, { status: 503 })
  }
}
