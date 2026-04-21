import { NextResponse } from 'next/server'
import { getAppSession } from '@/lib/auth/app-session'
import {
  NotificationAccessDeniedError,
  NotificationNotFoundError,
} from '@/lib/notification/notification-service'
import { getNotificationService } from '@/lib/notification/notification-service-di'

function getUserId(session: Record<string, unknown>): string | null {
  return typeof session.userId === 'string' ? session.userId : null
}

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ notificationId: string }> },
): Promise<NextResponse> {
  const session = await getAppSession()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = getUserId(session)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { notificationId } = await params

  try {
    const service = getNotificationService()
    const notification = await service.markAsRead(userId, notificationId)
    return NextResponse.json({ success: true, data: notification })
  } catch (error) {
    if (error instanceof NotificationNotFoundError) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 })
    }
    if (error instanceof NotificationAccessDeniedError) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Notification service not initialized' }, { status: 503 })
  }
}
