/**
 * Issue #182 / Task 20.1 / Req 18.1, 18.2, 18.3: 異議申立て送信フォーム
 *
 * - POST /api/appeals — 異議申立てを送信（EMPLOYEE）
 *   body: { targetType, targetId, reason, desiredOutcome? }
 */
'use client'

import { useState, type ReactElement, type FormEvent } from 'react'
import { useSearchParams } from 'next/navigation'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type AppealTargetType = 'FEEDBACK' | 'TOTAL_EVALUATION'

interface Appeal {
  readonly id: string
  readonly appellantId: string
  readonly cycleId: string
  readonly subjectId: string
  readonly targetType: AppealTargetType
  readonly targetId: string
  readonly reason: string
  readonly desiredOutcome: string | null
  readonly status: string
  readonly submittedAt: string
}

interface ApiEnvelope<T> {
  readonly success?: boolean
  readonly data?: T
  readonly error?: string
  readonly deadline?: string
}

interface AppealForm {
  targetType: AppealTargetType
  targetId: string
  reason: string
  desiredOutcome: string
}

type SubmitState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'submitting' }
  | { readonly kind: 'done'; readonly appeal: Appeal }
  | { readonly kind: 'deadline'; readonly deadline: string }
  | { readonly kind: 'error'; readonly message: string }

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function postJson<T>(
  url: string,
  body: unknown,
): Promise<{ data: T; envelope: ApiEnvelope<T> }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  const envelope = (await res.json().catch(() => ({}))) as ApiEnvelope<T>
  if (!res.ok) {
    const err = Object.assign(new Error(envelope.error ?? `HTTP ${res.status}`), { envelope })
    throw err
  }
  return { data: (envelope.data ?? null) as T, envelope }
}

function readError(err: unknown): string {
  if (err instanceof Error) return err.message
  return '予期せぬエラーが発生しました'
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return iso
  }
}

