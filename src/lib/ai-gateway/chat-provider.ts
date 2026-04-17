/**
 * ChatProvider 抽象インターフェース
 *
 * AI プロバイダ SDK (Anthropic / OpenAI) を共通形状にラップする。
 * AIGateway はこのインターフェースにのみ依存する (DI 対象)。
 *
 * 関連要件: Req 20.13 (設定変更のみでモデル切替可能なアーキテクチャ)
 */
import type {
  AIChatRequest,
  AIChatResponse,
  AIProviderName,
} from './ai-gateway-types'

export interface ChatProvider {
  readonly name: AIProviderName
  chat(request: AIChatRequest): Promise<AIChatResponse>
}
