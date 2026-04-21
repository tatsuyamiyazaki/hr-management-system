import { describe, expect, it, vi } from 'vitest'

import {
  createStructuredLogger,
  type StructuredLogEntry,
  type SentryPort,
} from '@/lib/monitoring/structured-logger'

describe('createStructuredLogger()', () => {
  it('writes structured entries to the sink with stable fields', async () => {
    const sink = vi.fn(async (_entry: StructuredLogEntry) => {})
    const logger = createStructuredLogger({
      sink,
      clock: () => new Date('2026-04-21T07:00:00.000Z'),
    })

    await logger.info('api.request.completed', 'request finished', {
      requestId: 'req-1',
      path: '/api/dashboard/kpi',
      statusCode: 200,
    })

    expect(sink).toHaveBeenCalledTimes(1)
    expect(sink).toHaveBeenCalledWith({
      timestamp: '2026-04-21T07:00:00.000Z',
      level: 'info',
      event: 'api.request.completed',
      message: 'request finished',
      context: {
        requestId: 'req-1',
        path: '/api/dashboard/kpi',
        statusCode: 200,
      },
    })
  })

  it('forwards exceptions to the sentry port on error logs', async () => {
    const sink = vi.fn(async (_entry: StructuredLogEntry) => {})
    const sentry: SentryPort = {
      captureException: vi.fn(async () => {}),
    }
    const logger = createStructuredLogger({
      sink,
      sentry,
      clock: () => new Date('2026-04-21T07:00:00.000Z'),
    })
    const error = new Error('database unavailable')

    await logger.error(
      'access-log.persist_failed',
      'failed to persist access log',
      {
        requestId: 'req-2',
        path: '/api/auth/login',
      },
      error,
    )

    expect(sink).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'error',
        event: 'access-log.persist_failed',
        message: 'failed to persist access log',
        context: {
          requestId: 'req-2',
          path: '/api/auth/login',
        },
        error: {
          name: 'Error',
          message: 'database unavailable',
          stack: expect.any(String),
        },
      }),
    )
    expect(sentry.captureException).toHaveBeenCalledWith(error, {
      event: 'access-log.persist_failed',
      requestId: 'req-2',
      path: '/api/auth/login',
    })
  })
})
