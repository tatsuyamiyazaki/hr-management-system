/**
 * Issue #37 / Req 4.3: 社員スキルのレーダーチャート
 *
 * - Recharts の RadarChart + Radar + PolarGrid を使用
 * - 承認済みスキルは実線 (emerald-600)、未承認スキルは点線 (amber-500) で重ね描画
 * - SSR 安全 ('use client' 限定)
 */
'use client'

import type { ReactElement } from 'react'
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from 'recharts'
import {
  SKILL_LEVEL_MAX,
  type RadarData,
  type RadarDataPoint,
} from '@/lib/skill/skill-analytics-types'

interface SkillRadarProps {
  readonly data: RadarData
  /** 高さ (px) 既定値 380 */
  readonly height?: number
}

/** Recharts に渡す各点の内部型。承認済 / 未承認を別キーで保持する */
interface RadarRow {
  readonly skillName: string
  readonly approvedLevel: number
  readonly pendingLevel: number
  readonly max: number
}

function toRows(points: readonly RadarDataPoint[]): RadarRow[] {
  return points.map((p) => ({
    skillName: p.skillName,
    approvedLevel: p.approved ? p.currentLevel : 0,
    pendingLevel: p.approved ? 0 : p.currentLevel,
    max: p.maxLevel,
  }))
}

function EmptyState(): ReactElement {
  return (
    <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-slate-500">
      <p className="text-sm">この社員にはまだスキルが登録されていません。</p>
    </div>
  )
}

export function SkillRadar({ data, height = 380 }: SkillRadarProps): ReactElement {
  const rows = toRows(data.points)
  if (rows.length === 0) return <EmptyState />

  return (
    <div data-testid="skill-radar" className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={rows} outerRadius="75%">
          <PolarGrid stroke="#cbd5e1" />
          <PolarAngleAxis dataKey="skillName" tick={{ fill: '#334155', fontSize: 12 }} />
          <PolarRadiusAxis
            angle={90}
            domain={[0, SKILL_LEVEL_MAX]}
            tickCount={SKILL_LEVEL_MAX + 1}
            tick={{ fill: '#94a3b8', fontSize: 10 }}
          />
          <Radar
            name="承認済み"
            dataKey="approvedLevel"
            stroke="#059669"
            strokeWidth={2}
            fill="#059669"
            fillOpacity={0.3}
            isAnimationActive={false}
          />
          <Radar
            name="未承認"
            dataKey="pendingLevel"
            stroke="#d97706"
            strokeWidth={2}
            strokeDasharray="4 4"
            fill="#fbbf24"
            fillOpacity={0.15}
            isAnimationActive={false}
          />
        </RadarChart>
      </ResponsiveContainer>
      <Legend />
    </div>
  )
}

function Legend(): ReactElement {
  return (
    <ul className="mt-2 flex items-center justify-center gap-6 text-xs text-slate-600">
      <li className="flex items-center gap-2">
        <span
          className="inline-block h-0.5 w-6"
          style={{ backgroundColor: '#059669' }}
          aria-hidden
        />
        承認済み
      </li>
      <li className="flex items-center gap-2">
        <span
          className="inline-block h-0.5 w-6"
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg, #d97706 0 4px, transparent 4px 8px)',
            backgroundSize: '8px 2px',
          }}
          aria-hidden
        />
        未承認
      </li>
    </ul>
  )
}
