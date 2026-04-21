/**
 * Task 6.1: AuthService の単体テスト
 * Task 6.2 で拡張: ロックアウト / ロック通知 / 監査ログの検証を追加
 *
 * Req 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.11 相当の挙動を検証する。
 */
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { z } from 'zod'
import {
  createAuthService,
  type AuthAuditLoggerPort,
  type AuthService,
} from '@/lib/auth/auth-service'
import {
  AccountLockedError,
  InvalidCredentialsError,
  SessionExpiredError,
  SessionIdleTimeoutError,
  SessionNotFoundError,
} from '@/lib/auth/auth-types'
import type { LockoutNotifier } from '@/lib/auth/lockout-notifier'
import {
  LOCKOUT_DURATION_MS,
  MAX_FAILED_LOGIN_ATTEMPTS,
  createInMemoryLockoutStore,
  type LockoutStore,
} from '@/lib/auth/lockout-store'
import { createBcryptPasswordHasher } from '@/lib/auth/password-hasher'
import {
  SESSION_ABSOLUTE_TTL_MS,
  SESSION_IDLE_TTL_MS,
  createInMemorySessionStore,
} from '@/lib/auth/session-store'
import {
  createInMemoryAuthUserRepository,
  type AuthUserRecord,
  type AuthUserStatus,
} from '@/lib/auth/user-repository'
import type { SecurityEventRecorderPort } from '@/lib/monitoring/security-monitoring-service'
import { computeEmailHash } from '@/lib/shared/crypto'

const APP_SECRET = 'test-app-secret'
const VALID_PASSWORD = 'P@ssw0rd-valid'
const VALID_EMAIL = 'alice@example.com'

let validPasswordHash: string

beforeAll(async () => {
  const hasher = createBcryptPasswordHasher({ cost: 12 })
  validPasswordHash = await hasher.hash(VALID_PASSWORD)
})

async function buildUser(overrides?: Partial<AuthUserRecord>): Promise<AuthUserRecord> {
  const email = overrides?.email ?? VALID_EMAIL
  const emailHash = overrides?.emailHash ?? (await computeEmailHash(email, APP_SECRET))
  const status: AuthUserStatus = overrides?.status ?? 'ACTIVE'
  return {
    id: 'user-1',
    emailHash,
    email,
    passwordHash: overrides?.passwordHash ?? validPasswordHash,
    role: 'EMPLOYEE',
    status,
    ...overrides,
  }
}

interface HarnessOptions {
  readonly users?: readonly AuthUserRecord[]
  readonly now?: Date
  readonly sessionIds?: readonly string[]
}

function buildHarness(opts: HarnessOptions): AuthService {
  const ids = opts.sessionIds ?? ['sess-1', 'sess-2', 'sess-3']
  let i = 0
  return createAuthService({
    users: createInMemoryAuthUserRepository(opts.users ?? []),
    sessions: createInMemorySessionStore(),
    passwordHasher: createBcryptPasswordHasher({ cost: 12 }),
    appSecret: APP_SECRET,
    sessionIdFactory: () => {
      const next = ids[i]
      i += 1
      if (!next) throw new Error('ran out of session ids in test fixture')
      return next
    },
    clock: () => opts.now ?? new Date('2026-04-17T00:00:00.000Z'),
  })
}

