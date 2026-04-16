import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'

/**
 * AuditLog テーブルのスキーマ存在確認テスト
 * Prisma スキーマに AuditLog モデルが定義されていることを検証する
 */
describe('AuditLog Prisma Schema', () => {
  const schemaPath = path.resolve(process.cwd(), 'prisma/schema.prisma')
  const schema = readFileSync(schemaPath, 'utf-8')

  it('should define AuditLog model in Prisma schema', () => {
    expect(schema).toContain('model AuditLog')
  })

  it('should define required fields: id, userId, action, resourceType', () => {
    const modelMatch = schema.match(/model AuditLog \{[\s\S]*?\}/)
    expect(modelMatch).not.toBeNull()
    const model = modelMatch![0]

    expect(model).toContain('id')
    expect(model).toContain('userId')
    expect(model).toContain('action')
    expect(model).toContain('resourceType')
    expect(model).toContain('resourceId')
    expect(model).toContain('ipAddress')
    expect(model).toContain('userAgent')
    expect(model).toContain('before')
    expect(model).toContain('after')
    expect(model).toContain('occurredAt')
  })

  it('should map to audit_logs table', () => {
    expect(schema).toContain('@@map("audit_logs")')
  })

  it('should define AuditAction enum', () => {
    expect(schema).toContain('enum AuditAction')
    expect(schema).toContain('LOGIN_SUCCESS')
    expect(schema).toContain('LOGIN_FAILURE')
    expect(schema).toContain('LOGOUT')
    expect(schema).toContain('ROLE_CHANGE')
    expect(schema).toContain('DATA_EXPORT')
    expect(schema).toContain('EVALUATION_FINALIZED')
  })

  it('should define AuditResourceType enum', () => {
    expect(schema).toContain('enum AuditResourceType')
    expect(schema).toContain('USER')
    expect(schema).toContain('SESSION')
    expect(schema).toContain('ORGANIZATION')
    expect(schema).toContain('EVALUATION')
  })

  it('should have index on occurredAt for efficient time-range queries', () => {
    const modelMatch = schema.match(/model AuditLog \{[\s\S]*?\}/)
    expect(modelMatch).not.toBeNull()
    const model = modelMatch![0]
    expect(model).toContain('occurredAt')
    expect(model).toMatch(/@@index\(\[.*occurredAt.*\]\)/)
  })

  it('should have @@map("audit_logs") for table naming convention', () => {
    const modelMatch = schema.match(/model AuditLog \{[\s\S]*?\}/)
    expect(modelMatch).not.toBeNull()
    const model = modelMatch![0]
    expect(model).toContain('@@map("audit_logs")')
  })
})
