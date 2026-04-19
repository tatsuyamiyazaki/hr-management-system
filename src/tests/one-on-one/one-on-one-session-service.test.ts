/**
 * Issue #47 / Task 14.1: OneOnOneSessionService 単体テスト (Req 7.1, 7.2)
 *
 * テスト対象:
 * - セッション作成（通知が呼ばれることを確認）
 * - 一覧取得（MANAGER は自分設定のもの、EMPLOYEE は自分向けのもの）
 * - 予定更新（成功 / 存在しない / 権限なし）
 */
import { describe, it, expect, vi } from 'vitest'
import { createOneOnOneSessionService } from '@/lib/one-on-one/one-on-one-session-service'
import {
  OneOnOneSessionNotFoundError,
  OneOnOneSessionAccessDeniedError,
  type OneOnOneSessionRecord,
} from '@/lib/one-on-one/one-on-one-types'
import type { NotificationEmitter } from '@/lib/notification/notification-emitter'

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const FIXED_NOW = new Date('2026-04-19T09:00:00.000Z')
const SCHEDULED_AT = new Date('2026-04-25T10:00:00.000Z')

function makeSessionRecord(overrides: Partial<OneOnOneSessionRecord> = {}): OneOnOneSessionRecord {
  return {
    id: 'session-1',
    managerId: 'user-manager',
    employeeId: 'user-employee',
    scheduledAt: SCHEDULED_AT,
    durationMin: 30,
    agenda: 'Q2 目標確認',
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    ...overrides,
  }
}

function makePrisma(record: OneOnOneSessionRecord) {
  return {
    oneOnOneSession: {
      create: vi.fn().mockResolvedValue(record),
      findUnique: vi.fn().mockResolvedValue(record),
      findMany: vi.fn().mockResolvedValue([record]),
      update: vi.fn().mockResolvedValue(record),
    },
  }
}

