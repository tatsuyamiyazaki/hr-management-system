/**
 * Issue #203: スキルマップ画面リデザイン
 *
 * - 左ペイン: 部署 × スキルカテゴリ ヒートマップ（充足率 %）
 * - 右ペイン: 個人レーダーチャート（現在 vs 希望役職要件 2 系列、SVG 実装）
 * - 採用アラートボタン（件数バッジ付き）
 * - API 未実装時はモックデータにフォールバック
 *
 * GET /api/skill-analytics/heatmap           — ヒートマップデータ
 * GET /api/skill-analytics/radar?userId={id} — 個人レーダーデータ
 */
'use client'

import { useCallback, useEffect, useState, type FormEvent, type ReactElement } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ApiEnvelope<T> {
  readonly success?: boolean
  readonly data?: T
  readonly error?: string
}

interface HeatmapCell {
  readonly team: string
  readonly category: string
  readonly fulfillmentRate: number // 0–100
}

interface SkillHeatmapData {
  readonly teams: readonly string[]
  readonly categories: readonly string[]
  readonly cells: readonly HeatmapCell[]
  readonly totalMembers: number
}

interface RecruitmentAlert {
  readonly id: string
  readonly team: string
  readonly category: string
  readonly shortfall: number
}

interface RadarAxis {
  readonly axis: string
  readonly current: number    // 0–100
  readonly targetRole: number // 0–100（希望役職要件）
}

interface RadarData {
  readonly userId: string
  readonly userName: string
  readonly axes: readonly RadarAxis[]
}

type HeatmapState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | {
      readonly kind: 'ready'
      readonly data: SkillHeatmapData
      readonly alerts: readonly RecruitmentAlert[]
    }

type RadarState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading'; readonly userId: string }
  | { readonly kind: 'error'; readonly userId: string; readonly message: string }
  | { readonly kind: 'ready'; readonly data: RadarData }

// ─────────────────────────────────────────────────────────────────────────────
// Mock data
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_TEAMS = ['検索チーム', 'モバイルチーム', 'プラットフォーム', 'AIリサーチ'] as const
const MOCK_CATEGORIES = ['BACKEND', 'FRONTEND', 'DATA', 'INFRA', 'DESIGN', 'PM'] as const

const MOCK_CELLS: readonly HeatmapCell[] = [
  { team: '検索チーム',      category: 'BACKEND',  fulfillmentRate: 95 },
  { team: '検索チーム',      category: 'FRONTEND', fulfillmentRate: 60 },
  { team: '検索チーム',      category: 'DATA',     fulfillmentRate: 85 },
  { team: '検索チーム',      category: 'INFRA',    fulfillmentRate: 70 },
  { team: '検索チーム',      category: 'DESIGN',   fulfillmentRate: 45 },
  { team: '検索チーム',      category: 'PM',       fulfillmentRate: 65 },
  { team: 'モバイルチーム',  category: 'BACKEND',  fulfillmentRate: 50 },
  { team: 'モバイルチーム',  category: 'FRONTEND', fulfillmentRate: 92 },
  { team: 'モバイルチーム',  category: 'DATA',     fulfillmentRate: 55 },
  { team: 'モバイルチーム',  category: 'INFRA',    fulfillmentRate: 40 },
  { team: 'モバイルチーム',  category: 'DESIGN',   fulfillmentRate: 80 },
  { team: 'モバイルチーム',  category: 'PM',       fulfillmentRate: 58 },
  { team: 'プラットフォーム', category: 'BACKEND',  fulfillmentRate: 88 },
  { team: 'プラットフォーム', category: 'FRONTEND', fulfillmentRate: 42 },
  { team: 'プラットフォーム', category: 'DATA',     fulfillmentRate: 65 },
  { team: 'プラットフォーム', category: 'INFRA',    fulfillmentRate: 95 },
  { team: 'プラットフォーム', category: 'DESIGN',   fulfillmentRate: 35 },
  { team: 'プラットフォーム', category: 'PM',       fulfillmentRate: 70 },
  { team: 'AIリサーチ',     category: 'BACKEND',  fulfillmentRate: 72 },
  { team: 'AIリサーチ',     category: 'FRONTEND', fulfillmentRate: 38 },
  { team: 'AIリサーチ',     category: 'DATA',     fulfillmentRate: 96 },
  { team: 'AIリサーチ',     category: 'INFRA',    fulfillmentRate: 60 },
  { team: 'AIリサーチ',     category: 'DESIGN',   fulfillmentRate: 30 },
  { team: 'AIリサーチ',     category: 'PM',       fulfillmentRate: 55 },
]

