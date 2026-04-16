import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Worker } from 'bullmq'
import { createBaseWorker } from '@/lib/jobs/base-worker'

// ─────────────────────────────────────────────────────────────────────────────
// BullMQ Worker をモック
// ─────────────────────────────────────────────────────────────────────────────

const mockOn = vi.fn()
const mockClose = vi.fn()

vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation((_name: string, _processor: unknown, _opts: unknown) => ({
    on: mockOn,
    close: mockClose,
  })),
}))

vi.mock('@/lib/jobs/redis-connection', () => ({
  createRedisConnection: vi.fn(() => ({})),
}))

const MockedWorker = vi.mocked(Worker)

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('createBaseWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOn.mockReturnValue({ on: mockOn, close: mockClose })
  })

  it('should create a worker with the given queue name', () => {
    const processor = vi.fn()
    createBaseWorker('send-email', processor)
    expect(MockedWorker).toHaveBeenCalledWith('send-email', processor, expect.any(Object))
  })

  it('should register failed and error event handlers', () => {
    const processor = vi.fn()
    createBaseWorker('send-email', processor)
    const eventNames = mockOn.mock.calls.map((c) => c[0])
    expect(eventNames).toContain('failed')
    expect(eventNames).toContain('error')
  })

  it('should register completed event handler', () => {
    const processor = vi.fn()
    createBaseWorker('send-email', processor)
    const eventNames = mockOn.mock.calls.map((c) => c[0])
    expect(eventNames).toContain('completed')
  })

  it('should apply concurrency options', () => {
    const processor = vi.fn()
    createBaseWorker('send-email', processor)
    const opts = MockedWorker.mock.calls[0]![2]
    expect(opts).toMatchObject({
      concurrency: expect.any(Number),
    })
  })
})
