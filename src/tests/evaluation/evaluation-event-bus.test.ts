/**
 * Issue #50 / Task 15.1: EvaluationEventBus テスト
 *
 * InMemoryEvaluationEventBus を使用してRedisなしでテスト可能。
 */
import { describe, it, expect, vi } from 'vitest'
import type {
  EvaluationEventBus,
  EvaluationEventPayloadMap,
} from '@/lib/evaluation/evaluation-event-bus'
import { InMemoryEvaluationEventBus } from '@/lib/evaluation/evaluation-event-bus'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function createBus(): EvaluationEventBus {
  return new InMemoryEvaluationEventBus()
}

const NOW = '2024-01-15T10:00:00.000Z'

const validPayloads: EvaluationEventPayloadMap = {
  EvaluationSubmitted: {
    evaluationId: 'eval-1',
    responseId: 'eval-1',
    cycleId: 'cycle-1',
    evaluatorId: 'user-1',
    targetUserId: 'user-2',
    qualityGatePassed: true,
    submittedAt: NOW,
  },
  CycleFinalized: {
    cycleId: 'cycle-1',
    cycleName: '2024 Q1',
    finalizedAt: NOW,
  },
  FeedbackPublished: {
    feedbackId: 'feedback-1',
    targetUserId: 'user-2',
    publishedAt: NOW,
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('InMemoryEvaluationEventBus', () => {
  describe('EvaluationSubmitted イベント', () => {
    it('publish すると handler が正しい payload で呼ばれる', async () => {
      // Arrange
      const bus = createBus()
      const handler = vi.fn(
        async (_payload: EvaluationEventPayloadMap['EvaluationSubmitted']): Promise<void> => {},
      )
      bus.subscribe('EvaluationSubmitted', handler)

      // Act
      await bus.publish('EvaluationSubmitted', validPayloads.EvaluationSubmitted)

      // Assert
      expect(handler).toHaveBeenCalledOnce()
      expect(handler).toHaveBeenCalledWith(validPayloads.EvaluationSubmitted)
    })
  })

  describe('CycleFinalized イベント', () => {
    it('対応 handler のみ呼ばれ、他イベントの handler は呼ばれない', async () => {
      // Arrange
      const bus = createBus()
      const cycleFinalizedHandler = vi.fn(
        async (_payload: EvaluationEventPayloadMap['CycleFinalized']): Promise<void> => {},
      )
      const evaluationSubmittedHandler = vi.fn(
        async (_payload: EvaluationEventPayloadMap['EvaluationSubmitted']): Promise<void> => {},
      )

      bus.subscribe('CycleFinalized', cycleFinalizedHandler)
      bus.subscribe('EvaluationSubmitted', evaluationSubmittedHandler)

      // Act
      await bus.publish('CycleFinalized', validPayloads.CycleFinalized)

      // Assert
      expect(cycleFinalizedHandler).toHaveBeenCalledOnce()
      expect(cycleFinalizedHandler).toHaveBeenCalledWith(validPayloads.CycleFinalized)
      expect(evaluationSubmittedHandler).not.toHaveBeenCalled()
    })
  })

  describe('FeedbackPublished イベント', () => {
    it('publish すると handler が呼ばれる', async () => {
      // Arrange
      const bus = createBus()
      const handler = vi.fn(
        async (_payload: EvaluationEventPayloadMap['FeedbackPublished']): Promise<void> => {},
      )
      bus.subscribe('FeedbackPublished', handler)

      // Act
      await bus.publish('FeedbackPublished', validPayloads.FeedbackPublished)

      // Assert
      expect(handler).toHaveBeenCalledOnce()
      expect(handler).toHaveBeenCalledWith(validPayloads.FeedbackPublished)
    })
  })

  describe('不正ペイロード', () => {
    it('不正ペイロードの場合 handler が呼ばれない', async () => {
      // Arrange
      const bus = createBus()
      const handler = vi.fn(
        async (_payload: EvaluationEventPayloadMap['EvaluationSubmitted']): Promise<void> => {},
      )
      bus.subscribe('EvaluationSubmitted', handler)

      // Act — evaluatorId が空文字（min(1) 違反）
      await bus.publish('EvaluationSubmitted', {
        evaluationId: 'eval-1',
        responseId: 'eval-1',
        cycleId: 'cycle-1',
        evaluatorId: '',
        targetUserId: 'user-2',
        qualityGatePassed: true,
        submittedAt: NOW,
      })

      // Assert
      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('handler エラー', () => {
    it('handler でエラーが起きても publish は成功する', async () => {
      // Arrange
      const bus = createBus()
      const errorHandler = vi.fn(
        async (_payload: EvaluationEventPayloadMap['EvaluationSubmitted']): Promise<void> => {
          throw new Error('handler error')
        },
      )
      bus.subscribe('EvaluationSubmitted', errorHandler)

      // Act & Assert — throw しない
      await expect(
        bus.publish('EvaluationSubmitted', validPayloads.EvaluationSubmitted),
      ).resolves.toBeUndefined()
      expect(errorHandler).toHaveBeenCalledOnce()
    })
  })

  describe('close', () => {
    it('close を呼んでも例外が発生しない', async () => {
      const bus = createBus()
      await expect(bus.close()).resolves.toBeUndefined()
    })
  })
})
