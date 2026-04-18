/**
 * Issue #37 / Req 4.2: 部署 × カテゴリのスキルヒートマップ
 *
 * - カスタムグリッド（CSS grid）で (departments, categories) のマトリクスを描画
 * - 色: averageLevel 0 → SKILL_LEVEL_MAX(5) に応じて slate → emerald でグラデーション
 * - SSR 安全 ('use client' 限定)
 */
'use client'

import type { ReactElement } from 'react'
import {
  SKILL_LEVEL_MAX,
  type HeatmapCell,
  type SkillHeatmap as SkillHeatmapData,
} from '@/lib/skill/skill-analytics-types'

interface SkillHeatmapProps {
  readonly data: SkillHeatmapData
}

/**
 * 背景色を「充足度(0..1)」から生成する。
 * slate-100 (#f1f5f9) → emerald-600 (#059669) の線形補間。
 */
function levelToBackgroundColor(averageLevel: number): string {
  const ratio = clamp01(averageLevel / SKILL_LEVEL_MAX)
  // slate-100 RGB
  const r0 = 0xf1
  const g0 = 0xf5
  const b0 = 0xf9
  // emerald-600 RGB
  const r1 = 0x05
  const g1 = 0x96
  const b1 = 0x69
  const r = Math.round(r0 + (r1 - r0) * ratio)
  const g = Math.round(g0 + (g1 - g0) * ratio)
  const b = Math.round(b0 + (b1 - b0) * ratio)
  return `rgb(${r} ${g} ${b})`
}

function clamp01(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 0
  if (v >= 1) return 1
  return v
}

/** 高い充足度では明るい白、低い充足度では濃いスレート文字色を返す */
function textColor(averageLevel: number): string {
  return averageLevel / SKILL_LEVEL_MAX > 0.55 ? 'text-white' : 'text-slate-700'
}

function buildCellIndex(cells: readonly HeatmapCell[]): Map<string, HeatmapCell> {
  const out = new Map<string, HeatmapCell>()
  for (const c of cells) out.set(`${c.departmentName}|${c.category}`, c)
  return out
}

function EmptyState(): ReactElement {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 py-16 text-slate-500">
      <p className="text-sm">ヒートマップを表示するためのスキルデータがまだありません。</p>
      <p className="mt-1 text-xs text-slate-400">
        社員がスキルを登録すると、部署 × カテゴリの充足度がここに表示されます。
      </p>
    </div>
  )
}

export function SkillHeatmap({ data }: SkillHeatmapProps): ReactElement {
  if (data.cells.length === 0 || data.departments.length === 0 || data.categories.length === 0) {
    return <EmptyState />
  }

  const index = buildCellIndex(data.cells)

  return (
    <div data-testid="skill-heatmap" className="w-full overflow-x-auto">
      <div
        role="grid"
        aria-label="部署 × スキルカテゴリ ヒートマップ"
        className="inline-grid min-w-full gap-px rounded-xl bg-slate-200 p-px"
        style={{
          gridTemplateColumns: `minmax(160px, auto) repeat(${data.categories.length}, minmax(96px, 1fr))`,
        }}
      >
        <div
          role="columnheader"
          className="bg-slate-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500"
        >
          部署 / カテゴリ
        </div>
        {data.categories.map((category) => (
          <div
            key={`col-${category}`}
            role="columnheader"
            className="bg-slate-50 px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500"
          >
            {category}
          </div>
        ))}

        {data.departments.map((dept) => (
          <DeptRow
            key={`row-${dept}`}
            departmentName={dept}
            categories={data.categories}
            cellIndex={index}
          />
        ))}
      </div>
      <Legend />
    </div>
  )
}

interface DeptRowProps {
  readonly departmentName: string
  readonly categories: readonly string[]
  readonly cellIndex: ReadonlyMap<string, HeatmapCell>
}

function DeptRow(props: DeptRowProps): ReactElement {
  const { departmentName, categories, cellIndex } = props
  return (
    <>
      <div
        role="rowheader"
        className="flex items-center bg-white px-4 py-3 text-sm font-medium text-slate-800"
      >
        {departmentName}
      </div>
      {categories.map((category) => {
        const cell = cellIndex.get(`${departmentName}|${category}`)
        return (
          <HeatmapCellTile
            key={`${departmentName}-${category}`}
            departmentName={departmentName}
            category={category}
            cell={cell}
          />
        )
      })}
    </>
  )
}

interface HeatmapCellTileProps {
  readonly departmentName: string
  readonly category: string
  readonly cell: HeatmapCell | undefined
}

function HeatmapCellTile(props: HeatmapCellTileProps): ReactElement {
  const { departmentName, category, cell } = props
  const level = cell?.averageLevel ?? 0
  const backgroundColor = levelToBackgroundColor(level)
  const textClass = textColor(level)
  const label =
    cell === undefined
      ? `${departmentName} / ${category}: データなし`
      : `${departmentName} / ${category}: 平均 ${level.toFixed(2)} (${cell.employeeCount}名)`

  return (
    <div
      role="gridcell"
      aria-label={label}
      title={label}
      className={`flex flex-col items-center justify-center px-3 py-4 text-sm tabular-nums ${textClass}`}
      style={{ backgroundColor }}
    >
      {cell === undefined ? (
        <span className="text-xs text-slate-400">—</span>
      ) : (
        <>
          <span className="text-base font-semibold">{level.toFixed(1)}</span>
          <span className="mt-0.5 text-[10px] uppercase tracking-wider opacity-80">
            {cell.employeeCount}名
          </span>
        </>
      )}
    </div>
  )
}

function Legend(): ReactElement {
  const stops = [0, 1.25, 2.5, 3.75, 5]
  return (
    <div className="mt-4 flex items-center gap-3 text-xs text-slate-500">
      <span>充足度</span>
      <div className="flex overflow-hidden rounded-full border border-slate-200">
        {stops.map((stop, idx) => (
          <span
            key={idx}
            className="h-3 w-8"
            style={{ backgroundColor: levelToBackgroundColor(stop) }}
            aria-hidden
          />
        ))}
      </div>
      <span className="flex items-center gap-2">
        <span>0</span>
        <span className="text-slate-300">→</span>
        <span>{SKILL_LEVEL_MAX}</span>
      </span>
    </div>
  )
}
