/**
 * Task 1.3: Prisma スキーマ存在確認テスト
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '../../../')
const schemaPath = resolve(root, 'prisma/schema.prisma')

describe('Prisma スキーマ', () => {
  it('prisma/schema.prisma が存在する', () => {
    expect(existsSync(schemaPath)).toBe(true)
  })

  it('User モデルが定義されている', () => {
    const schema = readFileSync(schemaPath, 'utf-8')
    expect(schema).toContain('model User {')
  })

  it('Profile モデルが定義されている', () => {
    const schema = readFileSync(schemaPath, 'utf-8')
    expect(schema).toContain('model Profile {')
  })

  it('PasswordHistory モデルが定義されている', () => {
    const schema = readFileSync(schemaPath, 'utf-8')
    expect(schema).toContain('model PasswordHistory {')
  })

  it('Session モデルが定義されている', () => {
    const schema = readFileSync(schemaPath, 'utf-8')
    expect(schema).toContain('model Session {')
  })

  it('emailHash フィールドが User に含まれている', () => {
    const schema = readFileSync(schemaPath, 'utf-8')
    expect(schema).toContain('emailHash')
  })

  it('employeeCodeHash フィールドが Profile に含まれている', () => {
    const schema = readFileSync(schemaPath, 'utf-8')
    expect(schema).toContain('employeeCodeHash')
  })

  it('postgresql provider が設定されている', () => {
    const schema = readFileSync(schemaPath, 'utf-8')
    expect(schema).toContain('provider = "postgresql"')
  })
})

describe('Prisma クライアント拡張', () => {
  it('prisma/extensions/encrypted-fields.ts が存在する', () => {
    const extPath = resolve(root, 'prisma/extensions/encrypted-fields.ts')
    expect(existsSync(extPath)).toBe(true)
  })
})

describe('マイグレーション初期ファイル', () => {
  it('prisma/migrations ディレクトリが存在する', () => {
    const migDir = resolve(root, 'prisma/migrations')
    expect(existsSync(migDir)).toBe(true)
  })

  it('pgcrypto インストール SQL が存在する', () => {
    const initSqlPath = resolve(root, 'prisma/migrations/init-pgcrypto.sql')
    expect(existsSync(initSqlPath)).toBe(true)
    const content = readFileSync(initSqlPath, 'utf-8')
    expect(content).toContain('pgcrypto')
  })
})
