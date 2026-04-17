/**
 * Task 6.2 / Req 1.3: LockoutNotifier の単体テスト
 *
 * NotificationEmitter 互換 port を経由して SYSTEM カテゴリの通知が送られることを検証する。
 */
import { describe, expect, it, vi } from 'vitest'
import {
  createNotificationEmitterLockoutNotifier,
  type LockoutNotifierEmitterPort,
} from '@/lib/auth/lockout-notifier'

type EmittedEvent = Parameters<LockoutNotifierEmitterPort['emit']>[0]

function createMockEmitter(): LockoutNotifierEmitterPort & {
  readonly calls: EmittedEvent[]
} {
  const calls: EmittedEvent[] = []
  return {
    emit: vi.fn(async (event: EmittedEvent) => {
      calls.push(event)
    }),
    get calls(): EmittedEvent[] {
      return calls
    },
  }
}

function eventAt(calls: readonly EmittedEvent[], index: number): EmittedEvent {
  const event = calls[index]
  if (!event) throw new Error(`no emitted event at index ${index}`)
  return event
}

describe('createNotificationEmitterLockoutNotifier', () => {
  it('emit が category=SYSTEM / userId / payload.lockedUntil(ISO) を持つイベントで呼ばれる', async () => {
    const emitter = createMockEmitter()
    const notifier = createNotificationEmitterLockoutNotifier({ emitter })

    const lockedUntil = new Date('2026-04-17T00:15:00.000Z')
    await notifier.notifyLocked({
      userId: 'user-42',
      email: 'alice@example.com',
      lockedUntil,
    })

    expect(emitter.calls).toHaveLength(1)
    const event = eventAt(emitter.calls, 0)
    expect(event.userId).toBe('user-42')
    expect(event.category).toBe('SYSTEM')
    expect(event.title).toBe('アカウントがロックされました')
    expect(event.body).toContain('2026-04-17T00:15:00.000Z')
    expect(event.payload).toBeDefined()
    expect(event.payload?.email).toBe('alice@example.com')
    expect(event.payload?.lockedUntil).toBe(lockedUntil.toISOString())
  })

  it('複数回呼び出すと emit も複数回呼ばれる', async () => {
    const emitter = createMockEmitter()
    const notifier = createNotificationEmitterLockoutNotifier({ emitter })

    await notifier.notifyLocked({
      userId: 'user-a',
      email: 'a@example.com',
      lockedUntil: new Date('2026-04-17T00:15:00.000Z'),
    })
    await notifier.notifyLocked({
      userId: 'user-b',
      email: 'b@example.com',
      lockedUntil: new Date('2026-04-17T01:00:00.000Z'),
    })

    expect(emitter.calls).toHaveLength(2)
    expect(eventAt(emitter.calls, 0).userId).toBe('user-a')
    expect(eventAt(emitter.calls, 1).userId).toBe('user-b')
  })

  it('body には日本語の定型文と解除予定 ISO が含まれる', async () => {
    const emitter = createMockEmitter()
    const notifier = createNotificationEmitterLockoutNotifier({ emitter })
    const lockedUntil = new Date('2026-04-17T12:34:56.000Z')

    await notifier.notifyLocked({
      userId: 'user-1',
      email: 'bob@example.com',
      lockedUntil,
    })

    const event = eventAt(emitter.calls, 0)
    expect(event.body).toContain('連続ログイン失敗により')
    expect(event.body).toContain('15 分間ロック')
    expect(event.body).toContain(lockedUntil.toISOString())
  })
})
