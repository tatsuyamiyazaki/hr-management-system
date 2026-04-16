import { Queue } from 'bullmq'
import { createRedisConnection } from './redis-connection'
import type { JobName, JobPayloadMap, JobStatus, JobState } from './job-types'
import { isJobName } from './job-types'

// ─────────────────────────────────────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────────────────────────────────────

const QUEUE_NAME = 'hr-main'

/** 指数バックオフリトライ設定（Requirement 20.4） */
const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 1_000, // 初回: 1s, 2回目: 2s, 3回目: 4s
  },
  removeOnComplete: { count: 1_000 },
  removeOnFail: { count: 5_000 },
}

// ─────────────────────────────────────────────────────────────────────────────
// Interface
// ─────────────────────────────────────────────────────────────────────────────

export interface JobQueue {
  enqueue<N extends JobName>(name: N, payload: JobPayloadMap[N]): Promise<string>
  getJobStatus(jobId: string): Promise<JobStatus | null>
  close(): Promise<void>
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

class BullMQJobQueue implements JobQueue {
  private readonly queue: Queue

  constructor(queue: Queue) {
    this.queue = queue
  }

  async enqueue<N extends JobName>(name: N, payload: JobPayloadMap[N]): Promise<string> {
    const job = await this.queue.add(name, payload, DEFAULT_JOB_OPTIONS)
    if (!job.id) throw new Error(`BullMQ did not return a job id for "${name}"`)
    return job.id
  }

  async getJobStatus(jobId: string): Promise<JobStatus | null> {
    const job = await this.queue.getJob(jobId)
    if (!job) return null

    const state = (await job.getState()) as JobState
    return {
      jobId: job.id ?? jobId,
      name: isJobName(job.name) ? job.name : 'send-email',
      state,
      returnValue: job.returnvalue,
      failedReason: job.failedReason ?? null,
    }
  }

  async close(): Promise<void> {
    await this.queue.close()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createJobQueue(queue?: Queue): JobQueue {
  return new BullMQJobQueue(
    queue ??
      new Queue(QUEUE_NAME, {
        connection: createRedisConnection(),
      }),
  )
}
