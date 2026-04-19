/**
 * Issue #43 / Task 13.2: PersonalGoalService 単体テスト (Req 6.3, 6.4, 6.5)
 *
 * テスト対象:
 * - DRAFT → PENDING_APPROVAL ステート遷移
 * - 無効な遷移でエラー（例: DRAFT → APPROVED は不可）
 * - 承認・却下フロー
 * - 目標作成・一覧取得
 */
import { describe, it, expect, vi } from 'vitest'
import { createPersonalGoalService } from '@/lib/goal/personal-goal-service'
import {
  PersonalGoalNotFoundError,
  PersonalGoalInvalidTransitionError,
  type PersonalGoalRecord,
} from '@/lib/goal/personal-goal-types'
import type { NotificationEmitter } from '@/lib/notification/notification-emitter'

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const FIXED_NOW = new Date('2026-04-19T09:00:00.000Z')

function makeGoalRecord(overrides: Partial<PersonalGoalRecord> = {}): PersonalGoalRecord {
  return {
    id: 'goal-1',
    userId: 'user-employee',
    parentOrgGoalId: null,
    title: 'Q2 売上目標達成',
    description: null,
    goalType: 'MBO',
    keyResult: null,
    targetValue: 100,
    unit: '件',
    status: 'DRAFT',
    startDate: new Date('2026-04-01'),
    endDate: new Date('2026-06-30'),
    approvedBy: null,
    approvedAt: null,
    rejectedAt: null,
    rejectedReason: null,
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    ...overrides,
  }
}

function makePrisma(goalRecord: PersonalGoalRecord) {
  return {
    personalGoal: {
      create: vi.fn().mockResolvedValue(goalRecord),
      findUnique: vi.fn().mockResolvedValue(goalRecord),
      findMany: vi.fn().mockResolvedValue([goalRecord]),
      update: vi.fn(),
    },
  }
}

