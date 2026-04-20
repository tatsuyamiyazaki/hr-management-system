/**
 * Issue #58 / Task 16.2: 対話型入力 UI（チャットボット形式）
 * (Requirements: 9.1, 9.3, 9.5, 9.6)
 *
 * 評価フォーム内のチャットボット形式 AI コーチング UI。
 *
 * - チャット形式のメッセージ表示（user / assistant ロール）
 * - 品質NGで「評価完了」ボタンを無効化 (Req 9.3)
 * - AI判定中のローディングインジケーター表示 (Req 9.5)
 * - 入力欄は AI 判定中も編集可能 (Req 9.5)
 * - 品質ゲート通過時に「評価完了」ボタンを有効化 (Req 9.6)
 */
'use client'

import { useRef, useState, type FormEvent, type ReactElement } from 'react'
import { useAICoachChat, type UseAICoachChatProps } from './useAICoachChat'
import type { QualityGateStatus } from './ai-coach-chat-types'

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface AICoachChatProps extends UseAICoachChatProps {
  /** 「評価完了」ボタン押下時のコールバック */
  readonly onSubmitEvaluation?: () => void
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function AICoachChat(props: AICoachChatProps): ReactElement {
  const { onSubmitEvaluation, ...hookProps } = props
  const { state, sendComment } = useAICoachChat(hookProps)
  const [inputValue, setInputValue] = useState('')
  const chatBodyRef = useRef<HTMLDivElement>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const trimmed = inputValue.trim()
    if (!trimmed || state.isValidating) return
    setInputValue('')
    await sendComment(trimmed)
    // スクロールを最下部に
    requestAnimationFrame(() => {
      chatBodyRef.current?.scrollTo({
        top: chatBodyRef.current.scrollHeight,
        behavior: 'smooth',
      })
    })
  }

  return (
    <div className="flex h-full flex-col rounded-lg border border-slate-200 bg-white shadow-sm">
      {/* ヘッダー */}
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
        <span className="text-sm font-semibold text-slate-800" aria-label="AIコーチング">
          ✦ AIコーチング — 評価コメント作成
        </span>
        <QualityGateIndicator status={state.qualityGateStatus} />
      </div>

      {/* チャットボディ */}
      <div
        ref={chatBodyRef}
        className="flex-1 space-y-3 overflow-y-auto p-4"
        role="log"
        aria-live="polite"
        aria-label="AIコーチングチャット"
      >
        {state.messages.length === 0 && (
          <p className="text-center text-sm text-slate-400">
            評価コメントを入力してAIコーチングを開始してください。
          </p>
        )}

        {state.messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-[11px] font-semibold text-white">
                AI
              </span>
            )}
            <div
              className={`max-w-[80%] rounded-xl px-3 py-2.5 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-slate-100 text-slate-800'
                  : 'bg-indigo-50 text-slate-800'
              }`}
            >
              {msg.content}
            </div>
            {msg.role === 'user' && (
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-600 text-[11px] font-semibold text-white">
                私
              </span>
            )}
          </div>
        ))}

        {/* ローディングインジケーター (Req 9.5) */}
        {state.isValidating && (
          <div className="flex items-center gap-2.5" aria-label="AI判定中">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-[11px] font-semibold text-white">
              AI
            </span>
            <div className="flex gap-1 rounded-xl bg-indigo-50 px-4 py-3">
              <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-400 [animation-delay:0ms]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-400 [animation-delay:150ms]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-400 [animation-delay:300ms]" />
            </div>
          </div>
        )}

        {/* 品質ゲート通過表示 */}
        {state.qualityGateStatus === 'passed' && (
          <div
            className="flex items-center gap-2 rounded-md border border-emerald-500 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700"
            role="status"
            aria-label="品質ゲート通過"
          >
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            品質ゲート通過 — 評価を送信できます
          </div>
        )}
      </div>

      {/* 入力フォーム (Req 9.5: AI判定中も編集可能) */}
      <form
        onSubmit={handleSubmit}
        className="flex gap-2 border-t border-slate-200 p-3"
      >
        <textarea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="評価コメントを入力してください…"
          className="flex-1 resize-none rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          rows={2}
          aria-label="評価コメント入力"
          disabled={false}
        />
        <button
          type="submit"
          disabled={!inputValue.trim() || state.isValidating}
          className="shrink-0 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="送信"
        >
          送信
        </button>
      </form>

      {/* 評価完了ボタン (Req 9.3, 9.6) */}
      <div className="flex justify-end border-t border-slate-100 px-4 py-3">
        <button
          type="button"
          onClick={onSubmitEvaluation}
          disabled={!state.canSubmit}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="評価完了"
        >
          評価完了
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function QualityGateIndicator({ status }: { status: QualityGateStatus }): ReactElement | null {
  switch (status) {
    case 'validating':
      return (
        <span className="ml-auto inline-flex items-center gap-1 text-xs text-slate-500">
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
          判定中…
        </span>
      )
    case 'passed':
      return (
        <span className="ml-auto inline-flex items-center gap-1 text-xs text-emerald-600">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          品質OK
        </span>
      )
    case 'failed':
      return (
        <span className="ml-auto inline-flex items-center gap-1 text-xs text-red-600">
          <span className="h-2 w-2 rounded-full bg-red-500" />
          品質NG
        </span>
      )
    case 'timeout':
      return (
        <span className="ml-auto inline-flex items-center gap-1 text-xs text-amber-600">
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          手動確認モード
        </span>
      )
    default:
      return null
  }
}
