/**
 * Issue #28 / Req 3.5: MANAGER 向け直属メンバー一覧画面
 *
 * - マウント時に GET /api/organization/my-team を取得
 * - 自分の部署情報と直属メンバーをカード + MemberList で表示
 * - ローディング / エラー / 空状態を適切にハンドリング
 *
 * MANAGER 以外のアクセスはサーバ側で 403 とする想定。
 */
'use client'

import { useEffect, useState, type ReactElement } from 'react'
import type { MyTeamResponse } from '@/lib/organization/organization-types'
import { MemberList } from '@/components/organization/MemberList'

type LoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly data: MyTeamResponse }

const MY_TEAM_URL = '/api/organization/my-team'

export default function MyTeamPage(): ReactElement {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(MY_TEAM_URL, { cache: 'no-store' })
        if (!res.ok) {
          throw new Error(`Failed to load my-team: ${res.status}`)
        }
        const data = (await res.json()) as MyTeamResponse
        if (cancelled) return
        setState({ kind: 'ready', data })
      } catch (err) {
        if (cancelled) return
        setState({ kind: 'error', message: readError(err) })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8">
        <p className="text-xs font-semibold tracking-widest text-emerald-600 uppercase">My Team</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">直属メンバー</h1>
        <p className="mt-2 text-sm text-slate-600">
          あなたが上長として登録されているメンバーを確認できます。
        </p>
      </header>
      <Body state={state} />
    </main>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// サブコンポーネント
// ─────────────────────────────────────────────────────────────────────────────

interface BodyProps {
  readonly state: LoadState
}

function Body(props: BodyProps): ReactElement {
  const { state } = props
  if (state.kind === 'loading') {
    return (
      <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white py-16 text-sm text-slate-500">
        <span className="animate-pulse">チーム情報を読み込み中…</span>
      </div>
    )
  }
  if (state.kind === 'error') {
    return (
      <div className="rounded-xl border border-rose-300 bg-rose-50 p-6 text-sm text-rose-800">
        <p className="font-semibold">情報の取得に失敗しました</p>
        <p className="mt-1 text-xs">{state.message}</p>
      </div>
    )
  }
  return (
    <div className="space-y-6">
      <ManagerSummary
        managerName={state.data.managerName}
        departmentName={state.data.departmentName}
      />
      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">
          メンバー ({state.data.directReports.length} 名)
        </h2>
        <MemberList members={state.data.directReports} />
      </section>
    </div>
  )
}

interface ManagerSummaryProps {
  readonly managerName: string
  readonly departmentName: string
}

function ManagerSummary(props: ManagerSummaryProps): ReactElement {
  return (
    <section className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-6 shadow-sm">
      <p className="text-xs tracking-wider text-slate-500 uppercase">Manager</p>
      <p className="text-xl font-semibold text-slate-900">{props.managerName}</p>
      <p className="text-sm text-slate-600">{props.departmentName}</p>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ユーティリティ
// ─────────────────────────────────────────────────────────────────────────────

function readError(err: unknown): string {
  if (err instanceof Error) return err.message
  return '予期せぬエラーが発生しました'
}
