/**
 * Issue #64 / Task 18.1, 18.2: IncentiveService 単体テスト
 *
 * テスト対象:
 * - qualityGatePassed=true のみ加算（Req 11.6）
 * - responseId unique で重複防止（Req 11.1）
 * - EvaluationSubmitted イベント経由での自動起動
 * - サイクルが存在しない場合は加算しない
 * - getCumulativeScore: マイページ表示用（Req 11.4）
 * - getAdjustmentForTotalEvaluation: 総合評価集計用（Req 11.5）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createIncentiveService, type CycleKProvider } from '@/lib/incentive/incentive-service'
import type { IncentiveRecord, IncentiveRepository } from '@/lib/incentive/incentive-types'
import { InMemoryEvaluationEventBus } from '@/lib/evaluation/evaluation-event-bus'

// ─────────────────────────────────────────────────────────────────────────────
// InMemory Repository
// ─────────────────────────────────────────────────────────────────────────────

class InMemoryIncentiveRepository implements IncentiveRepository {
  readonly records: IncentiveRecord[] = []

  async save(record: IncentiveRecord): Promise<void> {
    this.records.push(record)
  }

  async existsByResponseId(responseId: string): Promise<boolean> {
    return this.records.some((r) => r.responseId === responseId)
  }

  async countByCycleAndEvaluator(cycleId: string, evaluatorId: string): Promise<number> {
    return this.records.filter((r) => r.cycleId === cycleId && r.evaluatorId === evaluatorId).length
  }

  async findByCycleId(cycleId: string): Promise<IncentiveRecord[]> {
    return this.records.filter((r) => r.cycleId === cycleId)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const FIXED_NOW = new Date('2026-04-20T09:00:00.000Z')
const FIXED_ID = 'incentive-1'
const DEFAULT_K = 1.5

function makeCycleKProvider(k: number | null = DEFAULT_K): CycleKProvider {
  return {
    getIncentiveK: vi.fn().mockResolvedValue(k),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// InMemoryIncentiveRepository unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe('InMemoryIncentiveRepository.findByCycleId', () => {
  it('指定サイクルのレコードのみ返す', async () => {
    const repo = new InMemoryIncentiveRepository()
    const now = new Date()
    await repo.save({
      id: '1',
      cycleId: 'cycle-A',
      evaluatorId: 'user-1',
      responseId: 'r1',
      coefficientK: 1.0,
      createdAt: now,
    })
    await repo.save({
      id: '2',
      cycleId: 'cycle-B',
      evaluatorId: 'user-1',
      responseId: 'r2',
      coefficientK: 2.0,
      createdAt: now,
    })
    await repo.save({
      id: '3',
      cycleId: 'cycle-A',
      evaluatorId: 'user-2',
      responseId: 'r3',
      coefficientK: 1.0,
      createdAt: now,
    })

    const result = await repo.findByCycleId('cycle-A')

    expect(result).toHaveLength(2)
    expect(result.map((r) => r.id)).toEqual(['1', '3'])
  })

  it('該当レコードがなければ空配列を返す', async () => {
    const repo = new InMemoryIncentiveRepository()
    const result = await repo.findByCycleId('nonexistent')
    expect(result).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('IncentiveService', () => {
  let repo: InMemoryIncentiveRepository
  let cycleKProvider: CycleKProvider

  beforeEach(() => {
    repo = new InMemoryIncentiveRepository()
    cycleKProvider = makeCycleKProvider()
  })

  describe('applyIncentive', () => {
    it('qualityGatePassed=true の場合、IncentiveRecord が保存される', async () => {
      // Arrange
      const svc = createIncentiveService({
        incentiveRepository: repo,
        cycleKProvider,
        idFactory: () => FIXED_ID,
        clock: () => FIXED_NOW,
      })

      // Act
      await svc.applyIncentive({
        responseId: 'resp-1',
        cycleId: 'cycle-1',
        evaluatorId: 'user-1',
        qualityGatePassed: true,
      })

      // Assert
      expect(repo.records).toHaveLength(1)
      expect(repo.records[0]).toEqual({
        id: FIXED_ID,
        cycleId: 'cycle-1',
        evaluatorId: 'user-1',
        responseId: 'resp-1',
        coefficientK: DEFAULT_K,
        createdAt: FIXED_NOW,
      })
    })

    it('qualityGatePassed=false の場合、加算されない', async () => {
      // Arrange
      const svc = createIncentiveService({
        incentiveRepository: repo,
        cycleKProvider,
        idFactory: () => FIXED_ID,
        clock: () => FIXED_NOW,
      })

      // Act
      await svc.applyIncentive({
        responseId: 'resp-1',
        cycleId: 'cycle-1',
        evaluatorId: 'user-1',
        qualityGatePassed: false,
      })

      // Assert
      expect(repo.records).toHaveLength(0)
    })

    it('同じ responseId で重複加算されない', async () => {
      // Arrange
      let callCount = 0
      const svc = createIncentiveService({
        incentiveRepository: repo,
        cycleKProvider,
        idFactory: () => `incentive-${++callCount}`,
        clock: () => FIXED_NOW,
      })

      // Act: 2回同じ responseId で呼ぶ
      await svc.applyIncentive({
        responseId: 'resp-1',
        cycleId: 'cycle-1',
        evaluatorId: 'user-1',
        qualityGatePassed: true,
      })
      await svc.applyIncentive({
        responseId: 'resp-1',
        cycleId: 'cycle-1',
        evaluatorId: 'user-1',
        qualityGatePassed: true,
      })

      // Assert: 1件だけ保存
      expect(repo.records).toHaveLength(1)
    })

    it('サイクルが存在しない場合（k=null）は加算されない', async () => {
      // Arrange
      const nullProvider = makeCycleKProvider(null)
      const svc = createIncentiveService({
        incentiveRepository: repo,
        cycleKProvider: nullProvider,
        idFactory: () => FIXED_ID,
        clock: () => FIXED_NOW,
      })

      // Act
      await svc.applyIncentive({
        responseId: 'resp-1',
        cycleId: 'nonexistent-cycle',
        evaluatorId: 'user-1',
        qualityGatePassed: true,
      })

      // Assert
      expect(repo.records).toHaveLength(0)
    })

    it('異なる responseId であれば複数件加算される', async () => {
      // Arrange
      let callCount = 0
      const svc = createIncentiveService({
        incentiveRepository: repo,
        cycleKProvider,
        idFactory: () => `incentive-${++callCount}`,
        clock: () => FIXED_NOW,
      })

      // Act
      await svc.applyIncentive({
        responseId: 'resp-1',
        cycleId: 'cycle-1',
        evaluatorId: 'user-1',
        qualityGatePassed: true,
      })
      await svc.applyIncentive({
        responseId: 'resp-2',
        cycleId: 'cycle-1',
        evaluatorId: 'user-1',
        qualityGatePassed: true,
      })

      // Assert
      expect(repo.records).toHaveLength(2)
    })
  })

  describe('EvaluationSubmitted イベント経由', () => {
    it('イベント購読で applyIncentive が自動起動される', async () => {
      // Arrange
      const bus = new InMemoryEvaluationEventBus()
      createIncentiveService({
        incentiveRepository: repo,
        cycleKProvider,
        eventBus: bus,
        idFactory: () => FIXED_ID,
        clock: () => FIXED_NOW,
      })

      // Act: イベント発行
      await bus.publish('EvaluationSubmitted', {
        evaluationId: 'eval-1',
        responseId: 'resp-1',
        cycleId: 'cycle-1',
        evaluatorId: 'user-1',
        targetUserId: 'user-2',
        qualityGatePassed: true,
        submittedAt: '2026-04-20T09:00:00.000Z',
      })

      // Assert
      expect(repo.records).toHaveLength(1)
      expect(repo.records[0]).toMatchObject({
        responseId: 'resp-1',
        cycleId: 'cycle-1',
        evaluatorId: 'user-1',
        coefficientK: DEFAULT_K,
      })
    })

    it('qualityGatePassed=false のイベントでは加算されない', async () => {
      // Arrange
      const bus = new InMemoryEvaluationEventBus()
      createIncentiveService({
        incentiveRepository: repo,
        cycleKProvider,
        eventBus: bus,
        idFactory: () => FIXED_ID,
        clock: () => FIXED_NOW,
      })

      // Act
      await bus.publish('EvaluationSubmitted', {
        evaluationId: 'eval-1',
        responseId: 'resp-1',
        cycleId: 'cycle-1',
        evaluatorId: 'user-1',
        targetUserId: 'user-2',
        qualityGatePassed: false,
        submittedAt: '2026-04-20T09:00:00.000Z',
      })

      // Assert
      expect(repo.records).toHaveLength(0)
    })

    it('同じ responseId のイベントが2回発行されても重複加算されない', async () => {
      // Arrange
      let callCount = 0
      const bus = new InMemoryEvaluationEventBus()
      createIncentiveService({
        incentiveRepository: repo,
        cycleKProvider,
        eventBus: bus,
        idFactory: () => `incentive-${++callCount}`,
        clock: () => FIXED_NOW,
      })

      const payload = {
        evaluationId: 'eval-1',
        responseId: 'resp-1',
        cycleId: 'cycle-1',
        evaluatorId: 'user-1',
        targetUserId: 'user-2',
        qualityGatePassed: true,
        submittedAt: '2026-04-20T09:00:00.000Z',
      } as const

      // Act
      await bus.publish('EvaluationSubmitted', payload)
      await bus.publish('EvaluationSubmitted', payload)

      // Assert
      expect(repo.records).toHaveLength(1)
    })
  })

  describe('getCumulativeScore (Req 11.4)', () => {
    it('評価実施件数と累積スコア（= count × k）を返す', async () => {
      // Arrange
      let callCount = 0
      const svc = createIncentiveService({
        incentiveRepository: repo,
        cycleKProvider,
        idFactory: () => `incentive-${++callCount}`,
        clock: () => FIXED_NOW,
      })

      // 3件の評価を追加
      await svc.applyIncentive({
        responseId: 'resp-1',
        cycleId: 'cycle-1',
        evaluatorId: 'user-1',
        qualityGatePassed: true,
      })
      await svc.applyIncentive({
        responseId: 'resp-2',
        cycleId: 'cycle-1',
        evaluatorId: 'user-1',
        qualityGatePassed: true,
      })
      await svc.applyIncentive({
        responseId: 'resp-3',
        cycleId: 'cycle-1',
        evaluatorId: 'user-1',
        qualityGatePassed: true,
      })

      // Act
      const score = await svc.getCumulativeScore('user-1', 'cycle-1')

      // Assert: count=3, score=3×1.5=4.5
      expect(score.evaluationCount).toBe(3)
      expect(score.cumulativeScore).toBe(4.5)
    })

    it('加算記録がない場合は0を返す', async () => {
      // Arrange
      const svc = createIncentiveService({
        incentiveRepository: repo,
        cycleKProvider,
        idFactory: () => FIXED_ID,
        clock: () => FIXED_NOW,
      })

      // Act
      const score = await svc.getCumulativeScore('user-1', 'cycle-1')

      // Assert
      expect(score.evaluationCount).toBe(0)
      expect(score.cumulativeScore).toBe(0)
    })

    it('サイクルが存在しない場合（k=null）はスコア0を返す', async () => {
      // Arrange
      const nullProvider = makeCycleKProvider(null)
      const svc = createIncentiveService({
        incentiveRepository: repo,
        cycleKProvider: nullProvider,
        idFactory: () => FIXED_ID,
        clock: () => FIXED_NOW,
      })

      // Act
      const score = await svc.getCumulativeScore('user-1', 'nonexistent')

      // Assert
      expect(score.evaluationCount).toBe(0)
      expect(score.cumulativeScore).toBe(0)
    })
  })

  describe('getAdjustmentForTotalEvaluation (Req 11.5)', () => {
    it('サイクル内全評価者のスコアをMap形式で返す', async () => {
      // Arrange
      let callCount = 0
      const svc = createIncentiveService({
        incentiveRepository: repo,
        cycleKProvider,
        idFactory: () => `incentive-${++callCount}`,
        clock: () => FIXED_NOW,
      })

      // user-1: 2件, user-2: 1件
      await svc.applyIncentive({
        responseId: 'resp-1',
        cycleId: 'cycle-1',
        evaluatorId: 'user-1',
        qualityGatePassed: true,
      })
      await svc.applyIncentive({
        responseId: 'resp-2',
        cycleId: 'cycle-1',
        evaluatorId: 'user-1',
        qualityGatePassed: true,
      })
      await svc.applyIncentive({
        responseId: 'resp-3',
        cycleId: 'cycle-1',
        evaluatorId: 'user-2',
        qualityGatePassed: true,
      })

      // Act
      const result = await svc.getAdjustmentForTotalEvaluation('cycle-1')

      // Assert: user-1 = 2 × 1.5 = 3.0, user-2 = 1 × 1.5 = 1.5
      expect(result.get('user-1')).toBe(3.0)
      expect(result.get('user-2')).toBe(1.5)
    })

    it('レコードがないサイクルでは空のMapを返す', async () => {
      // Arrange
      const svc = createIncentiveService({
        incentiveRepository: repo,
        cycleKProvider,
        idFactory: () => FIXED_ID,
        clock: () => FIXED_NOW,
      })

      // Act
      const result = await svc.getAdjustmentForTotalEvaluation('empty-cycle')

      // Assert
      expect(result.size).toBe(0)
    })

    it('異なるサイクルのレコードは含まれない', async () => {
      // Arrange
      let callCount = 0
      const svc = createIncentiveService({
        incentiveRepository: repo,
        cycleKProvider,
        idFactory: () => `incentive-${++callCount}`,
        clock: () => FIXED_NOW,
      })

      await svc.applyIncentive({
        responseId: 'resp-1',
        cycleId: 'cycle-1',
        evaluatorId: 'user-1',
        qualityGatePassed: true,
      })
      await svc.applyIncentive({
        responseId: 'resp-2',
        cycleId: 'cycle-2',
        evaluatorId: 'user-1',
        qualityGatePassed: true,
      })

      // Act
      const result = await svc.getAdjustmentForTotalEvaluation('cycle-1')

      // Assert: cycle-1 のみ
      expect(result.size).toBe(1)
      expect(result.get('user-1')).toBe(1.5)
    })
  })
})