describe('createAuthService.login', () => {
  it('正しい認証情報で Session を発行する (Req 1.1, 1.2)', async () => {
    const user = await buildUser()
    const now = new Date('2026-04-17T09:00:00.000Z')
    const service = buildHarness({ users: [user], now })

    const session = await service.login({ email: VALID_EMAIL, password: VALID_PASSWORD })

    expect(session.id).toBe('sess-1')
    expect(session.userId).toBe(user.id)
    expect(session.role).toBe('EMPLOYEE')
    expect(session.email).toBe(VALID_EMAIL)
    expect(session.createdAt.getTime()).toBe(now.getTime())
    expect(session.expiresAt.getTime()).toBe(now.getTime() + SESSION_ABSOLUTE_TTL_MS)
    expect(session.lastAccessAt.getTime()).toBe(now.getTime())
  })

  it('context から ipAddress / userAgent を保存する', async () => {
    const user = await buildUser()
    const service = buildHarness({ users: [user] })
    const session = await service.login(
      { email: VALID_EMAIL, password: VALID_PASSWORD },
      { ipAddress: '192.0.2.1', userAgent: 'test-agent/1.0' },
    )
    expect(session.ipAddress).toBe('192.0.2.1')
    expect(session.userAgent).toBe('test-agent/1.0')
  })

  it('存在しないメールは InvalidCredentialsError (ユーザー存在を漏らさない)', async () => {
    const service = buildHarness({ users: [] })
    await expect(
      service.login({ email: 'unknown@example.com', password: VALID_PASSWORD }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError)
  })

  it('誤ったパスワードは InvalidCredentialsError', async () => {
    const user = await buildUser()
    const service = buildHarness({ users: [user] })
    await expect(
      service.login({ email: VALID_EMAIL, password: 'wrong-password' }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError)
  })

  it('status=RESIGNED は InvalidCredentialsError で拒否', async () => {
    const resigned = await buildUser({ status: 'RESIGNED' })
    const service = buildHarness({ users: [resigned] })
    await expect(
      service.login({ email: VALID_EMAIL, password: VALID_PASSWORD }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError)
  })

  it('status=ON_LEAVE / PENDING_JOIN も InvalidCredentialsError', async () => {
    for (const status of ['ON_LEAVE', 'PENDING_JOIN'] as const) {
      const email = `${status.toLowerCase()}@example.com`
      const emailHash = await computeEmailHash(email, APP_SECRET)
      const user = await buildUser({
        status,
        email,
        emailHash,
        id: `user-${status}`,
      })
      const service = buildHarness({ users: [user] })
      await expect(service.login({ email, password: VALID_PASSWORD })).rejects.toBeInstanceOf(
        InvalidCredentialsError,
      )
    }
  })

  it('メール形式不正は ZodError (Zod バリデーション)', async () => {
    const service = buildHarness({ users: [] })
    await expect(
      service.login({ email: 'not-an-email', password: 'anything' }),
    ).rejects.toBeInstanceOf(z.ZodError)
  })

  it('password が空文字は ZodError', async () => {
    const service = buildHarness({ users: [] })
    await expect(service.login({ email: VALID_EMAIL, password: '' })).rejects.toBeInstanceOf(
      z.ZodError,
    )
  })

  it('appSecret 未指定は createAuthService で失敗', () => {
    expect(() =>
      createAuthService({
        users: createInMemoryAuthUserRepository(),
        sessions: createInMemorySessionStore(),
        passwordHasher: createBcryptPasswordHasher(),
        appSecret: '',
      }),
    ).toThrow(/appSecret must be a non-empty string/)
  })
})

describe('createAuthService.logout / getSession / touchSession', () => {
  it('logout でセッションが削除される (Req 1.6)', async () => {
    const user = await buildUser()
    const now = new Date('2026-04-17T00:00:00.000Z')
    const service = buildHarness({ users: [user], now })

    const session = await service.login({ email: VALID_EMAIL, password: VALID_PASSWORD })
    await service.logout(session.id)

    await expect(service.getSession(session.id, now)).rejects.toBeInstanceOf(SessionNotFoundError)
  })

  it('getSession は期限切れで SessionExpiredError (Req 1.4)', async () => {
    const user = await buildUser()
    const issueAt = new Date('2026-04-17T00:00:00.000Z')
    const service = buildHarness({ users: [user], now: issueAt })

    const session = await service.login({ email: VALID_EMAIL, password: VALID_PASSWORD })
    const expired = new Date(issueAt.getTime() + SESSION_ABSOLUTE_TTL_MS + 1000)
    await expect(service.getSession(session.id, expired)).rejects.toBeInstanceOf(
      SessionExpiredError,
    )
  })

  it('getSession は idle 超過で SessionIdleTimeoutError (Req 1.5)', async () => {
    const user = await buildUser()
    const issueAt = new Date('2026-04-17T00:00:00.000Z')
    const service = buildHarness({ users: [user], now: issueAt })
    const session = await service.login({ email: VALID_EMAIL, password: VALID_PASSWORD })

    const idled = new Date(issueAt.getTime() + SESSION_IDLE_TTL_MS + 1000)
    await expect(service.getSession(session.id, idled)).rejects.toBeInstanceOf(
      SessionIdleTimeoutError,
    )
  })

  it('touchSession は lastAccessAt を更新する', async () => {
    const user = await buildUser()
    const issueAt = new Date('2026-04-17T00:00:00.000Z')
    const service = buildHarness({ users: [user], now: issueAt })
    const session = await service.login({ email: VALID_EMAIL, password: VALID_PASSWORD })

    const later = new Date(issueAt.getTime() + 10 * 60 * 1000)
    const touched = await service.touchSession(session.id, later)
    expect(touched.lastAccessAt.getTime()).toBe(later.getTime())
    expect(touched.expiresAt.getTime()).toBe(session.expiresAt.getTime())
  })

  it('touchSession を繰り返せば idle タイマーがリセットされる', async () => {
    const user = await buildUser()
    const issueAt = new Date('2026-04-17T00:00:00.000Z')
    const service = buildHarness({ users: [user], now: issueAt })
    const session = await service.login({ email: VALID_EMAIL, password: VALID_PASSWORD })

    // 25 分 → idle 未超過 → touch
    const t1 = new Date(issueAt.getTime() + 25 * 60 * 1000)
    await service.touchSession(session.id, t1)

    // さらに 25 分 → 直前の touch から 25 分経過 → idle 未超過
    const t2 = new Date(t1.getTime() + 25 * 60 * 1000)
    await expect(service.touchSession(session.id, t2)).resolves.toBeDefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Task 6.2: Lockout + notification + audit log (Req 1.3)
// ─────────────────────────────────────────────────────────────────────────────

/** noUncheckedIndexedAccess 下でも安全に 0 番目の呼び出し引数を取り出す helper */
function firstCallArg<T>(mockFn: unknown): T {
  const mock = mockFn as { mock: { calls: unknown[][] } }
  const call = mock.mock.calls[0]
  if (!call) throw new Error('mock was not called')
  const arg = call[0]
  if (arg === undefined) throw new Error('mock call had no first argument')
  return arg as T
}

interface LockoutHarnessOptions {
  readonly users?: readonly AuthUserRecord[]
  readonly now?: Date
  readonly lockout?: LockoutStore
  readonly notifier?: LockoutNotifier
  readonly auditLogger?: AuthAuditLoggerPort
  readonly securityMonitor?: SecurityEventRecorderPort
}

function buildLockoutHarness(opts: LockoutHarnessOptions): AuthService {
  return createAuthService({
    users: createInMemoryAuthUserRepository(opts.users ?? []),
    sessions: createInMemorySessionStore(),
    passwordHasher: createBcryptPasswordHasher({ cost: 12 }),
    appSecret: APP_SECRET,
    sessionIdFactory: () => 'sess-lockout',
    clock: () => opts.now ?? new Date('2026-04-17T00:00:00.000Z'),
    lockout: opts.lockout,
    notifier: opts.notifier,
    auditLogger: opts.auditLogger,
    securityMonitor: opts.securityMonitor,
  })
}

describe('createAuthService.login + lockout (Req 1.3)', () => {
  it('lockout 未指定時は従来どおりロックアウト機能は動作しない (後方互換)', async () => {
    const user = await buildUser()
    const service = buildLockoutHarness({ users: [user] })
    // 失敗を 10 回繰り返してもロックされない (bcrypt cost=12 のため時間を許容)
    for (let i = 0; i < 10; i += 1) {
      await expect(service.login({ email: VALID_EMAIL, password: 'wrong' })).rejects.toBeInstanceOf(
        InvalidCredentialsError,
      )
    }
    // 最後に正しいパスワードでログイン成功
    const session = await service.login({ email: VALID_EMAIL, password: VALID_PASSWORD })
    expect(session.userId).toBe(user.id)
  }, 15000)

  it('パスワード誤りで lockout.recordFailure が呼ばれる', async () => {
    const user = await buildUser()
    const lockout = createInMemoryLockoutStore()
    const recordFailureSpy = vi.spyOn(lockout, 'recordFailure')
    const service = buildLockoutHarness({ users: [user], lockout })

    await expect(service.login({ email: VALID_EMAIL, password: 'wrong' })).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    )

    expect(recordFailureSpy).toHaveBeenCalledTimes(1)
    const firstCall = recordFailureSpy.mock.calls[0]
    if (!firstCall) throw new Error('recordFailure was not called')
    expect(firstCall[0]).toBe(user.id)
  })

  it('ユーザー存在しない場合は lockout.recordFailure が呼ばれない (存在漏洩防止)', async () => {
    const lockout = createInMemoryLockoutStore()
    const recordFailureSpy = vi.spyOn(lockout, 'recordFailure')
    const service = buildLockoutHarness({ users: [], lockout })

    await expect(
      service.login({ email: 'unknown@example.com', password: 'wrong' }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError)

    expect(recordFailureSpy).not.toHaveBeenCalled()
  })

  it('ロック中のアカウントはパスワードが正しくても AccountLockedError', async () => {
    const user = await buildUser()
    const now = new Date('2026-04-17T00:00:00.000Z')
    const lockout = createInMemoryLockoutStore()
    // 事前に 5 回失敗させてロック状態を作る
    for (let i = 0; i < MAX_FAILED_LOGIN_ATTEMPTS; i += 1) {
      await lockout.recordFailure(user.id, now)
    }

    const service = buildLockoutHarness({ users: [user], now, lockout })

    try {
      await service.login({ email: VALID_EMAIL, password: VALID_PASSWORD }, undefined, now)
      throw new Error('should have thrown')
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(AccountLockedError)
      if (error instanceof AccountLockedError) {
        expect(error.lockedUntil.getTime()).toBe(now.getTime() + LOCKOUT_DURATION_MS)
      }
    }
  })

  it('5 回目の失敗で notifier.notifyLocked + auditLogger.emit が呼ばれる', async () => {
    const user = await buildUser()
    const now = new Date('2026-04-17T00:00:00.000Z')
    const lockout = createInMemoryLockoutStore()
    const notifier: LockoutNotifier = {
      notifyLocked: vi.fn(async () => {}),
    }
    const auditLogger: AuthAuditLoggerPort = {
      emit: vi.fn(async () => {}),
    }
    const service = buildLockoutHarness({
      users: [user],
      now,
      lockout,
      notifier,
      auditLogger,
    })

    // 1..4 回目の失敗では通知/監査は呼ばれない
    for (let i = 0; i < 4; i += 1) {
      await expect(
        service.login({ email: VALID_EMAIL, password: 'wrong' }, undefined, now),
      ).rejects.toBeInstanceOf(InvalidCredentialsError)
    }
    expect(notifier.notifyLocked).not.toHaveBeenCalled()
    expect(auditLogger.emit).not.toHaveBeenCalled()

    // 5 回目で lockedUntil が設定され通知 + 監査が発火
    await expect(
      service.login({ email: VALID_EMAIL, password: 'wrong' }, undefined, now),
    ).rejects.toBeInstanceOf(InvalidCredentialsError)

    expect(notifier.notifyLocked).toHaveBeenCalledTimes(1)
    const notifiedArg = firstCallArg<{
      userId: string
      email: string
      lockedUntil: Date
    }>(notifier.notifyLocked)
    expect(notifiedArg.userId).toBe(user.id)
    expect(notifiedArg.email).toBe(VALID_EMAIL)
    expect(notifiedArg.lockedUntil.getTime()).toBe(now.getTime() + LOCKOUT_DURATION_MS)

    expect(auditLogger.emit).toHaveBeenCalledTimes(1)
    const auditArg = firstCallArg<Parameters<AuthAuditLoggerPort['emit']>[0]>(auditLogger.emit)
    expect(auditArg.action).toBe('ACCOUNT_LOCKED')
    expect(auditArg.resourceType).toBe('USER')
    expect(auditArg.userId).toBe(user.id)
    expect(auditArg.resourceId).toBe(user.id)
    const after = auditArg.after
    if (!after) throw new Error('auditArg.after missing')
    expect(after.lockedUntil).toBe(new Date(now.getTime() + LOCKOUT_DURATION_MS).toISOString())
    expect(after.failedCount).toBe(MAX_FAILED_LOGIN_ATTEMPTS)
    expect(auditArg.before).toBeNull()
  }, 10000)

  it('context の ipAddress/userAgent が監査ログへ渡る', async () => {
    const user = await buildUser()
    const now = new Date('2026-04-17T00:00:00.000Z')
    const lockout = createInMemoryLockoutStore()
    const auditLogger: AuthAuditLoggerPort = { emit: vi.fn(async () => {}) }
    const service = buildLockoutHarness({ users: [user], now, lockout, auditLogger })

    for (let i = 0; i < MAX_FAILED_LOGIN_ATTEMPTS; i += 1) {
      await expect(
        service.login(
          { email: VALID_EMAIL, password: 'wrong' },
          { ipAddress: '192.0.2.10', userAgent: 'agent-x/1.0' },
          now,
        ),
      ).rejects.toBeInstanceOf(InvalidCredentialsError)
    }
    const auditArg = firstCallArg<Parameters<AuthAuditLoggerPort['emit']>[0]>(auditLogger.emit)
    expect(auditArg.ipAddress).toBe('192.0.2.10')
    expect(auditArg.userAgent).toBe('agent-x/1.0')
  }, 10000)

  it('context 未指定時は ipAddress/userAgent が "unknown" になる', async () => {
    const user = await buildUser()
    const now = new Date('2026-04-17T00:00:00.000Z')
    const lockout = createInMemoryLockoutStore()
    const auditLogger: AuthAuditLoggerPort = { emit: vi.fn(async () => {}) }
    const service = buildLockoutHarness({ users: [user], now, lockout, auditLogger })

    for (let i = 0; i < MAX_FAILED_LOGIN_ATTEMPTS; i += 1) {
      await expect(
        service.login({ email: VALID_EMAIL, password: 'wrong' }, undefined, now),
      ).rejects.toBeInstanceOf(InvalidCredentialsError)
    }
    const auditArg = firstCallArg<Parameters<AuthAuditLoggerPort['emit']>[0]>(auditLogger.emit)
    expect(auditArg.ipAddress).toBe('unknown')
    expect(auditArg.userAgent).toBe('unknown')
  }, 10000)

  it('成功ログインで lockout.reset が呼ばれる', async () => {
    const user = await buildUser()
    const now = new Date('2026-04-17T00:00:00.000Z')
    const lockout = createInMemoryLockoutStore()
    // 数回失敗させてからカウンタを持たせる
    await lockout.recordFailure(user.id, now)
    await lockout.recordFailure(user.id, now)
    const resetSpy = vi.spyOn(lockout, 'reset')

    const service = buildLockoutHarness({ users: [user], now, lockout })
    await service.login({ email: VALID_EMAIL, password: VALID_PASSWORD }, undefined, now)

    expect(resetSpy).toHaveBeenCalledWith(user.id)
    const status = await lockout.get(user.id, now)
    expect(status.failedCount).toBe(0)
  })

  it('通知が失敗しても認証経路は影響を受けない (fire-and-forget)', async () => {
    const user = await buildUser()
    const now = new Date('2026-04-17T00:00:00.000Z')
    const lockout = createInMemoryLockoutStore()
    const notifier: LockoutNotifier = {
      notifyLocked: vi.fn(async () => {
        throw new Error('notification service down')
      }),
    }
    const service = buildLockoutHarness({ users: [user], now, lockout, notifier })

    for (let i = 0; i < MAX_FAILED_LOGIN_ATTEMPTS; i += 1) {
      // 通知失敗は throw せず InvalidCredentialsError のみが外に出る
      await expect(
        service.login({ email: VALID_EMAIL, password: 'wrong' }, undefined, now),
      ).rejects.toBeInstanceOf(InvalidCredentialsError)
    }
    expect(notifier.notifyLocked).toHaveBeenCalledTimes(1)
  })

  it('監査失敗しても認証経路は影響を受けない (fire-and-forget)', async () => {
    const user = await buildUser()
    const now = new Date('2026-04-17T00:00:00.000Z')
    const lockout = createInMemoryLockoutStore()
    const auditLogger: AuthAuditLoggerPort = {
      emit: vi.fn(async () => {
        throw new Error('audit log db down')
      }),
    }
    const service = buildLockoutHarness({ users: [user], now, lockout, auditLogger })

    for (let i = 0; i < MAX_FAILED_LOGIN_ATTEMPTS; i += 1) {
      await expect(
        service.login({ email: VALID_EMAIL, password: 'wrong' }, undefined, now),
      ).rejects.toBeInstanceOf(InvalidCredentialsError)
    }
    expect(auditLogger.emit).toHaveBeenCalledTimes(1)
  })

  it('認証失敗を securityMonitor に記録する', async () => {
    const user = await buildUser()
    const securityMonitor: SecurityEventRecorderPort = {
      record: vi.fn(async () => []),
    }
    const service = buildLockoutHarness({ users: [user], securityMonitor })

    await expect(
      service.login(
        { email: VALID_EMAIL, password: 'wrong' },
        { ipAddress: '192.0.2.44', userAgent: 'agent-y/2.0' },
      ),
    ).rejects.toBeInstanceOf(InvalidCredentialsError)

    expect(securityMonitor.record).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'AUTH_FAILURE',
        userId: user.id,
        ipAddress: '192.0.2.44',
        metadata: {
          email: VALID_EMAIL,
        },
      }),
    )
  })
})
