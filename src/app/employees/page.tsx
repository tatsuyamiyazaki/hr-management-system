/**
 * Issue #199: 社員名簿画面リデザイン
 *
 * - ヘッダー: 在籍数・部署数・役職数サマリ + CSV出力/CSV取込/+ 社員を追加ボタン
 * - 検索バー: テキスト検索（氏名・部署）+ 部署タブフィルタ
 * - テーブル: アバター(イニシャル) / 氏名 / 部署・役職 / ステータスバッジ / 詳細リンク
 * - クライアントサイドページネーション (24件/ページ)
 * - GET /api/search/employees — 社員一覧（全ステータス）
 */
'use client'

import {
  useEffect,
  useState,
  useMemo,
  useCallback,
  type ReactElement,
  type ChangeEvent,
} from 'react'
import type { EmployeeSearchResult, EmployeeStatus } from '@/lib/search/search-types'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ApiEnvelope<T> {
  readonly success?: boolean
  readonly data?: T
  readonly meta?: { readonly total: number }
  readonly error?: string
}

type PageState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly employees: readonly EmployeeSearchResult[] }

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 24

const ALL_STATUSES: readonly EmployeeStatus[] = [
  'ACTIVE',
  'ON_LEAVE',
  'RESIGNED',
  'PENDING_JOIN',
]

const STATUS_LABELS: Record<EmployeeStatus, string> = {
  ACTIVE: '在籍',
  ON_LEAVE: '休職中',
  RESIGNED: '退職',
  PENDING_JOIN: '入社予定',
}

const STATUS_COLORS: Record<EmployeeStatus, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-800',
  ON_LEAVE: 'bg-amber-100 text-amber-800',
  RESIGNED: 'bg-slate-100 text-slate-500',
  PENDING_JOIN: 'bg-blue-100 text-blue-800',
}

const AVATAR_COLORS = [
  'bg-indigo-100 text-indigo-700',
  'bg-violet-100 text-violet-700',
  'bg-cyan-100 text-cyan-700',
  'bg-teal-100 text-teal-700',
  'bg-pink-100 text-pink-700',
  'bg-orange-100 text-orange-700',
] as const

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function readError(err: unknown): string {
  if (err instanceof Error) return err.message
  return '予期せぬエラーが発生しました'
}

function getInitials(firstName: string, lastName: string): string {
  return `${lastName.charAt(0)}${firstName.charAt(0)}`.toUpperCase()
}

function getAvatarColor(id: string): string {
  const idx = id.charCodeAt(0) % AVATAR_COLORS.length
  return AVATAR_COLORS[idx] ?? 'bg-slate-100 text-slate-700'
}

function buildSearchUrl(statuses: readonly EmployeeStatus[]): string {
  const params = new URLSearchParams({ keyword: ' ', limit: '100' })
  for (const s of statuses) params.append('statuses[]', s)
  return `/api/search/employees?${params.toString()}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function EmployeesPage(): ReactElement {
  const [state, setState] = useState<PageState>({ kind: 'loading' })
  const [keyword, setKeyword] = useState('')
  const [deptFilter, setDeptFilter] = useState<string>('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setState({ kind: 'loading' })
      try {
        const res = await fetch(buildSearchUrl(ALL_STATUSES), { cache: 'no-store' })
        const payload = (await res.json().catch(() => ({}))) as ApiEnvelope<
          EmployeeSearchResult[]
        >
        if (!res.ok) throw new Error(payload.error ?? `HTTP ${res.status}`)
        if (!cancelled) {
          setState({ kind: 'ready', employees: Array.isArray(payload.data) ? payload.data : [] })
        }
      } catch (err) {
        if (!cancelled) setState({ kind: 'error', message: readError(err) })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const employees = state.kind === 'ready' ? state.employees : []

  const activeCount = employees.filter((e) => e.status === 'ACTIVE').length
  const departments = useMemo(
    () => Array.from(new Set(employees.map((e) => e.departmentName))).sort(),
    [employees],
  )
  const roles = useMemo(
    () => Array.from(new Set(employees.map((e) => e.roleName))),
    [employees],
  )

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return employees.filter((e) => {
      const matchDept = !deptFilter || e.departmentName === deptFilter
      const matchKw =
        !kw ||
        `${e.lastName}${e.firstName}`.toLowerCase().includes(kw) ||
        e.departmentName.toLowerCase().includes(kw) ||
        e.roleName.toLowerCase().includes(kw) ||
        e.id.toLowerCase().includes(kw)
      return matchDept && matchKw
    })
  }, [employees, keyword, deptFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const handleKeywordChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setKeyword(e.target.value)
    setPage(1)
  }, [])

  const handleDeptChange = useCallback((dept: string) => {
    setDeptFilter(dept)
    setPage(1)
  }, [])

  const rangeStart = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, filtered.length)

  return (
    <main className="mx-auto max-w-7xl px-8 py-10">
      {/* Header */}
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.3em] text-indigo-600 uppercase">
            Employees
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">社員名簿</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            在籍{' '}
            <span className="font-semibold text-slate-900">{activeCount} 名</span>・部署{' '}
            <span className="font-semibold text-slate-900">{departments.length}</span>・役職{' '}
            <span className="font-semibold text-slate-900">{roles.length}</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            CSV 出力
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            CSV 取込
          </button>
          <a
            href="/employees/import"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            ＋ 社員を追加
          </a>
        </div>
      </header>

      {/* Search bar */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
            🔍
          </span>
          <input
            type="search"
            value={keyword}
            onChange={handleKeywordChange}
            placeholder="氏名・社員番号・部署で検索"
            className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-4 text-sm focus:border-indigo-400 focus:outline-none"
          />
        </div>
        {state.kind === 'ready' && filtered.length > 0 && (
          <p className="shrink-0 text-xs text-slate-500">
            表示: {rangeStart}–{rangeEnd} / {filtered.length}
          </p>
        )}
      </div>

      {/* Department tabs */}
      {state.kind === 'ready' && (
        <div className="mb-6 flex gap-1.5 overflow-x-auto pb-1">
          <DeptTab
            label={`全員 (${employees.length})`}
            active={deptFilter === ''}
            onClick={() => handleDeptChange('')}
          />
          {departments.slice(0, 6).map((dept) => {
            const count = employees.filter((e) => e.departmentName === dept).length
            return (
              <DeptTab
                key={dept}
                label={`${dept} (${count})`}
                active={deptFilter === dept}
                onClick={() => handleDeptChange(dept)}
              />
            )
          })}
          {departments.length > 6 && (
            <span className="flex items-center rounded-lg px-3 py-1.5 text-xs text-slate-400">
              +{departments.length - 6}
            </span>
          )}
        </div>
      )}

      {/* Table */}
      <EmployeeTable state={state} employees={paginated} />

      {/* Pagination */}
      {state.kind === 'ready' && totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-1.5">
          <PaginationBtn
            label="«"
            disabled={currentPage === 1}
            onClick={() => setPage(1)}
          />
          <PaginationBtn
            label="‹"
            disabled={currentPage === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          />
          <span className="px-4 text-sm font-medium text-slate-700 tabular-nums">
            {currentPage} / {totalPages}
          </span>
          <PaginationBtn
            label="›"
            disabled={currentPage === totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          />
          <PaginationBtn
            label="»"
            disabled={currentPage === totalPages}
            onClick={() => setPage(totalPages)}
          />
        </div>
      )}
    </main>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// DeptTab
// ─────────────────────────────────────────────────────────────────────────────

interface DeptTabProps {
  readonly label: string
  readonly active: boolean
  readonly onClick: () => void
}

function DeptTab({ label, active, onClick }: DeptTabProps): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'bg-indigo-600 text-white shadow-sm'
          : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
      }`}
    >
      {label}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PaginationBtn
