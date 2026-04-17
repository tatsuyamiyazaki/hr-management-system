/**
 * Task 6.1: AuthService の単体テスト
 *
 * Req 1.1, 1.2, 1.4, 1.5, 1.6, 1.11 相当の挙動を検証する。
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { z } from 'zod'
import { createAuthService } from '@/lib/auth/auth-service'
import type { AuthService } from '@/lib/auth/auth-service'
import {
  InvalidCredentialsError,
  SessionExpiredError,
  SessionIdleTimeoutError,
  SessionNotFoundError,
} from '@/lib/auth/auth-types'
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
