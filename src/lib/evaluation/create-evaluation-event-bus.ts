/**
 * Issue #50 / Task 15.1: EvaluationEventBus ファクトリ
 *
 * Redis Pub/Sub 用に publisher / subscriber で別々の接続を生成する。
 * ioredis の仕様上、subscribe モードに入った接続は publish に使えないため分離が必要。
 */
import { Redis } from 'ioredis'
import type { EvaluationEventBus } from './evaluation-event-bus'
import { RedisEvaluationEventBus } from './evaluation-event-bus'

export function createEvaluationEventBus(): EvaluationEventBus {
  const url = process.env.REDIS_URL ?? 'redis://localhost:6379'
  const publisher = new Redis(url)
  const subscriber = new Redis(url)
  return new RedisEvaluationEventBus(publisher, subscriber)
}
