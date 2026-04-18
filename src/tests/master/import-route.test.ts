/**
 * Issue #26: POST /api/masters/[resource]/import ルートハンドラのテスト
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import type { ImportJob } from '@/lib/import/import-job'

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

const { POST, setImportJobForTesting, clearImportJobForTesting } =
  await import('@/app/api/masters/[resource]/import/route')

// ─────────────────────────────────────────────────────────────────────────────
// ヘルパー
// ─────────────────────────────────────────────────────────────────────────────

function makeFormRequest(csv: string, filename = 'skills.csv'): NextRequest {
  const form = new FormData()
  form.set('file', new File([csv], filename, { type: 'text/csv' }))
  return new NextRequest('http://localhost/api/masters/skill/import', {
    method: 'POST',
    body: form,
  })
}

function makeEmptyMultipartRequest(): NextRequest {
  const form = new FormData()
  return new NextRequest('http://localhost/api/masters/skill/import', {
    method: 'POST',
    body: form,
  })
}

function makeImportJobMock(overrides?: Partial<ImportJob>): ImportJob {
  return {
    enqueue: vi.fn().mockResolvedValue({ jobId: 'job-abc' }),
    getStatus: vi.fn().mockResolvedValue(null),
    getResult: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as unknown as ImportJob
}

function paramsOf(resource: string): { params: Promise<{ resource: string }> } {
  return { params: Promise.resolve({ resource }) }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  clearImportJobForTesting()
})

describe('POST /api/masters/[resource]/import', () => {
  it('skill リソースで正常ジョブ投入', async () => {
    const job = makeImportJobMock()
    setImportJobForTesting(job)

    const req = makeFormRequest('name,category,description\nTypeScript,programming,desc\n')
    const res = await POST(req, paramsOf('skill'))
    expect(res.status).toBe(202)
    const body = (await res.json()) as { jobId: string }
    expect(body.jobId).toBe('job-abc')

    expect(job.enqueue).toHaveBeenCalledOnce()
    const call = vi.mocked(job.enqueue).mock.calls[0]
    expect(call?.[0]).toMatchObject({ type: 'MasterCsv', resource: 'skill' })
    const sent = call?.[0] as { csvContent?: string } | undefined
    expect(sent?.csvContent).toContain('TypeScript')
  })

  it('resource が不正な場合 400 を返す', async () => {
    setImportJobForTesting(makeImportJobMock())
    const req = makeFormRequest('name,category,description\n')
    const res = await POST(req, paramsOf('unknown'))
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('Invalid resource')
  })

  it('file フィールドが無い場合 422 を返す', async () => {
    setImportJobForTesting(makeImportJobMock())
    const req = makeEmptyMultipartRequest()
    const res = await POST(req, paramsOf('skill'))
    expect(res.status).toBe(422)
  })

  it('空のファイルは 422 を返す', async () => {
    setImportJobForTesting(makeImportJobMock())
    const req = makeFormRequest('')
    const res = await POST(req, paramsOf('skill'))
    expect(res.status).toBe(422)
  })

  it('サービス未初期化は 503', async () => {
    // setImportJobForTesting を呼ばないまま
    const req = makeFormRequest('name,category,description\nTS,programming,\n')
    const res = await POST(req, paramsOf('skill'))
    expect(res.status).toBe(503)
  })

  it('enqueue が失敗した場合 500', async () => {
    setImportJobForTesting(
      makeImportJobMock({
        enqueue: vi.fn().mockRejectedValue(new Error('redis down')),
      }),
    )
    const req = makeFormRequest('name,category,description\nTS,programming,\n')
    const res = await POST(req, paramsOf('skill'))
    expect(res.status).toBe(500)
  })

  it('role / grade リソースも受け付ける', async () => {
    const job = makeImportJobMock()
    setImportJobForTesting(job)

    const req1 = makeFormRequest('name,gradeId,skillIds,requiredLevels\n')
    const res1 = await POST(req1, paramsOf('role'))
    expect(res1.status).toBe(202)

    const req2 = makeFormRequest('label,performanceWeight,goalWeight,feedbackWeight\n')
    const res2 = await POST(req2, paramsOf('grade'))
    expect(res2.status).toBe(202)

    expect(job.enqueue).toHaveBeenCalledTimes(2)
  })
})
