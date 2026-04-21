import { describe, expect, it } from 'vitest'

import {
  createInMemorySecurityEventRepository,
  createSecurityMonitoringService,
  type SecurityEvent,
} from '@/lib/monitoring/security-monitoring-service'

function makeEvent(overrides: Partial<SecurityEvent> = {}): SecurityEvent {
  return {
    type: 'AUTH_FAILURE',
    occurredAt: new Date('2026-04-21T07:00:00.000Z'),
    ipAddress: '192.0.2.10',
    userId: 'user-1',
    requestId: 'req-1',
    metadata: null,
    ...overrides,
  }
}

describe('SecurityMonitoringService', () => {
  it('raises an alert when the threshold is reached inside the window', async () => {
    const repository = createInMemorySecurityEventRepository()
    const service = createSecurityMonitoringService({
      repository,
      thresholds: {
        AUTH_FAILURE: 3,
        ACCESS_DENIED: 5,
        RATE_LIMITED: 4,
      },
      windowMs: 15 * 60 * 1000,
    })

    await service.record(makeEvent({ requestId: 'req-1' }))
    await service.record(makeEvent({ requestId: 'req-2' }))
    const alerts = await service.record(makeEvent({ requestId: 'req-3' }))

    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({
      type: 'AUTH_FAILURE',
      count: 3,
      threshold: 3,
    })
  })

  it('summarizes counts by event type for a requested period', async () => {
    const repository = createInMemorySecurityEventRepository({
      events: [
        makeEvent({ type: 'AUTH_FAILURE', requestId: 'req-1' }),
        makeEvent({ type: 'ACCESS_DENIED', requestId: 'req-2' }),
        makeEvent({ type: 'ACCESS_DENIED', requestId: 'req-3' }),
        makeEvent({ type: 'RATE_LIMITED', requestId: 'req-4' }),
      ],
    })
    const service = createSecurityMonitoringService({ repository })

    const summary = await service.getSummary({
      from: new Date('2026-04-21T00:00:00.000Z'),
      to: new Date('2026-04-21T23:59:59.999Z'),
    })

    expect(summary.countsByType).toEqual({
      AUTH_FAILURE: 1,
      ACCESS_DENIED: 2,
      RATE_LIMITED: 1,
    })
    expect(summary.totalCount).toBe(4)
  })
})