const MOCK_HEATMAP: SkillHeatmapData = {
  teams: MOCK_TEAMS,
  categories: MOCK_CATEGORIES,
  cells: MOCK_CELLS,
  totalMembers: 48,
}

const MOCK_ALERTS: readonly RecruitmentAlert[] = [
  { id: 'a1', team: '検索チーム',      category: 'DESIGN',   shortfall: 3 },
  { id: 'a2', team: 'モバイルチーム',  category: 'INFRA',    shortfall: 2 },
  { id: 'a3', team: 'プラットフォーム', category: 'DESIGN',   shortfall: 4 },
  { id: 'a4', team: 'AIリサーチ',     category: 'DESIGN',   shortfall: 2 },
  { id: 'a5', team: 'AIリサーチ',     category: 'FRONTEND', shortfall: 1 },
]

const MOCK_RADAR_BY_TEAM: Readonly<Record<string, RadarData>> = {
  '検索チーム': {
    userId: 'usr-search-01',
    userName: '田中 一郎（検索チーム）',
    axes: [
      { axis: 'Backend',  current: 90, targetRole: 90 },
      { axis: 'Frontend', current: 58, targetRole: 70 },
      { axis: 'Data',     current: 82, targetRole: 85 },
      { axis: 'Infra',    current: 68, targetRole: 75 },
      { axis: 'Design',   current: 42, targetRole: 60 },
      { axis: 'PM',       current: 62, targetRole: 70 },
    ],
  },
  'モバイルチーム': {
    userId: 'usr-mobile-01',
    userName: '鈴木 花子（モバイルチーム）',
    axes: [
      { axis: 'Backend',  current: 48, targetRole: 60 },
      { axis: 'Frontend', current: 88, targetRole: 85 },
      { axis: 'Data',     current: 52, targetRole: 60 },
      { axis: 'Infra',    current: 38, targetRole: 55 },
      { axis: 'Design',   current: 78, targetRole: 80 },
      { axis: 'PM',       current: 55, targetRole: 65 },
    ],
  },
  'プラットフォーム': {
    userId: 'usr-platform-01',
    userName: '佐藤 次郎（プラットフォーム）',
    axes: [
      { axis: 'Backend',  current: 85, targetRole: 90 },
      { axis: 'Frontend', current: 40, targetRole: 50 },
      { axis: 'Data',     current: 62, targetRole: 70 },
      { axis: 'Infra',    current: 92, targetRole: 90 },
      { axis: 'Design',   current: 32, targetRole: 50 },
      { axis: 'PM',       current: 68, targetRole: 75 },
    ],
  },
  'AIリサーチ': {
    userId: 'usr-ai-01',
    userName: '山田 美咲（AIリサーチ）',
    axes: [
      { axis: 'Backend',  current: 70, targetRole: 75 },
      { axis: 'Frontend', current: 35, targetRole: 45 },
      { axis: 'Data',     current: 94, targetRole: 95 },
      { axis: 'Infra',    current: 58, targetRole: 65 },
      { axis: 'Design',   current: 28, targetRole: 45 },
      { axis: 'PM',       current: 52, targetRole: 60 },
    ],
  },
}

