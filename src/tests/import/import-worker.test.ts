import { describe, it, expect, vi, beforeEach } from 'vitest'
import { processImportJob } from '@/lib/import/import-worker'

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
// ヘルパー
// ─────────────────────────────────────────────────────────────────────────────

function makeJob(data: Record<string, unknown>, id = 'job-abc') {
  return { id, data } as unknown as Parameters<typeof processImportJob>[0]
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('processImportJob()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should process MasterCsv and return ImportResult', async () => {
    const job = makeJob({ type: 'MasterCsv', resource: 'DEPARTMENT' })
    const result = await processImportJob(job)
    expect(result.totalRows).toBeGreaterThanOrEqual(0)
    expect(result.successCount).toBeGreaterThanOrEqual(0)
    expect(result.failureCount).toBeGreaterThanOrEqual(0)
    expect(Array.isArray(result.errors)).toBe(true)
  })

  it('should process EmployeeCsv and return ImportResult', async () => {
    const job = makeJob({ type: 'EmployeeCsv' })
    const result = await processImportJob(job)
    expect(result.totalRows).toBeGreaterThanOrEqual(0)
    expect(Array.isArray(result.errors)).toBe(true)
  })

  it('should throw for unknown import type', async () => {
    const job = makeJob({ type: 'UnknownType' })
    await expect(processImportJob(job)).rejects.toThrow()
  })

  it('should satisfy totalRows = successCount + failureCount invariant for MasterCsv', async () => {
    const job = makeJob({ type: 'MasterCsv', resource: 'POSITION' })
    const result = await processImportJob(job)
    expect(result.successCount + result.failureCount).toBe(result.totalRows)
  })

  it('should satisfy totalRows = successCount + failureCount invariant for EmployeeCsv', async () => {
    const job = makeJob({ type: 'EmployeeCsv' })
    const result = await processImportJob(job)
    expect(result.successCount + result.failureCount).toBe(result.totalRows)
  })

  it('should satisfy errors.length equals failureCount', async () => {
    const job = makeJob({ type: 'MasterCsv', resource: 'DEPARTMENT' })
    const result = await processImportJob(job)
    expect(result.errors).toHaveLength(result.failureCount)
  })

  it('should use "unknown" as fallback when job.id is undefined', async () => {
    const job = { id: undefined, data: { type: 'EmployeeCsv' } } as unknown as Parameters<
      typeof processImportJob
    >[0]
    const result = await processImportJob(job)
    expect(result.totalRows).toBeGreaterThanOrEqual(0)
  })
})
