import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createExportJob } from '@/lib/export/export-job'
import type { JobQueue } from '@/lib/jobs/job-queue'
import type { BlobStorage } from '@/lib/export/blob-storage'

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

type StorageMock = {
  upload: ReturnType<typeof vi.fn>
  getSignedUrl: ReturnType<typeof vi.fn>
}

function makeQueueMock(): QueueMock & JobQueue {
  return {
    enqueue: vi.fn().mockResolvedValue('job-123'),
    getJobStatus: vi.fn().mockResolvedValue(null),
    close: vi.fn().mockResolvedValue(undefined),
  }
}

function makeStorageMock(): StorageMock & BlobStorage {
  return {
    upload: vi.fn().mockResolvedValue('blobs/export-job-123.csv'),
    getSignedUrl: vi.fn().mockResolvedValue({
      url: 'https://storage.example.com/signed/export-job-123.csv?sig=abc',
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    }),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('ExportJob', () => {
  let queueMock: QueueMock & JobQueue
  let storageMock: StorageMock & BlobStorage

  beforeEach(() => {
    vi.clearAllMocks()
    queueMock = makeQueueMock()
    storageMock = makeStorageMock()
  })

  describe('enqueue()', () => {
    it('should enqueue an export-csv job and return jobId', async () => {
      const exportJob = createExportJob(queueMock, storageMock)
      const { jobId } = await exportJob.enqueue({ type: 'OrganizationCsv' })
      expect(jobId).toBe('job-123')
      expect(queueMock.enqueue).toHaveBeenCalledOnce()
    })

    it('should pass export request as part of payload', async () => {
      const exportJob = createExportJob(queueMock, storageMock)
      await exportJob.enqueue({ type: 'MasterCsv', resource: 'DEPARTMENT' })
      expect(queueMock.enqueue).toHaveBeenCalledWith(
        'export-csv',
        expect.objectContaining({ type: 'MasterCsv', resource: 'DEPARTMENT' }),
      )
    })

    it('should pass EvaluationReport request correctly', async () => {
      const exportJob = createExportJob(queueMock, storageMock)
      await exportJob.enqueue({ type: 'EvaluationReport', cycleId: 'cycle-1', format: 'pdf' })
      expect(queueMock.enqueue).toHaveBeenCalledWith(
        'export-csv',
        expect.objectContaining({ type: 'EvaluationReport', cycleId: 'cycle-1', format: 'pdf' }),
      )
    })
  })

  describe('getStatus()', () => {
    it('should return null when job does not exist', async () => {
      queueMock.getJobStatus.mockResolvedValue(null)
      const exportJob = createExportJob(queueMock, storageMock)
      const status = await exportJob.getStatus('nonexistent')
      expect(status).toBeNull()
    })

    it('should return "queued" when job state is waiting', async () => {
      queueMock.getJobStatus.mockResolvedValue({
        jobId: 'job-1',
        name: 'export-csv',
        state: 'waiting',
        returnValue: null,
        failedReason: null,
      })
      const exportJob = createExportJob(queueMock, storageMock)
      const status = await exportJob.getStatus('job-1')
      expect(status).toBe('queued')
    })

    it('should return "processing" when job state is active', async () => {
      queueMock.getJobStatus.mockResolvedValue({
        jobId: 'job-1',
        name: 'export-csv',
        state: 'active',
        returnValue: null,
        failedReason: null,
      })
      const exportJob = createExportJob(queueMock, storageMock)
      const status = await exportJob.getStatus('job-1')
      expect(status).toBe('processing')
    })

    it('should return "ready" when job state is completed', async () => {
      queueMock.getJobStatus.mockResolvedValue({
        jobId: 'job-1',
        name: 'export-csv',
        state: 'completed',
        returnValue: { blobKey: 'blobs/export-job-1.csv' },
        failedReason: null,
      })
      const exportJob = createExportJob(queueMock, storageMock)
      const status = await exportJob.getStatus('job-1')
      expect(status).toBe('ready')
    })

    it('should return "failed" when job state is failed', async () => {
      queueMock.getJobStatus.mockResolvedValue({
        jobId: 'job-1',
        name: 'export-csv',
        state: 'failed',
        returnValue: null,
        failedReason: 'something went wrong',
      })
      const exportJob = createExportJob(queueMock, storageMock)
      const status = await exportJob.getStatus('job-1')
      expect(status).toBe('failed')
    })
  })

  describe('getDownloadUrl()', () => {
    it('should return signed URL when job is completed', async () => {
      queueMock.getJobStatus.mockResolvedValue({
        jobId: 'job-1',
        name: 'export-csv',
        state: 'completed',
        returnValue: { blobKey: 'blobs/export-job-1.csv' },
        failedReason: null,
      })
      const exportJob = createExportJob(queueMock, storageMock)
      const result = await exportJob.getDownloadUrl('job-1')
      expect(result).not.toBeNull()
      expect(result?.url).toBeTruthy()
      expect(result?.expiresAt).toBeTruthy()
      expect(storageMock.getSignedUrl).toHaveBeenCalledWith('blobs/export-job-1.csv', 86_400)
    })

    it('should return null when job is not completed', async () => {
      queueMock.getJobStatus.mockResolvedValue({
        jobId: 'job-1',
        name: 'export-csv',
        state: 'active',
        returnValue: null,
        failedReason: null,
      })
      const exportJob = createExportJob(queueMock, storageMock)
      const result = await exportJob.getDownloadUrl('job-1')
      expect(result).toBeNull()
    })

    it('should return null when job does not exist', async () => {
      queueMock.getJobStatus.mockResolvedValue(null)
      const exportJob = createExportJob(queueMock, storageMock)
      const result = await exportJob.getDownloadUrl('nonexistent')
      expect(result).toBeNull()
    })
  })
})
