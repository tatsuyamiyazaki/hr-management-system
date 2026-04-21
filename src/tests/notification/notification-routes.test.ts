import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearNotificationServiceForTesting,
  setNotificationServiceForTesting,
} from '@/lib/notification/notification-service-di'
import type { NotificationService } from '@/lib/notification/notification-service'
import { NotificationNotFoundError } from '@/lib/notification/notification-service'
import { NextRequest } from 'next/server'

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}))

const { getServerSession } = await import('next-auth')
const mockedGetServerSession = vi.mocked(getServerSession)

const notificationsRoute = await import('@/app/api/notifications/route')
const notificationItemRoute = await import('@/app/api/notifications/[notificationId]/route')

function makeSession() {
  return {
    user: { email: 'admin@example.com' },
    userId: 'dev-admin',
    role: 'ADMIN',
  }
}

function makeService(): NotificationService {
  return {
    listForUser: vi.fn().mockResolvedValue({
      notifications: [
        {
          id: 'notif-1',
          userId: 'dev-admin',
          category: 'SYSTEM',
          title: 'Title',
          body: 'Body',
          payload: null,
          readAt: null,
          createdAt: new Date('2026-04-21T00:00:00.000Z'),
        },
      ],
      unreadCount: 1,
    }),
    markAsRead: vi.fn().mockResolvedValue({
      id: 'notif-1',
      userId: 'dev-admin',
      category: 'SYSTEM',
      title: 'Title',
      body: 'Body',
      payload: null,
      readAt: new Date('2026-04-21T01:00:00.000Z'),
      createdAt: new Date('2026-04-21T00:00:00.000Z'),
    }),
    getPreferences: vi.fn().mockResolvedValue([{ category: 'SYSTEM', emailEnabled: true }]),
    updatePreferences: vi.fn().mockResolvedValue(undefined),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  clearNotificationServiceForTesting()
})

describe('GET /api/notifications', () => {
  it('returns 401 without session', async () => {
    mockedGetServerSession.mockResolvedValue(null)
    const res = await notificationsRoute.GET()
    expect(res.status).toBe(401)
  })

  it('returns notifications and preferences', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession())
    const service = makeService()
    setNotificationServiceForTesting(service)

    const res = await notificationsRoute.GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.unreadCount).toBe(1)
    expect(service.listForUser).toHaveBeenCalledWith('dev-admin')
    expect(service.getPreferences).toHaveBeenCalledWith('dev-admin')
  })
})

describe('PUT /api/notifications', () => {
  it('updates preferences', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession())
    const service = makeService()
    setNotificationServiceForTesting(service)

    const req = new NextRequest('http://localhost/api/notifications', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferences: [{ category: 'SYSTEM', emailEnabled: false }] }),
    })

    const res = await notificationsRoute.PUT(req)
    expect(res.status).toBe(200)
    expect(service.updatePreferences).toHaveBeenCalledWith('dev-admin', [
      { category: 'SYSTEM', emailEnabled: false },
    ])
  })
})

describe('PATCH /api/notifications/[notificationId]', () => {
  it('marks a notification as read', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession())
    const service = makeService()
    setNotificationServiceForTesting(service)

    const res = await notificationItemRoute.PATCH(
      new NextRequest('http://localhost/api/notifications/notif-1'),
      {
        params: Promise.resolve({ notificationId: 'notif-1' }),
      },
    )

    expect(res.status).toBe(200)
    expect(service.markAsRead).toHaveBeenCalledWith('dev-admin', 'notif-1')
  })

  it('returns 404 when missing', async () => {
    mockedGetServerSession.mockResolvedValue(makeSession())
    const service = makeService()
    vi.mocked(service.markAsRead).mockRejectedValue(new NotificationNotFoundError('missing'))
    setNotificationServiceForTesting(service)

    const res = await notificationItemRoute.PATCH(
      new NextRequest('http://localhost/api/notifications/missing'),
      {
        params: Promise.resolve({ notificationId: 'missing' }),
      },
    )

    expect(res.status).toBe(404)
  })
})
