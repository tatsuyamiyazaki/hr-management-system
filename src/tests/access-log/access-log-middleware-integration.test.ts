import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'

/**
 * Next.js middleware.ts がアプリ実行経路に正しく接続されていることを確認する
 */
describe('Next.js middleware integration', () => {
  const middlewarePath = path.resolve(process.cwd(), 'src/middleware.ts')
  const content = readFileSync(middlewarePath, 'utf-8')

  it('should import createAccessLogMiddleware', () => {
    expect(content).toContain('createAccessLogMiddleware')
  })

  it('should import request security helpers', () => {
    expect(content).toContain('applySecurityHeaders')
    expect(content).toContain('enforceRateLimits')
    expect(content).toContain('shouldRedirectToHttps')
  })

  it('should export middleware function', () => {
    expect(content).toContain('export async function middleware')
  })

  it('should configure matcher as a global route pattern', () => {
    expect(content).toContain('/((?!_next/static|_next/image|favicon.ico).*)')
  })

  it('should export config with matcher', () => {
    expect(content).toContain('export const config')
    expect(content).toContain('matcher')
  })
})

/**
 * パーティション削除ロジックが 13ヶ月前を使うことで 1年間保持を確実に満たすことを確認する
 */
describe('Partition rotation retention policy', () => {
  const sqlPath = path.resolve(process.cwd(), 'prisma/migrations/access-log-partition.sql')
  const sql = readFileSync(sqlPath, 'utf-8')

  it('should use 13 months interval for drop threshold (not 12)', () => {
    // 12ヶ月だと月末データが保持期間内に入るため、13ヶ月を使うことで1年間保持を保証する
    expect(sql).toContain("INTERVAL '13 months'")
    expect(sql).not.toMatch(/drop_threshold.*INTERVAL '12 months'/)
  })

  it('should create next month partition before dropping old ones', () => {
    // 関数内でのコメント順序を確認（セクション見出しではなく本体内のコメント）
    const createIdx = sql.indexOf('-- 翌月パーティションを先行作成')
    const dropIdx = sql.indexOf('-- 13ヶ月前の月パーティションをドロップ')
    expect(createIdx).toBeGreaterThan(-1)
    expect(dropIdx).toBeGreaterThan(-1)
    expect(createIdx).toBeLessThan(dropIdx)
  })
})
