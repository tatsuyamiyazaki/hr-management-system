/**
 * Task 1.4: Zod ヘルパーのテスト
 */
import { describe, it, expect } from 'vitest'
import { z } from 'zod'

describe('parseStrict', () => {
  it('スキーマに合致するデータをパースできる', async () => {
    const { parseStrict } = await import('@/lib/shared/zod-helpers')
    const schema = z.object({ id: z.string(), name: z.string() })
    const result = parseStrict(schema, { id: '1', name: 'テスト' })
    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value.id).toBe('1')
    }
  })

  it('スキーマに合致しないデータは ValidationError になる', async () => {
    const { parseStrict } = await import('@/lib/shared/zod-helpers')
    const schema = z.object({ id: z.string(), count: z.number() })
    const result = parseStrict(schema, { id: '1', count: 'not-a-number' })
    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error._tag).toBe('ValidationError')
    }
  })

  it('余分なフィールドがある場合 strict モードでエラーになる', async () => {
    const { parseStrict } = await import('@/lib/shared/zod-helpers')
    const schema = z.object({ id: z.string() }).strict()
    const result = parseStrict(schema, { id: '1', extra: 'field' })
    expect(result.isErr()).toBe(true)
  })
})

describe('safeParse', () => {
  it('成功時に ok Result を返す', async () => {
    const { safeParse } = await import('@/lib/shared/zod-helpers')
    const schema = z.string().email()
    const result = safeParse(schema, 'user@example.com')
    expect(result.isOk()).toBe(true)
  })

  it('失敗時に err Result を返す', async () => {
    const { safeParse } = await import('@/lib/shared/zod-helpers')
    const schema = z.string().email()
    const result = safeParse(schema, 'not-an-email')
    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error._tag).toBe('ValidationError')
    }
  })
})
