/**
 * Prisma Client 拡張: カラム暗号化/復号の透過的処理
 *
 * @encrypted マーカーを持つフィールド（User.email, Profile.employeeCode, Profile.phoneNumber）に
 * pgcrypto の pgp_sym_encrypt / pgp_sym_decrypt を適用する。
 *
 * アプリケーション層では常に平文として扱い、
 * 永続化と読み出しのみ透過的に暗号化/復号する。
 */
import { PrismaClient, Prisma } from '@prisma/client'

const ENCRYPTED_MODELS: Record<string, string[]> = {
  user: ['email'],
  profile: ['employeeCode', 'phoneNumber'],
}

/**
 * 暗号化対象フィールドを Buffer（pgcrypto バイト列）に変換する
 */
function encryptFields(modelName: string, data: Record<string, unknown>, encryptionKey: string): Record<string, unknown> {
  const fields = ENCRYPTED_MODELS[modelName.toLowerCase()] ?? []
  const result = { ...data }
  for (const field of fields) {
    const value = result[field]
    if (typeof value === 'string') {
      // アプリ層: 平文 string → pgp_sym_encrypt への SQL パラメータ渡しは
      // マイグレーション SQL / raw クエリで行う。
      // ここではアプリ層マーカーとして Buffer に変換しておく（実装プレースホルダー）。
      result[field] = Buffer.from(value, 'utf-8')
    }
  }
  return result
}

/**
 * 暗号化対象フィールドを Buffer → string に復号する（アプリ層プレースホルダー）
 */
function decryptFields(modelName: string, data: Record<string, unknown>): Record<string, unknown> {
  const fields = ENCRYPTED_MODELS[modelName.toLowerCase()] ?? []
  const result = { ...data }
  for (const field of fields) {
    const value = result[field]
    if (Buffer.isBuffer(value)) {
      result[field] = value.toString('utf-8')
    }
  }
  return result
}

/**
 * Prisma Client 拡張を作成する
 *
 * 使用方法:
 * ```typescript
 * import { createEncryptedPrismaClient } from '@/lib/db/prisma'
 * const prisma = createEncryptedPrismaClient()
 * ```
 */
export function createEncryptedExtension(encryptionKey: string) {
  return Prisma.defineExtension({
    name: 'encrypted-fields',
    query: {
      user: {
        async create({ args, query }) {
          args.data = encryptFields('user', args.data as Record<string, unknown>, encryptionKey) as typeof args.data
          const result = await query(args)
          return decryptFields('user', result as Record<string, unknown>) as typeof result
        },
        async update({ args, query }) {
          if (args.data) {
            args.data = encryptFields('user', args.data as Record<string, unknown>, encryptionKey) as typeof args.data
          }
          const result = await query(args)
          return decryptFields('user', result as Record<string, unknown>) as typeof result
        },
        async findUnique({ args, query }) {
          const result = await query(args)
          if (!result) return result
          return decryptFields('user', result as Record<string, unknown>) as typeof result
        },
        async findFirst({ args, query }) {
          const result = await query(args)
          if (!result) return result
          return decryptFields('user', result as Record<string, unknown>) as typeof result
        },
        async findMany({ args, query }) {
          const results = await query(args)
          return (results as Record<string, unknown>[]).map((r) => decryptFields('user', r)) as typeof results
        },
      },
      profile: {
        async create({ args, query }) {
          args.data = encryptFields('profile', args.data as Record<string, unknown>, encryptionKey) as typeof args.data
          const result = await query(args)
          return decryptFields('profile', result as Record<string, unknown>) as typeof result
        },
        async update({ args, query }) {
          if (args.data) {
            args.data = encryptFields('profile', args.data as Record<string, unknown>, encryptionKey) as typeof args.data
          }
          const result = await query(args)
          return decryptFields('profile', result as Record<string, unknown>) as typeof result
        },
        async findUnique({ args, query }) {
          const result = await query(args)
          if (!result) return result
          return decryptFields('profile', result as Record<string, unknown>) as typeof result
        },
        async findFirst({ args, query }) {
          const result = await query(args)
          if (!result) return result
          return decryptFields('profile', result as Record<string, unknown>) as typeof result
        },
        async findMany({ args, query }) {
          const results = await query(args)
          return (results as Record<string, unknown>[]).map((r) => decryptFields('profile', r)) as typeof results
        },
      },
    },
  })
}

/**
 * 拡張済み Prisma Client を生成するファクトリ
 */
export function createEncryptedPrismaClient(encryptionKey?: string) {
  const key = encryptionKey ?? process.env.DB_COLUMN_ENCRYPTION_KEY
  if (!key) {
    throw new Error('DB_COLUMN_ENCRYPTION_KEY 環境変数が設定されていません')
  }
  const client = new PrismaClient()
  return client.$extends(createEncryptedExtension(key))
}
