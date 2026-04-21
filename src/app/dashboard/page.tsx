'use client'

import Link from 'next/link'
import { useEffect, useState, type ReactElement } from 'react'
import { KpiSummaryPanel } from '@/components/dashboard/KpiSummaryPanel'
import type { DashboardSummary } from '@/lib/dashboard/dashboard-types'

interface DashboardEnvelope {
  readonly success?: boolean
  readonly data?: DashboardSummary
  readonly error?: string
}

type DashboardState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly summary: DashboardSummary }
  | { readonly kind: 'unauthorized'; readonly message: string }
  | { readonly kind: 'error'; readonly message: string }

const DASHBOARD_URL = '/api/dashboard/kpi'

export default function DashboardPage(): ReactElement {
  const [state, setState] = useState<DashboardState>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const res = await fetch(DASHBOARD_URL, { cache: 'no-store' })
        const body = ((await res.json().catch(() => ({}))) ?? {}) as DashboardEnvelope

        if (cancelled) return

        if (res.status === 401 || res.status === 403) {
          setState({
            kind: 'unauthorized',
            message:
              body.error ??
              'ダッシュボードを表示するにはログイン済みユーザーとしてアクセスしてください。',
          })
          return
        }

        if (!res.ok || !body.data) {
          setState({
            kind: 'error',
            message: body.error ?? `ダッシュボードの取得に失敗しました (HTTP ${res.status})`,
          })
          return
        }

        setState({ kind: 'ready', summary: body.data })
      } catch (error) {
        if (cancelled) return
        setState({
          kind: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'ダッシュボードの読み込み中に予期しないエラーが発生しました。',
        })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_45%,#f8fafc_100%)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
        <PageHeader />
        <QuickLinks />
        <DashboardBody state={state} />
      </div>
    </main>
  )
}

function PageHeader(): ReactElement {
  return (
    <header className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm backdrop-blur">
      <p className="text-xs font-semibold tracking-[0.3em] text-sky-700 uppercase">Home</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">
        HR Management Dashboard
      </h1>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
        人事業務に必要な主要指標をロールごとに整理して表示します。API 実装済みの KPI
        サマリーを、この画面からそのまま確認できるようにしました。
      </p>
    </header>
  )
}

function QuickLinks(): ReactElement {
  const links = [
    {
      href: '/organization',
      title: '組織管理',
      description: '組織図の確認と編集フローへ移動',
    },
    {
      href: '/organization/my-team',
      title: 'マイチーム',
      description: '直属メンバーの一覧を確認',
    },
    {
      href: '/skill-map',
      title: 'スキルマップ',
      description: 'スキル充足率やレーダーチャートを表示',
    },
  ] as const

  return (
    <section className="grid gap-4 md:grid-cols-3">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-sky-300 hover:bg-sky-50"
        >
          <p className="text-lg font-semibold text-slate-900">{link.title}</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">{link.description}</p>
          <p className="mt-4 text-xs font-semibold tracking-[0.25em] text-sky-700 uppercase">
            Open
          </p>
        </Link>
      ))}
    </section>
  )
}

function DashboardBody({ state }: { readonly state: DashboardState }): ReactElement {
  if (state.kind === 'loading') {
    return (
      <Panel>
        <p className="animate-pulse text-sm text-slate-500">ダッシュボードを読み込んでいます…</p>
      </Panel>
    )
  }

  if (state.kind === 'unauthorized') {
    return (
      <Panel tone="warning">
        <h2 className="text-lg font-semibold text-amber-950">ログインが必要です</h2>
        <p className="mt-2 text-sm leading-6 text-amber-900">{state.message}</p>
      </Panel>
    )
  }

  if (state.kind === 'error') {
    return (
      <Panel tone="error">
        <h2 className="text-lg font-semibold text-rose-950">ダッシュボードを表示できません</h2>
        <p className="mt-2 text-sm leading-6 text-rose-900">{state.message}</p>
      </Panel>
    )
  }

  return <KpiSummaryPanel summary={state.summary} />
}

function Panel(
  props: Readonly<{
    children: ReactElement | string | readonly (ReactElement | string)[]
    tone?: 'neutral' | 'warning' | 'error'
  }>,
): ReactElement {
  const className =
    props.tone === 'warning'
      ? 'border-amber-300 bg-amber-50'
      : props.tone === 'error'
        ? 'border-rose-300 bg-rose-50'
        : 'border-slate-200 bg-white'

  return (
    <section className={`rounded-3xl border p-6 shadow-sm ${className}`}>{props.children}</section>
  )
}
