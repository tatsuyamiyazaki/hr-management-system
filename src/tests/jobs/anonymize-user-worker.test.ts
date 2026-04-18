/**
 * Issue #31 / Req 14.7: anonymize-user ワーカーの単体テスト
 *
 * - ペイロード検証
 * - AnonymizationService.anonymizeUser の呼び出し検証
 * - 不正ペイロードのエラーハンドリング
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { processAnonymizeUserJob } from '@/lib/jobs/anonymize-user-worker'
import type { AnonymizationService } from '@/lib/lifecycle/anonymization-service'
import type { Job } from 'bullmq'

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeJob(data: unknown, id = 'job-1'): Job {
  return { id, data, name: 'anonymize-user' } as unknown as Job
}

function makeMockService(): AnonymizationService {
  return {
    anonymizeUser: vi.fn().mockResolvedValue(undefined),
    anonymizeExpiredRetirees: vi.fn().mockResolvedValue({
      processedCount: 0,
      skippedCount: 0,
      errors: [],
    }),
    handleDeletionRequest: vi.fn().mockResolvedValue({
      userId: '',
      requestedBy: '',
      deletableFields: [],
      retentionFields: [],
      canExecuteImmediately: false,
      executedAt: null,
    }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
// processAnonymizeUserJob
// ─────────────────────────────────────────────────────────────────────────────

describe('processAnonymizeUserJob', () => {
  it('有効なペイロードで AnonymizationService.anonymizeUser が呼ばれる', async () => {
    const service = makeMockService()
    const job = makeJob({ userId: 'u1', requestedBy: 'admin-1' })

    const result = await processAnonymizeUserJob(job, service)

    expect(service.anonymizeUser).toHaveBeenCalledWith('u1', 'admin-1')
    expect(result.userId).toBe('u1')
    expect(result.anonymizedAt).toBeDefined()
  })

  it('不正なペイロード（userId 欠落）はエラーをスローする', async () => {
    const service = makeMockService()
    const job = makeJob({ requestedBy: 'admin-1' })

    await expect(processAnonymizeUserJob(job, service)).rejects.toThrow(
      'AnonymizeUserWorker: invalid payload',
    )
    expect(service.anonymizeUser).not.toHaveBeenCalled()
  })

  it('不正なペイロード（requestedBy 欠落）はエラーをスローする', async () => {
    const service = makeMockService()
    const job = makeJob({ userId: 'u1' })

    await expect(processAnonymizeUserJob(job, service)).rejects.toThrow(
      'AnonymizeUserWorker: invalid payload',
    )
    expect(service.anonymizeUser).not.toHaveBeenCalled()
  })

  it('空のペイロードはエラーをスローする', async () => {
    const service = makeMockService()
    const job = makeJob({})

    await expect(processAnonymizeUserJob(job, service)).rejects.toThrow(
      'AnonymizeUserWorker: invalid payload',
    )
  })

  it('null ペイロードはエラーをスローする', async () => {
    const service = makeMockService()
    const job = makeJob(null)

    await expect(processAnonymizeUserJob(job, service)).rejects.toThrow(
      'AnonymizeUserWorker: invalid payload',
    )
  })

  it('AnonymizationService がエラーを投げた場合はそのまま伝播する', async () => {
    const service = makeMockService()
    vi.mocked(service.anonymizeUser).mockRejectedValue(new Error('User not found'))
    const job = makeJob({ userId: 'u1', requestedBy: 'admin-1' })

    await expect(processAnonymizeUserJob(job, service)).rejects.toThrow('User not found')
  })

  it('userId が空文字の場合はバリデーションエラー', async () => {
    const service = makeMockService()
    const job = makeJob({ userId: '', requestedBy: 'admin-1' })

    await expect(processAnonymizeUserJob(job, service)).rejects.toThrow(
      'AnonymizeUserWorker: invalid payload',
    )
  })
})
