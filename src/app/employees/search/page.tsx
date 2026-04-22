/**
 * Issue #174 / Task 10.2 / Req 16.1, 16.3, 16.4, 16.5, 16.6: 社員検索画面
 *
 * - 全ロールアクセス可能
 * - GET /api/search/employees?keyword=...&statuses[]=... で検索
 * - デフォルト: ACTIVE のみ（チェックボックスで非アクティブを含められる）
 * - 結果テーブル: 氏名 / 部署 / 役職 / ステータス
 */
'use client'

import { useCallback, useState, type FormEvent, type ReactElement, type ReactNode } from 'react'

interface EmployeeSearchResult {
  readonly id: string
  readonly firstName: string
  readonly lastName: string
  readonly departmentName: string
  readonly roleName: string
  readonly status: 'ACTIVE' | 'ON_LEAVE' | 'RESIGNED' | 'PENDING_JOIN'
}

interface SearchEnvelope {
  readonly success?: boolean
  readonly data?: readonly EmployeeSearchResult[]
  readonly error?: string
}

type SearchState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'searching' }
  | { readonly kind: 'results'; readonly employees: readonly EmployeeSearchResult[] }
  | { readonly kind: 'error'; readonly message: string }

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: '在籍',
  ON_LEAVE: '休職',
  RESIGNED: '退職',
  PENDING_JOIN: '入社予定',
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-800',
  ON_LEAVE: 'bg-amber-100 text-amber-800',
  RESIGNED: 'bg-slate-100 text-slate-600',
  PENDING_JOIN: 'bg-blue-100 text-blue-800',
}

const ALL_STATUSES = ['ACTIVE', 'ON_LEAVE', 'RESIGNED', 'PENDING_JOIN'] as const

const SEARCH_URL = '/api/search/employees'

export default function EmployeeSearchPage(): ReactElement {
  const [keyword, setKeyword] = useState('')
  const [includeInactive, setIncludeInactive] = useState(false)
  const [searchState, setSearchState] = useState<SearchState>({ kind: 'idle' })

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      const trimmed = keyword.trim()
      if (!trimmed) return

      setSearchState({ kind: 'searching' })

      const params = new URLSearchParams({ keyword: trimmed })
      const statuses = includeInactive ? ALL_STATUSES : (['ACTIVE'] as const)
      statuses.forEach((s) => params.append('statuses[]', s))

      try {
        const res = await fetch(`${SEARCH_URL}?${params.toString()}`, { cache: 'no-store' })
        const payload = (await res.json().catch(() => ({}))) as SearchEnvelope
        if (!res.ok) throw new Error(payload.error ?? `HTTP ${res.status}`)
        setSearchState({ kind: 'results', employees: payload.data ?? [] })
      } catch (err) {
        setSearchState({ kind: 'error', message: readError(err) })
      }
    },
    [keyword, includeInactive],
  )

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <p className="text-xs font-semibold tracking-widest text-indigo-600 uppercase">Employees</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">社員検索</h1>
        <p className="mt-2 text-sm text-slate-600">
          氏名・部署・役職などのキーワードで社員を検索できます。
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="mb-6 space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="flex gap-3">
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="氏名・部署・役職などを入力"
            className="block flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!keyword.trim() || searchState.kind === 'searching'}
            className="rounded-md bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {searchState.kind === 'searching' ? '検索中…' : '検索'}
          </button>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          休職・退職・入社予定の社員も含める
        </label>
      </form>

      <SearchResults state={searchState} />
    </main>
  )
}

interface SearchResultsProps {
  readonly state: SearchState
}

function SearchResults({ state }: SearchResultsProps): ReactElement {
  if (state.kind === 'idle') {
    return (
      <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400">
        キーワードを入力して検索してください
      </div>
    )
  }

  if (state.kind === 'searching') {
    return (
      <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white py-16 text-sm text-slate-500">
        <span className="animate-pulse">検索中…</span>
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <div className="rounded-xl border border-rose-300 bg-rose-50 p-6 text-sm text-rose-800">
        <p className="font-semibold">検索に失敗しました</p>
        <p className="mt-1 text-xs">{state.message}</p>
      </div>
    )
  }

  if (state.employees.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-500">
        該当する社員が見つかりませんでした
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-xs font-medium text-slate-600">
          検索結果: <span className="font-semibold text-slate-900">{state.employees.length}</span>{' '}
          件
        </p>
      </div>
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200">
          <tr>
            <Th>氏名</Th>
            <Th>部署</Th>
            <Th>役職</Th>
            <Th>ステータス</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {state.employees.map((emp) => (
            <tr key={emp.id} className="transition-colors hover:bg-slate-50">
              <td className="px-4 py-3 font-medium text-slate-900">
                {emp.lastName} {emp.firstName}
              </td>
              <td className="px-4 py-3 text-slate-600">{emp.departmentName}</td>
              <td className="px-4 py-3 text-slate-600">{emp.roleName}</td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[emp.status] ?? 'bg-slate-100 text-slate-600'}`}
                >
                  {STATUS_LABELS[emp.status] ?? emp.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
