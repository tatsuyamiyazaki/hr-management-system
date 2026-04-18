/**
 * Issue #37 / Req 4.1, 4.2, 4.3: スキルマップ画面 (HR_MANAGER 向け)
 *
 * - マウント時に /api/skill-analytics/summary と /heatmap を並列取得
 * - 組織サマリカード / ヒートマップを表示
 * - 社員 ID 入力 → /api/skill-analytics/radar?userId= を取得してレーダーを表示
 *
 * 権限判定はサーバ側で行う前提。UI 側は取得失敗時にエラー状態として描画する。
 */
'use client'

import { useCallback, useEffect, useState, type FormEvent, type ReactElement } from 'react'
import { SkillHeatmap } from '@/components/skill/SkillHeatmap'
import { SkillRadar } from '@/components/skill/SkillRadar'
import { SummaryCard } from '@/components/skill/SummaryCard'
import type {
  RadarData,
  SkillHeatmap as SkillHeatmapData,
  SkillSummary,
} from '@/lib/skill/skill-analytics-types'

interface ApiEnvelope<T> {
  readonly success: boolean
  readonly data: T
}

type OverviewState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | {
      readonly kind: 'ready'
      readonly summary: SkillSummary
      readonly heatmap: SkillHeatmapData
    }

type RadarState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading'; readonly userId: string }
  | { readonly kind: 'error'; readonly userId: string; readonly message: string }
  | { readonly kind: 'ready'; readonly data: RadarData }

const SUMMARY_URL = '/api/skill-analytics/summary'
const HEATMAP_URL = '/api/skill-analytics/heatmap'
const RADAR_URL = '/api/skill-analytics/radar'

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const envelope = (await res.json()) as ApiEnvelope<T>
  return envelope.data
}

export default function SkillMapPage(): ReactElement {
  const [overview, setOverview] = useState<OverviewState>({ kind: 'loading' })
  const [radar, setRadar] = useState<RadarState>({ kind: 'idle' })
  const [userIdInput, setUserIdInput] = useState<string>('')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [summary, heatmap] = await Promise.all([
          fetchJson<SkillSummary>(SUMMARY_URL),
          fetchJson<SkillHeatmapData>(HEATMAP_URL),
        ])
        if (cancelled) return
        setOverview({ kind: 'ready', summary, heatmap })
      } catch (err) {
        if (cancelled) return
        setOverview({
          kind: 'error',
          message: err instanceof Error ? err.message : 'unknown error',
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleRadarSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const trimmed = userIdInput.trim()
      if (!trimmed) return
      setRadar({ kind: 'loading', userId: trimmed })
      try {
        const data = await fetchJson<RadarData>(
          `${RADAR_URL}?userId=${encodeURIComponent(trimmed)}`,
        )
        setRadar({ kind: 'ready', data })
      } catch (err) {
        setRadar({
          kind: 'error',
          userId: trimmed,
          message: err instanceof Error ? err.message : 'unknown error',
        })
      }
    },
    [userIdInput],
  )

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-6 py-10">
      <PageHeader />
      <OverviewSection state={overview} />
      <RadarSection
        state={radar}
        userId={userIdInput}
        onUserIdChange={setUserIdInput}
        onSubmit={handleRadarSubmit}
      />
    </main>
  )
}

function PageHeader(): ReactElement {
  return (
    <header className="flex flex-col gap-1">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
        Skill analytics
      </p>
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900">スキルマップ</h1>
      <p className="max-w-2xl text-sm text-slate-500">
        組織全体のスキル充足率、部署 × カテゴリのヒートマップ、社員個人のレーダーチャートを 1 画面で確認できます。
      </p>
    </header>
  )
}

function OverviewSection({ state }: { readonly state: OverviewState }): ReactElement {
  if (state.kind === 'loading') {
    return <SkeletonCard label="組織サマリを読み込み中…" />
  }
  if (state.kind === 'error') {
    return (
      <div
        role="alert"
        className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700"
      >
        <p className="font-semibold">組織サマリを取得できませんでした。</p>
        <p className="mt-1 text-xs text-red-600">{state.message}</p>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-6">
      <SummaryCard summary={state.summary} />
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <header className="mb-4 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-slate-900">部署 × カテゴリ ヒートマップ</h2>
          <p className="text-xs text-slate-500">
            セルの濃さは平均スキルレベル (0〜5) を表します
          </p>
        </header>
        <SkillHeatmap data={state.heatmap} />
      </section>
    </div>
  )
}

interface RadarSectionProps {
  readonly state: RadarState
  readonly userId: string
  readonly onUserIdChange: (next: string) => void
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>
}

function RadarSection(props: RadarSectionProps): ReactElement {
  const { state, userId, onUserIdChange, onSubmit } = props
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <header className="mb-4 flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-slate-900">社員レーダー</h2>
        <p className="text-xs text-slate-500">
          社員 ID を入力するとレーダーチャートでスキル分布を確認できます。
        </p>
      </header>

      <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-3">
        <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-slate-600">
          <span>社員 ID</span>
          <input
            type="text"
            value={userId}
            onChange={(e) => onUserIdChange(e.target.value)}
            placeholder="cm_user_xxxxxxxxx"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
          />
        </label>
        <button
          type="submit"
          disabled={state.kind === 'loading' || userId.trim().length === 0}
          className="mt-5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {state.kind === 'loading' ? '読み込み中…' : '表示'}
        </button>
      </form>

      <div className="mt-6">
        <RadarBody state={state} />
      </div>
    </section>
  )
}

function RadarBody({ state }: { readonly state: RadarState }): ReactElement {
  if (state.kind === 'idle') {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
        社員 ID を入力するとレーダーチャートが表示されます。
      </p>
    )
  }
  if (state.kind === 'loading') {
    return <SkeletonCard label={`${state.userId} のスキルを読み込み中…`} />
  }
  if (state.kind === 'error') {
    return (
      <div
        role="alert"
        className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700"
      >
        <p className="font-semibold">レーダーを取得できませんでした。</p>
        <p className="mt-1 text-xs text-red-600">
          {state.userId}: {state.message}
        </p>
      </div>
    )
  }
  return <SkillRadar data={state.data} />
}

function SkeletonCard({ label }: { readonly label: string }): ReactElement {
  return (
    <div
      aria-busy="true"
      className="flex h-40 animate-pulse items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-400"
    >
      {label}
    </div>
  )
}
