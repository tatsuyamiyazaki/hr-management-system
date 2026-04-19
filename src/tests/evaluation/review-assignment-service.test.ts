/**
 * Issue #52 / Task 15.3: ReviewAssignmentService 単体テスト (Req 8.3, 8.4, 8.10, 8.11, 8.12)
 *
 * テスト対象:
 * - 割り当て追加テスト（正常系）
 * - maxTargets 超過でエラーになるテスト
 * - 重複割り当てでエラーになるテスト
 * - 辞退テスト（status が DECLINED になる）
 * - 代替評価者割り当てテスト（元が REPLACED、新規 ACTIVE が作成される）
 */
import { describe, it, expect, vi } from 'vitest'
import { createReviewAssignmentService } from '@/lib/evaluation/review-assignment-service'
import {
  AssignmentNotFoundError,
  AssignmentNotActiveError,
  MaxTargetsExceededError,
  DuplicateAssignmentError,
  type ReviewAssignmentRecord,
} from '@/lib/evaluation/review-assignment-types'

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const FIXED_NOW = new Date('2026-04-19T09:00:00.000Z')

function makeAssignmentRecord(
  overrides: Partial<ReviewAssignmentRecord> = {},
): ReviewAssignmentRecord {
  return {
    id: 'asn-1',
    cycleId: 'cycle-1',
    evaluatorId: 'user-evaluator',
    targetUserId: 'user-target',
    status: 'ACTIVE',
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    ...overrides,
  }
}

