/**
 * Issue #107 / Task 6.4: AuthService ブートストラップのテスト
 *
 * bootstrapAuthService() は本番 (Next.js instrumentation) から呼ばれ、
 * AuthService シングルトンを組み立てる。
 *
 * - REDIS_URL 未設定時は InMemory フォールバック
 * - 複数回呼んでも冪等 (同じインスタンスを返す)
 * - APP_SECRET が必要
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { resetAuthServiceBootstrap } from '@/lib/auth/auth-service-bootstrap'

// ioredis のモック: 実 Redis に接続しないで済ませる
vi.mock('ioredis', () => {
  class MockRedis {
    constructor(_url?: string, _options?: Record<string, unknown>) {}
    // bootstrap 時点では接続しないので空でも良い
    async quit(): Promise<'OK'> {
      return 'OK'
    }
    async disconnect(): Promise<void> {
      // noop
    }
  }
  return { Redis: MockRedis, default: MockRedis }
})

const ORIGINAL_ENV = { ...process.env }

describe('bootstrapAuthService', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV }
    resetAuthServiceBootstrap()
    // 必須の APP_SECRET は必ず設定 (crypto.ts 用)
    process.env.APP_SECRET = 'bootstrap-test-secret-key-32chars'
  })

  afterEach(() => {
    resetAuthServiceBootstrap()
    process.env = { ...ORIGINAL_ENV }
  })

  it('APP_SECRET 設定済み / REDIS_URL 未設定 → AuthService を返す (InMemory フォールバック)', async () => {
    delete process.env.REDIS_URL

    const { bootstrapAuthService } = await import('@/lib/auth/auth-service-bootstrap')
    const svc = bootstrapAuthService()

    expect(svc).toBeDefined()
    expect(typeof svc.login).toBe('function')
    expect(typeof svc.logout).toBe('function')
    expect(typeof svc.getSession).toBe('function')
    expect(typeof svc.touchSession).toBe('function')
    expect(typeof svc.listSessions).toBe('function')
    expect(typeof svc.revokeSession).toBe('function')
  })

  it('REDIS_URL 設定済み → AuthService を返す (Redis バックエンド)', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379'

    const { bootstrapAuthService } = await import('@/lib/auth/auth-service-bootstrap')
    const svc = bootstrapAuthService()

    expect(svc).toBeDefined()
    expect(typeof svc.login).toBe('function')
  })

  it('複数回呼んでも同じインスタンスを返す (冪等)', async () => {
    delete process.env.REDIS_URL

    const { bootstrapAuthService } = await import('@/lib/auth/auth-service-bootstrap')
    const first = bootstrapAuthService()
    const second = bootstrapAuthService()

    expect(first).toBe(second)
  })

  it('APP_SECRET 未設定なら throw する', async () => {
    delete process.env.APP_SECRET

    const { bootstrapAuthService } = await import('@/lib/auth/auth-service-bootstrap')

    expect(() => bootstrapAuthService()).toThrow(/APP_SECRET/)
  })

  it('resetAuthServiceBootstrap() 後は新しいインスタンスを返す', async () => {
    delete process.env.REDIS_URL

    const { bootstrapAuthService } = await import('@/lib/auth/auth-service-bootstrap')
    const first = bootstrapAuthService()
    resetAuthServiceBootstrap()
    const second = bootstrapAuthService()

    expect(first).not.toBe(second)
  })
})
