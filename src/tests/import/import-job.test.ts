import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createImportJob } from '@/lib/import/import-job'
import type { JobQueue } from '@/lib/jobs/job-queue'

vi.mock('@/lib/jobs/redis-connection', () => ({
  createRedisConnection: vi.fn(() => ({})),
}))
vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue({ id: 'job-123' }),
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
    enqueue: vi.fn().mockResolvedValue('job-123'),
    getJobStatus: vi.fn().mockResolvedValue(null),
    close: vi.fn().mockResolvedValue(undefined),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('ImportJob', () => {
  let queueMock: QueueMock & JobQueue

  beforeEach(() => {
    vi.clearAllMocks()
    queueMock = makeQueueMock()
  })

  describe('enqueue()', () => {
    it('should enqueue an import-csv job and return jobId', async () => {
      const importJob = createImportJob(queueMock)
      const { jobId } = await importJob.enqueue({ type: 'EmployeeCsv' })
      expect(jobId).toBe('job-123')
      expect(queueMock.enqueue).toHaveBeenCalledOnce()
    })

    it('should pass MasterCsv request as part of payload', async () => {
      const importJob = createImportJob(queueMock)
      await importJob.enqueue({ type: 'MasterCsv', resource: 'DEPARTMENT' })
      expect(queueMock.enqueue).toHaveBeenCalledWith(
        'import-csv',
        expect.objectContaining({ type: 'MasterCsv', resource: 'DEPARTMENT' }),
      )
    })

    it('should pass EmployeeCsv request as part of payload', async () => {
      const importJob = createImportJob(queueMock)
      await importJob.enqueue({ type: 'EmployeeCsv' })
      expect(queueMock.enqueue).toHaveBeenCalledWith(
        'import-csv',
        expect.objectContaining({ type: 'EmployeeCsv' }),
      )
    })
  })

  describe('getStatus()', () => {
    it('should return null when job does not exist', async () => {
      queueMock.getJobStatus.mockResolvedValue(null)
      const importJob = createImportJob(queueMock)
      const status = await importJob.getStatus('nonexistent')
      expect(status).toBeNull()
    })

    it('should return "queued" when job state is waiting', async () => {
      queueMock.getJobStatus.mockResolvedValue({
        jobId: 'job-1',
        name: 'import-csv',
        state: 'waiting',
        returnValue: null,
        failedReason: null,
      })
      const importJob = createImportJob(queueMock)
      expect(await importJob.getStatus('job-1')).toBe('queued')
    })

    it('should return "queued" when job state is waiting-children', async () => {
      queueMock.getJobStatus.mockResolvedValue({
        jobId: 'job-1',
        name: 'import-csv',
        state: 'waiting-children',
        returnValue: null,
        failedReason: null,
      })
      const importJob = createImportJob(queueMock)
      expect(await importJob.getStatus('job-1')).toBe('queued')
    })

    it('should return "queued" when job state is delayed', async () => {
      queueMock.getJobStatus.mockResolvedValue({
        jobId: 'job-1',
        name: 'import-csv',
        state: 'delayed',
        returnValue: null,
        failedReason: null,
      })
      const importJob = createImportJob(queueMock)
      expect(await importJob.getStatus('job-1')).toBe('queued')
    })

    it('should return "queued" when job state is prioritized', async () => {
      queueMock.getJobStatus.mockResolvedValue({
        jobId: 'job-1',
        name: 'import-csv',
        state: 'prioritized',
        returnValue: null,
        failedReason: null,
      })
      const importJob = createImportJob(queueMock)
      expect(await importJob.getStatus('job-1')).toBe('queued')
    })

    it('should return "processing" when job state is active', async () => {
      queueMock.getJobStatus.mockResolvedValue({
        jobId: 'job-1',
        name: 'import-csv',
        state: 'active',
        returnValue: null,
        failedReason: null,
      })
      const importJob = createImportJob(queueMock)
      expect(await importJob.getStatus('job-1')).toBe('processing')
    })

    it('should return "ready" when job state is completed', async () => {
      queueMock.getJobStatus.mockResolvedValue({
        jobId: 'job-1',
        name: 'import-csv',
        state: 'completed',
        returnValue: { totalRows: 10, successCount: 10, failureCount: 0, errors: [] },
        failedReason: null,
      })
      const importJob = createImportJob(queueMock)
      expect(await importJob.getStatus('job-1')).toBe('ready')
    })

    it('should return "failed" when job state is failed', async () => {
      queueMock.getJobStatus.mockResolvedValue({
        jobId: 'job-1',
        name: 'import-csv',
        state: 'failed',
        returnValue: null,
        failedReason: 'something went wrong',
      })
      const importJob = createImportJob(queueMock)
      expect(await importJob.getStatus('job-1')).toBe('failed')
    })

    it('should return "failed" when job state is unknown', async () => {
      queueMock.getJobStatus.mockResolvedValue({
        jobId: 'job-1',
        name: 'import-csv',
        state: 'unknown',
        returnValue: null,
        failedReason: null,
      })
      const importJob = createImportJob(queueMock)
      expect(await importJob.getStatus('job-1')).toBe('failed')
    })
  })

  describe('getResult()', () => {
    it('should return null when job does not exist', async () => {
      queueMock.getJobStatus.mockResolvedValue(null)
      const importJob = createImportJob(queueMock)
      expect(await importJob.getResult('nonexistent')).toBeNull()
    })

    it('should return null when job is not completed', async () => {
      queueMock.getJobStatus.mockResolvedValue({
        jobId: 'job-1',
        name: 'import-csv',
        state: 'active',
        returnValue: null,
        failedReason: null,
      })
      const importJob = createImportJob(queueMock)
      expect(await importJob.getResult('job-1')).toBeNull()
    })

    it('should return null when returnValue is null', async () => {
      queueMock.getJobStatus.mockResolvedValue({
        jobId: 'job-1',
        name: 'import-csv',
        state: 'completed',
        returnValue: null,
        failedReason: null,
      })
      const importJob = createImportJob(queueMock)
      expect(await importJob.getResult('job-1')).toBeNull()
    })

    it('should return null when returnValue has no required fields', async () => {
      queueMock.getJobStatus.mockResolvedValue({
        jobId: 'job-1',
        name: 'import-csv',
        state: 'completed',
        returnValue: { someOtherField: 'value' },
        failedReason: null,
      })
      const importJob = createImportJob(queueMock)
      expect(await importJob.getResult('job-1')).toBeNull()
    })

    it('should return ImportResult when job completed with no errors', async () => {
      const result = { totalRows: 5, successCount: 5, failureCount: 0, errors: [] }
      queueMock.getJobStatus.mockResolvedValue({
        jobId: 'job-1',
        name: 'import-csv',
        state: 'completed',
        returnValue: result,
        failedReason: null,
      })
      const importJob = createImportJob(queueMock)
      const importResult = await importJob.getResult('job-1')
      expect(importResult).not.toBeNull()
      expect(importResult?.totalRows).toBe(5)
      expect(importResult?.successCount).toBe(5)
      expect(importResult?.failureCount).toBe(0)
      expect(importResult?.errors).toHaveLength(0)
    })

    it('should return ImportResult with error details', async () => {
      const result = {
        totalRows: 3,
        successCount: 2,
        failureCount: 1,
        errors: [{ rowNumber: 2, field: 'email', message: 'Invalid email format' }],
      }
      queueMock.getJobStatus.mockResolvedValue({
        jobId: 'job-1',
        name: 'import-csv',
        state: 'completed',
        returnValue: result,
        failedReason: null,
      })
      const importJob = createImportJob(queueMock)
      const importResult = await importJob.getResult('job-1')
      expect(importResult?.failureCount).toBe(1)
      expect(importResult?.errors[0]?.rowNumber).toBe(2)
      expect(importResult?.errors[0]?.field).toBe('email')
    })
  })
})