function makeNotificationEmitter(): NotificationEmitter {
  return { emit: vi.fn().mockResolvedValue(undefined) }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('PersonalGoalService', () => {
  describe('createGoal', () => {
    it('DRAFT ステータスで目標を作成する', async () => {
      // Arrange
      const record = makeGoalRecord({ status: 'DRAFT' })
      const db = makePrisma(record)
      const svc = createPersonalGoalService(db as never, null, () => FIXED_NOW)

      // Act
      const result = await svc.createGoal('user-employee', {
        title: 'Q2 売上目標達成',
        goalType: 'MBO',
        targetValue: 100,
        unit: '件',
        startDate: new Date('2026-04-01'),
        endDate: new Date('2026-06-30'),
      })

      // Assert
      expect(result.status).toBe('DRAFT')
      expect(result.title).toBe('Q2 売上目標達成')
      expect(db.personalGoal.create).toHaveBeenCalledOnce()
    })
  })

  describe('submitForApproval', () => {
    it('DRAFT → PENDING_APPROVAL に遷移する', async () => {
      // Arrange
      const draftRecord = makeGoalRecord({ status: 'DRAFT' })
      const pendingRecord = makeGoalRecord({ status: 'PENDING_APPROVAL' })
      const db = makePrisma(draftRecord)
      db.personalGoal.update.mockResolvedValue(pendingRecord)
      const svc = createPersonalGoalService(db as never, null, () => FIXED_NOW)

      // Act
      const result = await svc.submitForApproval('goal-1', 'user-employee')

      // Assert
      expect(result.status).toBe('PENDING_APPROVAL')
      expect(db.personalGoal.update).toHaveBeenCalledWith({
        where: { id: 'goal-1' },
        data: { status: 'PENDING_APPROVAL' },
      })
    })

    it('承認依頼通知を送信する', async () => {
      // Arrange
      const draftRecord = makeGoalRecord({ status: 'DRAFT' })
      const pendingRecord = makeGoalRecord({ status: 'PENDING_APPROVAL' })
      const db = makePrisma(draftRecord)
      db.personalGoal.update.mockResolvedValue(pendingRecord)
      const emitter = makeNotificationEmitter()
      const svc = createPersonalGoalService(db as never, emitter, () => FIXED_NOW)

      // Act
      await svc.submitForApproval('goal-1', 'user-employee')

      // Assert
      expect(emitter.emit).toHaveBeenCalledOnce()
      expect(emitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'GOAL_APPROVAL_REQUEST',
          userId: 'user-employee',
        }),
      )
    })

    it('通知が失敗しても遷移は成功する', async () => {
      // Arrange
      const draftRecord = makeGoalRecord({ status: 'DRAFT' })
      const pendingRecord = makeGoalRecord({ status: 'PENDING_APPROVAL' })
      const db = makePrisma(draftRecord)
      db.personalGoal.update.mockResolvedValue(pendingRecord)
      const failingEmitter: NotificationEmitter = {
        emit: vi.fn().mockRejectedValue(new Error('Queue unavailable')),
      }
      const svc = createPersonalGoalService(db as never, failingEmitter, () => FIXED_NOW)

      // Act & Assert — should not throw
      await expect(svc.submitForApproval('goal-1', 'user-employee')).resolves.toMatchObject({
        status: 'PENDING_APPROVAL',
      })
    })

    it('存在しない目標に対して PersonalGoalNotFoundError をスローする', async () => {
      // Arrange
      const db = makePrisma(makeGoalRecord())
      db.personalGoal.findUnique.mockResolvedValue(null)
      const svc = createPersonalGoalService(db as never, null, () => FIXED_NOW)

      // Act & Assert
      await expect(svc.submitForApproval('no-such-id', 'user-employee')).rejects.toThrow(
        PersonalGoalNotFoundError,
      )
    })

    it('PENDING_APPROVAL 状態からは再申請できない（無効な遷移）', async () => {
      // Arrange
      const pendingRecord = makeGoalRecord({ status: 'PENDING_APPROVAL' })
      const db = makePrisma(pendingRecord)
      const svc = createPersonalGoalService(db as never, null, () => FIXED_NOW)

      // Act & Assert
      await expect(svc.submitForApproval('goal-1', 'user-employee')).rejects.toThrow(
        PersonalGoalInvalidTransitionError,
      )
    })
  })

  describe('approveGoal', () => {
    it('PENDING_APPROVAL → APPROVED に遷移し承認者を記録する', async () => {
      // Arrange
      const pendingRecord = makeGoalRecord({ status: 'PENDING_APPROVAL' })
      const approvedRecord = makeGoalRecord({
        status: 'APPROVED',
        approvedBy: 'user-manager',
        approvedAt: FIXED_NOW,
      })
      const db = makePrisma(pendingRecord)
      db.personalGoal.update.mockResolvedValue(approvedRecord)
      const svc = createPersonalGoalService(db as never, null, () => FIXED_NOW)

      // Act
      const result = await svc.approveGoal('goal-1', 'user-manager')

      // Assert
      expect(result.status).toBe('APPROVED')
      expect(result.approvedBy).toBe('user-manager')
      expect(result.approvedAt).toEqual(FIXED_NOW)
    })

    it('DRAFT 状態から直接 APPROVE はできない（無効な遷移）', async () => {
      // Arrange
      const draftRecord = makeGoalRecord({ status: 'DRAFT' })
      const db = makePrisma(draftRecord)
      const svc = createPersonalGoalService(db as never, null, () => FIXED_NOW)

      // Act & Assert
      await expect(svc.approveGoal('goal-1', 'user-manager')).rejects.toThrow(
        PersonalGoalInvalidTransitionError,
      )
    })
  })

  describe('rejectGoal', () => {
    it('PENDING_APPROVAL → REJECTED に遷移し却下理由を記録する', async () => {
      // Arrange
      const pendingRecord = makeGoalRecord({ status: 'PENDING_APPROVAL' })
      const rejectedRecord = makeGoalRecord({
        status: 'REJECTED',
        rejectedAt: FIXED_NOW,
        rejectedReason: '目標が具体的でない',
      })
      const db = makePrisma(pendingRecord)
      db.personalGoal.update.mockResolvedValue(rejectedRecord)
      const svc = createPersonalGoalService(db as never, null, () => FIXED_NOW)

      // Act
      const result = await svc.rejectGoal('goal-1', 'user-manager', '目標が具体的でない')

      // Assert
      expect(result.status).toBe('REJECTED')
      expect(result.rejectedReason).toBe('目標が具体的でない')
      expect(result.rejectedAt).toEqual(FIXED_NOW)
    })

    it('APPROVED 状態から REJECT はできない（無効な遷移）', async () => {
      // Arrange
      const approvedRecord = makeGoalRecord({ status: 'APPROVED' })
      const db = makePrisma(approvedRecord)
      const svc = createPersonalGoalService(db as never, null, () => FIXED_NOW)

      // Act & Assert
      await expect(svc.rejectGoal('goal-1', 'user-manager', 'reason')).rejects.toThrow(
        PersonalGoalInvalidTransitionError,
      )
    })
  })

  describe('startGoal', () => {
    it('APPROVED → IN_PROGRESS に遷移する', async () => {
      // Arrange
      const approvedRecord = makeGoalRecord({ status: 'APPROVED' })
      const inProgressRecord = makeGoalRecord({ status: 'IN_PROGRESS' })
      const db = makePrisma(approvedRecord)
      db.personalGoal.update.mockResolvedValue(inProgressRecord)
      const svc = createPersonalGoalService(db as never, null, () => FIXED_NOW)

      // Act
      const result = await svc.startGoal('goal-1')

      // Assert
      expect(result.status).toBe('IN_PROGRESS')
    })

    it('DRAFT 状態から IN_PROGRESS はできない（無効な遷移）', async () => {
      // Arrange
      const draftRecord = makeGoalRecord({ status: 'DRAFT' })
      const db = makePrisma(draftRecord)
      const svc = createPersonalGoalService(db as never, null, () => FIXED_NOW)

      // Act & Assert
      await expect(svc.startGoal('goal-1')).rejects.toThrow(PersonalGoalInvalidTransitionError)
    })
  })

  describe('completeGoal', () => {
    it('IN_PROGRESS → COMPLETED に遷移する', async () => {
      // Arrange
      const inProgressRecord = makeGoalRecord({ status: 'IN_PROGRESS' })
      const completedRecord = makeGoalRecord({ status: 'COMPLETED' })
      const db = makePrisma(inProgressRecord)
      db.personalGoal.update.mockResolvedValue(completedRecord)
      const svc = createPersonalGoalService(db as never, null, () => FIXED_NOW)

      // Act
      const result = await svc.completeGoal('goal-1')

      // Assert
      expect(result.status).toBe('COMPLETED')
    })

    it('APPROVED 状態から直接 COMPLETE はできない（IN_PROGRESS が必要）', async () => {
      // Arrange
      const approvedRecord = makeGoalRecord({ status: 'APPROVED' })
      const db = makePrisma(approvedRecord)
      const svc = createPersonalGoalService(db as never, null, () => FIXED_NOW)

      // Act & Assert
      await expect(svc.completeGoal('goal-1')).rejects.toThrow(PersonalGoalInvalidTransitionError)
    })
  })

  describe('listMyGoals', () => {
    it('指定ユーザーの目標一覧を返す', async () => {
      // Arrange
      const records = [makeGoalRecord(), makeGoalRecord({ id: 'goal-2', title: '別の目標' })]
      const db = makePrisma(makeGoalRecord())
      db.personalGoal.findMany.mockResolvedValue(records)
      const svc = createPersonalGoalService(db as never, null, () => FIXED_NOW)

      // Act
      const result = await svc.listMyGoals('user-employee')

      // Assert
      expect(result).toHaveLength(2)
      expect(db.personalGoal.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-employee' },
        orderBy: { createdAt: 'desc' },
      })
    })
  })

  describe('getGoal', () => {
    it('存在する目標を返す', async () => {
      // Arrange
      const record = makeGoalRecord()
      const db = makePrisma(record)
      const svc = createPersonalGoalService(db as never, null, () => FIXED_NOW)

      // Act
      const result = await svc.getGoal('goal-1')

      // Assert
      expect(result).not.toBeNull()
      expect(result?.id).toBe('goal-1')
    })

    it('存在しない目標は null を返す', async () => {
      // Arrange
      const db = makePrisma(makeGoalRecord())
      db.personalGoal.findUnique.mockResolvedValue(null)
      const svc = createPersonalGoalService(db as never, null, () => FIXED_NOW)

      // Act
      const result = await svc.getGoal('no-such-id')

      // Assert
      expect(result).toBeNull()
    })
  })
})
