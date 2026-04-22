/**
 * Issue #176 / Task 12.3 / Req 5.5: 組織全体のキャリア希望集計画面
 *
 * - HR_MANAGER / ADMIN のみアクセス可能
 * - GET /api/career/aggregate/dashboard で集計ダッシュボードを取得
 * - 希望役職の分布と充足予測をダッシュボード形式で表示
 */
'use client'

import { useEffect, useState, type ReactElement, type ReactNode } from 'react'

interface RoleWishDistribution {
  readonly roleId: string
  readonly roleName: string
  readonly wishCount: number
  readonly fulfillmentRate: number
}

interface CareerAggregateDashboard {
  readonly totalWishes: number
  readonly distribution: readonly RoleWishDistribution[]
  readonly unfulfilledTopRoles: readonly RoleWishDistribution[]
}

interface ApiEnvelope<T> {
  readonly success?: boolean
  readonly data?: T
  readonly error?: string
}

type DashboardState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly dashboard: CareerAggregateDashboard }

const DASHBOARD_URL = '/api/career/aggregate/dashboard'

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' })
  const envelope = (await res.json().catch(() => ({}))) as ApiEnvelope<T>
  if (!res.ok) throw new Error(envelope.error ?? `HTTP ${res.status}`)
  return envelope.data as T
}

export default function CareerAggregatePage(): ReactElement {
  const [state, setState] = useState<DashboardState>({ kind: 'loading' })

  useEffect(() => {
    const load = async () => {
      try {
        const dashboard = await fetchJson<CareerAggregateDashboard>(DASHBOARD_URL)
        setState({ kind: 'ready', dashboard })
      } catch (err) {
        setState({ kind: 'error', message: readError(err) })
      }
    }
    void load()
  }, [])

  return (
    <main className="mx-auto max-w-5xl space-y-10 px-6 py-10">
      <header>
        <p className="text-xs font-semibold tracking-widest text-indigo-600 uppercase">Career</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">キャリア希望集計</h1>
        <p className="mt-2 text-sm text-slate-600">
          組織全体の希望役職の分布と充足予測を確認できます。
        </p>
      </header>

      <DashboardBody state={state} />
    </main>
  )
}

function DashboardBody({ state }: { readonly state: DashboardState }): ReactElement {
  if (state.kind === 'loading') {
    return (
      <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white py-16 text-sm text-slate-500">
        <span className="animate-pulse">データを読み込み中…</span>
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <div className="rounded-xl border border-rose-300 bg-rose-50 p-6 text-sm text-rose-800">
        <p className="font-semibold">データの取得に失敗しました</p>
        <p className="mt-1 text-xs">{state.message}</p>
      </div>
    )
  }

  const { dashboard } = state

  return (
    <div className="space-y-8">
      {/* サマリーカード */}
      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          label="総希望件数"
          value={String(dashboard.totalWishes)}
          unit="件"
          color="indigo"
        />
        <SummaryCard
          label="希望役職数"
          value={String(dashboard.distribution.length)}
          unit="種"
          color="slate"
        />
        <SummaryCard
          label="充足率不足ロール"
          value={String(dashboard.unfulfilledTopRoles.length)}
          unit="件"
          color="amber"
        />
      </div>

      {/* 充足率不足 TOP ロール */}
      {dashboard.unfulfilledTopRoles.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold text-slate-900">充足率不足ロール TOP</h2>
          <div className="overflow-hidden rounded-xl border border-amber-200 bg-white shadow-sm">
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-xs font-medium text-amber-800">
                ⚠ 希望が多いにもかかわらず充足率が低いロール
              </p>
            </div>
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200">
                <tr>
                  <Th>順位</Th>
                  <Th>役職名</Th>
                  <Th>希望者数</Th>
                  <Th>充足率</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dashboard.unfulfilledTopRoles.map((item, idx) => (
                  <tr key={item.roleId} className="transition-colors hover:bg-slate-50">
                    <td className="px-4 py-3 text-center font-semibold text-slate-500">
                      {idx + 1}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">{item.roleName}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {item.wishCount}
                      <span className="ml-1 text-xs text-slate-400">名</span>
                    </td>
                    <td className="px-4 py-3">
                      <FulfillmentBar rate={item.fulfillmentRate} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 全役職の希望分布 */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-slate-900">希望役職の分布</h2>
        {dashboard.distribution.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white py-12 text-center text-sm text-slate-400">
            希望データがありません
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <Th>役職名</Th>
                  <Th>希望者数</Th>
                  <Th>充足率</Th>
                  <Th>構成比</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dashboard.distribution.map((item) => {
                  const share =
                    dashboard.totalWishes > 0
                      ? Math.round((item.wishCount / dashboard.totalWishes) * 100)
                      : 0
                  return (
                    <tr key={item.roleId} className="transition-colors hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{item.roleName}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {item.wishCount}
                        <span className="ml-1 text-xs text-slate-400">名</span>
                      </td>
                      <td className="px-4 py-3">
                        <FulfillmentBar rate={item.fulfillmentRate} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-1.5 rounded-full bg-indigo-400"
                              style={{ width: `${share}%` }}
                            />
                          </div>
                          <span className="w-8 text-right text-xs text-slate-500">{share}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

interface SummaryCardProps {
  readonly label: string
  readonly value: string
  readonly unit: string
  readonly color: 'indigo' | 'slate' | 'amber'
}

function SummaryCard({ label, value, unit, color }: SummaryCardProps): ReactElement {
  const borderCls =
    color === 'indigo'
      ? 'border-indigo-200 bg-indigo-50'
      : color === 'amber'
        ? 'border-amber-200 bg-amber-50'
        : 'border-slate-200 bg-white'
  const valueCls =
    color === 'indigo' ? 'text-indigo-700' : color === 'amber' ? 'text-amber-700' : 'text-slate-700'
  return (
    <div className={`rounded-xl border p-5 ${borderCls}`}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${valueCls}`}>
        {value}
        <span className="ml-1 text-base font-normal">{unit}</span>
      </p>
    </div>
  )
}

function FulfillmentBar({ rate }: { readonly rate: number }): ReactElement {
  const pct = Math.round(rate * 100)
  const color = pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-rose-500'
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right text-xs font-semibold text-slate-700">{pct}%</span>
    </div>
  )
}

function Th({ children }: { readonly children: ReactNode }): ReactElement {
  return <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">{children}</th>
}

function readError(err: unknown): string {
  if (err instanceof Error) return err.message
  return '予期せぬエラーが発生しました'
}
