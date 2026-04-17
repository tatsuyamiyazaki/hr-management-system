import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Job, Worker } from 'bullmq'
import {
  processEmailJob,
  attachFinalFailureLogging,
} from '@/lib/notification/email-worker'
import type { EmailWorkerDeps } from '@/lib/notification/email-worker'
import type { EmailSender } from '@/lib/notification/email-sender'
import { createInMemoryLogRecorder } from '@/lib/notification/notification-log-recorder'

// ─────────────────────────────────────────────────────────────────────────────
// 外部依存のモック
// ─────────────────────────────────────────────────────────────────────────────

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

function makeJob(data: Record<string, unknown>, overrides: Partial<Job> = {}): Job {
  return {
    id: 'job-1',
    data,
    attemptsMade: 0,
    ...overrides,
  } as unknown as Job
}

function makeDeps(sender?: EmailSender): EmailWorkerDeps & {
  recorder: ReturnType<typeof createInMemoryLogRecorder>
  sendMock: ReturnType<typeof vi.fn>
} {
  const sendMock = vi.fn().mockResolvedValue(undefined)
  const resolvedSender: EmailSender = sender ?? { send: sendMock }
  const recorder = createInMemoryLogRecorder()
  return { sender: resolvedSender, recorder, sendMock }
}

function validPayload() {
  return {
    to: 'user@example.com',
    subject: '評価依頼',
    body: '評価を開始してください',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests: processEmailJob
// ─────────────────────────────────────────────────────────────────────────────

describe('processEmailJob()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should call EmailSender.send with rendered HTML on valid payload', async () => {
    const deps = makeDeps()
    const job = makeJob(validPayload())

    await processEmailJob(job, deps)

    expect(deps.sendMock).toHaveBeenCalledOnce()
    const arg = deps.sendMock.mock.calls[0]?.[0] as {
      to: string
      subject: string
      html: string
    }
    expect(arg.to).toBe('user@example.com')
    expect(arg.subject).toBe('評価依頼')
    expect(arg.html).toContain('<html')
    expect(arg.html).toContain('評価依頼')
  })

  it('should record SENT log entry on success', async () => {
    const deps = makeDeps()
    const job = makeJob(validPayload())

    await processEmailJob(job, deps)

    expect(deps.recorder.entries).toHaveLength(1)
    const entry = deps.recorder.entries[0]
    expect(entry?.status).toBe('SENT')
    expect(entry?.channel).toBe('EMAIL')
    expect(entry?.subject).toBe('評価依頼')
    expect(entry?.errorDetail).toBeNull()
    expect(entry?.attempts).toBe(1)
  })

  it('should throw when EmailSender.send rejects', async () => {
    const failingSender: EmailSender = {
      send: vi.fn().mockRejectedValue(new Error('SMTP unreachable')),
    }
    const deps = makeDeps(failingSender)
    const job = makeJob(validPayload())

    await expect(processEmailJob(job, deps)).rejects.toThrow(/SMTP unreachable/)
  })

  it('should record RETRYING log entry on non-final failure', async () => {
    const failingSender: EmailSender = {
      send: vi.fn().mockRejectedValue(new Error('temporary glitch')),
    }
    const deps = makeDeps(failingSender)
    // attemptsMade=0 -> attempts=1 < 3 (not final)
    const job = makeJob(validPayload(), { attemptsMade: 0 } as Partial<Job>)

    await expect(processEmailJob(job, deps)).rejects.toThrow(/temporary glitch/)

    expect(deps.recorder.entries).toHaveLength(1)
    const entry = deps.recorder.entries[0]
    expect(entry?.status).toBe('RETRYING')
    expect(entry?.errorDetail).toContain('temporary glitch')
  })

  it('should not record RETRYING on final attempt (defer FAILED to worker event)', async () => {
    const failingSender: EmailSender = {
      send: vi.fn().mockRejectedValue(new Error('final failure')),
    }
    const deps = makeDeps(failingSender)
    // attemptsMade=2 -> attempts=3 which is MAX_ATTEMPTS
    const job = makeJob(validPayload(), { attemptsMade: 2 } as Partial<Job>)

    await expect(processEmailJob(job, deps)).rejects.toThrow(/final failure/)

    expect(deps.recorder.entries).toHaveLength(0)
  })

  it('should throw validation error for invalid payload (missing subject)', async () => {
    const deps = makeDeps()
    const job = makeJob({ to: 'user@example.com', body: 'hello' })
    await expect(processEmailJob(job, deps)).rejects.toThrow(/invalid payload/)
    expect(deps.sendMock).not.toHaveBeenCalled()
  })

  it('should throw validation error for invalid email address', async () => {
    const deps = makeDeps()
    const job = makeJob({ to: 'not-an-email', subject: 'S', body: 'B' })
    await expect(processEmailJob(job, deps)).rejects.toThrow(/invalid payload/)
  })

  it('should throw validation error for empty body', async () => {
    const deps = makeDeps()
    const job = makeJob({ to: 'user@example.com', subject: 'S', body: '' })
    await expect(processEmailJob(job, deps)).rejects.toThrow(/invalid payload/)
  })

  it('should use extended userId/category fields when present in payload', async () => {
    const deps = makeDeps()
    const job = makeJob({
      ...validPayload(),
      userId: 'user-42',
      category: 'EVAL_INVITATION',
    })

    await processEmailJob(job, deps)

    const entry = deps.recorder.entries[0]
    expect(entry?.userId).toBe('user-42')
    expect(entry?.category).toBe('EVAL_INVITATION')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Tests: attachFinalFailureLogging (worker 'failed' イベントフック)
// ─────────────────────────────────────────────────────────────────────────────

describe('attachFinalFailureLogging()', () => {
  type FailedHandler = (job: Job | undefined, err: Error) => void

  function makeWorkerStub(): {
    worker: Worker
    fire: (job: Job | undefined, err: Error) => void
  } {
    let handler: FailedHandler | null = null
    const worker = {
      on: vi.fn((event: string, h: FailedHandler) => {
        if (event === 'failed') handler = h
      }),
    } as unknown as Worker
    return {
      worker,
      fire: (job, err) => {
        if (handler) handler(job, err)
      },
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should record FAILED entry when attemptsMade >= MAX_ATTEMPTS', async () => {
    const recorder = createInMemoryLogRecorder()
    const { worker, fire } = makeWorkerStub()
    attachFinalFailureLogging(worker, recorder)

    const job = makeJob(validPayload(), { attemptsMade: 3 } as Partial<Job>)
    fire(job, new Error('SMTP permanent failure'))

    // record() は非同期のため Promise flush
    await new Promise((r) => setImmediate(r))

    expect(recorder.entries).toHaveLength(1)
    const entry = recorder.entries[0]
    expect(entry?.status).toBe('FAILED')
    expect(entry?.errorDetail).toContain('SMTP permanent failure')
    expect(entry?.attempts).toBe(3)
  })

  it('should not record when attemptsMade < MAX_ATTEMPTS', async () => {
    const recorder = createInMemoryLogRecorder()
    const { worker, fire } = makeWorkerStub()
    attachFinalFailureLogging(worker, recorder)

    const job = makeJob(validPayload(), { attemptsMade: 1 } as Partial<Job>)
    fire(job, new Error('retry'))

    await new Promise((r) => setImmediate(r))
    expect(recorder.entries).toHaveLength(0)
  })

  it('should ignore undefined job', async () => {
    const recorder = createInMemoryLogRecorder()
    const { worker, fire } = makeWorkerStub()
    attachFinalFailureLogging(worker, recorder)

    fire(undefined, new Error('no job'))
    await new Promise((r) => setImmediate(r))
    expect(recorder.entries).toHaveLength(0)
  })

  it('should skip logging when payload is invalid', async () => {
    const recorder = createInMemoryLogRecorder()
    const { worker, fire } = makeWorkerStub()
    attachFinalFailureLogging(worker, recorder)

    const job = makeJob({ invalid: 'shape' }, { attemptsMade: 3 } as Partial<Job>)
    fire(job, new Error('validation'))

    await new Promise((r) => setImmediate(r))
    expect(recorder.entries).toHaveLength(0)
  })
})
