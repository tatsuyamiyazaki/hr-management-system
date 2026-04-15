#!/usr/bin/env tsx
/**
 * テスト用 DB のセットアップスクリプト
 *
 * - テスト専用 DB を作成/リセットする
 * - pgcrypto 拡張をインストールする
 * - 統合テスト前に実行する（vitest globalSetup で使用）
 *
 * 使用方法:
 *   pnpm tsx scripts/test-db-setup.ts
 */
import { Client } from 'pg'

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://hruser:hrpass@localhost:5432/hr_test'

async function setup(): Promise<void> {
  // テスト DB への接続（まず postgres DB に接続してテスト DB を作成）
  const adminUrl = TEST_DB_URL.replace(/\/[^/]+$/, '/postgres')
  const adminClient = new Client({ connectionString: adminUrl })

  try {
    await adminClient.connect()

    // テスト DB 名を抽出
    const dbName = TEST_DB_URL.split('/').pop()?.split('?')[0] ?? 'hr_test'

    // テスト DB が存在しない場合は作成
    const exists = await adminClient.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [dbName])

    if (exists.rowCount === 0) {
      // db 名に特殊文字があると問題なので識別子として安全にエスケープ
      await adminClient.query(`CREATE DATABASE "${dbName}"`)
      console.log(`✓ テスト DB "${dbName}" を作成しました`)
    } else {
      console.log(`✓ テスト DB "${dbName}" は既に存在します`)
    }
  } finally {
    await adminClient.end()
  }

  // テスト DB に接続して拡張をインストール
  const testClient = new Client({ connectionString: TEST_DB_URL })
  try {
    await testClient.connect()
    await testClient.query('CREATE EXTENSION IF NOT EXISTS pgcrypto')
    await testClient.query('CREATE EXTENSION IF NOT EXISTS pg_trgm')
    console.log('✓ pgcrypto, pg_trgm 拡張をインストールしました')
  } finally {
    await testClient.end()
  }

  console.log('✓ テスト DB セットアップ完了')
}

setup().catch((err) => {
  console.error('テスト DB セットアップ失敗:', err)
  process.exit(1)
})
