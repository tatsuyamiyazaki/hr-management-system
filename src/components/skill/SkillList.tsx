/**
 * Issue #36 / Task 11.2 / Req 4.4, 4.5: 社員スキル一覧
 *
 * EmployeeSkill[] を表示し、各スキルに承認状態バッジ (SkillBadge) を表示する。
 * - 本人用ページでは自分のスキル一覧を
 * - マネージャー用ページでは承認待ちスキル一覧を表示する想定
 *
 * Component は presentational に保ち、fetch / mutate は親コンポーネント側で行う。
 */
import type { ReactElement } from 'react'
import { isSkillApproved, type EmployeeSkill } from '@/lib/skill/skill-types'
import { SkillBadge } from './SkillBadge'

interface SkillListProps {
  readonly skills: ReadonlyArray<EmployeeSkill>
  /** skillId → 表示名のマップ (SkillMaster 情報の注入)。未指定時は skillId をそのまま表示 */
  readonly skillNames?: Readonly<Record<string, string>>
  /** MANAGER 以上でのみ有効: 各行に「承認」ボタンを表示し、クリック時のハンドラを受け取る */
  readonly onApprove?: (skill: EmployeeSkill) => void
}

const JA_LOCALE = 'ja-JP'

function formatAcquiredDate(date: Date): string {
  return date.toLocaleDateString(JA_LOCALE, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function SkillList({ skills, skillNames, onApprove }: SkillListProps): ReactElement {
  if (skills.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
        スキルがまだ登録されていません。
      </div>
    )
  }

  return (
    <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
      {skills.map((skill) => {
        const approved = isSkillApproved(skill)
        const displayName = skillNames?.[skill.skillId] ?? skill.skillId
        return (
          <li
            key={skill.id}
            className={`flex flex-col gap-2 px-5 py-4 transition-colors hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between ${
              approved ? '' : 'bg-amber-50/40'
            }`}
          >
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-900">{displayName}</p>
              <p className="text-xs text-slate-500">
                レベル: Lv.{skill.level} / 習得日:{' '}
                <time dateTime={skill.acquiredAt.toISOString()}>
                  {formatAcquiredDate(skill.acquiredAt)}
                </time>
              </p>
            </div>
            <div className="flex items-center gap-3">
              <SkillBadge skill={skill} />
              {!approved && onApprove && (
                <button
                  type="button"
                  onClick={() => onApprove(skill)}
                  className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white shadow-sm transition-colors hover:bg-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none"
                >
                  承認する
                </button>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
