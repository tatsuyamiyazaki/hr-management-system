/**
 * Issue #195 / スキルマップ リデザイン
 * Req 4.1, 4.2, 4.3: スキルマップ画面 (HR_MANAGER 向け)
 *
 * - GET /api/skill-analytics/summary → SkillSummary
 * - GET /api/skill-analytics/heatmap → SkillHeatmap
 * - GET /api/skill-analytics/radar?userId= → RadarData
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

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ApiEnvelope<T> {
  readonly success: boolean
  readonly data: T
}

type OverviewState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly summary: SkillSummary; readonly heatmap: SkillHeatmapData }

type RadarState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading'; readonly userId: string }
  | { readonly kind: 'error'; readonly userId: string; readonly message: string }
  | { readonly kind: 'ready'; readonly data: RadarData }

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SUMMARY_URL = '/api/skill-analytics/summary'
const HEATMAP_URL = '/api/skill-analytics/heatmap'
const RADAR_URL = '/api/skill-analytics/radar'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const envelope = (await res.json()) as ApiEnvelope<T>
  return envelope.data
}

function readError(err: unknown): string {
  return err instanceof Error ? err.message : '不明なエラーが発生しました'
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

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
        setOverview({ kind: 'error', message: readError(err) })
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
        setRadar({ kind: 'error', userId: trimmed, message: readError(err) })
      }
    },
    [userIdInput],
  )

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-8 py-10">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.3em] text-emerald-600 uppercase">
            Skill Analytics
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
            スキルマップ
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            組織全体のスキル充足率、部署 ×
            カテゴリのヒートマップ、社員個人のレーダーチャートを確認できます。
          </p>
        </div>
      </header>

      <OverviewSection state={overview} />
      <RadarSection
        state={radar}
        userId={userIdInput}
        onUserIdChange={setUserIdInput}
        onSubmit={handleRadarSubmit}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Overview Section
// ─────────────────────────────────────────────────────────────────────────────

function OverviewSection({ state }: { readonly state: OverviewState }): ReactElement {
  if (state.kind === 'loading') {
    return (
      <div className="flex flex-col gap-4">
        <SkeletonPanel label="組織サマリを読み込み中…" height="h-32" />
        <SkeletonPanel label="ヒートマップを読み込み中…" height="h-48" />
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <div
        role="alert"
        className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700"
      >
        <p className="font-semibold">組織サマリを取得できませんでした</p>
        <p className="mt-1 text-xs">{state.message}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <SummaryCard summary={state.summary} />
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <header className="mb-5 flex items-baseline justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">部署 × カテゴリ ヒートマップ</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              セルの濃さは平均スキルレベル（0〜5）を表します
            </p>
          </div>
        </header>
        <SkillHeatmap data={state.heatmap} />
      </section>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Radar Section
// ─────────────────────────────────────────────────────────────────────────────

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
      <header className="mb-5">
        <h2 className="text-base font-semibold text-slate-900">社員レーダー</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          社員 ID を入力するとレーダーチャートでスキル分布を確認できます。
        </p>
      </header>

      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="radar-userId" className="text-xs font-medium text-slate-600">
            社員 ID
          </label>
          <input
            id="radar-userId"
            type="text"
            value={userId}
            onChange={(e) => onUserIdChange(e.target.value)}
            placeholder="cm_user_xxxxxxxxx"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={state.kind === 'loading' || userId.trim().length === 0}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus:ring-2 focus:ring-emerald-200 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-300"
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
    return <SkeletonPanel label={`${state.userId} のスキルを読み込み中…`} height="h-40" />
  }
  if (state.kind === 'error') {
    return (
      <div
        role="alert"
        className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700"
      >
        <p className="font-semibold">レーダーを取得できませんでした</p>
        <p className="mt-1 text-xs">
          {state.userId}: {state.message}
        </p>
      </div>
    )
  }
  return <SkillRadar data={state.data} />
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared
// ─────────────────────────────────────────────────────────────────────────────

function SkeletonPanel({
  label,
  height,
}: {
  readonly label: string
  readonly height: string
}): ReactElement {
  return (
    <div
      aria-busy="true"
      className={`flex ${height} animate-pulse items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-sm text-slate-400`}
    >
      {label}
    </div>
  )
}
