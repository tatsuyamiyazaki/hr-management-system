/**
 * Issue #50 / Task 15.1: 共有 EvaluationEventBus
 *
 * - EvaluationEventBus インターフェース
 * - InMemoryEvaluationEventBus（テスト用スタブ）
 * - RedisEvaluationEventBus（Redis Pub/Sub ベース本番実装）
 */
import type { Redis } from 'ioredis'
import {
  type EvaluationEventName,
  type EvaluationEventPayloadMap,
  evaluationEventSchema,
} from './evaluation-event-types'

// Redis Pub/Sub チャンネル名
export const EVALUATION_EVENT_CHANNEL = 'hr:evaluation-events'

// ─────────────────────────────────────────────────────────────────────────────
// Re-exports for convenience
// ─────────────────────────────────────────────────────────────────────────────

export type { EvaluationEventName, EvaluationEventPayloadMap }

// ─────────────────────────────────────────────────────────────────────────────
// Interface
// ─────────────────────────────────────────────────────────────────────────────

export interface EvaluationEventBus {
  /** イベントを publish（publisher 接続を使用） */
  publish<N extends EvaluationEventName>(
    name: N,
    payload: EvaluationEventPayloadMap[N],
  ): Promise<void>

  /** subscriber を登録（handler は型安全に受け取れる） */
  subscribe<N extends EvaluationEventName>(
    eventName: N,
    handler: (payload: EvaluationEventPayloadMap[N]) => Promise<void>,
  ): void

  /** 全 subscriber を解除して接続をクローズ */
  close(): Promise<void>
}

// ─────────────────────────────────────────────────────────────────────────────
// InMemoryEvaluationEventBus（テスト用スタブ）
// ─────────────────────────────────────────────────────────────────────────────

type AnyHandler = (payload: EvaluationEventPayloadMap[EvaluationEventName]) => Promise<void>

export class InMemoryEvaluationEventBus implements EvaluationEventBus {
  private readonly handlers = new Map<EvaluationEventName, AnyHandler[]>()

  subscribe<N extends EvaluationEventName>(
    eventName: N,
    handler: (payload: EvaluationEventPayloadMap[N]) => Promise<void>,
  ): void {
    const existing = this.handlers.get(eventName) ?? []
    this.handlers.set(eventName, [...existing, handler as AnyHandler])
  }

  async publish<N extends EvaluationEventName>(
    name: N,
    payload: EvaluationEventPayloadMap[N],
  ): Promise<void> {
    // Zod バリデーション — 失敗時はログのみ、handler を呼ばない
    const schema = evaluationEventSchema[name]
    const result = schema.safeParse(payload)
    if (!result.success) {
      console.error(
        `[EvaluationEventBus] Invalid payload for event "${name}":`,
        result.error.flatten(),
      )
      return
    }

    const eventHandlers = this.handlers.get(name) ?? []
    for (const handler of eventHandlers) {
      try {
        await handler(payload)
      } catch (err) {
        console.error(`[EvaluationEventBus] Handler error for event "${name}":`, err)
      }
    }
  }

  async close(): Promise<void> {
    this.handlers.clear()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Wire format
// ─────────────────────────────────────────────────────────────────────────────

interface EvaluationEventMessage {
  name: EvaluationEventName
  payload: EvaluationEventPayloadMap[EvaluationEventName]
  publishedAt: string
}

// ─────────────────────────────────────────────────────────────────────────────
// RedisEvaluationEventBus（本番実装）
// ─────────────────────────────────────────────────────────────────────────────

export class RedisEvaluationEventBus implements EvaluationEventBus {
  private readonly handlers = new Map<EvaluationEventName, AnyHandler[]>()
  private isSubscribed = false

  constructor(
    private readonly publisher: Redis,
    private readonly subscriber: Redis,
  ) {}

  subscribe<N extends EvaluationEventName>(
    eventName: N,
    handler: (payload: EvaluationEventPayloadMap[N]) => Promise<void>,
  ): void {
    const existing = this.handlers.get(eventName) ?? []
    this.handlers.set(eventName, [...existing, handler as AnyHandler])

    if (!this.isSubscribed) {
      this.isSubscribed = true
      this.subscriber.subscribe(EVALUATION_EVENT_CHANNEL, (err) => {
        if (err) {
          console.error('[EvaluationEventBus] Redis subscribe error:', err)
        }
      })
      this.subscriber.on('message', (_channel: string, message: string) => {
        void this.handleMessage(message)
      })
    }
  }

  async publish<N extends EvaluationEventName>(
    name: N,
    payload: EvaluationEventPayloadMap[N],
  ): Promise<void> {
    // Zod バリデーション — 失敗時はログのみ、例外を再throwしない
    const schema = evaluationEventSchema[name]
    const result = schema.safeParse(payload)
    if (!result.success) {
      console.error(
        `[EvaluationEventBus] Invalid payload for event "${name}":`,
        result.error.flatten(),
      )
      return
    }

    const message: EvaluationEventMessage = {
      name,
      payload,
      publishedAt: new Date().toISOString(),
    }

    await this.publisher.publish(EVALUATION_EVENT_CHANNEL, JSON.stringify(message))
  }

  private async handleMessage(raw: string): Promise<void> {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw) as unknown
    } catch (err) {
      console.error('[EvaluationEventBus] Failed to parse message:', err)
      return
    }

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('name' in parsed) ||
      !('payload' in parsed)
    ) {
      console.error('[EvaluationEventBus] Malformed message structure:', parsed)
      return
    }

    const { name, payload } = parsed as { name: unknown; payload: unknown }

    if (typeof name !== 'string' || !(name in evaluationEventSchema)) {
      console.error('[EvaluationEventBus] Unknown event name:', name)
      return
    }

    const eventName = name as EvaluationEventName
    const schema = evaluationEventSchema[eventName]
    const result = schema.safeParse(payload)

    if (!result.success) {
      console.error(
        `[EvaluationEventBus] Invalid payload for event "${eventName}":`,
        result.error.flatten(),
      )
      return
    }

    const eventHandlers = this.handlers.get(eventName) ?? []
    for (const handler of eventHandlers) {
      try {
        await handler(result.data as EvaluationEventPayloadMap[EvaluationEventName])
      } catch (err) {
        console.error(`[EvaluationEventBus] Handler error for event "${eventName}":`, err)
      }
    }
  }

  async close(): Promise<void> {
    this.handlers.clear()
    await this.subscriber.unsubscribe(EVALUATION_EVENT_CHANNEL)
    this.subscriber.disconnect()
    this.publisher.disconnect()
  }
}
