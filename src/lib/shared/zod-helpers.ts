/**
 * Zod バリデーションヘルパー
 *
 * Zod スキーマを Result<T, ValidationError> に変換するユーティリティ。
 * 全 API Route / サービス層でのバリデーションに統一して使用する。
 */
import { z } from 'zod'
import { ok, err, type Result } from './domain-error'
import type { ValidationError } from './domain-error'

/**
 * Zod スキーマを使ってデータをパースし Result を返す
 *
 * - 成功時: `ok(parsedData)`
 * - 失敗時: `err({ _tag: 'ValidationError', field, message })`
 */
export function parseStrict<T>(
  schema: z.ZodType<T>,
  data: unknown,
): Result<T, ValidationError> {
  const parsed = schema.safeParse(data)
  if (parsed.success) {
    return ok(parsed.data)
  }

  // 最初のエラーを ValidationError として返す
  const firstError = parsed.error.errors[0]
  const field = firstError?.path.join('.') ?? 'unknown'
  const message = firstError?.message ?? '入力が不正です'

  return err({
    _tag: 'ValidationError',
    field,
    message,
    details: parsed.error.errors,
  })
}

/**
 * Zod スキーマを使ってデータを安全にパースし Result を返す
 * （parseStrict と同等だが名前でセマンティクスを明示）
 */
export function safeParse<T>(
  schema: z.ZodType<T>,
  data: unknown,
): Result<T, ValidationError> {
  return parseStrict(schema, data)
}

/**
 * Zod スキーマから strict 版を生成するヘルパー
 * （余分なフィールドをエラーとする）
 */
export function strictSchema<T extends z.ZodRawShape>(shape: T) {
  return z.object(shape).strict()
}
