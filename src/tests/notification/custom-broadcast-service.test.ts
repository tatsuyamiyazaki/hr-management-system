import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { AuditLogEmitter } from '@/lib/audit/audit-log-emitter'
import type { AuditLogEntry } from '@/lib/audit/audit-log-types'
import {
  createInMemoryBroadcastTargetResolver,
  type BroadcastRecipient,
} from '@/lib/notification/broadcast-target-resolver'
import {
  BroadcastForbiddenError,
  BroadcastGroupNotFoundError,
  createCustomBroadcastService,
  type BroadcastRequestContext,
  type BroadcastSender,
  type CustomBroadcastService,
} from '@/lib/notification/custom-broadcast-service'
import type { NotificationEmitter } from '@/lib/notification/notification-emitter'
import {
  createInMemoryNotificationRepository,
  createInMemoryPreferenceRepository,
} from '@/lib/notification/notification-repository'
import type {
  NotificationPreferenceRepository,
  NotificationRepository,
} from '@/lib/notification/notification-repository'
import type {
  BroadcastInput,
  NotificationEvent,
  UserRole,
} from '@/lib/notification/notification-types'

// ─────────────────────────────────────────────────────────────────────────────
// Test doubles
// ─────────────────────────────────────────────────────────────────────────────

type EmitterSpy = NotificationEmitter & { readonly calls: NotificationEvent[] }
type AuditSpy = AuditLogEmitter & { readonly calls: AuditLogEntry[] }

function makeEmitterSpy(): EmitterSpy {
  const calls: NotificationEvent[] = []
  const emitter: EmitterSpy = {
    calls,
    emit: vi.fn(async (event: NotificationEvent) => {
      calls.push(event)
    }),
  }
  return emitter
}

function makeAuditSpy(): AuditSpy {
  const calls: AuditLogEntry[] = []
  const audit: AuditSpy = {
    calls,
    emit: vi.fn(async (entry: AuditLogEntry) => {
      calls.push(entry)
    }),
  }
  return audit
}

const ALL_USERS: readonly BroadcastRecipient[] = [
  { userId: 'u1', email: 'u1@example.com' },
  { userId: 'u2', email: 'u2@example.com' },
  { userId: 'u3', email: 'u3@example.com' },
]

const GROUP_A: readonly BroadcastRecipient[] = [
  { userId: 'u1', email: 'u1@example.com' },
  { userId: 'u2', email: 'u2@example.com' },
]

const VALID_INPUT: BroadcastInput = {
  title: '全社お知らせ',
  body: '本日18時から全社ミーティングを実施します。',
  target: { type: 'ALL' },
}

const CONTEXT: BroadcastRequestContext = {
  ipAddress: '10.0.0.1',
  userAgent: 'TestAgent/1.0',
}