const TARGET_TYPE_LABELS: Record<AppealTargetType, string> = {
  FEEDBACK: '360度フィードバック',
  TOTAL_EVALUATION: '総合評価',
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function AppealSubmitPage(): ReactElement {
  const searchParams = useSearchParams()
  const defaultTargetType = (searchParams.get('targetType') ??
    'TOTAL_EVALUATION') as AppealTargetType
  const defaultTargetId = searchParams.get('targetId') ?? ''

  const [form, setForm] = useState<AppealForm>({
    targetType: defaultTargetType,
    targetId: defaultTargetId,
    reason: '',
    desiredOutcome: '',
  })
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: 'idle' })

  const canSubmit =
    form.targetId.trim().length > 0 &&
    form.reason.trim().length > 0 &&
    form.reason.trim().length <= 2000 &&
    (form.desiredOutcome.trim().length === 0 || form.desiredOutcome.trim().length <= 1000) &&
    submitState.kind !== 'submitting'

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitState({ kind: 'submitting' })
    try {
      const payload: Record<string, unknown> = {
        targetType: form.targetType,
        targetId: form.targetId.trim(),
        reason: form.reason.trim(),
      }
      if (form.desiredOutcome.trim()) {
        payload.desiredOutcome = form.desiredOutcome.trim()
      }
      const { data } = await postJson<Appeal>('/api/appeals', payload)
      setSubmitState({ kind: 'done', appeal: data })
    } catch (err) {
      const envelope = (err as Error & { envelope?: ApiEnvelope<Appeal> }).envelope
      if (envelope?.deadline) {
        setSubmitState({ kind: 'deadline', deadline: envelope.deadline })
        return
      }
      setSubmitState({ kind: 'error', message: readError(err) })
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-widest text-indigo-600 uppercase">評価</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">異議申立て</h1>
          <p className="mt-2 text-sm text-slate-600">
            評価結果に異議がある場合は、公開日から 14 日以内に申立てを提出してください。
          </p>
        </div>
        <a
          href="/evaluation/cycles"
          className="shrink-0 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          ← サイクル一覧
        </a>
      </header>

      {submitState.kind === 'done' ? (
        /* 送信完了 */
        <div className="space-y-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6">
            <p className="text-lg font-bold text-emerald-800">✓ 異議申立てを受け付けました</p>
            <p className="mt-1 text-sm text-emerald-700">
              HR マネージャーが審査を行い、結果をお知らせします。
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-700 shadow-sm">
            <dl className="space-y-2">
              <div className="flex gap-2">
                <dt className="shrink-0 font-medium text-slate-500">申立て ID:</dt>
                <dd className="font-mono text-xs">{submitState.appeal.id}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="shrink-0 font-medium text-slate-500">対象:</dt>
                <dd>{TARGET_TYPE_LABELS[submitState.appeal.targetType]}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="shrink-0 font-medium text-slate-500">ステータス:</dt>
                <dd>
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                    受付済み
                  </span>
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="shrink-0 font-medium text-slate-500">提出日:</dt>
                <dd>{formatDate(submitState.appeal.submittedAt)}</dd>
              </div>
            </dl>
          </div>
          <a
            href="/evaluation/cycles"
            className="inline-block rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            サイクル一覧へ戻る
          </a>
        </div>
      ) : (
        /* 送信フォーム */
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {/* 期限切れエラー */}
          {submitState.kind === 'deadline' && (
            <div className="mb-5 rounded-lg border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800">
              <p className="font-semibold">申立て期限が過ぎています</p>
              <p className="mt-1 text-xs">
                申立て期限（{formatDate(submitState.deadline)}）を過ぎているため、送信できません。
              </p>
            </div>
          )}

          {/* 汎用エラー */}
          {submitState.kind === 'error' && (
            <div className="mb-5 rounded-lg border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800">
              <p className="font-semibold">送信に失敗しました</p>
              <p className="mt-1 text-xs">{submitState.message}</p>
            </div>
          )}

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
            {/* 対象種別 */}
            <div>
              <p className="mb-2 text-xs font-medium text-slate-600">
                対象種別 <span className="text-rose-500">*</span>
              </p>
              <div className="flex gap-4">
                {(['TOTAL_EVALUATION', 'FEEDBACK'] as const).map((type) => (
                  <label key={type} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name="targetType"
                      value={type}
                      checked={form.targetType === type}
                      onChange={() => setForm((f) => ({ ...f, targetType: type }))}
                      disabled={submitState.kind === 'submitting'}
                      className="accent-indigo-600"
                    />
                    {TARGET_TYPE_LABELS[type]}
                  </label>
                ))}
              </div>
            </div>

            {/* 対象ID */}
            <div>
              <label htmlFor="targetId" className="mb-1 block text-xs font-medium text-slate-600">
                対象 ID <span className="text-rose-500">*</span>
              </label>
              <input
                id="targetId"
                type="text"
                value={form.targetId}
                onChange={(e) => setForm((f) => ({ ...f, targetId: e.target.value }))}
                disabled={submitState.kind === 'submitting'}
                placeholder="評価 ID またはフィードバック ID"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none disabled:bg-slate-50"
              />
              <p className="mt-0.5 text-xs text-slate-400">
                フィードバック閲覧画面または総合評価プレビュー画面の ID をご確認ください
              </p>
            </div>

            {/* 理由 */}
            <div>
              <label htmlFor="reason" className="mb-1 block text-xs font-medium text-slate-600">
                申立て理由 <span className="text-rose-500">*</span>
              </label>
              <textarea
                id="reason"
                rows={5}
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                disabled={submitState.kind === 'submitting'}
                placeholder="評価結果に異議がある理由を具体的に記入してください（2000文字以内）"
                maxLength={2000}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none disabled:bg-slate-50"
              />
              <p className="mt-0.5 text-right text-xs text-slate-400">
                {form.reason.length} / 2000
              </p>
            </div>

            {/* 希望対応（任意） */}
            <div>
              <label
                htmlFor="desiredOutcome"
                className="mb-1 block text-xs font-medium text-slate-600"
              >
                希望する対応{' '}
                <span className="font-normal text-slate-400">（任意・1000文字以内）</span>
              </label>
              <textarea
                id="desiredOutcome"
                rows={3}
                value={form.desiredOutcome}
                onChange={(e) => setForm((f) => ({ ...f, desiredOutcome: e.target.value }))}
                disabled={submitState.kind === 'submitting'}
                placeholder="再評価・説明・修正など、希望する対応があれば記入してください"
                maxLength={1000}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none disabled:bg-slate-50"
              />
              <p className="mt-0.5 text-right text-xs text-slate-400">
                {form.desiredOutcome.length} / 1000
              </p>
            </div>

            {/* 注意書き */}
            <div className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-xs text-amber-800">
              <p className="font-semibold">申立て前にご確認ください</p>
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                <li>評価公開日から 14 日以内の申立てのみ受け付けています</li>
                <li>申立て後は HR マネージャーが審査を行います</li>
                <li>審査結果は通知でお知らせします</li>
              </ul>
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className="rounded-lg bg-indigo-600 px-6 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitState.kind === 'submitting' ? '送信中…' : '異議申立てを送信'}
            </button>
          </form>
        </section>
      )}
    </main>
  )
}