function makeNotificationEmitter(): NotificationEmitter {
  return { emit: vi.fn().mockResolvedValue(undefined) }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('OneOnOneSessionService', () => {
  describe('createSession', () => {
    it('セッションを作成して記録を返す', async () => {
      // Arrange
      const record = makeSessionRecord()
      const db = makePrisma(record)
      const emitter = makeNotificationEmitter()
      const svc = createOneOnOneSessionService(db as never, emitter)

      // Act
      const result = await svc.createSession('user-manager', {
        employeeId: 'user-employee',
        scheduledAt: SCHEDULED_AT,
        durationMin: 30,
        agenda: 'Q2 目標確認',
      })

      // Assert
      expect(result).toEqual(record)
      expect(db.oneOnOneSession.create).toHaveBeenCalledOnce()
    })

    it('部下（employeeId）に ONE_ON_ONE_REMINDER 通知を送信する', async () => {
      // Arrange
      const record = makeSessionRecord()
      const db = makePrisma(record)
      const emitter = makeNotificationEmitter()
      const svc = createOneOnOneSessionService(db as never, emitter)

      // Act
      await svc.createSession('user-manager', {
        employeeId: 'user-employee',
        scheduledAt: SCHEDULED_AT,
        durationMin: 30,
      })

      // Assert
      expect(emitter.emit).toHaveBeenCalledOnce()
      expect(emitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-employee',
          category: 'ONE_ON_ONE_REMINDER',
        }),
      )
    })

    it('通知エミッターが null のときも作成は成功する', async () => {
      // Arrange
      const record = makeSessionRecord()
      const db = makePrisma(record)
      const svc = createOneOnOneSessionService(db as never, null)

      // Act & Assert
      await expect(
        svc.createSession('user-manager', {
          employeeId: 'user-employee',
          scheduledAt: SCHEDULED_AT,
          durationMin: 30,
        }),
      ).resolves.toEqual(record)
    })

    it('通知送信が失敗してもセッション作成は成功を返す', async () => {
      // Arrange
      const record = makeSessionRecord()
      const db = makePrisma(record)
      const emitter: NotificationEmitter = {
        emit: vi.fn().mockRejectedValue(new Error('queue down')),
      }
      const svc = createOneOnOneSessionService(db as never, emitter)

      // Act & Assert
      await expect(
        svc.createSession('user-manager', {
          employeeId: 'user-employee',
          scheduledAt: SCHEDULED_AT,
          durationMin: 30,
        }),
      ).resolves.toEqual(record)
    })
  })

  describe('listMySessions', () => {
    it('MANAGER ロールは managerId でフィルタする', async () => {
      // Arrange
      const record = makeSessionRecord()
      const db = makePrisma(record)
      const svc = createOneOnOneSessionService(db as never, null)

      // Act
      const result = await svc.listMySessions('user-manager', 'MANAGER')

      // Assert
      expect(result).toEqual([record])
      expect(db.oneOnOneSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { managerId: 'user-manager' } }),
      )
    })

    it('EMPLOYEE ロールは employeeId でフィルタする', async () => {
      // Arrange
      const record = makeSessionRecord()
      const db = makePrisma(record)
      const svc = createOneOnOneSessionService(db as never, null)

      // Act
      const result = await svc.listMySessions('user-employee', 'EMPLOYEE')

      // Assert
      expect(result).toEqual([record])
      expect(db.oneOnOneSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { employeeId: 'user-employee' } }),
      )
    })

    it('HR_MANAGER ロールは managerId でフィルタする', async () => {
      // Arrange
      const record = makeSessionRecord({ managerId: 'user-hr' })
      const db = makePrisma(record)
      const svc = createOneOnOneSessionService(db as never, null)

      // Act
      await svc.listMySessions('user-hr', 'HR_MANAGER')

      // Assert
      expect(db.oneOnOneSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { managerId: 'user-hr' } }),
      )
    })
  })

  describe('getSession', () => {
    it('存在するセッションを返す', async () => {
      // Arrange
      const record = makeSessionRecord()
      const db = makePrisma(record)
      const svc = createOneOnOneSessionService(db as never, null)

      // Act
      const result = await svc.getSession('session-1')

      // Assert
      expect(result).toEqual(record)
    })

    it('存在しないセッションは null を返す', async () => {
      // Arrange
      const record = makeSessionRecord()
      const db = makePrisma(record)
      db.oneOnOneSession.findUnique = vi.fn().mockResolvedValue(null)
      const svc = createOneOnOneSessionService(db as never, null)

      // Act
      const result = await svc.getSession('not-found')

      // Assert
      expect(result).toBeNull()
    })
  })

  describe('updateSession', () => {
    it('MANAGER が自分のセッションを更新できる', async () => {
      // Arrange
      const original = makeSessionRecord()
      const updated = makeSessionRecord({ durationMin: 60 })
      const db = makePrisma(original)
      db.oneOnOneSession.update = vi.fn().mockResolvedValue(updated)
      const svc = createOneOnOneSessionService(db as never, null)

      // Act
      const result = await svc.updateSession('session-1', 'user-manager', { durationMin: 60 })

      // Assert
      expect(result.durationMin).toBe(60)
      expect(db.oneOnOneSession.update).toHaveBeenCalledOnce()
    })

    it('セッションが存在しない場合は OneOnOneSessionNotFoundError をスローする', async () => {
      // Arrange
      const record = makeSessionRecord()
      const db = makePrisma(record)
      db.oneOnOneSession.findUnique = vi.fn().mockResolvedValue(null)
      const svc = createOneOnOneSessionService(db as never, null)

      // Act & Assert
      await expect(
        svc.updateSession('not-found', 'user-manager', { durationMin: 60 }),
      ).rejects.toThrow(OneOnOneSessionNotFoundError)
    })

    it('別の MANAGER がセッションを更新しようとすると OneOnOneSessionAccessDeniedError をスローする', async () => {
      // Arrange
      const record = makeSessionRecord({ managerId: 'user-manager' })
      const db = makePrisma(record)
      const svc = createOneOnOneSessionService(db as never, null)

      // Act & Assert
      await expect(
        svc.updateSession('session-1', 'other-manager', { durationMin: 60 }),
      ).rejects.toThrow(OneOnOneSessionAccessDeniedError)
    })
  })
})
