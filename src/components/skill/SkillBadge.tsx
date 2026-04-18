/**
 * Issue #36 / Task 11.2 / Req 4.5: 承認状態バッジ
 *
 * EmployeeSkill の承認状態を視覚的に区別するための小さなバッジ。
 * - 承認済み: 緑系 "承認済み"
 * - 未承認:   グレー系 "承認待ち"
 */
import type { ReactElement } from 'react'
import { isSkillApproved, type EmployeeSkill } from '@/lib/skill/skill-types'

interface SkillBadgeProps {
  readonly skill: EmployeeSkill
}

export function SkillBadge({ skill }: SkillBadgeProps): ReactElement {
  const approved = isSkillApproved(skill)

  if (approved) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-600/20 ring-inset"
        aria-label="承認済み"
        title={skill.approvedAt ? `承認日時: ${skill.approvedAt.toISOString()}` : '承認済み'}
      >
        <span aria-hidden="true">●</span>
        承認済み
      </span>
    )
  }

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-500/20 ring-inset"
      aria-label="承認待ち"
      title="マネージャーの承認を待っています"
    >
      <span aria-hidden="true">○</span>
      承認待ち
    </span>
  )
}
