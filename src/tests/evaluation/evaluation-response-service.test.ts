/**
 * Issue #53 / Task 15.4: EvaluationResponseService 単体テスト
 * (Requirement 8.5, 8.6, 8.7, 8.17)
 *
 * テスト対象:
 * - 下書き保存テスト（isDraft: true）
 * - 送信テスト（isDraft: false に変更、EvaluationSubmitted イベント発行）
 * - 送信済み評価の再送信でエラー
 * - TOP_DOWN/PEER 評価で ACTIVE な Assignment がない場合にエラー
 * - SELF 評価は Assignment チェック不要
 * - listReceivedResponses は送信済みのみ返す
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createEvaluationResponseService } from '@/lib/evaluation/evaluation-response-service'
import {
  EvaluationAlreadySubmittedError,
  EvaluationNotAssignedError,
  type EvaluationResponseRecord,
} from '@/lib/evaluation/evaluation-response-types'
import {
  setEvaluationEventBusForTesting,
  clearEvaluationEventBusForTesting,
} from '@/lib/evaluation/evaluation-event-bus-di'
import { InMemoryEvaluationEventBus } from '@/lib/evaluation/evaluation-event-bus'

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const FIXED_NOW = new Date('2026-04-19T09:00:00.000Z')

function makeResponseRecord(
  overrides: Partial<EvaluationResponseRecord> = {},
): EvaluationResponseRecord {
  return {
    id: 'resp-1',
    cycleId: 'cycle-1',
    evaluatorId: 'user-evaluator',
    targetUserId: 'user-target',
    responseType: 'SELF',
    score: 80,
    comment: null,
    submittedAt: FIXED_NOW,
    isDraft: true,
    ...overrides,
  }
}

function makePrisma(opts: {
  existingResponse?: EvaluationResponseRecord | null
  upsertResult?: EvaluationResponseRecord
  findManyResult?: EvaluationResponseRecord[]
  activeAssignment?: { id: string } | null
}) {
  const {
    existingResponse = null,
    upsertResult = makeResponseRecord(),
    findManyResult = [],
    activeAssignment = { id: 'asn-1' },
  } = opts

  return {
    evaluationResponse: {
      findUnique: vi.fn().mockResolvedValue(existingResponse),
      upsert: vi.fn().mockResolvedValue(upsertResult),
      findMany: vi.fn().mockResolvedValue(findManyResult),
    },
    reviewAssignment: {
      findFirst: vi.fn().mockResolvedValue(activeAssignment),
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('EvaluationResponseService', () => {
  let bus: InMemoryEvaluationEventBus

  beforeEach(() => {
    bus = new InMemoryEvaluationEventBus()
    setEvaluationEventBusForTesting(bus)
  })

  afterEach(() => {
    clearEvaluationEventBusForTesting()
  })

  describe('saveDraft', () => {
    it('下書きを保存すると isDraft: true のレコードを返す', async () => {
      // Arrange
      const draftRecord = makeResponseRecord({ isDraft: true })
      const db = makePrisma({ upsertResult: draftRecord })
      const svc = createEvaluationResponseService(db as never)

      // Act
      const result = await svc.saveDraft('user-evaluator', {
        cycleId: 'cycle-1',
        targetUserId: 'user-target',
        responseType: 'SELF',
        score: 75,
      })

      // Assert
      expect(result.isDraft).toBe(true)
      expect(db.evaluationResponse.upsert).toHaveBeenCalledOnce()
      expect(db.evaluationResponse.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ isDraft: true }),
          update: expect.objectContaining({ isDraft: true }),
        }),
      )
    })

    it('既存の下書きを上書き保存できる', async () => {
      // Arrange
      const existingDraft = makeResponseRecord({ isDraft: true, score: 60 })
      const updatedDraft = makeResponseRecord({ isDraft: true, score: 80 })
      const db = makePrisma({ existingResponse: existingDraft, upsertResult: updatedDraft })
      const svc = createEvaluationResponseService(db as never)

      // Act
      const result = await svc.saveDraft('user-evaluator', {
        cycleId: 'cycle-1',
        targetUserId: 'user-target',
        responseType: 'SELF',
        score: 80,
      })

      // Assert
      expect(result.score).toBe(80)
      expect(result.isDraft).toBe(true)
    })
  })

  describe('submit', () => {
    it('SELF 評価を送信すると isDraft: false になり EvaluationSubmitted イベントが発行される', async () => {
      // Arrange
      const submittedRecord = makeResponseRecord({ isDraft: false })
      const db = makePrisma({ existingResponse: null, upsertResult: submittedRecord })
      const svc = createEvaluationResponseService(db as never)

      const publishedEvents: unknown[] = []
      bus.subscribe('EvaluationSubmitted', async (payload) => {
        publishedEvents.push(payload)
      })

      // Act
      const result = await svc.submit('user-evaluator', {
        cycleId: 'cycle-1',
        targetUserId: 'user-target',
        responseType: 'SELF',
        score: 80,
      })

      // Assert
      expect(result.isDraft).toBe(false)
      expect(publishedEvents).toHaveLength(1)
      expect(publishedEvents[0]).toMatchObject({
        evaluationId: 'resp-1',
        responseId: 'resp-1',
        cycleId: 'cycle-1',
        evaluatorId: 'user-evaluator',
        targetUserId: 'user-target',
        qualityGatePassed: true,
      })
    })

    it('SELF 評価は ReviewAssignment チェックを行わない', async () => {
      // Arrange
      const submittedRecord = makeResponseRecord({ isDraft: false })
      const db = makePrisma({ existingResponse: null, upsertResult: submittedRecord })
      const svc = createEvaluationResponseService(db as never)

      // Act
      await svc.submit('user-evaluator', {
        cycleId: 'cycle-1',
        targetUserId: 'user-target',
        responseType: 'SELF',
        score: 80,
      })

      // Assert: reviewAssignment.findFirst は呼ばれない
      expect(db.reviewAssignment.findFirst).not.toHaveBeenCalled()
    })

    it('TOP_DOWN 評価で ACTIVE な Assignment がある場合は送信できる', async () => {
      // Arrange
      const submittedRecord = makeResponseRecord({ responseType: 'TOP_DOWN', isDraft: false })
      const db = makePrisma({
        existingResponse: null,
        upsertResult: submittedRecord,
        activeAssignment: { id: 'asn-1' },
      })
      const svc = createEvaluationResponseService(db as never)

      // Act
      const result = await svc.submit('user-evaluator', {
        cycleId: 'cycle-1',
        targetUserId: 'user-target',
        responseType: 'TOP_DOWN',
        score: 85,
      })

      // Assert
      expect(result.isDraft).toBe(false)
      expect(db.reviewAssignment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            cycleId: 'cycle-1',
            evaluatorId: 'user-evaluator',
            targetUserId: 'user-target',
            status: 'ACTIVE',
          }),
        }),
      )
    })

    it('PEER 評価で ACTIVE な Assignment がない場合は EvaluationNotAssignedError をスローする', async () => {
      // Arrange
      const db = makePrisma({ existingResponse: null, activeAssignment: null })
      const svc = createEvaluationResponseService(db as never)

      // Act & Assert
      await expect(
        svc.submit('user-evaluator', {
          cycleId: 'cycle-1',
          targetUserId: 'user-target',
          responseType: 'PEER',
          score: 70,
        }),
      ).rejects.toBeInstanceOf(EvaluationNotAssignedError)
    })

    it('TOP_DOWN 評価で ACTIVE な Assignment がない場合は EvaluationNotAssignedError をスローする', async () => {
      // Arrange
      const db = makePrisma({ existingResponse: null, activeAssignment: null })
      const svc = createEvaluationResponseService(db as never)

      // Act & Assert
      await expect(
        svc.submit('user-evaluator', {
          cycleId: 'cycle-1',
          targetUserId: 'user-target',
          responseType: 'TOP_DOWN',
          score: 70,
        }),
      ).rejects.toBeInstanceOf(EvaluationNotAssignedError)
    })

    it('送信済み評価を再送信すると EvaluationAlreadySubmittedError をスローする', async () => {
      // Arrange
      const submittedRecord = makeResponseRecord({ isDraft: false })
      const db = makePrisma({ existingResponse: submittedRecord })
      const svc = createEvaluationResponseService(db as never)

      // Act & Assert
      await expect(
        svc.submit('user-evaluator', {
          cycleId: 'cycle-1',
          targetUserId: 'user-target',
          responseType: 'SELF',
          score: 90,
        }),
      ).rejects.toBeInstanceOf(EvaluationAlreadySubmittedError)
    })

    it('下書き状態からの送信は成功する（送信済みではない）', async () => {
      // Arrange
      const draftRecord = makeResponseRecord({ isDraft: true })
      const submittedRecord = makeResponseRecord({ isDraft: false })
      const db = makePrisma({ existingResponse: draftRecord, upsertResult: submittedRecord })
      const svc = createEvaluationResponseService(db as never)

      // Act
      const result = await svc.submit('user-evaluator', {
        cycleId: 'cycle-1',
        targetUserId: 'user-target',
        responseType: 'SELF',
        score: 80,
      })

      // Assert
      expect(result.isDraft).toBe(false)
    })
  })

  describe('listMyResponses', () => {
    it('自分が提出した評価一覧を返す（下書き含む）', async () => {
      // Arrange
      const records = [
        makeResponseRecord({ id: 'resp-1', isDraft: true }),
        makeResponseRecord({ id: 'resp-2', isDraft: false }),
      ]
      const db = makePrisma({ findManyResult: records })
      const svc = createEvaluationResponseService(db as never)

      // Act
      const result = await svc.listMyResponses('user-evaluator', 'cycle-1')

      // Assert
      expect(result).toHaveLength(2)
      expect(db.evaluationResponse.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { cycleId: 'cycle-1', evaluatorId: 'user-evaluator' },
        }),
      )
    })
  })

  describe('listReceivedResponses', () => {
    it('受けた評価一覧は送信済み（isDraft: false）のみを返す', async () => {
      // Arrange
      const submittedRecords = [makeResponseRecord({ id: 'resp-2', isDraft: false })]
      const db = makePrisma({ findManyResult: submittedRecords })
      const svc = createEvaluationResponseService(db as never)

      // Act
      const result = await svc.listReceivedResponses('user-target', 'cycle-1')

      // Assert
      expect(result).toHaveLength(1)
      expect(db.evaluationResponse.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { cycleId: 'cycle-1', targetUserId: 'user-target', isDraft: false },
        }),
      )
    })

    it('受けた評価一覧には evaluatorId が含まれない（匿名性保証 Req 8.7, 20.6）', async () => {
      // Arrange
      const submittedRecord = makeResponseRecord({
        id: 'resp-3',
        evaluatorId: 'secret-evaluator-id',
        isDraft: false,
      })
      const db = makePrisma({ findManyResult: [submittedRecord] })
      const svc = createEvaluationResponseService(db as never)

      // Act
      const result = await svc.listReceivedResponses('user-target', 'cycle-1')

      // Assert
      expect(result).toHaveLength(1)
      expect(result[0]).not.toHaveProperty('evaluatorId')
    })
  })

  describe('listByCycle', () => {
    it('サイクル全体の評価一覧を返す', async () => {
      // Arrange
      const records = [
        makeResponseRecord({ id: 'resp-1', evaluatorId: 'user-1' }),
        makeResponseRecord({ id: 'resp-2', evaluatorId: 'user-2' }),
      ]
      const db = makePrisma({ findManyResult: records })
      const svc = createEvaluationResponseService(db as never)

      // Act
      const result = await svc.listByCycle('cycle-1')

      // Assert
      expect(result).toHaveLength(2)
      expect(db.evaluationResponse.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { cycleId: 'cycle-1' },
        }),
      )
    })
  })
})