// ─────────────────────────────────────────────────────────────────────────────

interface PaginationBtnProps {
  readonly label: string
  readonly disabled: boolean
  readonly onClick: () => void
}

function PaginationBtn({ label, disabled, onClick }: PaginationBtnProps): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {label}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// EmployeeTable
// ─────────────────────────────────────────────────────────────────────────────

interface EmployeeTableProps {
  readonly state: PageState
  readonly employees: readonly EmployeeSearchResult[]
}

function EmployeeTable({ state, employees }: EmployeeTableProps): ReactElement {
  if (state.kind === 'loading') {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-20 text-sm text-slate-500">
        <span className="animate-pulse">社員データを読み込み中…</span>
      </div>
    )
  }
  if (state.kind === 'error') {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
        <p className="font-semibold">社員データの取得に失敗しました</p>
        <p className="mt-1 text-xs opacity-80">{state.message}</p>
      </div>
    )
  }
  if (employees.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400">
        該当する社員が見つかりませんでした
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <th className="w-8 px-4 py-3">
              <input type="checkbox" className="rounded border-slate-300" />
            </th>
            <th className="px-4 py-3">氏名</th>
            <th className="px-4 py-3">社員番号</th>
            <th className="px-4 py-3">部署 / 役職</th>
            <th className="px-4 py-3">ステータス</th>
            <th className="px-4 py-3 text-right">詳細</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {employees.map((emp) => (
            <EmployeeRow key={emp.id} employee={emp} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// EmployeeRow
// ─────────────────────────────────────────────────────────────────────────────

interface EmployeeRowProps {
  readonly employee: EmployeeSearchResult
}

function EmployeeRow({ employee: emp }: EmployeeRowProps): ReactElement {
  const ini = getInitials(emp.firstName, emp.lastName)
  const avatarCls = getAvatarColor(emp.id)
  const empNo = `emp-${emp.id.slice(0, 5).toUpperCase()}`

  return (
    <tr className="hover:bg-slate-50">
      <td className="px-4 py-3">
        <input type="checkbox" className="rounded border-slate-300" />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${avatarCls}`}
          >
            {ini}
          </span>
          <div>
            <p className="font-medium text-slate-900">
              {emp.lastName} {emp.firstName}
            </p>
            <p className="text-xs text-slate-400">—</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 font-mono text-xs text-slate-600">{empNo}</td>
      <td className="px-4 py-3">
        <p className="text-sm text-slate-800">{emp.departmentName}</p>
        <p className="mt-0.5 text-xs text-slate-400">{emp.roleName}</p>
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[emp.status]}`}
        >
          {STATUS_LABELS[emp.status]}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <a
          href={`/employees/search?keyword=${encodeURIComponent(`${emp.lastName}${emp.firstName}`)}`}
          className="rounded px-1.5 py-1 text-sm text-indigo-600 hover:text-indigo-800"
          aria-label={`${emp.lastName} ${emp.firstName}の詳細`}
        >
          ›
        </a>
      </td>
    </tr>
  )
}
