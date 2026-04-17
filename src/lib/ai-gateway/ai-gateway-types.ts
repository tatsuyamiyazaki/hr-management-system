/**
 * AIGateway 型定義
 *
 * AI プロバイダ抽象化層の共通型とスキーマ。
 * - AI プロバイダ名 / ドメイン enum
 * - Chat リクエスト / レスポンス 型
 * - ゲートウェイ固有の例外クラス (ドメインエラー判別共用体とは独立)
 *
 * 関連要件: Req 20.13, Req 19.8
 */
import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

/** サポート対象の AI プロバイダ名 */
export const AI_PROVIDER_NAMES = ['claude', 'openai'] as const

export type AIProviderName = (typeof AI_PROVIDER_NAMES)[number]

/** 任意の値が AIProviderName か判定 */
export function isAIProviderName(value: unknown): value is AIProviderName {
  return typeof value === 'string' && (AI_PROVIDER_NAMES as readonly string[]).includes(value)
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain
// ─────────────────────────────────────────────────────────────────────────────

/**
 * AI 機能ドメイン。
 * - ai-coach: 評価コーチング (Req 9.x)
 * - feedback: フィードバック変換 (Req 11.x)
 */
export const AI_DOMAINS = ['ai-coach', 'feedback'] as const

export type AIDomain = (typeof AI_DOMAINS)[number]

// ─────────────────────────────────────────────────────────────────────────────
// Chat Message / Request
// ─────────────────────────────────────────────────────────────────────────────

export const chatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().min(1),
})

export type ChatMessage = z.infer<typeof chatMessageSchema>

export const aiChatRequestSchema = z.object({
  /** 機能ドメイン (キャッシュキー・ロギング識別) */
  domain: z.enum(AI_DOMAINS),
  /** 対話メッセージ (最低 1 件) */
  messages: z.array(chatMessageSchema).min(1),
  /** 応答の最大トークン数 */
  maxOutputTokens: z.number().int().positive().optional(),
  /** サンプリング温度 */
  temperature: z.number().min(0).max(2).optional(),
  /** Anthropic プロンプトキャッシュを有効化するか */
  enablePromptCache: z.boolean().optional(),
  /** このリクエスト個別のタイムアウト (ms) */
  timeoutMs: z.number().int().positive().optional(),
})

export type AIChatRequest = z.infer<typeof aiChatRequestSchema>

// ─────────────────────────────────────────────────────────────────────────────
// Chat Response
// ─────────────────────────────────────────────────────────────────────────────

export interface AIChatUsage {
  readonly promptTokens: number
  readonly completionTokens: number
}

export interface AIChatResponse {
  readonly content: string
  readonly provider: AIProviderName
  readonly usage: AIChatUsage
  readonly cached: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Errors
//
// 注: src/lib/shared/domain-error.ts には同名の _tag 付き型が存在するが、
// それは Result<T, DomainError> 用の判別共用体。こちらは throw 可能な
// Error サブクラスであり、責務と名前空間が異なる。ai-gateway モジュールの
// 呼び出し側は本ファイルからクラスを import する。
// ─────────────────────────────────────────────────────────────────────────────

/** AI プロバイダ呼び出しで発生した例外 */
export class AIProviderError extends Error {
  public readonly provider: AIProviderName
  public readonly providerMessage: string

  constructor(provider: AIProviderName, providerMessage: string, options?: ErrorOptions) {
    super(`[${provider}] ${providerMessage}`, options)
    this.name = 'AIProviderError'
    this.provider = provider
    this.providerMessage = providerMessage
  }
}

/** AI 呼び出しがタイムアウトした */
export class AITimeoutError extends Error {
  public readonly elapsedMs: number

  constructor(elapsedMs: number) {
    super(`AI call timed out after ${elapsedMs}ms`)
    this.name = 'AITimeoutError'
    this.elapsedMs = elapsedMs
  }
}

/** AI 設定不備 (API キー未設定・プロバイダ名不正 等) */
export class AIConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AIConfigurationError'
  }
}