const DEFAULT_RADAR: RadarData = {
  userId: 'usr-default',
  userName: 'ユーザー',
  axes: [
    { axis: 'Backend',  current: 70, targetRole: 80 },
    { axis: 'Frontend', current: 55, targetRole: 70 },
    { axis: 'Data',     current: 65, targetRole: 75 },
    { axis: 'Infra',    current: 60, targetRole: 70 },
    { axis: 'Design',   current: 45, targetRole: 60 },
    { axis: 'PM',       current: 58, targetRole: 68 },
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function readError(err: unknown): string {
  if (err instanceof Error) return err.message
  return '予期せぬエラーが発生しました'
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' })
    const envelope = (await res.json().catch(() => ({}))) as ApiEnvelope<T>
    if (!res.ok || !envelope.data) return null
    return envelope.data
  } catch {
    return null
  }
}

function cellColorClass(rate: number): string {
  if (rate >= 90) return 'bg-emerald-600 text-white'
  if (rate >= 75) return 'bg-emerald-200 text-emerald-900'
  if (rate >= 50) return 'bg-rose-100 text-rose-800'
  return 'bg-rose-300 text-rose-900'
}

function getCell(
  cells: readonly HeatmapCell[],
  team: string,
  category: string,
): HeatmapCell | undefined {
  return cells.find((c) => c.team === team && c.category === category)
}

// ─────────────────────────────────────────────────────────────────────────────
// SVG Radar Chart
// ─────────────────────────────────────────────────────────────────────────────

const RADAR_CX = 150
const RADAR_CY = 150
const RADAR_R = 105
const RADAR_LABEL_R = 135

function radarPoint(i: number, n: number, val: number): [number, number] {
  const angle = (i * 2 * Math.PI) / n - Math.PI / 2
  const r = (val / 100) * RADAR_R
  return [RADAR_CX + r * Math.cos(angle), RADAR_CY + r * Math.sin(angle)]
}

function radarLabelPoint(i: number, n: number): [number, number] {
  const angle = (i * 2 * Math.PI) / n - Math.PI / 2
  return [RADAR_CX + RADAR_LABEL_R * Math.cos(angle), RADAR_CY + RADAR_LABEL_R * Math.sin(angle)]
}

function polygonPoints(axes: readonly RadarAxis[], key: 'current' | 'targetRole'): string {
  return axes
    .map((a, i) => {
      const [x, y] = radarPoint(i, axes.length, a[key])
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
}

function gridPolygon(pct: number, n: number): string {
  return Array.from({ length: n }, (_, i) => {
    const [x, y] = radarPoint(i, n, pct)
    return `${x.toFixed(2)},${y.toFixed(2)}`
  }).join(' ')
}

function RadarChart({ axes }: { readonly axes: readonly RadarAxis[] }): ReactElement {
  const n = axes.length
  const gridPcts = [20, 40, 60, 80, 100] as const

  return (
    <svg viewBox="0 0 300 300" className="mx-auto w-full max-w-[260px]" aria-label="スキルレーダーチャート">
      {/* Grid polygons */}
      {gridPcts.map((pct) => (
        <polygon key={pct} points={gridPolygon(pct, n)} fill="none" stroke="#e2e8f0" strokeWidth="1" />
      ))}
      {/* Axis lines */}
      {axes.map((_, i) => {
        const [x, y] = radarPoint(i, n, 100)
        return (
          <line key={i} x1={RADAR_CX} y1={RADAR_CY} x2={x.toFixed(2)} y2={y.toFixed(2)} stroke="#e2e8f0" strokeWidth="1" />
        )
      })}
      {/* Target role series (dashed gray) */}
      <polygon
        points={polygonPoints(axes, 'targetRole')}
        fill="rgba(148,163,184,0.12)"
        stroke="#94a3b8"
        strokeWidth="1.5"
        strokeDasharray="4 2"
      />
      {/* Current series (filled indigo) */}
      <polygon
        points={polygonPoints(axes, 'current')}
        fill="rgba(79,70,229,0.18)"
        stroke="#4f46e5"
        strokeWidth="2"
      />
      {/* Grid % labels */}
      {gridPcts.map((pct) => {
        const [, y] = radarPoint(0, n, pct)
        return (
          <text key={pct} x={RADAR_CX + 3} y={y + 1} fontSize="7" fill="#94a3b8" textAnchor="start" dominantBaseline="middle">
            {pct}
          </text>
        )
      })}
      {/* Axis labels */}
      {axes.map((a, i) => {
        const [lx, ly] = radarLabelPoint(i, n)
        return (
          <text key={i} x={lx.toFixed(2)} y={ly.toFixed(2)} fontSize="10" fill="#475569" fontWeight="500" textAnchor="middle" dominantBaseline="middle">
            {a.axis}
          </text>
        )
      })}
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function SkillMapPage(): ReactElement {
  const [heatmapState, setHeatmapState] = useState<HeatmapState>({ kind: 'loading' })
  const [radarState, setRadarState] = useState<RadarState>({ kind: 'idle' })
  const [userIdInput, setUserIdInput] = useState('')
  const [showAlerts, setShowAlerts] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [heatmap, alerts] = await Promise.all([
        fetchJson<SkillHeatmapData>('/api/skill-analytics/heatmap'),
        fetchJson<readonly RecruitmentAlert[]>('/api/skill-analytics/recruitment-alerts'),
      ])
      if (cancelled) return
      setHeatmapState({
        kind: 'ready',
        data: heatmap ?? MOCK_HEATMAP,
        alerts: alerts ?? MOCK_ALERTS,
      })
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const loadRadar = useCallback(async (userId: string, fallback?: RadarData) => {
    const trimmed = userId.trim()
    if (!trimmed) return
    setRadarState({ kind: 'loading', userId: trimmed })
    try {
      const data = await fetchJson<RadarData>(
        `/api/skill-analytics/radar?userId=${encodeURIComponent(trimmed)}`,
      )
      setRadarState({ kind: 'ready', data: data ?? fallback ?? DEFAULT_RADAR })
    } catch (err) {
      setRadarState({ kind: 'error', userId: trimmed, message: readError(err) })
    }
  }, [])

  const handleRadarSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      await loadRadar(userIdInput)
    },
    [userIdInput, loadRadar],
  )

  const handleCellClick = useCallback(
    async (team: string) => {
      const mockData = MOCK_RADAR_BY_TEAM[team] ?? DEFAULT_RADAR
      setUserIdInput(mockData.userId)
      await loadRadar(mockData.userId, mockData)
    },
    [loadRadar],
  )

  const alertCount = heatmapState.kind === 'ready' ? heatmapState.alerts.length : 0
  const heatmapData = heatmapState.kind === 'ready' ? heatmapState.data : null

  return (
    <main className="mx-auto max-w-7xl px-8 py-10">
      {/* Page Header */}
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.3em] text-emerald-600 uppercase">
            Skill Analytics
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
            スキルマップ
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">
            {heatmapData != null
              ? `全チーム・${heatmapData.totalMembers}名・${heatmapData.categories.length}スキルカテゴリ`
              : '組織全体のスキル充足状況を可視化します'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            エクスポート
          </button>
          <button
            type="button"
            onClick={() => setShowAlerts((v) => !v)}
            className="relative rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            採用アラートを確認
            {alertCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white">
                {alertCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Recruitment Alert Panel */}
      {showAlerts && heatmapState.kind === 'ready' && (
        <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 p-5">
          <p className="mb-3 text-sm font-semibold text-rose-800">
            採用アラート — {alertCount}件の充足不足
          </p>
          <div className="flex flex-wrap gap-2">
            {heatmapState.alerts.map((a) => (
              <div key={a.id} className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs">
                <span className="font-medium text-rose-700">{a.team}</span>
                <span className="mx-1 text-rose-400">/</span>
                <span className="text-slate-700">{a.category}</span>
                <span className="ml-1 font-semibold text-rose-600">▲{a.shortfall}名不足</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2-column layout */}
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <HeatmapPanel state={heatmapState} onCellClick={handleCellClick} />
        <RadarPanel
          state={radarState}
          userId={userIdInput}
          onUserIdChange={setUserIdInput}
          onSubmit={handleRadarSubmit}
        />
      </div>
    </main>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// HeatmapPanel
// ─────────────────────────────────────────────────────────────────────────────

interface HeatmapPanelProps {
  readonly state: HeatmapState
  readonly onCellClick: (team: string) => void
}

function HeatmapPanel({ state, onCellClick }: HeatmapPanelProps): ReactElement {
  if (state.kind === 'loading') {
    return (
      <div className="flex h-64 animate-pulse items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-sm text-slate-400">
        ヒートマップを読み込み中…
      </div>
    )
  }
  if (state.kind === 'error') {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
        <p className="font-semibold">ヒートマップの取得に失敗しました</p>
        <p className="mt-1 text-xs opacity-80">{state.message}</p>
      </div>
    )
  }

  const { teams, categories, cells } = state.data

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-slate-800">部署 × スキルカテゴリ ヒートマップ</p>
          <p className="mt-0.5 text-xs text-slate-500">チーム行をクリックすると右ペインにレーダーを表示</p>
        </div>
        <p className="text-xs font-medium text-slate-400">充足率 %</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="py-3 pl-5 pr-3 text-left text-xs font-semibold text-slate-500">チーム</th>
              {categories.map((cat) => (
                <th key={cat} className="px-2 py-3 text-center text-xs font-semibold text-slate-500">
                  {cat}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teams.map((team) => (
              <tr
                key={team}
                className="cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50"
                onClick={() => onCellClick(team)}
              >
                <td className="whitespace-nowrap py-3 pl-5 pr-3 text-xs font-medium text-slate-700">
                  {team}
                </td>
                {categories.map((cat) => {
                  const cell = getCell(cells, team, cat)
                  const rate = cell?.fulfillmentRate ?? 0
                  return (
                    <td key={cat} className="px-1.5 py-2 text-center">
                      <span
                        className={`inline-flex h-9 w-14 items-center justify-center rounded-lg text-xs font-semibold tabular-nums ${cellColorClass(rate)}`}
                      >
                        {rate}
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-5 py-3">
        <p className="text-xs text-slate-400">凡例:</p>
        {(
          [
            ['bg-emerald-600', '90以上'],
            ['bg-emerald-200', '75–89'],
            ['bg-rose-100',    '50–74'],
            ['bg-rose-300',    '50未満'],
          ] as const
        ).map(([cls, label]) => (
          <span key={label} className="flex items-center gap-1 text-xs text-slate-600">
            <span className={`inline-block h-3 w-5 rounded-sm ${cls}`} />
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// RadarPanel
// ─────────────────────────────────────────────────────────────────────────────

interface RadarPanelProps {
  readonly state: RadarState
  readonly userId: string
  readonly onUserIdChange: (v: string) => void
  readonly onSubmit: (e: FormEvent) => void | Promise<void>
}

function RadarPanel({ state, userId, onUserIdChange, onSubmit }: RadarPanelProps): ReactElement {
  const userName = state.kind === 'ready' ? state.data.userName : null

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <p className="text-sm font-semibold text-slate-800">
          個人レーダー{userName != null ? ` — ${userName}` : ''}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          社員 ID 入力 またはヒートマップ行クリックで更新
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex items-end gap-2 border-b border-slate-100 px-5 py-3">
        <div className="flex-1">
          <label htmlFor="radar-uid" className="mb-1 block text-xs font-medium text-slate-600">
            社員 ID
          </label>
          <input
            id="radar-uid"
            type="text"
            value={userId}
            onChange={(e) => onUserIdChange(e.target.value)}
            placeholder="usr-xxxxxx"
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-xs text-slate-900 focus:border-indigo-400 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={state.kind === 'loading' || userId.trim().length === 0}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {state.kind === 'loading' ? '…' : '表示'}
        </button>
      </form>

      <div className="flex flex-1 flex-col items-center justify-center p-5">
        <RadarBody state={state} />
      </div>

      {state.kind === 'ready' && (
        <div className="flex items-center justify-center gap-5 border-t border-slate-100 py-3 text-xs text-slate-600">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-5 rounded-sm bg-indigo-600 opacity-80" />
            現在 ●
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-5 rounded-sm border border-slate-400 bg-slate-100" />
            希望役職要件 ○
          </span>
        </div>
      )}
    </div>
  )
}

function RadarBody({ state }: { readonly state: RadarState }): ReactElement {
  if (state.kind === 'idle') {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-xs text-slate-400">
        ヒートマップの行をクリック、または
        <br />
        社員 ID を入力してください
      </p>
    )
  }
  if (state.kind === 'loading') {
    return (
      <div className="flex h-48 animate-pulse items-center justify-center text-xs text-slate-400">
        {state.userId} のデータを読み込み中…
      </div>
    )
  }
  if (state.kind === 'error') {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700">
        <p className="font-semibold">取得に失敗しました</p>
        <p className="mt-1 opacity-80">
          {state.userId}: {state.message}
        </p>
      </div>
    )
  }

  return (
    <div className="w-full">
      <RadarChart axes={state.data.axes} />
      <div className="mt-3 space-y-1.5">
        {state.data.axes.map((a) => (
          <div key={a.axis} className="flex items-center gap-2 text-xs">
            <span className="w-16 shrink-0 text-right text-slate-500">{a.axis}</span>
            <div className="flex-1 overflow-hidden rounded-full bg-slate-100">
              <div className="h-1.5 rounded-full bg-indigo-500" style={{ width: `${a.current}%` }} />
            </div>
            <span className="w-8 shrink-0 tabular-nums text-slate-700">{a.current}</span>
            <span className="w-8 shrink-0 tabular-nums text-slate-400">/{a.targetRole}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
