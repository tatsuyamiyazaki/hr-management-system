/**
 * Issue #51 / Task 15.2: ReviewCycleService 単体テスト (Req 8.1, 8.2)
 *
 * テスト対象:
 * - DRAFT → ACTIVE 遷移テスト（通知が呼ばれることを確認）
 * - 各ステート遷移の正常系テスト
 * - 無効な遷移でエラーになるテスト（DRAFT → FINALIZED は不可）
 * - FINALIZED 時に CycleFinalized イベントが publish されるテスト
 * - listCycles のフィルタリングテスト
 */
import { describe, it, expect, vi } from 'vitest'
import { createReviewCycleService } from '@/lib/evaluation/review-cycle-service'
import {
  ReviewCycleNotFoundError,
  ReviewCycleInvalidTransitionError,
  type ReviewCycleRecord,
} from '@/lib/evaluation/review-cycle-types'
import type { NotificationEmitter } from '@/lib/notification/notification-emitter'
import type { EvaluationEventBus } from '@/lib/evaluation/evaluation-event-bus'

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const FIXED_NOW = new Date('2026-04-19T09:00:00.000Z')

function makeCycleRecord(overrides: Partial<ReviewCycleRecord> = {}): ReviewCycleRecord {
  return {
    id: 'cycle-1',
    name: 'Q2 360度評価',
    status: 'DRAFT',
    startDate: new Date('2026-04-01'),
    endDate: new Date('2026-06-30'),
    items: ['コミュニケーション', 'リーダーシップ'],
    incentiveK: 1.5,
    minReviewers: 3,
    maxTargets: 100,
    activatedAt: null,
    finalizedAt: null,
    closedAt: null,
    createdBy: 'user-hr',
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    ...overrides,
  }
}

function makeActiveUser(id: string) {
  return { id, status: 'ACTIVE' }
}

function makePrisma(
  cycleRecord: ReviewCycleRecord,
  activeUsers: { id: string; status: string }[] = [],
) {
  return {
    reviewCycle: {
      create: vi.fn().mockResolvedValue(cycleRecord),
      findUnique: vi.fn().mockResolvedValue(cycleRecord),
      findMany: vi.fn().mockResolvedValue([cycleRecord]),
      update: vi.fn(),
    },
    user: {
      findMany: vi.fn().mockResolvedValue(activeUsers),
    },
  }
}

function makeNotificationEmitter(): NotificationEmitter {
  return { emit: vi.fn().mockResolvedValue(undefined) }
}

