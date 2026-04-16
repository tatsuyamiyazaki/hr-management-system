import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createJobQueue, type JobQueue } from '@/lib/jobs/job-queue'

// ─────────────────────────────────────────────────────────────────────────────
// BullMQ をモック
// ─────────────────────────────────────────────────────────────────────────────

const mockAdd = vi.fn()
const mockGetJob = vi.fn()

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: mockAdd,
    getJob: mockGetJob,
    close: vi.fn(),
  })),
}))

vi.mock('@/lib/jobs/redis-connection', () => ({
  createRedisConnection: vi.fn(() => ({})),
}))

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('JobQueue', () => {
  let queue: JobQueue

  beforeEach(() => {
    vi.clearAllMocks()
    mockAdd.mockResolvedValue({ id: 'job-1' })
    mockGetJob.mockResolvedValue(null)
    queue = createJobQueue()
  })

  describe('enqueue()', () => {
    it('should enqueue a job and return a jobId', async () => {
      const jobId = await queue.enqueue('send-email', {
        to: 'user@example.com',
        subject: 'Test',
        body: 'Hello',
      })
      expect(jobId).toBe('job-1')
      expect(mockAdd).toHaveBeenCalledOnce()
    })

    it('should pass the job name and payload to BullMQ', async () => {
      await queue.enqueue('export-csv', { resourceType: 'USER', requestedBy: 'user-1' })
      expect(mockAdd).toHaveBeenCalledWith(
        'export-csv',
        expect.objectContaining({ resourceType: 'USER', requestedBy: 'user-1' }),
        expect.any(Object),
      )
    })

    it('should apply exponential backoff retry options', async () => {
      await queue.enqueue('send-email', { to: 'a@b.com', subject: 'S', body: 'B' })
      const options = mockAdd.mock.calls[0]![2]
      expect(options).toMatchObject({
        attempts: expect.any(Number),
        backoff: expect.objectContaining({ type: 'exponential' }),
      })
      expect(options.attempts).toBeGreaterThanOrEqual(3)
    })
  })

  describe('getJobStatus()', () => {
    it('should return null when job does not exist', async () => {
      mockGetJob.mockResolvedValue(null)
      const status = await queue.getJobStatus('nonexistent')
      expect(status).toBeNull()
    })

    it('should return job status when job exists', async () => {
      mockGetJob.mockResolvedValue({
        id: 'job-1',
        name: 'send-email',
        data: {},
        getState: vi.fn().mockResolvedValue('completed'),
        returnvalue: { success: true },
        failedReason: null,
      })
      const status = await queue.getJobStatus('job-1')
      expect(status).not.toBeNull()
      expect(status?.state).toBe('completed')
      expect(status?.jobId).toBe('job-1')
    })
  })
})
