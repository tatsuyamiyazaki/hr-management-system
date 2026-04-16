import { Worker, type Processor } from 'bullmq'
import { createRedisConnection } from './redis-connection'

// ─────────────────────────────────────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_CONCURRENCY = 5

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * BullMQ Worker の共通基盤。
 * - 指定されたキュー名でワーカーを起動
 * - completed / failed / error イベントハンドラを自動登録
 * - 各ドメインワーカーはこの関数でラップして独自 Processor を渡す
 */
export function createBaseWorker(
  queueName: string,
  processor: Processor,
  concurrency: number = DEFAULT_CONCURRENCY,
): Worker {
  const worker = new Worker(queueName, processor, {
    connection: createRedisConnection(),
    concurrency,
  })

  worker.on('completed', (job) => {
    // TODO: 本番では構造化ロガーに転送する
    console.error(`[Worker:${queueName}] job completed`, { jobId: job.id, jobName: job.name })
    // 本番では構造化ロガーに転送する
    void job
  })

  worker.on('failed', (job, err) => {
    // DLQ 監視: 最大リトライ後も失敗した場合のフック
    console.error(`[Worker:${queueName}] job failed`, {
      jobId: job?.id,
      jobName: job?.name,
      attemptsMade: job?.attemptsMade,
      error: err.message,
    })
    void job
    void err
  })

  worker.on('error', (err) => {
    // Redis 接続断など Worker レベルのエラー
    console.error(`[Worker:${queueName}] worker error`, { error: err.message })
    void err
  })

  return worker
}
