/**
 * Anthropic Claude ChatProvider 実装
 *
 * - @anthropic-ai/sdk の Messages.create() を呼び出す
 * - system プロンプトは request.messages から抽出し、SDK の top-level `system` に渡す
 * - request.enablePromptCache=true の場合、system ブロックに
 *   cache_control: { type: 'ephemeral' } を付与しプロンプトキャッシュを有効化
 * - usage.input_tokens / output_tokens を promptTokens / completionTokens に写像
 */
import Anthropic from '@anthropic-ai/sdk'

import {
  AIConfigurationError,
  AIProviderError,
  type AIChatRequest,
  type AIChatResponse,
} from '../ai-gateway-types'
import type { ChatProvider } from '../chat-provider'

// ─────────────────────────────────────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001'
const DEFAULT_MAX_OUTPUT_TOKENS = 1024

// ─────────────────────────────────────────────────────────────────────────────
// 型
// ─────────────────────────────────────────────────────────────────────────────

export interface AnthropicProviderOptions {
  readonly apiKey?: string
  readonly model?: string
  /** テスト用: モック済み Anthropic クライアントを差し替え */
  readonly client?: Anthropic
}

// ─────────────────────────────────────────────────────────────────────────────
// 実装
// ─────────────────────────────────────────────────────────────────────────────

class AnthropicChatProvider implements ChatProvider {
  public readonly name = 'claude' as const
  private readonly client: Anthropic
  private readonly model: string

  constructor(client: Anthropic, model: string) {
    this.client = client
    this.model = model
  }

  async chat(request: AIChatRequest): Promise<AIChatResponse> {
    const systemText = extractSystemText(request)
    const userAssistantMessages = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))

    const createParams: Parameters<Anthropic['messages']['create']>[0] = {
      model: this.model,
      max_tokens: request.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      messages: userAssistantMessages,
    }

    if (systemText) {
      if (request.enablePromptCache) {
        createParams.system = [
          {
            type: 'text',
            text: systemText,
            cache_control: { type: 'ephemeral' },
          },
        ]
      } else {
        createParams.system = systemText
      }
    }

    if (typeof request.temperature === 'number') {
      createParams.temperature = request.temperature
    }

    let result
    try {
      result = await this.client.messages.create(createParams)
    } catch (error) {
      throw new AIProviderError(this.name, getErrorMessage(error), { cause: error })
    }

    const message = result as Awaited<ReturnType<Anthropic['messages']['create']>> & {
      content: Array<{ type: string; text?: string }>
      usage?: { input_tokens?: number; output_tokens?: number }
    }

    const content = message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('')

    return {
      content,
      provider: this.name,
      usage: {
        promptTokens: message.usage?.input_tokens ?? 0,
        completionTokens: message.usage?.output_tokens ?? 0,
      },
      cached: false,
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ヘルパー
// ─────────────────────────────────────────────────────────────────────────────

function extractSystemText(request: AIChatRequest): string {
  const systemMessages = request.messages.filter((m) => m.role === 'system')
  if (systemMessages.length === 0) return ''
  return systemMessages.map((m) => m.content).join('\n\n')
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Unknown Anthropic error'
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * AnthropicChatProvider を生成する。
 *
 * 優先順位:
 *  1. opts.client が渡されていればそれを使用 (DI)
 *  2. opts.apiKey または env ANTHROPIC_API_KEY で新規クライアント生成
 *
 * API キー未設定時は AIConfigurationError を投げる。
 */
export function createAnthropicProvider(opts: AnthropicProviderOptions = {}): ChatProvider {
  const model = opts.model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL

  if (opts.client) {
    return new AnthropicChatProvider(opts.client, model)
  }

  const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY
  if (!apiKey || apiKey.trim().length === 0) {
    throw new AIConfigurationError('ANTHROPIC_API_KEY is required to create an Anthropic provider')
  }

  const client = new Anthropic({ apiKey })
  return new AnthropicChatProvider(client, model)
}
