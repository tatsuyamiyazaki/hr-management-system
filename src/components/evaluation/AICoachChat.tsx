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

import {
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactElement,
} from 'react'
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
  const headingId = useId()
  const descriptionId = useId()
  const inputLabelId = useId()
  const inputHintId = useId()
  const inputShortcutId = useId()
  const statusId = useId()

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

  const handleInputKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      void handleSubmit(e)
    }
  }

  const hasGuidance = state.qualityGateStatus === 'failed' || state.qualityGateStatus === 'timeout'

  return (
    <section
      className="flex h-full min-h-[32rem] flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm"
      aria-labelledby={headingId}
      aria-describedby={descriptionId}
    >
      {/* ヘッダー */}
      <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 id={headingId} className="text-base font-semibold text-slate-900">
            AIコーチング
          </h2>
          <p id={descriptionId} className="text-sm leading-6 text-slate-700">
            評価コメントを入力すると、AI が不足している観点を分かりやすく案内します。
            キーボードだけでも操作でき、スマートフォンでも読みやすい構成です。
          </p>
        </div>
        <QualityGateIndicator status={state.qualityGateStatus} />
      </div>

      {/* チャットボディ */}
      <div
        ref={chatBodyRef}
        className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5"
        role="log"
        aria-live="polite"
        aria-label="AIコーチングチャット"
        aria-busy={state.isValidating}
        aria-describedby={hasGuidance ? statusId : undefined}
        tabIndex={0}
      >
        {state.messages.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center text-sm leading-6 text-slate-600">
            評価コメントを入力してAIコーチングを開始してください。
          </p>
        )}

        {state.messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-start gap-2.5 ${
              msg.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
            aria-label={msg.role === 'user' ? 'あなたのメッセージ' : 'AIからのメッセージ'}
          >
            {msg.role === 'assistant' && (
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-700 text-[11px] font-semibold text-white"
                aria-hidden="true"
              >
                AI
              </span>
            )}
            <div
              className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-6 sm:max-w-[80%] ${
                msg.role === 'user'
                  ? 'bg-slate-800 text-white'
                  : 'border border-indigo-100 bg-indigo-50 text-slate-900'
              }`}
            >
              {msg.content}
            </div>
            {msg.role === 'user' && (
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-700 text-[11px] font-semibold text-white"
                aria-hidden="true"
              >
                私
              </span>
            )}
          </div>
        ))}

        {/* ローディングインジケーター (Req 9.5) */}
        {state.isValidating && (
          <div className="flex items-center gap-2.5" role="status" aria-label="AI判定中">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-700 text-[11px] font-semibold text-white"
              aria-hidden="true"
            >
              AI
            </span>
            <div className="flex items-center gap-3 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-slate-800">
              <div className="flex gap-1" aria-hidden="true">
                <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-500 [animation-delay:0ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-500 [animation-delay:150ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-500 [animation-delay:300ms]" />
              </div>
              <span>入力内容を確認しています。少しお待ちください。</span>
            </div>
          </div>
        )}

        {state.qualityGateStatus === 'failed' && (
          <div
            id={statusId}
            className="space-y-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
            role="status"
            aria-live="polite"
          >
            <p className="font-medium">
              もう少しで送信できます。次の観点を補うと通りやすくなります。
            </p>
            {state.missingAspects.length > 0 && (
              <ul className="list-disc space-y-1 pl-5">
                {state.missingAspects.map((aspect) => (
                  <li key={aspect}>{aspect}</li>
                ))}
              </ul>
            )}
            {state.lastSuggestions && <p className="leading-6">{state.lastSuggestions}</p>}
          </div>
        )}

        {state.qualityGateStatus === 'timeout' && (
          <div
            id={statusId}
            className="rounded-2xl border border-sky-300 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-950"
            role="status"
            aria-live="polite"
          >
            AI の応答が遅いため手動確認モードに切り替えています。内容を見直したうえで、
            必要ならそのまま評価完了に進めます。
          </div>
        )}

        {/* 品質ゲート通過表示 */}
        {state.qualityGateStatus === 'passed' && (
          <div
            className="flex items-center gap-2 rounded-2xl border border-emerald-600 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900"
            role="status"
            aria-label="品質ゲート通過"
          >
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            品質ゲート通過 — 評価を送信できます
          </div>
        )}
      </div>

      {/* 入力フォーム (Req 9.5: AI判定中も編集可能) */}
      <form onSubmit={handleSubmit} className="border-t border-slate-200 p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label
              id={inputLabelId}
              htmlFor="ai-coach-comment"
              className="text-sm font-medium text-slate-900"
            >
              評価コメント入力
            </label>
            <p id={inputHintId} className="mt-1 text-xs leading-5 text-slate-600">
              箇条書きでも短文でも大丈夫です。AI が不足点を案内します。
            </p>
            <p id={inputShortcutId} className="mt-1 text-xs leading-5 text-slate-500">
              Enter で改行、Ctrl+Enter または Command+Enter で送信できます。
            </p>
            <textarea
              id="ai-coach-comment"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="評価コメントを入力してください…"
              className="mt-2 min-h-24 w-full resize-y rounded-xl border border-slate-400 px-4 py-3 text-sm leading-6 text-slate-900 placeholder:text-slate-500 focus:border-indigo-700 focus:ring-2 focus:ring-indigo-200 focus:outline-none"
              rows={4}
              aria-labelledby={inputLabelId}
              aria-describedby={`${inputHintId} ${inputShortcutId}`}
              disabled={false}
            />
          </div>
          <button
            type="submit"
            disabled={!inputValue.trim() || state.isValidating}
            className="w-full shrink-0 rounded-xl bg-indigo-700 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-800 focus:ring-2 focus:ring-indigo-300 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 sm:w-auto"
            aria-label="送信"
          >
            送信
          </button>
        </div>
      </form>

      {/* 評価完了ボタン (Req 9.3, 9.6) */}
      <div className="flex justify-stretch border-t border-slate-100 px-3 py-3 sm:justify-end sm:px-4">
        <button
          type="button"
          onClick={onSubmitEvaluation}
          disabled={!state.canSubmit}
          className="w-full rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 focus:ring-2 focus:ring-emerald-300 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 sm:w-auto"
          aria-label="評価完了"
        >
          評価完了
        </button>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function QualityGateIndicator({ status }: { status: QualityGateStatus }): ReactElement | null {
  switch (status) {
    case 'validating':
      return (
        <span
          className="inline-flex items-center gap-1 self-start rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-900 sm:self-center"
          role="status"
        >
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
          判定中…
        </span>
      )
    case 'passed':
      return (
        <span className="inline-flex items-center gap-1 self-start rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-900 sm:self-center">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          品質OK
        </span>
      )
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1 self-start rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-900 sm:self-center">
          <span className="h-2 w-2 rounded-full bg-red-500" />
          品質NG
        </span>
      )
    case 'timeout':
      return (
        <span className="inline-flex items-center gap-1 self-start rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-900 sm:self-center">
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          手動確認モード
        </span>
      )
    default:
      return null
  }
}
