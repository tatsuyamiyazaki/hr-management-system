/**
 * Issue #58 / Task 16.2: 対話型入力 UI（チャットボット形式）
 * (Requirements: 9.1, 9.3, 9.5, 9.6)
 *
 * AIコーチングチャット UI の型定義。
 */

/** チャットメッセージのロール */
export type ChatMessageRole = 'user' | 'assistant'

/** チャット表示用メッセージ */
export interface ChatMessage {
  readonly id: string
  readonly role: ChatMessageRole
  readonly content: string
  readonly timestamp: Date
}

/** 品質ゲートの状態 */
export type QualityGateStatus = 'idle' | 'validating' | 'passed' | 'failed' | 'timeout'

/** AIコーチチャットの状態 */
export interface AICoachChatState {
  readonly messages: readonly ChatMessage[]
  readonly qualityGateStatus: QualityGateStatus
  readonly isValidating: boolean
  readonly canSubmit: boolean
  readonly turnNumber: number
  readonly lastSuggestions: string | null
  readonly missingAspects: readonly string[]
}
