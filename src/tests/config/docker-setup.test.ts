/**
 * Task 1.2: Docker Compose で開発用 PostgreSQL 16 と Redis 7 を起動
 *
 * RED → GREEN: これらのテストがすべて通過すれば Task 1.2 完了
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import * as yaml from 'js-yaml'

const root = resolve(__dirname, '../../../')

// ─────────────────────────────────────────────
// 1. docker-compose.yml の存在と構造
// ─────────────────────────────────────────────
describe('docker-compose.yml', () => {
  it('docker-compose.yml が存在する', () => {
    expect(existsSync(resolve(root, 'docker-compose.yml'))).toBe(true)
  })

  it('有効な YAML として解析できる', () => {
    const content = readFileSync(resolve(root, 'docker-compose.yml'), 'utf-8')
    expect(() => yaml.load(content)).not.toThrow()
  })

  it('postgres サービスが定義されている', () => {
    const content = readFileSync(resolve(root, 'docker-compose.yml'), 'utf-8')
    const doc = yaml.load(content) as Record<string, unknown>
    const services = doc['services'] as Record<string, unknown>
    expect(services).toHaveProperty('postgres')
  })

  it('redis サービスが定義されている', () => {
    const content = readFileSync(resolve(root, 'docker-compose.yml'), 'utf-8')
    const doc = yaml.load(content) as Record<string, unknown>
    const services = doc['services'] as Record<string, unknown>
    expect(services).toHaveProperty('redis')
  })
})

// ─────────────────────────────────────────────
// 2. PostgreSQL 16 の設定
// ─────────────────────────────────────────────
describe('PostgreSQL 設定', () => {
  function getPostgresService() {
    const content = readFileSync(resolve(root, 'docker-compose.yml'), 'utf-8')
    const doc = yaml.load(content) as Record<string, unknown>
    const services = doc['services'] as Record<string, unknown>
    return services['postgres'] as Record<string, unknown>
  }

  it('PostgreSQL 16 イメージを使用している', () => {
    const pg = getPostgresService()
    expect(pg['image']).toMatch(/postgres:16/)
  })

  it('ポート 5432 がマッピングされている', () => {
    const pg = getPostgresService()
    const ports = pg['ports'] as string[]
    expect(ports.some((p) => p.includes('5432'))).toBe(true)
  })

  it('ヘルスチェックが設定されている', () => {
    const pg = getPostgresService()
    expect(pg['healthcheck']).toBeDefined()
  })

  it('データボリュームが設定されている', () => {
    const pg = getPostgresService()
    const volumes = pg['volumes'] as string[]
    expect(Array.isArray(volumes)).toBe(true)
    expect(volumes.length).toBeGreaterThan(0)
  })
})

// ─────────────────────────────────────────────
// 3. PostgreSQL 拡張初期化スクリプト
// ─────────────────────────────────────────────
describe('PostgreSQL 拡張設定', () => {
  it('初期化 SQL スクリプトが存在する', () => {
    const candidates = ['docker/postgres/init.sql', 'docker/init.sql', 'infra/postgres/init.sql']
    const found = candidates.some((f) => existsSync(resolve(root, f)))
    expect(found).toBe(true)
  })

  it('pgcrypto 拡張が有効化される', () => {
    const candidates = ['docker/postgres/init.sql', 'docker/init.sql', 'infra/postgres/init.sql']
    const file = candidates.find((f) => existsSync(resolve(root, f)))
    const content = readFileSync(resolve(root, file!), 'utf-8')
    expect(content.toLowerCase()).toContain('pgcrypto')
  })

  it('pg_trgm 拡張が有効化される', () => {
    const candidates = ['docker/postgres/init.sql', 'docker/init.sql', 'infra/postgres/init.sql']
    const file = candidates.find((f) => existsSync(resolve(root, f)))
    const content = readFileSync(resolve(root, file!), 'utf-8')
    expect(content.toLowerCase()).toContain('pg_trgm')
  })
})

// ─────────────────────────────────────────────
// 4. Redis 7 の設定
// ─────────────────────────────────────────────
describe('Redis 設定', () => {
  function getRedisService() {
    const content = readFileSync(resolve(root, 'docker-compose.yml'), 'utf-8')
    const doc = yaml.load(content) as Record<string, unknown>
    const services = doc['services'] as Record<string, unknown>
    return services['redis'] as Record<string, unknown>
  }

  it('Redis 7 イメージを使用している', () => {
    const redis = getRedisService()
    expect(redis['image']).toMatch(/redis:7/)
  })

  it('ポート 6379 がマッピングされている', () => {
    const redis = getRedisService()
    const ports = redis['ports'] as string[]
    expect(ports.some((p) => p.includes('6379'))).toBe(true)
  })

  it('ヘルスチェックが設定されている', () => {
    const redis = getRedisService()
    expect(redis['healthcheck']).toBeDefined()
  })

  it('データボリュームが設定されている', () => {
    const redis = getRedisService()
    const volumes = redis['volumes'] as string[]
    expect(Array.isArray(volumes)).toBe(true)
    expect(volumes.length).toBeGreaterThan(0)
  })
})

// ─────────────────────────────────────────────
// 5. 接続確認スクリプト
// ─────────────────────────────────────────────
describe('接続確認スクリプト', () => {
  it('接続確認スクリプトが存在する', () => {
    const candidates = [
      'scripts/check-db.ts',
      'scripts/check-db.js',
      'scripts/check-connections.ts',
      'scripts/check-connections.sh',
    ]
    const found = candidates.some((f) => existsSync(resolve(root, f)))
    expect(found).toBe(true)
  })
})

// ─────────────────────────────────────────────
// 6. .gitignore に .env.local が含まれる
// ─────────────────────────────────────────────
describe('.gitignore', () => {
  it('.env.local が .gitignore に含まれる', () => {
    const content = readFileSync(resolve(root, '.gitignore'), 'utf-8')
    expect(content).toContain('.env.local')
  })
})
