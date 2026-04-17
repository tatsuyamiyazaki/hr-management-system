import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createNotificationEmitterAlertNotifier,
  type AlertNotificationEmitterPort,
} from '@/lib/ai-monitoring/ai-alert-notifier'

interface EmitterMock extends AlertNotificationEmitterPort {
  emit: ReturnType<typeof vi.fn>
}

function makeEmitterMock(): EmitterMock {
  return {
    emit: vi.fn().mockResolvedValue(undefined),
  }
}

describe('createNotificationEmitterAlertNotifier', () => {
  let emitter: EmitterMock

  beforeEach(() => {
    emitter = makeEmitterMock()
  })

  it('emits to every ADMIN user', async () => {
    const notifier = createNotificationEmitterAlertNotifier({
      emitter,
      adminUserIdsProvider: async () => ['admin-1', 'admin-2', 'admin-3'],
    })

    await notifier.notify({
      yearMonth: '2026-04',
      level: 'WARN',
      currentCostUsd: 80,
      budgetUsd: 100,
      utilizationPct: 80,
    })

    expect(emitter.emit).toHaveBeenCalledTimes(3)
    const userIds = emitter.emit.mock.calls.map((c) => c[0].userId).sort()
    expect(userIds).toEqual(['admin-1', 'admin-2', 'admin-3'])
  })

  it('is idempotent for the same (yearMonth, level) pair', async () => {
    const notifier = createNotificationEmitterAlertNotifier({
      emitter,
      adminUserIdsProvider: async () => ['admin-1'],
    })

    await notifier.notify({
      yearMonth: '2026-04',
      level: 'WARN',
      currentCostUsd: 80,
      budgetUsd: 100,
      utilizationPct: 80,
    })
    await notifier.notify({
      yearMonth: '2026-04',
      level: 'WARN',
      currentCostUsd: 85,
      budgetUsd: 100,
      utilizationPct: 85,
    })

    expect(emitter.emit).toHaveBeenCalledTimes(1)
  })

  it('does NOT dedupe across different levels', async () => {
    const notifier = createNotificationEmitterAlertNotifier({
      emitter,
      adminUserIdsProvider: async () => ['admin-1'],
    })

    await notifier.notify({
      yearMonth: '2026-04',
      level: 'WARN',
      currentCostUsd: 80,
      budgetUsd: 100,
      utilizationPct: 80,
    })
    await notifier.notify({
      yearMonth: '2026-04',
      level: 'CRITICAL',
      currentCostUsd: 100,
      budgetUsd: 100,
      utilizationPct: 100,
    })

    expect(emitter.emit).toHaveBeenCalledTimes(2)
  })

  it('does NOT dedupe across different yearMonths', async () => {
    const notifier = createNotificationEmitterAlertNotifier({
      emitter,
      adminUserIdsProvider: async () => ['admin-1'],
    })

    await notifier.notify({
      yearMonth: '2026-04',
      level: 'WARN',
      currentCostUsd: 80,
      budgetUsd: 100,
      utilizationPct: 80,
    })
    await notifier.notify({
      yearMonth: '2026-05',
      level: 'WARN',
      currentCostUsd: 85,
      budgetUsd: 100,
      utilizationPct: 85,
    })

    expect(emitter.emit).toHaveBeenCalledTimes(2)
  })

  it('uses different titles for WARN and CRITICAL', async () => {
    const notifier = createNotificationEmitterAlertNotifier({
      emitter,
      adminUserIdsProvider: async () => ['admin-1'],
    })

    await notifier.notify({
      yearMonth: '2026-04',
      level: 'WARN',
      currentCostUsd: 80,
      budgetUsd: 100,
      utilizationPct: 80,
    })
    await notifier.notify({
      yearMonth: '2026-04',
      level: 'CRITICAL',
      currentCostUsd: 100,
      budgetUsd: 100,
      utilizationPct: 100,
    })

    const titles = emitter.emit.mock.calls.map((c) => c[0].title as string)
    expect(titles[0]).toContain('WARN')
    expect(titles[1]).toContain('CRITICAL')
    expect(titles[0]).not.toEqual(titles[1])
  })

  it('uses different bodies for WARN and CRITICAL', async () => {
    const notifier = createNotificationEmitterAlertNotifier({
      emitter,
      adminUserIdsProvider: async () => ['admin-1'],
    })

    await notifier.notify({
      yearMonth: '2026-04',
      level: 'WARN',
      currentCostUsd: 80,
      budgetUsd: 100,
      utilizationPct: 80,
    })
    await notifier.notify({
      yearMonth: '2026-04',
      level: 'CRITICAL',
      currentCostUsd: 100,
      budgetUsd: 100,
      utilizationPct: 100,
    })

    const calls = emitter.emit.mock.calls
    const warnCall = calls[0]
    const critCall = calls[1]
    if (!warnCall || !critCall) throw new Error('expected 2 emit calls')
    expect(warnCall[0].body).not.toEqual(critCall[0].body)
    // CRITICAL body should mention the auto-disable behavior.
    expect(critCall[0].body).toContain('一時停止')
  })

  it('emits SYSTEM category with numeric payload', async () => {
    const notifier = createNotificationEmitterAlertNotifier({
      emitter,
      adminUserIdsProvider: async () => ['admin-1'],
    })

    await notifier.notify({
      yearMonth: '2026-04',
      level: 'CRITICAL',
      currentCostUsd: 100,
      budgetUsd: 100,
      utilizationPct: 100,
    })

    expect(emitter.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-1',
        category: 'SYSTEM',
        payload: expect.objectContaining({
          yearMonth: '2026-04',
          level: 'CRITICAL',
          utilizationPct: 100,
        }),
      }),
    )
  })

  it('skips gracefully when there are no ADMIN users (but marks key as sent)', async () => {
    const notifier = createNotificationEmitterAlertNotifier({
      emitter,
      adminUserIdsProvider: async () => [],
    })

    await notifier.notify({
      yearMonth: '2026-04',
      level: 'WARN',
      currentCostUsd: 80,
      budgetUsd: 100,
      utilizationPct: 80,
    })
    // A second call for the same key should also skip (idempotent record).
    await notifier.notify({
      yearMonth: '2026-04',
      level: 'WARN',
      currentCostUsd: 80,
      budgetUsd: 100,
      utilizationPct: 80,
    })
    expect(emitter.emit).not.toHaveBeenCalled()
  })

  it('allows retry when all ADMIN emits fail (no key persisted)', async () => {
    emitter.emit.mockRejectedValue(new Error('boom'))
    const notifier = createNotificationEmitterAlertNotifier({
      emitter,
      adminUserIdsProvider: async () => ['admin-1'],
    })

    await notifier.notify({
      yearMonth: '2026-04',
      level: 'WARN',
      currentCostUsd: 80,
      budgetUsd: 100,
      utilizationPct: 80,
    })
    // Since all emits failed, the next call should retry.
    await notifier.notify({
      yearMonth: '2026-04',
      level: 'WARN',
      currentCostUsd: 80,
      budgetUsd: 100,
      utilizationPct: 80,
    })

    expect(emitter.emit).toHaveBeenCalledTimes(2)
  })

  it('respects an external sentRecord to seed state', async () => {
    const externalRecord = new Set<string>(['2026-04:WARN'])
    const notifier = createNotificationEmitterAlertNotifier({
      emitter,
      adminUserIdsProvider: async () => ['admin-1'],
      sentRecord: externalRecord,
    })

    await notifier.notify({
      yearMonth: '2026-04',
      level: 'WARN',
      currentCostUsd: 80,
      budgetUsd: 100,
      utilizationPct: 80,
    })

    expect(emitter.emit).not.toHaveBeenCalled()
  })
})
