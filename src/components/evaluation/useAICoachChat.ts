/**
 * Issue #58 / Task 16.2: 対話型入力 UI（チャットボット形式）
 * (Requirements: 9.1, 9.3, 9.5, 9.6)
 *
 * AIコーチングチャットの状態管理 React Hook。
 * - 対話履歴の管理
 * - 品質ゲート判定の非同期呼び出し
 * - 品質NG時の「評価完了」ボタン無効化制御
 * - AI判定中のローディング状態管理（入力欄は編集可能を維持）
 * - タイムアウト時の手動モード切替
 */
'use client'

import { useCallback, useRef, useState } from 'react'
import type {
  AICoachChatState,
  ChatMessage,
  QualityGateStatus,
} from './ai-coach-chat-types'

// ─────────────────────────────────────────────────────────────────────────────
// API レスポンス型
// ─────────────────────────────────────────────────────────────────────────────

interface ValidateApiResponse {
  success: boolean
  data?: {
    qualityOk: boolean
    missingAspects: string[]
    suggestions: string
    turnNumber: number
  }
  timeout?: {
    timeout: true
    elapsedMs: number
    fallbackToManual: true
  }
  error?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook props
// ─────────────────────────────────────────────────────────────────────────────

export interface UseAICoachChatProps {
  /** 評価サイクル ID */
  readonly cycleId: string
  /** 被評価者の役職・等級コンテキスト */
  readonly subjectRoleContext: string
  /** 品質ゲート通過時のコールバック */
  readonly onQualityGatePassed?: () => void
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook return type
// ─────────────────────────────────────────────────────────────────────────────

export interface UseAICoachChatReturn {
  /** チャットの現在の状態 */
  readonly state: AICoachChatState
  /** コメントを送信して品質判定を実行する */
  readonly sendComment: (draftComment: string) => Promise<void>
  /** チャットをリセットする */
  readonly reset: () => void
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

let messageIdCounter = 0

function createMessage(role: 'user' | 'assistant', content: string): ChatMessage {
  messageIdCounter += 1
  return {
    id: `msg-${Date.now()}-${messageIdCounter}`,
    role,
    content,
    timestamp: new Date(),
  }
}

const INITIAL_STATE: AICoachChatState = {
  messages: [],
  qualityGateStatus: 'idle',
  isValidating: false,
  canSubmit: false,
  turnNumber: 0,
  lastSuggestions: null,
  missingAspects: [],
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook implementation
// ─────────────────────────────────────────────────────────────────────────────

export function useAICoachChat(props: UseAICoachChatProps): UseAICoachChatReturn {
  const { cycleId, subjectRoleContext, onQualityGatePassed } = props
  const [state, setState] = useState<AICoachChatState>(INITIAL_STATE)
  const abortRef = useRef<AbortController | null>(null)
  const messagesRef = useRef<readonly ChatMessage[]>([])
  messagesRef.current = state.messages

  const sendComment = useCallback(
    async (draftComment: string) => {
      // ユーザーメッセージを追加 & バリデーション開始
      const userMessage = createMessage('user', draftComment)

      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, userMessage],
        qualityGateStatus: 'validating' as QualityGateStatus,
        isValidating: true,
      }))

      // 既存リクエストがあればキャンセル
      if (abortRef.current) {
        abortRef.current.abort()
      }
      abortRef.current = new AbortController()

      try {
        const conversationHistory = messagesRef.current.map((m) => ({
          role: m.role,
          content: m.content,
        }))

        const response = await fetch('/api/evaluation/ai-coach/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cycleId,
            subjectRoleContext,
            draftComment,
            conversationHistory,
          }),
          signal: abortRef.current.signal,
        })

        const result: ValidateApiResponse = await response.json()

        if (result.timeout) {
          // タイムアウト → 手動モードに切替 (Req 9.7)
          const timeoutMessage = createMessage(
            'assistant',
            'AI の応答がタイムアウトしました。手動で品質確認を行い、評価を送信できます。',
          )
          setState((prev) => ({
            ...prev,
            messages: [...prev.messages, timeoutMessage],
            qualityGateStatus: 'timeout',
            isValidating: false,
            canSubmit: true, // タイムアウト時は手動で送信可能
          }))
          return
        }

        if (result.data) {
          const { qualityOk, missingAspects, suggestions, turnNumber } = result.data

          const assistantContent = qualityOk
            ? '品質ゲート通過 — 評価を送信できます。'
            : suggestions

          const assistantMessage = createMessage('assistant', assistantContent)

          const newStatus: QualityGateStatus = qualityOk ? 'passed' : 'failed'

          setState((prev) => ({
            ...prev,
            messages: [...prev.messages, assistantMessage],
            qualityGateStatus: newStatus,
            isValidating: false,
            canSubmit: qualityOk,
            turnNumber,
            lastSuggestions: qualityOk ? null : suggestions,
            missingAspects: qualityOk ? [] : missingAspects,
          }))

          if (qualityOk) {
            onQualityGatePassed?.()
          }
          return
        }

        // エラーレスポンス
        const errorMessage = createMessage(
          'assistant',
          result.error ?? 'エラーが発生しました。もう一度お試しください。',
        )
        setState((prev) => ({
          ...prev,
          messages: [...prev.messages, errorMessage],
          qualityGateStatus: 'failed',
          isValidating: false,
          canSubmit: false,
        }))
      } catch (error: unknown) {
        if (error instanceof Error && error.name === 'AbortError') {
          return // キャンセル時は何もしない
        }
        const errorMessage = createMessage(
          'assistant',
          'ネットワークエラーが発生しました。接続を確認して再度お試しください。',
        )
        setState((prev) => ({
          ...prev,
          messages: [...prev.messages, errorMessage],
          qualityGateStatus: 'failed',
          isValidating: false,
          canSubmit: false,
        }))
      }
    },
    [cycleId, subjectRoleContext, onQualityGatePassed],
  )

  const reset = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
    }
    setState(INITIAL_STATE)
  }, [])

  return { state, sendComment, reset }
}
