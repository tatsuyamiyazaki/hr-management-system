import { Redis } from 'ioredis'

/**
 * BullMQ 専用の Redis 接続を生成する。
 * BullMQ は ioredis インスタンスを直接受け取る。
 */
export function createRedisConnection(): Redis {
  const url = process.env.REDIS_URL ?? 'redis://localhost:6379'
  return new Redis(url, {
    maxRetriesPerRequest: null, // BullMQ 推奨設定
  })
}
