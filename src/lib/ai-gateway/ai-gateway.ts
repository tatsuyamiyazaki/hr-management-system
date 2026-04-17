/**
 * AIGateway
 *
 * AI プロバイダ呼び出しの統合エントリポイント。
 *  - リクエスト Zod バリデーション
 *  - 同一入力レスポンスの Redis キャッシュ (Req 19.8)
 *  - タイムアウト付き実行 (デフォルト 5 秒)
 *  - usage ログ用フック (Task 5.1 では optional、実装は別タスク)
 *
 * プロバイダ (Anthropic / OpenAI) は ChatProvider 抽象経由で DI される (Req 20.13)。
 */
import {
  AIProviderError,
  AITimeoutError,
  AIConfigurationError,
  aiChatRequestSchema,
  isAIProviderName,
  type AIChatRequest,
  type AIChatResponse,
  type AIDomain,
  type AIProviderName,
} from './ai-gateway-types'
import type { ChatProvider } from './chat-provider'
import {
  createInMemoryAIResponseCache,
  createRedisAIResponseCache,
  type AIResponseCache,
} from './ai-response-cache'
import { createAnthropicProvider } from './providers/anthropic-provider'
import { createOpenAIProvider } from './providers/openai-provider'
import { createRedisConnection } from '../jobs/redis-connection'

// ─────────────────────────────────────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────────────────────────────────────

/** ゲートウェイのデフォルトタイムアウト (5 秒) */
export const DEFAULT_AI_GATEWAY_TIMEOUT_MS = 5000

/** AI_PROVIDER 環境変数のデフォルト */
const DEFAULT_PROVIDER_NAME: AIProviderName = 'claude'

// ─────────────────────────────────────────────────────────────────────────────
// 公開型
// ─────────────────────────────────────────────────────────────────────────────

export interface AIGateway {
  chat(request: AIChatRequest): Promise<AIChatResponse>
  getCurrentProvider(): AIProviderName
}

export interface AIUsageEntry {
  readonly domain: AIDomain
  readonly provider: AIProviderName
  readonly promptTokens: number
  readonly completionTokens: number
  readonly cached: boolean
}

export interface AIGatewayDeps {
  readonly provider: ChatProvider
  readonly cache: AIResponseCache
  /** トークン使用量ロギング用フック (本タスクでは optional、実装は別タスク) */
  readonly onUsage?: (entry: AIUsageEntry) => void | Promise<void>
  readonly defaultTimeoutMs?: number
}

// ─────────────────────────────────────────────────────────────────────────────
// キャッシュキー
// ─────────────────────────────────────────────────────────────────────────────

/** provider + domain + messages からキャッシュキーの raw 文字列を生成 */
function buildRawCacheKey(provider: AIProviderName, request: AIChatRequest): string {
  return `${provider}|${request.domain}|${JSON.stringify(request.messages)}`
}

// ─────────────────────────────────────────────────────────────────────────────
// タイムアウト
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 指定ミリ秒で resolve されなかった場合は AITimeoutError で reject する Promise を返す。
 * 元の promise の reject は素通しする。
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new AITimeoutError(timeoutMs))
    }, timeoutMs)
  })

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// onUsage 安全呼び出し
// ─────────────────────────────────────────────────────────────────────────────

async function emitUsage(
  onUsage: AIGatewayDeps['onUsage'],
  entry: AIUsageEntry,
): Promise<void> {
  if (!onUsage) return
  try {
    await onUsage(entry)
  } catch {
    // ロギングの失敗でメイン処理を止めない (フェイルオープン)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 実装
// ─────────────────────────────────────────────────────────────────────────────

/**
 * AIGateway を生成する。
 */
export function createAIGateway(deps: AIGatewayDeps): AIGateway {
  const defaultTimeoutMs = deps.defaultTimeoutMs ?? DEFAULT_AI_GATEWAY_TIMEOUT_MS
  const { provider, cache, onUsage } = deps

  async function chat(request: AIChatRequest): Promise<AIChatResponse> {
    // 1. Zod バリデーション
    const parsed = aiChatRequestSchema.parse(request)

    // 2. キャッシュ確認
    const rawKey = buildRawCacheKey(provider.name, parsed)
    const cached = await cache.get(rawKey)
    if (cached) {
      await emitUsage(onUsage, {
        domain: parsed.domain,
        provider: provider.name,
        promptTokens: cached.usage.promptTokens,
        completionTokens: cached.usage.completionTokens,
        cached: true,
      })
      return cached
    }

    // 3. プロバイダ呼び出し (タイムアウト付き)
    const timeoutMs = parsed.timeoutMs ?? defaultTimeoutMs
    let response: AIChatResponse
    try {
      response = await withTimeout(provider.chat(parsed), timeoutMs)
    } catch (error) {
      if (error instanceof AITimeoutError) throw error
      if (error instanceof AIProviderError) throw error
      // 想定外の例外は AIProviderError に正規化
      const message = error instanceof Error ? error.message : 'Unknown provider error'
      throw new AIProviderError(provider.name, message, { cause: error })
    }

    // 4. キャッシュ保存 + usage 記録
    await cache.set(rawKey, response)
    await emitUsage(onUsage, {
      domain: parsed.domain,
      provider: provider.name,
      promptTokens: response.usage.promptTokens,
      completionTokens: response.usage.completionTokens,
      cached: false,
    })

    return response
  }

  return {
    chat,
    getCurrentProvider: () => provider.name,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory (env ベース)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 環境変数からゲートウェイを組み立てる。
 *  - AI_PROVIDER = 'claude' | 'openai' (default: 'claude')
 *  - REDIS_URL 未設定時は InMemory キャッシュにフォールバック
 *  - overrides で個別の依存を差し替え可能
 */
export function createAIGatewayFromEnv(
  overrides: Partial<AIGatewayDeps> = {},
): AIGateway {
  const providerName = resolveProviderName()
  const provider = overrides.provider ?? buildProviderForName(providerName)
  const cache = overrides.cache ?? buildCacheFromEnv()

  return createAIGateway({
    provider,
    cache,
    onUsage: overrides.onUsage,
    defaultTimeoutMs: overrides.defaultTimeoutMs,
  })
}

function resolveProviderName(): AIProviderName {
  const raw = process.env.AI_PROVIDER
  if (!raw || raw.trim().length === 0) return DEFAULT_PROVIDER_NAME
  if (!isAIProviderName(raw)) {
    throw new AIConfigurationError(`Unknown AI_PROVIDER value: ${raw}`)
  }
  return raw
}

function buildProviderForName(name: AIProviderName): ChatProvider {
  switch (name) {
    case 'claude':
      return createAnthropicProvider()
    case 'openai':
      return createOpenAIProvider()
  }
}

function buildCacheFromEnv(): AIResponseCache {
  const redisUrl = process.env.REDIS_URL
  if (!redisUrl || redisUrl.trim().length === 0) {
    return createInMemoryAIResponseCache()
  }
  return createRedisAIResponseCache(createRedisConnection())
}
