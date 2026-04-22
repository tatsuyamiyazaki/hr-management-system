/**
 * Issue #179 / Task 15.4 + 16.2 / Req 8.5, 8.6, 8.7, 9.1–9.6:
 * 自己評価・ピア評価フォーム（AI コーチ統合）
 *
 * - cycleId + targetUserId をクエリパラメータで受け取る
 * - POST /api/evaluation/responses/draft  — 下書き保存
 * - POST /api/evaluation/responses/submit — 評価送信
 * - POST /api/evaluation/ai-coach/validate — AI 品質ゲート
 */
'use client'

import {
  useState,
  useRef,
  useEffect,
  type ReactElement,
  type FormEvent,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react'
import { useSearchParams } from 'next/navigation'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type EvaluationResponseType = 'SELF' | 'TOP_DOWN' | 'PEER'

interface ChatTurn {
  readonly role: 'user' | 'assistant'
  readonly content: string
}

interface ValidateResult {
  readonly qualityOk: boolean
  readonly missingAspects: readonly string[]
  readonly suggestions: string
  readonly turnNumber: number
}

interface ApiEnvelope<T> {
  readonly success?: boolean
  readonly data?: T
  readonly error?: string
  readonly timeout?: {
    readonly timeout: true
    readonly elapsedMs: number
    readonly fallbackToManual: true
  }
}

type SubmitState = 'idle' | 'saving' | 'submitting' | 'done'

type AiState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'checking' }
  | { readonly kind: 'ok'; readonly result: ValidateResult }
  | { readonly kind: 'ng'; readonly result: ValidateResult }
  | { readonly kind: 'timeout' }
  | { readonly kind: 'manual' }

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const RESPONSE_TYPE_LABELS: Record<EvaluationResponseType, string> = {
  SELF: '自己評価',
  TOP_DOWN: '上司評価',
  PEER: 'ピア評価',
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function postJson<T>(url: string, body: unknown): Promise<ApiEnvelope<T>> {
  const res = await fetch(url, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return (await res.json().catch(() => ({}))) as ApiEnvelope<T>
}

function readError(err: unknown): string {
  if (err instanceof Error) return err.message
  return '予期せぬエラーが発生しました'
}

function buildAiMessage(result: ValidateResult): string {
  if (result.qualityOk) {
    return `✅ 品質チェック通過！\n\n${result.suggestions}`
  }
  const aspects = result.missingAspects.map((a) => `• ${a}`).join('\n')
  return `❌ 改善が必要です\n\n不足している観点:\n${aspects}\n\n提案:\n${result.suggestions}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function EvaluationFormPage(): ReactElement {
  const searchParams = useSearchParams()
  const cycleId = searchParams.get('cycleId') ?? ''
  const targetUserId = searchParams.get('targetUserId') ?? ''

  // Form fields
  const [responseType, setResponseType] = useState<EvaluationResponseType>('PEER')
  const [score, setScore] = useState('80')
  const [comment, setComment] = useState('')
  const [subjectRoleContext, setSubjectRoleContext] = useState('')

  // AI coach
  const [chatHistory, setChatHistory] = useState<readonly ChatTurn[]>([])
  const [chatInput, setChatInput] = useState('')
  const [aiState, setAiState] = useState<AiState>({ kind: 'idle' })
  const chatBottomRef = useRef<HTMLDivElement>(null)

  // Submit
  const [submitState, setSubmitState] = useState<SubmitState>('idle')
  const [actionError, setActionError] = useState<string | null>(null)
  const [draftMsg, setDraftMsg] = useState<string | null>(null)

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory])

  const aiQualityPassed = aiState.kind === 'ok' || aiState.kind === 'manual'
  const canSubmit =
    submitState === 'idle' &&
    cycleId !== '' &&
    targetUserId !== '' &&
    comment.trim() !== '' &&
    aiQualityPassed

  // ── AI helpers ──────────────────────────────────────────────────────────────

  async function runAiValidate(history: readonly ChatTurn[]): Promise<void> {
    setAiState({ kind: 'checking' })
    try {
      const envelope = await postJson<ValidateResult>('/api/evaluation/ai-coach/validate', {
        cycleId,
        subjectRoleContext: subjectRoleContext || '役割情報なし',
        draftComment: comment,
        conversationHistory: history,
      })

      if (envelope.timeout) {
        setAiState({ kind: 'timeout' })
        setChatHistory((h) => [
          ...h,
          {
            role: 'assistant',
            content: 'AI の応答がタイムアウトしました。手動モードに切り替えられます。',
          },
        ])
        return
      }

      const result = envelope.data
      if (!result) {
        setAiState({
          kind: 'ng',
          result: {
            qualityOk: false,
            missingAspects: [],
            suggestions: envelope.error ?? 'エラーが発生しました',
            turnNumber: 0,
          },
        })
        return
      }

      setChatHistory((h) => [...h, { role: 'assistant', content: buildAiMessage(result) }])
      setAiState(result.qualityOk ? { kind: 'ok', result } : { kind: 'ng', result })
    } catch (err) {
      setAiState({
        kind: 'ng',
        result: {
          qualityOk: false,
          missingAspects: [],
          suggestions: readError(err),
          turnNumber: 0,
        },
      })
    }
  }

  async function handleAiCheck(): Promise<void> {
    if (!comment.trim()) return
    const nextHistory: readonly ChatTurn[] = [
      ...chatHistory,
      { role: 'user', content: `評価コメント:\n${comment}` },
    ]
    setChatHistory(nextHistory)
    await runAiValidate(nextHistory)
  }

  async function handleChatSend(): Promise<void> {
    if (!chatInput.trim() || aiState.kind === 'checking') return
    const userMsg = chatInput.trim()
    setChatInput('')
    const nextHistory: readonly ChatTurn[] = [...chatHistory, { role: 'user', content: userMsg }]
    setChatHistory(nextHistory)
    await runAiValidate(nextHistory)
  }

  function handleChatKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleChatSend()
    }
  }

  // ── Form actions ─────────────────────────────────────────────────────────────

  async function handleSaveDraft(e: FormEvent): Promise<void> {
    e.preventDefault()
    setSubmitState('saving')
    setActionError(null)
    setDraftMsg(null)
    try {
      const envelope = await postJson('/api/evaluation/responses/draft', {
        cycleId,
        targetUserId,
        responseType,
        score: Number(score),
        comment: comment || undefined,
      })
      if (envelope.error) throw new Error(envelope.error)
      setDraftMsg('下書きを保存しました')
    } catch (err) {
      setActionError(readError(err))
    } finally {
      setSubmitState('idle')
    }
  }

  async function handleSubmit(): Promise<void> {
    if (!canSubmit) return
    setSubmitState('submitting')
    setActionError(null)
    setDraftMsg(null)
    try {
      const envelope = await postJson('/api/evaluation/responses/submit', {
        cycleId,
        targetUserId,
        responseType,
        score: Number(score),
        comment: comment || undefined,
      })
      if (envelope.error) throw new Error(envelope.error)
      setSubmitState('done')
    } catch (err) {
      setActionError(readError(err))
      setSubmitState('idle')
    }
  }

  // ── Guard: missing query params ───────────────────────────────────────────

  if (!cycleId || !targetUserId) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-10">
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-6 text-sm text-amber-800">
          <p className="font-semibold">パラメータが不足しています</p>
          <p className="mt-1 text-xs">
            URL に <span className="font-mono">?cycleId=...&targetUserId=...</span> が必要です。
          </p>
          <a
            href="/evaluation/assignments"
            className="mt-3 inline-block text-xs font-medium text-amber-700 underline"
          >
            割り当て一覧から開く
          </a>
        </div>
      </main>
    )
  }

  // ── Complete screen ───────────────────────────────────────────────────────

  if (submitState === 'done') {
    return (
      <main className="mx-auto max-w-2xl px-6 py-10">
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-10 text-center">
          <p className="text-2xl font-bold text-emerald-800">評価を送信しました ✓</p>
          <p className="mt-2 text-sm text-emerald-700">ご協力ありがとうございました。</p>
          <a
            href="/evaluation/assignments"
            className="mt-5 inline-block rounded-lg border border-emerald-400 px-5 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
          >
            割り当て一覧に戻る
          </a>
        </div>
      </main>
    )
  }

  // ── Main form ─────────────────────────────────────────────────────────────

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8">
        <p className="text-xs font-semibold tracking-widest text-indigo-600 uppercase">360度評価</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">評価フォーム</h1>
        <p className="mt-2 text-sm text-slate-600">
          評価を入力し、AI コーチの品質チェックを通過してから送信してください。
        </p>
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
          <span>
            サイクル: <span className="font-mono">{cycleId}</span>
          </span>
          <span>
            対象者: <span className="font-mono">{targetUserId}</span>
          </span>
        </div>
      </header>

      <div className="space-y-6">
        {/* ── Evaluation form ── */}
        <form
          onSubmit={handleSaveDraft}
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <h2 className="mb-4 font-semibold text-slate-800">評価内容</h2>
          <div className="space-y-4">
            {/* Response type */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">評価種別</label>
              <div className="flex flex-wrap gap-2">
                {(['SELF', 'TOP_DOWN', 'PEER'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setResponseType(t)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                      responseType === t
                        ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200'
                    }`}
                  >
                    {RESPONSE_TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>

            {/* Score slider */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                スコア（0〜100）<span className="text-rose-500">*</span>
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={score}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setScore(e.target.value)}
                  className="flex-1"
                />
                <span className="w-10 text-right text-lg font-bold text-indigo-600">{score}</span>
              </div>
              <div className="mt-0.5 flex justify-between text-xs text-slate-400">
                <span>0</span>
                <span>基準: 80点</span>
                <span>100</span>
              </div>
            </div>

            {/* Subject role context */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                対象者の役職・等級コンテキスト（AI コーチ用）
              </label>
              <input
                value={subjectRoleContext}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setSubjectRoleContext(e.target.value)
                }
                placeholder="例: シニアエンジニア / グレード3"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              />
            </div>

            {/* Comment */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                評価コメント <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={5}
                maxLength={2000}
                value={comment}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
                  setComment(e.target.value)
                  if (aiState.kind === 'ok' || aiState.kind === 'ng') {
                    setAiState({ kind: 'idle' })
                  }
                }}
                placeholder="具体的なエピソードを含め、価値観体現・経営貢献の観点から評価してください"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              />
              <p className="mt-0.5 text-right text-xs text-slate-400">{comment.length} / 2000</p>
            </div>
          </div>

          {actionError && <p className="mt-2 text-xs text-rose-600">{actionError}</p>}
          {draftMsg && <p className="mt-2 text-xs text-emerald-600">{draftMsg}</p>}

          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={submitState === 'saving'}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {submitState === 'saving' ? '保存中…' : '下書き保存'}
            </button>
          </div>
        </form>

        {/* ── AI Coach Chat ── */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <div>
              <p className="font-semibold text-slate-800">AI コーチ</p>
              <p className="text-xs text-slate-500">
                コメントの具体性・価値観関連性を判定します（品質ゲート）
              </p>
            </div>
            <AiBadge state={aiState} />
          </div>

          {/* Messages */}
          <div className="max-h-72 space-y-3 overflow-y-auto p-4">
            {chatHistory.length === 0 && (
              <p className="py-4 text-center text-xs text-slate-400">
                「AI チェック開始」を押すと品質チェックが始まります
              </p>
            )}
            {chatHistory.map((turn, i) => (
              <div
                key={i}
                className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-xl px-3 py-2 text-xs whitespace-pre-wrap ${
                    turn.role === 'user'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {turn.content}
                </div>
              </div>
            ))}
            {aiState.kind === 'checking' && (
              <div className="flex justify-start">
                <div className="rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-500">
                  <span className="animate-pulse">AI が判定中…</span>
                </div>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Input area */}
          <div className="border-t border-slate-100 p-4">
            {aiState.kind === 'idle' && (
              <button
                type="button"
                disabled={!comment.trim()}
                onClick={() => void handleAiCheck()}
                className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                AI チェック開始
              </button>
            )}

            {aiState.kind === 'ng' && (
              <div className="flex gap-2">
                <textarea
                  rows={2}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={handleChatKeyDown}
                  placeholder="AI に質問・追記内容を入力（Enter で送信）"
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                />
                <button
                  type="button"
                  disabled={!chatInput.trim()}
                  onClick={() => void handleChatSend()}
                  className="shrink-0 self-end rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  送信
                </button>
              </div>
            )}

            {aiState.kind === 'timeout' && (
              <div className="flex items-center justify-between rounded-lg bg-amber-50 px-4 py-2">
                <p className="text-xs text-amber-700">AI タイムアウト — 手動モードで送信できます</p>
                <button
                  type="button"
                  onClick={() => setAiState({ kind: 'manual' })}
                  className="text-xs font-medium text-amber-700 underline"
                >
                  手動モードで続行
                </button>
              </div>
            )}

            {(aiState.kind === 'ok' || aiState.kind === 'manual') && (
              <p className="text-center text-xs text-emerald-600">
                ✅{' '}
                {aiState.kind === 'ok'
                  ? '品質チェック通過 — 送信ボタンが有効になりました'
                  : '手動モード — 送信ボタンが有効になりました'}
              </p>
            )}
          </div>
        </div>

        {/* ── Submit ── */}
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            disabled={
              submitState !== 'idle' ||
              !aiQualityPassed ||
              !comment.trim() ||
              !cycleId ||
              !targetUserId
            }
            onClick={() => void handleSubmit()}
            className="rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
          >
            {submitState === 'submitting' ? '送信中…' : '評価を送信する'}
          </button>
          {!aiQualityPassed && comment.trim() && (
            <p className="text-xs text-slate-400">
              ※ AI 品質チェックを通過すると送信ボタンが有効になります
            </p>
          )}
        </div>
      </div>
    </main>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AiBadge
// ─────────────────────────────────────────────────────────────────────────────

function AiBadge({ state }: { readonly state: AiState }): ReactElement {
  const badges: Record<AiState['kind'], { label: string; cls: string }> = {
    idle: { label: '未チェック', cls: 'bg-slate-100 text-slate-500' },
    checking: { label: '判定中…', cls: 'bg-amber-100 text-amber-700 animate-pulse' },
    ok: { label: '✓ 通過', cls: 'bg-emerald-100 text-emerald-700 font-medium' },
    ng: { label: '要改善', cls: 'bg-rose-100 text-rose-700 font-medium' },
    timeout: { label: 'タイムアウト', cls: 'bg-amber-100 text-amber-700 font-medium' },
    manual: { label: '✓ 手動', cls: 'bg-emerald-100 text-emerald-700 font-medium' },
  }
  const { label, cls } = badges[state.kind]
  return <span className={`rounded-full px-2 py-0.5 text-xs ${cls}`}>{label}</span>
}
