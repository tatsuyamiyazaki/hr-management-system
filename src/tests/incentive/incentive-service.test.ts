/**
 * Issue #64 / Task 18.1: IncentiveService 単体テスト
 *
 * テスト対象:
 * - qualityGatePassed=true のみ加算（Req 11.6）
 * - responseId unique で重複防止（Req 11.1）
 * - EvaluationSubmitted イベント経由での自動起動
 * - サイクルが存在しない場合は加算しない
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
})
