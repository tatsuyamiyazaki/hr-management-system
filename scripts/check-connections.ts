#!/usr/bin/env tsx
/**
 * ローカル開発環境の接続確認スクリプト
 *
 * 使い方:
 *   pnpm check:connections
 *
 * 確認内容:
 *   - PostgreSQL 16 への接続
 *   - pgcrypto / pg_trgm 拡張が有効か
 *   - Redis 7 への接続
 *   - PING レスポンス
 */

import { Client } from 'pg'
import { createClient } from 'redis'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'

function ok(msg: string) {
  console.log(`${GREEN}✓${RESET} ${msg}`)
}

function fail(msg: string) {
  console.log(`${RED}✗${RESET} ${msg}`)
}

function info(msg: string) {
  console.log(`${YELLOW}→${RESET} ${msg}`)
}

async function checkPostgres(): Promise<boolean> {
  const url =
    process.env['DATABASE_URL'] ?? 'postgresql://postgres:postgres@localhost:5432/hr_management'

  info(`PostgreSQL: ${url.replace(/:([^:@]+)@/, ':***@')}`)

  const client = new Client({ connectionString: url })
  try {
    await client.connect()
    ok('PostgreSQL 接続成功')

    // バージョン確認
    const versionResult = await client.query<{ version: string }>('SELECT version()')
    const version = versionResult.rows[0]?.version ?? ''
    if (version.includes('PostgreSQL 16')) {
      ok(`PostgreSQL バージョン: ${version.split(' ').slice(0, 2).join(' ')}`)
    } else {
      fail(
        `PostgreSQL 16 が必要ですが、${version.split(' ').slice(0, 2).join(' ')} が検出されました`,
      )
    }

    // pgcrypto 拡張確認
    const pgcryptoResult = await client.query<{ count: string }>(
      "SELECT COUNT(*) FROM pg_extension WHERE extname = 'pgcrypto'",
    )
    if (Number(pgcryptoResult.rows[0]?.count) > 0) {
      ok('pgcrypto 拡張: 有効')
    } else {
      fail('pgcrypto 拡張: 無効（docker/postgres/init.sql を確認してください）')
    }

    // pg_trgm 拡張確認
    const trgmResult = await client.query<{ count: string }>(
      "SELECT COUNT(*) FROM pg_extension WHERE extname = 'pg_trgm'",
    )
    if (Number(trgmResult.rows[0]?.count) > 0) {
      ok('pg_trgm 拡張: 有効')
    } else {
      fail('pg_trgm 拡張: 無効（docker/postgres/init.sql を確認してください）')
    }

    return true
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    fail(`PostgreSQL 接続失敗: ${message}`)
    fail('docker compose up -d を実行してください')
    return false
  } finally {
    await client.end().catch(() => undefined)
  }
}

async function checkRedis(): Promise<boolean> {
  const url = process.env['REDIS_URL'] ?? 'redis://localhost:6379'
  info(`Redis: ${url}`)

  const client = createClient({ url })
  try {
    await client.connect()
    ok('Redis 接続成功')

    // PING 確認
    const pong = await client.ping()
    if (pong === 'PONG') {
      ok('Redis PING: PONG')
    } else {
      fail(`Redis PING: 予期しないレスポンス "${pong}"`)
    }

    // バージョン確認
    const info = await client.info('server')
    const versionMatch = /redis_version:(\S+)/.exec(info)
    if (versionMatch) {
      const version = versionMatch[1] ?? ''
      if (version.startsWith('7.')) {
        ok(`Redis バージョン: ${version}`)
      } else {
        fail(`Redis 7 が必要ですが、${version} が検出されました`)
      }
    }

    return true
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    fail(`Redis 接続失敗: ${message}`)
    fail('docker compose up -d を実行してください')
    return false
  } finally {
    await client.disconnect().catch(() => undefined)
  }
}

async function main() {
  console.log(`\n${BOLD}HR Management System — 接続確認${RESET}\n`)

  const pgOk = await checkPostgres()
  console.log()
  const redisOk = await checkRedis()
  console.log()

  if (pgOk && redisOk) {
    console.log(`${GREEN}${BOLD}✓ すべての接続確認が完了しました！${RESET}\n`)
    process.exit(0)
  } else {
    console.log(
      `${RED}${BOLD}✗ 一部の接続に失敗しました。上記のエラーを確認してください。${RESET}\n`,
    )
    process.exit(1)
  }
}

main()
