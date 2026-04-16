import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'

describe('AccessLog Prisma Schema', () => {
  const schemaPath = path.resolve(process.cwd(), 'prisma/schema.prisma')
  const schema = readFileSync(schemaPath, 'utf-8')

  it('should define AccessLog model', () => {
    expect(schema).toContain('model AccessLog')
  })

  it('should define required fields', () => {
    const modelMatch = schema.match(/model AccessLog \{[\s\S]*?\}/)
    expect(modelMatch).not.toBeNull()
    const model = modelMatch![0]

    expect(model).toContain('id')
    expect(model).toContain('method')
    expect(model).toContain('path')
    expect(model).toContain('statusCode')
    expect(model).toContain('durationMs')
    expect(model).toContain('ipAddress')
    expect(model).toContain('userAgent')
    expect(model).toContain('userId')
    expect(model).toContain('requestedAt')
  })

  it('should map to access_logs table', () => {
    expect(schema).toContain('@@map("access_logs")')
  })

  it('should have index on requestedAt for time-range queries', () => {
    const modelMatch = schema.match(/model AccessLog \{[\s\S]*?\}/)
    expect(modelMatch).not.toBeNull()
    const model = modelMatch![0]
    expect(model).toMatch(/@@index\(\[.*requestedAt.*\]\)/)
  })
})
