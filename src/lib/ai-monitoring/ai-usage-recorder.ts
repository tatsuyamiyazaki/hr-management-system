/**
 * AI Usage Recorder
 *
 * AIGateway の `onUsage` コールバック形状を受け取り、AIMonitoringService.recordUsage
 * に整形して渡す薄いアダプタ。
 *  - userId は呼び出しコンテキストから DI で解決
 *  - requestId は factory で発番
 *  - estimatedCostUsd は provider 別の簡易単価テーブルで算出 (Haiku / gpt-4o-mini 想定)
 *
 * 関連要件: Req 19.1, Req 19.8
 */
import { randomUUID } from 'node:crypto'
import type { AIDomain, AIProviderName } from '@/lib/ai-gateway/ai-gateway-types'
import type { AIMonitoringService } from './ai-monitoring-service'

// ─────────────────────────────────────────────────────────────────────────────
// 単価テーブル (USD per token)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * provider ごとの簡易単価 (USD / 1 token)。
 * - claude: Haiku 想定 ($0.80 / 1M prompt, $4.00 / 1M completion)
 * - openai: gpt-4o-mini 想定 ($0.15 / 1M prompt, $0.60 / 1M completion)
 */
export const AI_TOKEN_PRICES_USD: Readonly<
  Record<AIProviderName, { readonly promptPerToken: number; readonly completionPerToken: number }>
> = {
  claude: {
    promptPerToken: 0.8 / 1_000_000,
    completionPerToken: 4.0 / 1_000_000,
  },
  openai: {
    promptPerToken: 0.15 / 1_000_000,
    completionPerToken: 0.6 / 1_000_000,
  },
}

/** 認証コンテキストがない場合のユーザー ID フォールバック */
export const UNKNOWN_USER_ID = 'unknown'

// ─────────────────────────────────────────────────────────────────────────────
// 型
// ─────────────────────────────────────────────────────────────────────────────

/** AIGateway の `onUsage` コールバックが受け取るエントリ形状 */
export interface GatewayUsageEvent {
  readonly domain: AIDomain
  readonly provider: AIProviderName
  readonly promptTokens: number
  readonly completionTokens: number
  readonly cached: boolean
  /** provider 呼び出しのレイテンシ (ms)。未提供時は 0 として扱う */
  readonly latencyMs?: number
}

export interface UsageCallbackOptions {
  /** 呼び出しコンテキストからユーザー ID を解決する。null を返す場合は 'unknown' 固定 */
  readonly userIdResolver: () => string | null
  /** requestId 発番 (既定: randomUUID) */
  readonly requestIdFactory?: () => string
  /** 時刻ソース (既定: Date.now 基準の `new Date()`) */
  readonly clock?: () => Date
}

export type UsageCallback = (event: GatewayUsageEvent) => Promise<void>

// ─────────────────────────────────────────────────────────────────────────────
// コスト計算
// ─────────────────────────────────────────────────────────────────────────────

export function estimateCostUsd(
  provider: AIProviderName,
  promptTokens: number,
  completionTokens: number,
): number {
  const price = AI_TOKEN_PRICES_USD[provider]
  return promptTokens * price.promptPerToken + completionTokens * price.completionPerToken
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * AIGateway の `onUsage` として渡せるコールバックを生成する。
 * recordUsage の失敗は AIGateway 側で握りつぶされる前提 (フェイルオープン)。
 */
export function createUsageCallback(
  service: AIMonitoringService,
  opts: UsageCallbackOptions,
): UsageCallback {
  const requestIdFactory = opts.requestIdFactory ?? (() => randomUUID())
  const clock = opts.clock ?? (() => new Date())

  return async function handleUsage(event: GatewayUsageEvent): Promise<void> {
    const resolved = opts.userIdResolver()
    const userId = resolved && resolved.length > 0 ? resolved : UNKNOWN_USER_ID
    const latencyMs = event.latencyMs ?? 0
    const estimatedCostUsd = estimateCostUsd(
      event.provider,
      event.promptTokens,
      event.completionTokens,
    )

    await service.recordUsage({
      userId,
      domain: event.domain,
      provider: event.provider,
      promptTokens: event.promptTokens,
      completionTokens: event.completionTokens,
      estimatedCostUsd,
      latencyMs,
      cacheHit: event.cached,
      requestId: requestIdFactory(),
      createdAt: clock(),
    })
  }
}
