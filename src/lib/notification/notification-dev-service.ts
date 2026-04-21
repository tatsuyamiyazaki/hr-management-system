import { createNotificationService, type NotificationService } from './notification-service'
import {
  createInMemoryNotificationRepository,
  createInMemoryPreferenceRepository,
} from './notification-repository'

const now = Date.now()

const devService = createNotificationService({
  notifications: createInMemoryNotificationRepository([
    {
      id: 'notif-1',
      userId: 'dev-admin',
      category: 'SYSTEM',
      title: '開発環境の通知センターを有効化しました',
      body: 'Issue #173 のUI検証用に、アプリ内通知のダミーデータを表示しています。',
      payload: { route: '/notifications' },
      readAt: null,
      createdAt: new Date(now - 15 * 60 * 1000),
    },
    {
      id: 'notif-2',
      userId: 'dev-admin',
      category: 'GOAL_APPROVAL_REQUEST',
      title: '目標承認待ちが 3 件あります',
      body: '部下の目標申請を確認し、承認または差し戻しを実施してください。',
      payload: { count: 3 },
      readAt: null,
      createdAt: new Date(now - 3 * 60 * 60 * 1000),
    },
    {
      id: 'notif-3',
      userId: 'dev-admin',
      category: 'DEADLINE_ALERT',
      title: '評価締切が近づいています',
      body: '今週金曜 18:00 までに未完了の評価フォームを確認してください。',
      payload: { deadline: '2026-04-24T18:00:00+09:00' },
      readAt: new Date(now - 60 * 60 * 1000),
      createdAt: new Date(now - 20 * 60 * 60 * 1000),
    },
  ]),
  preferences: createInMemoryPreferenceRepository(
    new Map([
      [
        'dev-admin',
        [
          { category: 'SYSTEM', emailEnabled: true },
          { category: 'GOAL_APPROVAL_REQUEST', emailEnabled: true },
          { category: 'DEADLINE_ALERT', emailEnabled: false },
        ],
      ],
    ]),
  ),
})

export function getDevNotificationService(): NotificationService {
  return devService
}