function makeSender(role: UserRole): BroadcastSender {
  return { userId: 'sender-1', role }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test harness
// ─────────────────────────────────────────────────────────────────────────────

interface Harness {
  readonly service: CustomBroadcastService
  readonly emitter: EmitterSpy
  readonly audit: AuditSpy
  readonly notifications: NotificationRepository
  readonly preferences: NotificationPreferenceRepository
}

function setupHarness(): Harness {
  const emitter = makeEmitterSpy()
  const audit = makeAuditSpy()
  const notifications = createInMemoryNotificationRepository()
  const preferences = createInMemoryPreferenceRepository()
  const resolver = createInMemoryBroadcastTargetResolver({
    allUsers: ALL_USERS,
    groups: new Map([['group-a', GROUP_A]]),
  })

  const service = createCustomBroadcastService({
    emitter,
    notifications,
    preferences,
    audit,
    resolver,
  })

  return { service, emitter, audit, notifications, preferences }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('CustomBroadcastService', () => {
  let h: Harness

  beforeEach(() => {
    h = setupHarness()
  })

  describe('authorization', () => {
    it('rejects EMPLOYEE role with BroadcastForbiddenError and no side effects', async () => {
      await expect(
        h.service.sendCustomBroadcast(makeSender('EMPLOYEE'), VALID_INPUT, CONTEXT),
      ).rejects.toBeInstanceOf(BroadcastForbiddenError)

      expect(h.emitter.calls).toHaveLength(0)
      expect(h.audit.calls).toHaveLength(0)
      const listed = await h.notifications.listByUser('u1')
      expect(listed).toHaveLength(0)
    })

    it('rejects MANAGER role with BroadcastForbiddenError', async () => {
      await expect(
        h.service.sendCustomBroadcast(makeSender('MANAGER'), VALID_INPUT, CONTEXT),
      ).rejects.toBeInstanceOf(BroadcastForbiddenError)

      expect(h.emitter.calls).toHaveLength(0)
      expect(h.audit.calls).toHaveLength(0)
    })

    it('allows HR_MANAGER role', async () => {
      const result = await h.service.sendCustomBroadcast(
        makeSender('HR_MANAGER'),
        VALID_INPUT,
        CONTEXT,
      )
      expect(result.deliveredCount).toBe(ALL_USERS.length)
    })

    it('allows ADMIN role', async () => {
      const result = await h.service.sendCustomBroadcast(makeSender('ADMIN'), VALID_INPUT, CONTEXT)
      expect(result.deliveredCount).toBe(ALL_USERS.length)
    })
  })

  describe('input validation', () => {
    it('rejects empty title via Zod', async () => {
      await expect(
        h.service.sendCustomBroadcast(
          makeSender('HR_MANAGER'),
          { title: '', body: 'body', target: { type: 'ALL' } },
          CONTEXT,
        ),
      ).rejects.toThrow()
      expect(h.audit.calls).toHaveLength(0)
    })

    it('rejects empty body via Zod', async () => {
      await expect(
        h.service.sendCustomBroadcast(
          makeSender('HR_MANAGER'),
          { title: 'ok', body: '', target: { type: 'ALL' } },
          CONTEXT,
        ),
      ).rejects.toThrow()
    })

    it('rejects unknown target.type via Zod', async () => {
      await expect(
        h.service.sendCustomBroadcast(
          makeSender('HR_MANAGER'),
          {
            title: 'ok',
            body: 'body',
            target: { type: 'BAD' } as unknown as BroadcastInput['target'],
          },
          CONTEXT,
        ),
      ).rejects.toThrow()
    })
  })

  describe('target resolution', () => {
    it('delivers to all users when target = ALL', async () => {
      const result = await h.service.sendCustomBroadcast(
        makeSender('HR_MANAGER'),
        { ...VALID_INPUT, target: { type: 'ALL' } },
        CONTEXT,
      )

      expect(result.deliveredCount).toBe(3)
      expect(h.emitter.calls).toHaveLength(3)
      for (const userId of ['u1', 'u2', 'u3']) {
        const list = await h.notifications.listByUser(userId)
        expect(list).toHaveLength(1)
        const first = list[0]
        if (!first) throw new Error('expected notification to exist')
        expect(first.category).toBe('CUSTOM')
      }
    })

    it('delivers only to group members when target = GROUP', async () => {
      const result = await h.service.sendCustomBroadcast(
        makeSender('HR_MANAGER'),
        { ...VALID_INPUT, target: { type: 'GROUP', groupId: 'group-a' } },
        CONTEXT,
      )

      expect(result.deliveredCount).toBe(2)
      const u3List = await h.notifications.listByUser('u3')
      expect(u3List).toHaveLength(0)
    })

    it('throws BroadcastGroupNotFoundError for unknown groupId', async () => {
      await expect(
        h.service.sendCustomBroadcast(
          makeSender('HR_MANAGER'),
          { ...VALID_INPUT, target: { type: 'GROUP', groupId: 'nope' } },
          CONTEXT,
        ),
      ).rejects.toBeInstanceOf(BroadcastGroupNotFoundError)
    })
  })

  describe('preferences-aware email delivery', () => {
    it('creates in-app notification but skips email when CUSTOM emailEnabled=false', async () => {
      // u1 は CUSTOM カテゴリのメールを無効化
      await h.preferences.upsertMany('u1', [{ category: 'CUSTOM', emailEnabled: false }])

      const result = await h.service.sendCustomBroadcast(
        makeSender('HR_MANAGER'),
        VALID_INPUT,
        CONTEXT,
      )

      expect(result.deliveredCount).toBe(3)
      // u1 宛のメール emit は行われない
      const emailedUserIds = h.emitter.calls.map((e) => e.userId)
      expect(emailedUserIds).not.toContain('u1')
      expect(emailedUserIds.sort()).toEqual(['u2', 'u3'])

      // アプリ内通知は全員分作成される
      const u1List = await h.notifications.listByUser('u1')
      expect(u1List).toHaveLength(1)
    })

    it('sends email when CUSTOM emailEnabled is true or unset (default true)', async () => {
      await h.preferences.upsertMany('u2', [{ category: 'CUSTOM', emailEnabled: true }])
      await h.service.sendCustomBroadcast(makeSender('ADMIN'), VALID_INPUT, CONTEXT)

      const emailedUserIds = h.emitter.calls.map((e) => e.userId).sort()
      expect(emailedUserIds).toEqual(['u1', 'u2', 'u3'])
    })
  })

  describe('audit logging', () => {
    it('emits exactly one audit log with CUSTOM_BROADCAST_SENT / NOTIFICATION', async () => {
      await h.service.sendCustomBroadcast(makeSender('HR_MANAGER'), VALID_INPUT, CONTEXT)

      expect(h.audit.calls).toHaveLength(1)
      const entry = h.audit.calls[0]
      if (!entry) throw new Error('expected audit entry to be emitted')
      expect(entry.action).toBe('CUSTOM_BROADCAST_SENT')
      expect(entry.resourceType).toBe('NOTIFICATION')
      expect(entry.resourceId).toBeNull()
      expect(entry.userId).toBe('sender-1')
      expect(entry.ipAddress).toBe('10.0.0.1')
      expect(entry.userAgent).toBe('TestAgent/1.0')
      expect(entry.before).toBeNull()
      expect(entry.after).toEqual({
        title: VALID_INPUT.title,
        body: VALID_INPUT.body,
        target: VALID_INPUT.target,
        deliveredCount: 3,
      })
    })

    it('does not emit an audit log when authorization fails', async () => {
      await expect(
        h.service.sendCustomBroadcast(makeSender('EMPLOYEE'), VALID_INPUT, CONTEXT),
      ).rejects.toBeInstanceOf(BroadcastForbiddenError)
      expect(h.audit.calls).toHaveLength(0)
    })
  })
})