function makeEventBus(): EvaluationEventBus {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('ReviewCycleService', () => {
  describe('createCycle', () => {
    it('DRAFT ステータスでサイクルを作成する', async () => {
      // Arrange
      const record = makeCycleRecord({ status: 'DRAFT' })
      const db = makePrisma(record)
      const svc = createReviewCycleService(db as never, null, null, () => FIXED_NOW)

      // Act
      const result = await svc.createCycle('user-hr', {
        name: 'Q2 360度評価',
        startDate: new Date('2026-04-01'),
        endDate: new Date('2026-06-30'),
        items: ['コミュニケーション', 'リーダーシップ'],
        incentiveK: 1.5,
        minReviewers: 3,
        maxTargets: 100,
      })

      // Assert
      expect(result.status).toBe('DRAFT')
      expect(result.name).toBe('Q2 360度評価')
      expect(db.reviewCycle.create).toHaveBeenCalledOnce()
    })
  })

  describe('activateCycle', () => {
    it('DRAFT → ACTIVE に遷移し、全アクティブ社員に EVAL_INVITATION 通知を送る', async () => {
      // Arrange
      const draftRecord = makeCycleRecord({ status: 'DRAFT' })
      const activeRecord = makeCycleRecord({ status: 'ACTIVE', activatedAt: FIXED_NOW })
      const activeUsers = [makeActiveUser('user-1'), makeActiveUser('user-2')]
      const db = makePrisma(draftRecord, activeUsers)
      db.reviewCycle.update.mockResolvedValue(activeRecord)
      const emitter = makeNotificationEmitter()
      const svc = createReviewCycleService(db as never, emitter, null, () => FIXED_NOW)

      // Act
      const result = await svc.activateCycle('cycle-1')

      // Assert
      expect(result.status).toBe('ACTIVE')
      expect(result.activatedAt).toEqual(FIXED_NOW)
      expect(emitter.emit).toHaveBeenCalledTimes(2)
      expect(emitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'EVAL_INVITATION', userId: 'user-1' }),
      )
      expect(emitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'EVAL_INVITATION', userId: 'user-2' }),
      )
    })

    it('通知エミッターが null の場合もエラーなく ACTIVE に遷移する', async () => {
      // Arrange
      const draftRecord = makeCycleRecord({ status: 'DRAFT' })
      const activeRecord = makeCycleRecord({ status: 'ACTIVE', activatedAt: FIXED_NOW })
      const db = makePrisma(draftRecord, [])
      db.reviewCycle.update.mockResolvedValue(activeRecord)
      const svc = createReviewCycleService(db as never, null, null, () => FIXED_NOW)

      // Act & Assert
      await expect(svc.activateCycle('cycle-1')).resolves.toMatchObject({ status: 'ACTIVE' })
    })

    it('存在しないサイクルは ReviewCycleNotFoundError をスローする', async () => {
      // Arrange
      const db = makePrisma(makeCycleRecord())
      db.reviewCycle.findUnique.mockResolvedValue(null)
      const svc = createReviewCycleService(db as never, null, null, () => FIXED_NOW)

      // Act & Assert
      await expect(svc.activateCycle('not-exist')).rejects.toBeInstanceOf(ReviewCycleNotFoundError)
    })
  })

  describe('startAggregating', () => {
    it('ACTIVE → AGGREGATING に遷移する', async () => {
      // Arrange
      const activeRecord = makeCycleRecord({ status: 'ACTIVE', activatedAt: FIXED_NOW })
      const aggregatingRecord = makeCycleRecord({ status: 'AGGREGATING', activatedAt: FIXED_NOW })
      const db = makePrisma(activeRecord)
      db.reviewCycle.update.mockResolvedValue(aggregatingRecord)
      const svc = createReviewCycleService(db as never, null, null, () => FIXED_NOW)

      // Act
      const result = await svc.startAggregating('cycle-1')

      // Assert
      expect(result.status).toBe('AGGREGATING')
    })
  })

  describe('pendingApproval', () => {
    it('AGGREGATING → PENDING_FEEDBACK_APPROVAL に遷移する', async () => {
      // Arrange
      const aggregatingRecord = makeCycleRecord({ status: 'AGGREGATING' })
      const pendingRecord = makeCycleRecord({ status: 'PENDING_FEEDBACK_APPROVAL' })
      const db = makePrisma(aggregatingRecord)
      db.reviewCycle.update.mockResolvedValue(pendingRecord)
      const svc = createReviewCycleService(db as never, null, null, () => FIXED_NOW)

      // Act
      const result = await svc.pendingApproval('cycle-1')

      // Assert
      expect(result.status).toBe('PENDING_FEEDBACK_APPROVAL')
    })
  })

  describe('finalizeCycle', () => {
    it('PENDING_FEEDBACK_APPROVAL → FINALIZED に遷移し、CycleFinalized イベントを publish する', async () => {
      // Arrange
      const pendingRecord = makeCycleRecord({ status: 'PENDING_FEEDBACK_APPROVAL' })
      const finalizedRecord = makeCycleRecord({ status: 'FINALIZED', finalizedAt: FIXED_NOW })
      const db = makePrisma(pendingRecord)
      db.reviewCycle.update.mockResolvedValue(finalizedRecord)
      const bus = makeEventBus()
      const svc = createReviewCycleService(db as never, null, bus, () => FIXED_NOW)

      // Act
      const result = await svc.finalizeCycle('cycle-1')

      // Assert
      expect(result.status).toBe('FINALIZED')
      expect(result.finalizedAt).toEqual(FIXED_NOW)
      expect(bus.publish).toHaveBeenCalledOnce()
      expect(bus.publish).toHaveBeenCalledWith(
        'CycleFinalized',
        expect.objectContaining({
          cycleId: 'cycle-1',
          cycleName: 'Q2 360度評価',
        }),
      )
    })

    it('イベントバスが null の場合もエラーなく FINALIZED に遷移する', async () => {
      // Arrange
      const pendingRecord = makeCycleRecord({ status: 'PENDING_FEEDBACK_APPROVAL' })
      const finalizedRecord = makeCycleRecord({ status: 'FINALIZED', finalizedAt: FIXED_NOW })
      const db = makePrisma(pendingRecord)
      db.reviewCycle.update.mockResolvedValue(finalizedRecord)
      const svc = createReviewCycleService(db as never, null, null, () => FIXED_NOW)

      // Act & Assert
      await expect(svc.finalizeCycle('cycle-1')).resolves.toMatchObject({ status: 'FINALIZED' })
    })
  })

  describe('closeCycle', () => {
    it('FINALIZED → CLOSED に遷移する', async () => {
      // Arrange
      const finalizedRecord = makeCycleRecord({ status: 'FINALIZED', finalizedAt: FIXED_NOW })
      const closedRecord = makeCycleRecord({ status: 'CLOSED', closedAt: FIXED_NOW })
      const db = makePrisma(finalizedRecord)
      db.reviewCycle.update.mockResolvedValue(closedRecord)
      const svc = createReviewCycleService(db as never, null, null, () => FIXED_NOW)

      // Act
      const result = await svc.closeCycle('cycle-1')

      // Assert
      expect(result.status).toBe('CLOSED')
      expect(result.closedAt).toEqual(FIXED_NOW)
    })
  })

  describe('無効な遷移', () => {
    it('DRAFT → FINALIZED は ReviewCycleInvalidTransitionError をスローする', async () => {
      // Arrange
      const draftRecord = makeCycleRecord({ status: 'DRAFT' })
      const db = makePrisma(draftRecord)
      const svc = createReviewCycleService(db as never, null, null, () => FIXED_NOW)

      // Act & Assert
      await expect(svc.finalizeCycle('cycle-1')).rejects.toBeInstanceOf(
        ReviewCycleInvalidTransitionError,
      )
    })

    it('DRAFT → AGGREGATING は ReviewCycleInvalidTransitionError をスローする', async () => {
      // Arrange
      const draftRecord = makeCycleRecord({ status: 'DRAFT' })
      const db = makePrisma(draftRecord)
      const svc = createReviewCycleService(db as never, null, null, () => FIXED_NOW)

      // Act & Assert
      await expect(svc.startAggregating('cycle-1')).rejects.toBeInstanceOf(
        ReviewCycleInvalidTransitionError,
      )
    })

    it('CLOSED → ACTIVE は ReviewCycleInvalidTransitionError をスローする', async () => {
      // Arrange
      const closedRecord = makeCycleRecord({ status: 'CLOSED', closedAt: FIXED_NOW })
      const db = makePrisma(closedRecord)
      const svc = createReviewCycleService(db as never, null, null, () => FIXED_NOW)

      // Act & Assert
      await expect(svc.activateCycle('cycle-1')).rejects.toBeInstanceOf(
        ReviewCycleInvalidTransitionError,
      )
    })
  })

  describe('listCycles', () => {
    it('フィルターなしで全サイクルを返す', async () => {
      // Arrange
      const record = makeCycleRecord()
      const db = makePrisma(record)
      const svc = createReviewCycleService(db as never, null, null, () => FIXED_NOW)

      // Act
      const results = await svc.listCycles()

      // Assert
      expect(results).toHaveLength(1)
      expect(db.reviewCycle.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }))
    })

    it('status フィルターで絞り込む', async () => {
      // Arrange
      const record = makeCycleRecord({ status: 'ACTIVE' })
      const db = makePrisma(record)
      db.reviewCycle.findMany.mockResolvedValue([record])
      const svc = createReviewCycleService(db as never, null, null, () => FIXED_NOW)

      // Act
      const results = await svc.listCycles({ status: 'ACTIVE' })

      // Assert
      expect(db.reviewCycle.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'ACTIVE' } }),
      )
      expect(results[0]?.status).toBe('ACTIVE')
    })
  })

  describe('getCycle', () => {
    it('存在するサイクルを返す', async () => {
      // Arrange
      const record = makeCycleRecord()
      const db = makePrisma(record)
      const svc = createReviewCycleService(db as never, null, null, () => FIXED_NOW)

      // Act
      const result = await svc.getCycle('cycle-1')

      // Assert
      expect(result).not.toBeNull()
      expect(result?.id).toBe('cycle-1')
    })

    it('存在しないサイクルは null を返す', async () => {
      // Arrange
      const db = makePrisma(makeCycleRecord())
      db.reviewCycle.findUnique.mockResolvedValue(null)
      const svc = createReviewCycleService(db as never, null, null, () => FIXED_NOW)

      // Act
      const result = await svc.getCycle('not-exist')

      // Assert
      expect(result).toBeNull()
    })
  })
})
