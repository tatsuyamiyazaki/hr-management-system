/**
 * OpenAI ChatProvider 実装
 *
 * - openai SDK の chat.completions.create() を呼び出す
 * - usage.prompt_tokens / completion_tokens を promptTokens / completionTokens に写像
 */
import OpenAI from 'openai'

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

const DEFAULT_MODEL = 'gpt-4o-mini'

// ─────────────────────────────────────────────────────────────────────────────
// 型
// ─────────────────────────────────────────────────────────────────────────────

export interface OpenAIProviderOptions {
  readonly apiKey?: string
  readonly model?: string
  /** テスト用: モック済み OpenAI クライアントを差し替え */
  readonly client?: OpenAI
}

// ─────────────────────────────────────────────────────────────────────────────
// 実装
// ─────────────────────────────────────────────────────────────────────────────

class OpenAIChatProvider implements ChatProvider {
  public readonly name = 'openai' as const
  private readonly client: OpenAI
  private readonly model: string

  constructor(client: OpenAI, model: string) {
    this.client = client
    this.model = model
  }

  async chat(request: AIChatRequest): Promise<AIChatResponse> {
    const params: Parameters<OpenAI['chat']['completions']['create']>[0] = {
      model: this.model,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    }

    if (typeof request.maxOutputTokens === 'number') {
      params.max_completion_tokens = request.maxOutputTokens
    }
    if (typeof request.temperature === 'number') {
      params.temperature = request.temperature
    }

    let result
    try {
      result = await this.client.chat.completions.create(params)
    } catch (error) {
      throw new AIProviderError(this.name, getErrorMessage(error), { cause: error })
    }

    const completion = result as Awaited<
      ReturnType<OpenAI['chat']['completions']['create']>
    > & {
      choices: Array<{ message: { content: string | null } }>
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }

    const content = completion.choices[0]?.message?.content ?? ''

    return {
      content,
      provider: this.name,
      usage: {
        promptTokens: completion.usage?.prompt_tokens ?? 0,
        completionTokens: completion.usage?.completion_tokens ?? 0,
      },
      cached: false,
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ヘルパー
// ─────────────────────────────────────────────────────────────────────────────

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Unknown OpenAI error'
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * OpenAIChatProvider を生成する。
 *
 * 優先順位:
 *  1. opts.client が渡されていればそれを使用 (DI)
 *  2. opts.apiKey または env OPENAI_API_KEY で新規クライアント生成
 *
 * API キー未設定時は AIConfigurationError を投げる。
 */
export function createOpenAIProvider(opts: OpenAIProviderOptions = {}): ChatProvider {
  const model = opts.model ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL

  if (opts.client) {
    return new OpenAIChatProvider(opts.client, model)
  }

  const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY
  if (!apiKey || apiKey.trim().length === 0) {
    throw new AIConfigurationError('OPENAI_API_KEY is required to create an OpenAI provider')
  }

  const client = new OpenAI({ apiKey })
  return new OpenAIChatProvider(client, model)
}
