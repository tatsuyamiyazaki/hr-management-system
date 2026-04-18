/**
 * Issue #28 / Req 3.5: 直属メンバー一覧コンポーネント
 *
 * MANAGER の my-team ページで使用。
 * - 名前 / メールアドレス / 役職 / 部署 を一覧表示
 * - 空リスト時は「直属メンバーがいません」を表示
 */
'use client'

import type { ReactElement } from 'react'
import type { DirectReport } from '@/lib/organization/organization-types'

interface MemberListProps {
  readonly members: ReadonlyArray<DirectReport>
}

export function MemberList(props: MemberListProps): ReactElement {
  const { members } = props

  if (members.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
        直属メンバーはまだ登録されていません。
      </div>
    )
  }

  return (
    <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
      {members.map((m) => (
        <li
          key={m.userId}
          className="flex flex-col gap-1 px-5 py-4 transition-colors hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-900">{m.name}</p>
            <p className="text-xs text-slate-500">{m.email}</p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="rounded-full bg-indigo-50 px-3 py-1 font-medium text-indigo-700">
              {m.roleName}
            </span>
            <span className="text-slate-500">{m.departmentName}</span>
          </div>
        </li>
      ))}
    </ul>
  )
}