function makePrisma(opts: {
  assignment?: ReviewAssignmentRecord | null
  assignments?: ReviewAssignmentRecord[]
  activeCount?: number
  maxTargets?: number
  findUniqueAssignment?: ReviewAssignmentRecord | null
  transactionResult?: [unknown, ReviewAssignmentRecord]
}) {
  const {
    assignment = makeAssignmentRecord(),
    assignments = [],
    activeCount = 0,
    maxTargets = 5,
    findUniqueAssignment = null,
    transactionResult,
  } = opts

  const defaultTransactionResult: [unknown, ReviewAssignmentRecord] = [
    { ...assignment, status: 'REPLACED' },
    makeAssignmentRecord({ id: 'asn-2', evaluatorId: 'user-replacement' }),
  ]

  return {
    reviewCycle: {
      findUnique: vi.fn().mockResolvedValue({ maxTargets }),
    },
    reviewAssignment: {
      create: vi.fn().mockResolvedValue(assignment),
      findUnique: vi.fn().mockImplementation(
        ({ where }: { where: Record<string, unknown> }) => {
          // findUnique by id (for decline/replace)
          if ('id' in where) return Promise.resolve(assignment)
          // findUnique by unique constraint (duplicate check)
          return Promise.resolve(findUniqueAssignment)
        },
      ),
      findMany: vi.fn().mockResolvedValue(assignments),
      count: vi.fn().mockResolvedValue(activeCount),
      update: vi.fn().mockResolvedValue({ ...assignment, status: 'DECLINED' }),
    },
    $transaction: vi.fn().mockResolvedValue(transactionResult ?? defaultTransactionResult),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('ReviewAssignmentService', () => {
  describe('addAssignment', () => {
    it('正常に割り当てを追加する', async () => {
      // Arrange
      const record = makeAssignmentRecord()
      const db = makePrisma({ assignment: record, activeCount: 0, maxTargets: 5 })
      const svc = createReviewAssignmentService(db as never)

      // Act
      const result = await svc.addAssignment({
        cycleId: 'cycle-1',
        evaluatorId: 'user-evaluator',
        targetUserId: 'user-target',
      })

      // Assert
      expect(result.status).toBe('ACTIVE')
      expect(result.evaluatorId).toBe('user-evaluator')
      expect(result.targetUserId).toBe('user-target')
      expect(db.reviewAssignment.create).toHaveBeenCalledOnce()
    })

    it('maxTargets を超過している場合に MaxTargetsExceededError をスローする', async () => {
      // Arrange
      const db = makePrisma({ activeCount: 5, maxTargets: 5 })
      const svc = createReviewAssignmentService(db as never)

      // Act & Assert
      await expect(
        svc.addAssignment({
          cycleId: 'cycle-1',
          evaluatorId: 'user-evaluator',
          targetUserId: 'user-target',
        }),
      ).rejects.toBeInstanceOf(MaxTargetsExceededError)
    })

    it('上限ちょうどの場合（count === maxTargets）に MaxTargetsExceededError をスローする', async () => {
      // Arrange
      const db = makePrisma({ activeCount: 3, maxTargets: 3 })
      const svc = createReviewAssignmentService(db as never)

      // Act & Assert
      await expect(
        svc.addAssignment({
          cycleId: 'cycle-1',
          evaluatorId: 'user-evaluator',
          targetUserId: 'user-target',
        }),
      ).rejects.toBeInstanceOf(MaxTargetsExceededError)
    })

    it('重複する割り当てがある場合に DuplicateAssignmentError をスローする', async () => {
      // Arrange
      const existingAssignment = makeAssignmentRecord()
      const db = makePrisma({
        activeCount: 0,
        maxTargets: 5,
        findUniqueAssignment: existingAssignment,
      })
      const svc = createReviewAssignmentService(db as never)

      // Act & Assert
      await expect(
        svc.addAssignment({
          cycleId: 'cycle-1',
          evaluatorId: 'user-evaluator',
          targetUserId: 'user-target',
        }),
      ).rejects.toBeInstanceOf(DuplicateAssignmentError)
    })
  })

  describe('listByEvaluator', () => {
    it('評価者の割り当て一覧を返す', async () => {
      // Arrange
      const records = [makeAssignmentRecord(), makeAssignmentRecord({ id: 'asn-2' })]
      const db = makePrisma({ assignments: records })
      const svc = createReviewAssignmentService(db as never)

      // Act
      const result = await svc.listByEvaluator('cycle-1', 'user-evaluator')

      // Assert
      expect(result).toHaveLength(2)
      expect(db.reviewAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { cycleId: 'cycle-1', evaluatorId: 'user-evaluator' },
        }),
      )
    })
  })

  describe('listByTarget', () => {
    it('対象者への割り当て一覧を返す', async () => {
      // Arrange
      const records = [makeAssignmentRecord()]
      const db = makePrisma({ assignments: records })
      const svc = createReviewAssignmentService(db as never)

      // Act
      const result = await svc.listByTarget('cycle-1', 'user-target')

      // Assert
      expect(result).toHaveLength(1)
      expect(db.reviewAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { cycleId: 'cycle-1', targetUserId: 'user-target' },
        }),
      )
    })
  })

  describe('listByCycle', () => {
    it('サイクル全体の割り当て一覧を返す', async () => {
      // Arrange
      const records = [
        makeAssignmentRecord(),
        makeAssignmentRecord({ id: 'asn-2', evaluatorId: 'user-2' }),
      ]
      const db = makePrisma({ assignments: records })
      const svc = createReviewAssignmentService(db as never)

      // Act
      const result = await svc.listByCycle('cycle-1')

      // Assert
      expect(result).toHaveLength(2)
      expect(db.reviewAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { cycleId: 'cycle-1' } }),
      )
    })
  })

  describe('declineAssignment', () => {
    it('ACTIVE な割り当てを辞退すると status が DECLINED になる', async () => {
      // Arrange
      const activeRecord = makeAssignmentRecord({ status: 'ACTIVE' })
      const declinedRecord = makeAssignmentRecord({
        status: 'DECLINED',
        decline: {
          id: 'dec-1',
          assignmentId: 'asn-1',
          reason: '業務多忙のため',
          replacementEvaluatorId: null,
          declinedAt: FIXED_NOW,
        },
      })
      const db = makePrisma({ assignment: activeRecord })
      db.reviewAssignment.update.mockResolvedValue(declinedRecord)
      const svc = createReviewAssignmentService(db as never)

      // Act
      const result = await svc.declineAssignment('asn-1', 'user-evaluator', {
        reason: '業務多忙のため',
      })

      // Assert
      expect(result.status).toBe('DECLINED')
      expect(result.decline?.reason).toBe('業務多忙のため')
      expect(db.reviewAssignment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'asn-1' },
          data: expect.objectContaining({ status: 'DECLINED' }),
        }),
      )
    })

    it('存在しない割り当ては AssignmentNotFoundError をスローする', async () => {
      // Arrange
      const db = makePrisma({ assignment: makeAssignmentRecord() })
      db.reviewAssignment.findUnique.mockResolvedValue(null)
      const svc = createReviewAssignmentService(db as never)

      // Act & Assert
      await expect(
        svc.declineAssignment('not-exist', 'user-evaluator', { reason: '理由' }),
      ).rejects.toBeInstanceOf(AssignmentNotFoundError)
    })

    it('ACTIVE でない割り当ては AssignmentNotActiveError をスローする', async () => {
      // Arrange
      const declinedRecord = makeAssignmentRecord({ status: 'DECLINED' })
      const db = makePrisma({ assignment: declinedRecord })
      const svc = createReviewAssignmentService(db as never)

      // Act & Assert
      await expect(
        svc.declineAssignment('asn-1', 'user-evaluator', { reason: '理由' }),
      ).rejects.toBeInstanceOf(AssignmentNotActiveError)
    })

    it('代替評価者 ID が指定された場合に replacementEvaluatorId を記録する', async () => {
      // Arrange
      const activeRecord = makeAssignmentRecord({ status: 'ACTIVE' })
      const declinedRecord = makeAssignmentRecord({
        status: 'DECLINED',
        decline: {
          id: 'dec-1',
          assignmentId: 'asn-1',
          reason: '異動のため',
          replacementEvaluatorId: 'user-replacement',
          declinedAt: FIXED_NOW,
        },
      })
      const db = makePrisma({ assignment: activeRecord })
      db.reviewAssignment.update.mockResolvedValue(declinedRecord)
      const svc = createReviewAssignmentService(db as never)

      // Act
      const result = await svc.declineAssignment('asn-1', 'user-evaluator', {
        reason: '異動のため',
        replacementEvaluatorId: 'user-replacement',
      })

      // Assert
      expect(result.decline?.replacementEvaluatorId).toBe('user-replacement')
    })
  })

  describe('assignReplacement', () => {
    it('代替評価者を割り当てると元が REPLACED、新規 ACTIVE が作成される', async () => {
      // Arrange
      const activeRecord = makeAssignmentRecord({ status: 'ACTIVE' })
      const newRecord = makeAssignmentRecord({ id: 'asn-2', evaluatorId: 'user-replacement' })
      const db = makePrisma({
        assignment: activeRecord,
        activeCount: 0,
        maxTargets: 5,
        transactionResult: [{ ...activeRecord, status: 'REPLACED' }, newRecord],
      })
      const svc = createReviewAssignmentService(db as never)

      // Act
      const result = await svc.assignReplacement('asn-1', 'user-replacement')

      // Assert
      expect(result.evaluatorId).toBe('user-replacement')
      expect(result.status).toBe('ACTIVE')
      expect(db.$transaction).toHaveBeenCalledOnce()
    })

    it('存在しない割り当ては AssignmentNotFoundError をスローする', async () => {
      // Arrange
      const db = makePrisma({ assignment: makeAssignmentRecord() })
      db.reviewAssignment.findUnique.mockResolvedValue(null)
      const svc = createReviewAssignmentService(db as never)

      // Act & Assert
      await expect(svc.assignReplacement('not-exist', 'user-replacement')).rejects.toBeInstanceOf(
        AssignmentNotFoundError,
      )
    })

    it('ACTIVE でない割り当ては AssignmentNotActiveError をスローする', async () => {
      // Arrange
      const replacedRecord = makeAssignmentRecord({ status: 'REPLACED' })
      const db = makePrisma({ assignment: replacedRecord })
      const svc = createReviewAssignmentService(db as never)

      // Act & Assert
      await expect(svc.assignReplacement('asn-1', 'user-replacement')).rejects.toBeInstanceOf(
        AssignmentNotActiveError,
      )
    })

    it('代替評価者が maxTargets を超過していると MaxTargetsExceededError をスローする', async () => {
      // Arrange
      const activeRecord = makeAssignmentRecord({ status: 'ACTIVE' })
      const db = makePrisma({ assignment: activeRecord, activeCount: 5, maxTargets: 5 })
      const svc = createReviewAssignmentService(db as never)

      // Act & Assert
      await expect(svc.assignReplacement('asn-1', 'user-replacement')).rejects.toBeInstanceOf(
        MaxTargetsExceededError,
      )
    })
  })
})
