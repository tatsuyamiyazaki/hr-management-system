import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createNotificationEmitter } from '@/lib/notification/notification-emitter'
import type { JobQueue } from '@/lib/jobs/job-queue'

vi.mock('@/lib/jobs/redis-connection', () => ({
  createRedisConnection: vi.fn(() => ({})),
}))
vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue({ id: 'job-xyz' }),
    getJob: vi.fn().mockResolvedValue(null),
    close: vi.fn(),
  })),
  Worker: vi.fn().mockImplementation(() => ({ on: vi.fn(), close: vi.fn() })),
}))

// ─────────────────────────────────────────────────────────────────────────────
// モック
// ─────────────────────────────────────────────────────────────────────────────

type QueueMock = {
  enqueue: ReturnType<typeof vi.fn>
  getJobStatus: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
}

function makeQueueMock(): QueueMock & JobQueue {
  return {
    enqueue: vi.fn().mockResolvedValue('job-xyz'),
    getJobStatus: vi.fn().mockResolvedValue(null),
    close: vi.fn().mockResolvedValue(undefined),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('NotificationEmitter', () => {
  let queueMock: QueueMock & JobQueue

  beforeEach(() => {
    vi.clearAllMocks()
    queueMock = makeQueueMock()
  })

  describe('emit()', () => {
    it('should resolve without throwing (fire-and-forget)', async () => {
      const emitter = createNotificationEmitter(queueMock)
      await expect(
        emitter.emit({
          userId: 'user-1',
          category: 'SYSTEM',
          title: 'テスト通知',
          body: '本文です',
        }),
      ).resolves.not.toThrow()
    })

    it('should enqueue a send-email job for EVAL_INVITATION', async () => {
      const emitter = createNotificationEmitter(queueMock)
      await emitter.emit({
        userId: 'user-1',
        category: 'EVAL_INVITATION',
        title: '評価依頼',
        body: '評価を開始してください',
      })
      expect(queueMock.enqueue).toHaveBeenCalledWith(
        'send-email',
        expect.objectContaining({
          userId: 'user-1',
          category: 'EVAL_INVITATION',
          title: '評価依頼',
          body: '評価を開始してください',
        }),
      )
    })

    it('should enqueue a send-email job for SYSTEM category', async () => {
      const emitter = createNotificationEmitter(queueMock)
      await emitter.emit({
        userId: 'user-2',
        category: 'SYSTEM',
        title: 'システム通知',
        body: 'メンテナンスのお知らせ',
      })
      expect(queueMock.enqueue).toHaveBeenCalledWith(
        'send-email',
        expect.objectContaining({
          userId: 'user-2',
          category: 'SYSTEM',
        }),
      )
    })

    it('should include optional payload in the enqueued job', async () => {
      const emitter = createNotificationEmitter(queueMock)
      await emitter.emit({
        userId: 'user-1',
        category: 'GOAL_APPROVAL_REQUEST',
        title: '目標承認依頼',
        body: '承認をお願いします',
        payload: { goalId: 'goal-42' },
      })
      expect(queueMock.enqueue).toHaveBeenCalledWith(
        'send-email',
        expect.objectContaining({
          payload: { goalId: 'goal-42' },
        }),
      )
    })

    it('should throw for invalid event payload', async () => {
      const emitter = createNotificationEmitter(queueMock)
      await expect(
        emitter.emit({
          userId: '',
          category: 'SYSTEM',
          title: 'Test',
          body: 'Body',
        }),
      ).rejects.toThrow()
    })

    it('should enqueue for DEADLINE_ALERT', async () => {
      const emitter = createNotificationEmitter(queueMock)
      await emitter.emit({
        userId: 'user-3',
        category: 'DEADLINE_ALERT',
        title: '締め切り間近',
        body: '期限が迫っています',
      })
      expect(queueMock.enqueue).toHaveBeenCalledWith(
        'send-email',
        expect.objectContaining({ category: 'DEADLINE_ALERT' }),
      )
    })

    it('should enqueue for FEEDBACK_PUBLISHED', async () => {
      const emitter = createNotificationEmitter(queueMock)
      await emitter.emit({
        userId: 'user-4',
        category: 'FEEDBACK_PUBLISHED',
        title: 'フィードバック公開',
        body: 'フィードバックが公開されました',
      })
      expect(queueMock.enqueue).toHaveBeenCalledWith(
        'send-email',
        expect.objectContaining({ category: 'FEEDBACK_PUBLISHED' }),
      )
    })
  })
})
