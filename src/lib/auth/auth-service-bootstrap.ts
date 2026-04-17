/**
 * Issue #107 / Task 6.4: AuthService ブートストラップ
 *
 * Next.js 15 の instrumentation.ts から呼ばれ、AuthService シングルトンを組み立てる。
 *
 * - REDIS_URL 設定時: Redis ベースの SessionStore
 * - REDIS_URL 未設定時: InMemory SessionStore (開発モード / ログに警告を残す)
 * - APP_SECRET は emailHash 算出に必須 → 未設定なら起動時に fail-fast
 *
 * AuthUserRepository は Prisma 版が未実装のため、暫定で InMemory 実装を返す。
 * TODO(Prisma 移行): Task 6.x で Prisma ベースの AuthUserRepository を実装したら差し替える。
 *
 * 冪等性: 一度初期化したら同じインスタンスを返す。
 * テスト用に resetAuthServiceBootstrap() を提供する。
 */
import { Redis } from 'ioredis'
import { createAuthService, type AuthService } from './auth-service'
import { createBcryptPasswordHasher } from './password-hasher'
import {
  createInMemorySessionStore,
  createRedisSessionStore,
  type SessionStore,
} from './session-store'
import { createInMemoryAuthUserRepository, type AuthUserRepository } from './user-repository'

let _cached: AuthService | null = null

/**
 * 本番用の AuthService を組み立てる。
 * 複数回呼ばれてもキャッシュ済みインスタンスを返す。
 */
export function bootstrapAuthService(): AuthService {
  if (_cached) return _cached

  const appSecret = process.env.APP_SECRET
  if (typeof appSecret !== 'string' || appSecret.length === 0) {
    throw new Error(
      'APP_SECRET is not configured. Set APP_SECRET env var before starting the server.',
    )
  }

  const sessions = buildSessionStore()
  const users = buildUserRepository()
  const passwordHasher = createBcryptPasswordHasher()

  _cached = createAuthService({
    users,
    sessions,
    passwordHasher,
    appSecret,
  })

  return _cached
}

/**
 * テスト用: キャッシュをクリアする。
 * 本番コードパスから呼ぶことは想定していない。
 */
export function resetAuthServiceBootstrap(): void {
  _cached = null
}

function buildSessionStore(): SessionStore {
  const redisUrl = process.env.REDIS_URL
  if (!redisUrl || redisUrl.trim().length === 0) {
    // 開発 / テスト環境でのフォールバック。本番では REDIS_URL 必須とすべき。

    console.warn(
      '[auth-service-bootstrap] REDIS_URL is not configured; falling back to InMemory SessionStore. ' +
        'This is only safe in development. Set REDIS_URL in production.',
    )
    return createInMemorySessionStore()
  }

  const redis = new Redis(redisUrl, {
    // BullMQ 等と異なり、セッションストアは標準のリトライ動作で十分
    lazyConnect: false,
  })
  return createRedisSessionStore({ redis })
}

function buildUserRepository(): AuthUserRepository {
  // TODO(Prisma 移行): Task 6.x で Prisma ベースの実装に置き換える。
  // 現状は InMemory 実装のみ。本番で API を叩くとユーザー不在で常に
  // InvalidCredentialsError になるが、少なくとも initAuthService 未初期化による
  // 500 エラー (Issue #107) は回避できる。

  console.warn(
    '[auth-service-bootstrap] AuthUserRepository is using InMemory fallback. ' +
      'Replace with Prisma-backed implementation before production use.',
  )
  return createInMemoryAuthUserRepository()
}
