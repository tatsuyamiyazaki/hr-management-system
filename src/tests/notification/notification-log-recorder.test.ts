import { describe, it, expect, beforeEach } from 'vitest'
import { createInMemoryLogRecorder } from '@/lib/notification/notification-log-recorder'
import type { NotificationLogEntry } from '@/lib/notification/notification-log-recorder'

// ─────────────────────────────────────────────────────────────────────────────
// ヘルパー
// ─────────────────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<NotificationLogEntry> = {}): NotificationLogEntry {
  return {
    userId: 'user-1',
    category: 'SYSTEM',
    channel: 'EMAIL',
    subject: 'テスト件名',
    status: 'SENT',
    attempts: 1,
    errorDetail: null,
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('createInMemoryLogRecorder()', () => {
  let recorder: ReturnType<typeof createInMemoryLogRecorder>

  beforeEach(() => {
    recorder = createInMemoryLogRecorder()
  })

  it('should start with an empty entries list', () => {
    expect(recorder.entries).toEqual([])
  })

  it('should record a SENT entry', async () => {
    await recorder.record(makeEntry())
    expect(recorder.entries).toHaveLength(1)
    expect(recorder.entries[0]?.status).toBe('SENT')
  })

  it('should record multiple entries in order', async () => {
    await recorder.record(makeEntry({ status: 'RETRYING', attempts: 1 }))
    await recorder.record(makeEntry({ status: 'SENT', attempts: 2 }))
    expect(recorder.entries).toHaveLength(2)
    expect(recorder.entries[0]?.status).toBe('RETRYING')
    expect(recorder.entries[1]?.status).toBe('SENT')
  })

  it('should stamp recordedAt automatically when omitted', async () => {
    await recorder.record(makeEntry())
    const entry = recorder.entries[0]
    expect(entry?.recordedAt).toBeDefined()
    // ISO8601 な形を確認
    expect(entry?.recordedAt).toMatch(/\d{4}-\d{2}-\d{2}T/)
  })

  it('should preserve caller-provided recordedAt when present', async () => {
    const fixed = '2026-04-17T00:00:00.000Z'
    await recorder.record(makeEntry({ recordedAt: fixed }))
    expect(recorder.entries[0]?.recordedAt).toBe(fixed)
  })

  it('should return a defensive copy from entries getter', async () => {
    await recorder.record(makeEntry())
    const snapshot = recorder.entries
    // 参照を mutate しても内部 store に影響しないこと
    ;(snapshot as NotificationLogEntry[]).pop()
    expect(recorder.entries).toHaveLength(1)
  })

  it('should record FAILED entry with errorDetail', async () => {
    await recorder.record(
      makeEntry({ status: 'FAILED', attempts: 3, errorDetail: 'SMTP timeout' }),
    )
    const entry = recorder.entries[0]
    expect(entry?.status).toBe('FAILED')
    expect(entry?.errorDetail).toBe('SMTP timeout')
    expect(entry?.attempts).toBe(3)
  })

  it('should record entries for each category independently', async () => {
    await recorder.record(makeEntry({ category: 'EVAL_INVITATION' }))
    await recorder.record(makeEntry({ category: 'FEEDBACK_PUBLISHED' }))
    expect(recorder.entries.map((e) => e.category)).toEqual([
      'EVAL_INVITATION',
      'FEEDBACK_PUBLISHED',
    ])
  })
})
