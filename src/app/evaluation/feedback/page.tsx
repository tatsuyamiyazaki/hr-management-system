/**
 * Issue #180 / Task 17.4 / Req 10.6, 10.7, 10.8: 被評価者向けフィードバック閲覧画面
 *
 * - GET  /api/feedback/published — 自分への公開済みフィードバック一覧（evaluatorId 除外）
 * - POST /api/feedback/view      — 閲覧確認日時を記録（{ cycleId, subjectId }）
 */
'use client'

import { useEffect, useState, type ReactElement } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface PublishedFeedback {
  readonly id: string
  readonly cycleId: string
  readonly subjectId: string
  readonly transformedBatch: readonly string[]
  readonly summary: string
  readonly publishedAt: string
}

interface ApiEnvelope<T> {
  readonly success?: boolean
  readonly data?: T
  readonly error?: string
}

type ListState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly items: readonly PublishedFeedback[] }

// viewedAt は API から返されないため、画面セッション内で管理
type ViewedSet = ReadonlySet<string> // feedback.id

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...options })
  const envelope = (await res.json().catch(() => ({}))) as ApiEnvelope<T>
  if (!res.ok) throw new Error(envelope.error ?? `HTTP ${res.status}`)
  return (envelope.data ?? null) as T
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

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function FeedbackViewPage(): ReactElement {
  const [listState, setListState] = useState<ListState>({ kind: 'loading' })
  const [viewed, setViewed] = useState<ViewedSet>(new Set())
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())

  useEffect(() => {
    void (async () => {
      try {
        const items = await fetchJson<PublishedFeedback[]>('/api/feedback/published')
        setListState({ kind: 'ready', items: items ?? [] })
      } catch (err) {
        setListState({ kind: 'error', message: readError(err) })
      }
    })()
  }, [])

  function toggleExpand(id: string): void {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  async function markViewed(fb: PublishedFeedback): Promise<void> {
    if (viewed.has(fb.id)) return
    try {
      await fetchJson<null>('/api/feedback/view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cycleId: fb.cycleId, subjectId: fb.subjectId }),
      })
      setViewed((prev) => new Set([...prev, fb.id]))
    } catch {
      // 閲覧記録の失敗はサイレントに処理（UX を妨げない）
    }
  }

  function handleExpand(fb: PublishedFeedback): void {
    toggleExpand(fb.id)
    if (!viewed.has(fb.id) && !expanded.has(fb.id)) {
      void markViewed(fb)
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-8 py-10">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-widest text-indigo-600 uppercase">
            360度評価
          </p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">フィードバック閲覧</h1>
          <p className="mt-2 text-sm text-slate-600">
            あなたへの公開済みフィードバックを確認できます（評価者名は非表示）。
          </p>
        </div>
        <a
          href="/evaluation/cycles"
          className="shrink-0 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          ← サイクル一覧
        </a>
      </header>

      {listState.kind === 'loading' && (
        <div className="py-16 text-center text-sm text-slate-400">
          <span className="animate-pulse">読み込み中…</span>
        </div>
      )}

      {listState.kind === 'error' && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 p-6 text-sm text-rose-800">
          <p className="font-semibold">フィードバックの取得に失敗しました</p>
          <p className="mt-1 text-xs">{listState.message}</p>
        </div>
      )}

      {listState.kind === 'ready' && listState.items.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400">
          公開済みのフィードバックはまだありません
        </div>
      )}

      {listState.kind === 'ready' && listState.items.length > 0 && (
        <div className="space-y-4">
          {listState.items.map((fb) => {
            const isExpanded = expanded.has(fb.id)
            const isViewed = viewed.has(fb.id)

            return (
              <article
                key={fb.id}
                className="rounded-xl border border-slate-200 bg-white shadow-sm"
              >
                {/* ヘッダー */}
                <button
                  type="button"
                  onClick={() => handleExpand(fb)}
                  className="flex w-full items-center justify-between px-6 py-4 text-left"
                >
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-800">
                          サイクル:{' '}
                          <span className="font-mono text-xs text-slate-600">{fb.cycleId}</span>
                        </p>
                        {isViewed ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            閲覧済み
                          </span>
                        ) : (
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                            未読
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        公開日: {formatDate(fb.publishedAt)}
                      </p>
                    </div>
                  </div>
                  <span className="text-slate-400" aria-hidden>
                    {isExpanded ? '▲' : '▼'}
                  </span>
                </button>

                {/* コンテンツ */}
                {isExpanded && (
                  <div className="space-y-4 border-t border-slate-100 px-6 pt-4 pb-6">
                    {/* サマリー */}
                    <div>
                      <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                        サマリー
                      </h3>
                      <p className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm leading-relaxed text-slate-800">
                        {fb.summary}
                      </p>
                    </div>

                    {/* 個別コメント */}
                    {fb.transformedBatch.length > 0 && (
                      <div>
                        <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                          コメント（{fb.transformedBatch.length} 件）
                        </h3>
                        <ul className="space-y-2">
                          {fb.transformedBatch.map((comment, i) => (
                            <li
                              key={i}
                              className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-700"
                            >
                              {comment}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <p className="text-xs text-slate-400">
                      ※ 評価者の氏名は匿名性保護のため表示されません
                    </p>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </main>
  )
}
