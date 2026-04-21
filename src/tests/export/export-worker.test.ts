import { describe, it, expect, vi, beforeEach } from 'vitest'
import { processExportJob } from '@/lib/export/export-worker'
import type { BlobStorage } from '@/lib/export/blob-storage'

vi.mock('@/lib/jobs/redis-connection', () => ({
  createRedisConnection: vi.fn(() => ({})),
}))
vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue({ id: 'job-abc' }),
    getJob: vi.fn().mockResolvedValue(null),
    close: vi.fn(),
  })),
  Worker: vi.fn().mockImplementation(() => ({ on: vi.fn(), close: vi.fn() })),
}))

// ─────────────────────────────────────────────────────────────────────────────
// モック
// ─────────────────────────────────────────────────────────────────────────────

type StorageMock = {
  upload: ReturnType<typeof vi.fn>
  getSignedUrl: ReturnType<typeof vi.fn>
}

function makeStorageMock(): StorageMock & BlobStorage {
  return {
    upload: vi.fn().mockResolvedValue('blobs/export-abc.csv'),
    getSignedUrl: vi.fn().mockResolvedValue({
      url: 'https://storage.example.com/signed/export-abc.csv?sig=xyz',
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    }),
  }
}

function makeJob(data: Record<string, unknown>) {
  return { id: 'job-abc', data } as unknown as Parameters<typeof processExportJob>[0]
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('processExportJob()', () => {
  let storageMock: StorageMock & BlobStorage

  beforeEach(() => {
    vi.clearAllMocks()
    storageMock = makeStorageMock()
  })

  it('should process OrganizationCsv and return blobKey', async () => {
    const job = makeJob({ type: 'OrganizationCsv', requestedBy: 'user-1' })
    const result = await processExportJob(job, storageMock)
    expect(result.blobKey).toBeTruthy()
    expect(storageMock.upload).toHaveBeenCalledOnce()
  })

  it('should process MasterCsv and upload a file', async () => {
    const job = makeJob({ type: 'MasterCsv', resource: 'DEPARTMENT', requestedBy: 'user-1' })
    const result = await processExportJob(job, storageMock)
    expect(result.blobKey).toBeTruthy()
    const [uploadPath] = storageMock.upload.mock.calls[0]!
    expect(uploadPath).toContain('job-abc')
  })

  it('should process EvaluationReport (pdf) and upload a file', async () => {
    const job = makeJob({
      type: 'EvaluationReport',
      cycleId: 'cycle-1',
      format: 'pdf',
      requestedBy: 'user-1',
    })
    const result = await processExportJob(job, storageMock)
    expect(result.blobKey).toBeTruthy()
  })

  it('should process AuditLog and upload a file', async () => {
    const job = makeJob({ type: 'AuditLog', filter: {}, requestedBy: 'user-1' })
    const result = await processExportJob(job, storageMock)
    expect(result.blobKey).toBeTruthy()
  })

  it('should throw for unknown export type', async () => {
    const job = makeJob({ type: 'UnknownType', requestedBy: 'user-1' })
    await expect(processExportJob(job, storageMock)).rejects.toThrow()
  })

  it('should include jobId in the upload path', async () => {
    const job = makeJob({ type: 'OrganizationCsv', requestedBy: 'user-1' })
    await processExportJob(job, storageMock)
    const [uploadPath] = storageMock.upload.mock.calls[0]!
    expect(uploadPath).toContain('job-abc')
  })

  it('should process EvaluationReport (csv) and upload a .csv file', async () => {
    const job = makeJob({
      type: 'EvaluationReport',
      cycleId: 'cycle-1',
      format: 'csv',
      requestedBy: 'user-1',
    })
    const result = await processExportJob(job, storageMock)
    expect(result.blobKey).toBeTruthy()
    const [uploadPath] = storageMock.upload.mock.calls[0]!
    expect(uploadPath).toMatch(/\.csv$/)
  })

  it('should process DashboardReport (pdf) and upload a file', async () => {
    const job = makeJob({
      type: 'DashboardReport',
      format: 'pdf',
      cycleId: 'cycle-1',
      departmentIds: ['dept-1'],
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-03-31T23:59:59.999Z',
    })
    const result = await processExportJob(job, storageMock)
    expect(result.blobKey).toBeTruthy()
    const [uploadPath] = storageMock.upload.mock.calls[0]!
    expect(uploadPath).toMatch(/\.pdf$/)
  })

  it('should use "unknown" as fallback when job.id is undefined', async () => {
    const job = { id: undefined, data: { type: 'OrganizationCsv' } } as unknown as Parameters<
      typeof processExportJob
    >[0]
    const result = await processExportJob(job, storageMock)
    expect(result.blobKey).toBeTruthy()
    const [uploadPath] = storageMock.upload.mock.calls[0]!
    expect(uploadPath).toContain('unknown')
  })
})
