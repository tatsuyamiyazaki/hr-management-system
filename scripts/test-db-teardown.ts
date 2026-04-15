#!/usr/bin/env tsx
/**
 * テスト用 DB のティアダウンスクリプト
 *
 * - テスト後にテスト DB のデータをクリーンアップする
 * - 必要に応じてテスト DB を削除する
 *
 * 使用方法:
 *   pnpm tsx scripts/test-db-teardown.ts
 *   pnpm tsx scripts/test-db-teardown.ts --drop  # DB を完全に削除
 */
import { Client } from 'pg'

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://hruser:hrpass@localhost:5432/hr_test'
const DROP_DB = process.argv.includes('--drop')

async function teardown(): Promise<void> {
  if (DROP_DB) {
    // postgres DB に接続してテスト DB を削除
    const adminUrl = TEST_DB_URL.replace(/\/[^/]+$/, '/postgres')
    const adminClient = new Client({ connectionString: adminUrl })

    try {
      await adminClient.connect()
      const dbName = TEST_DB_URL.split('/').pop()?.split('?')[0] ?? 'hr_test'

      // 既存接続を切断してから削除
      await adminClient.query(
        `SELECT pg_terminate_backend(pid)
         FROM pg_stat_activity
         WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [dbName],
      )
      await adminClient.query(`DROP DATABASE IF EXISTS "${dbName}"`)
      console.log(`✓ テスト DB "${dbName}" を削除しました`)
    } finally {
      await adminClient.end()
    }
    return
  }

  // DB を削除しない場合はテーブルのデータのみクリーンアップ
  const testClient = new Client({ connectionString: TEST_DB_URL })
  try {
    await testClient.connect()

    // 全テーブルを TRUNCATE（外部キー制約を考慮して CASCADE）
    await testClient.query(`
      DO $$
      DECLARE
        r RECORD;
      BEGIN
        FOR r IN (
          SELECT tablename FROM pg_tables
          WHERE schemaname = 'public'
          ORDER BY tablename
        ) LOOP
          EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE';
        END LOOP;
      END $$;
    `)
    console.log('✓ テスト DB データをクリアしました')
  } catch {
    // テーブルが存在しない場合（マイグレーション未実行）はスキップ
    console.log('✓ クリーンアップ対象のテーブルがありません（スキップ）')
  } finally {
    await testClient.end()
  }

  console.log('✓ テスト DB ティアダウン完了')
}

teardown().catch((err) => {
  console.error('テスト DB ティアダウン失敗:', err)
  process.exit(1)
})
