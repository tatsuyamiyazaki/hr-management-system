'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactElement,
} from 'react'
import type { Department, Employee, EmployeeStatus } from '@/lib/employees/employee-directory'

type EmployeeListState =
  | { kind: 'loading' }
  | {
      kind: 'ready'
      employees: readonly Employee[]
      total: number
      page: number
      activeTab: string
    }
  | { kind: 'error'; message: string }

interface EmployeesPayload {
  readonly employees?: readonly Employee[]
  readonly total?: number
  readonly page?: number
}

interface DepartmentsPayload {
  readonly departments?: readonly Department[]
}

const PAGE_SIZE = 24
const SUMMARY = {
  activeEmployees: 1248,
  departments: 48,
  roles: 32,
} as const

const STATUS_LABELS: Record<EmployeeStatus, string> = {
  ACTIVE: '在籍',
  ON_LEAVE: '休職中',
  PARENTAL_LEAVE: '育休中',
  RESIGNED: '退職予定',
}

const STATUS_STYLES: Record<EmployeeStatus, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 ring-emerald-200 before:bg-emerald-500',
  ON_LEAVE: 'bg-yellow-50 text-yellow-700 ring-yellow-200 before:bg-yellow-500',
  PARENTAL_LEAVE: 'bg-orange-50 text-orange-700 ring-orange-200 before:bg-orange-500',
  RESIGNED: 'bg-rose-50 text-rose-700 ring-rose-200 before:bg-rose-500',
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('ja-JP').format(value)
}

function readError(error: unknown): string {
  return error instanceof Error ? error.message : '社員名簿の取得に失敗しました'
}

function getInitials(employee: Employee): string {
  return `${employee.lastName.charAt(0)}${employee.firstName.charAt(0)}`
}

function buildEmployeesUrl(page: number, activeTab: string): string {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(PAGE_SIZE),
  })
  if (activeTab) params.set('departmentId', activeTab)
  return `/api/employees?${params.toString()}`
}

function buildExportUrl(activeTab: string): string {
  const params = new URLSearchParams({ format: 'csv' })
  if (activeTab) params.set('departmentId', activeTab)
  return `/api/employees/export?${params.toString()}`
}

export default function EmployeesPage(): ReactElement {
  const [state, setState] = useState<EmployeeListState>({ kind: 'loading' })
  const [departments, setDepartments] = useState<readonly Department[]>([])
  const [page, setPage] = useState(1)
  const [activeTab, setActiveTab] = useState('')
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set())
  const [isMoreOpen, setIsMoreOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const response = await fetch('/api/departments', { cache: 'no-store' })
        const payload = (await response.json().catch(() => ({}))) as DepartmentsPayload
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        if (!cancelled) setDepartments(payload.departments ?? [])
      } catch {
        if (!cancelled) setDepartments([])
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      setState({ kind: 'loading' })
      try {
        const response = await fetch(buildEmployeesUrl(page, activeTab), { cache: 'no-store' })
        const payload = (await response.json().catch(() => ({}))) as EmployeesPayload
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        if (!cancelled) {
          setState({
            kind: 'ready',
            employees: payload.employees ?? [],
            total: payload.total ?? 0,
            page: payload.page ?? page,
            activeTab,
          })
          setSelectedIds(new Set())
        }
      } catch (error) {
        if (!cancelled) setState({ kind: 'error', message: readError(error) })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [activeTab, page])

  const visibleDepartments = departments.slice(0, 4)
  const hiddenDepartments = departments.slice(4)
  const employees = useMemo(() => (state.kind === 'ready' ? state.employees : []), [state])
  const total = state.kind === 'ready' ? state.total : SUMMARY.activeEmployees
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(page * PAGE_SIZE, total)
  const visibleIds = useMemo(() => employees.map((employee) => employee.id), [employees])
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))

  const handleTabChange = useCallback((departmentId: string) => {
    setActiveTab(departmentId)
    setPage(1)
    setIsMoreOpen(false)
  }, [])

  const toggleEmployee = useCallback((employeeId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(employeeId)) {
        next.delete(employeeId)
      } else {
        next.add(employeeId)
      }
      return next
    })
  }, [])

  const toggleVisibleEmployees = useCallback(() => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (visibleIds.every((id) => next.has(id))) {
        visibleIds.forEach((id) => next.delete(id))
      } else {
        visibleIds.forEach((id) => next.add(id))
      }
      return next
    })
  }, [visibleIds])

  const handleImportChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const formData = new FormData()
    formData.set('file', file)
    await fetch('/api/employees/import', { method: 'POST', body: formData })
    event.target.value = ''
  }, [])

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-5 border-b border-slate-200 pb-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">社員名簿</h1>
            <div className="mt-4 flex flex-wrap gap-2">
              <SummaryBadge label="在籍" value={`${formatNumber(SUMMARY.activeEmployees)}名`} />
              <SummaryBadge label="部署" value={String(SUMMARY.departments)} />
              <SummaryBadge label="役職" value={String(SUMMARY.roles)} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={buildExportUrl(activeTab)}
              className="inline-flex h-10 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-100"
            >
              CSV出力
            </a>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex h-10 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-100"
            >
              CSV取込
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleImportChange}
            />
            <a
              href="/employees/import"
              className="inline-flex h-10 items-center rounded-md bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
            >
              + 社員を追加
            </a>
          </div>
        </header>

        <nav className="relative mt-6 border-b border-slate-200" aria-label="部署フィルタ">
          <div className="flex gap-6 overflow-x-auto">
            <FilterTab
              label={`全員 ${formatNumber(SUMMARY.activeEmployees)}`}
              active={activeTab === ''}
              onClick={() => handleTabChange('')}
            />
            {visibleDepartments.map((department) => (
              <FilterTab
                key={department.id}
                label={department.name}
                active={activeTab === department.id}
                onClick={() => handleTabChange(department.id)}
              />
            ))}
            {hiddenDepartments.length > 0 && (
              <button
                type="button"
                onClick={() => setIsMoreOpen((value) => !value)}
                className="shrink-0 border-b-2 border-transparent px-1 pb-3 text-sm font-semibold text-slate-500 hover:text-slate-900"
              >
                +{hiddenDepartments.length}
              </button>
            )}
          </div>
          {isMoreOpen && (
            <div className="absolute top-11 right-0 z-10 w-64 rounded-md border border-slate-200 bg-white py-2 shadow-lg">
              {hiddenDepartments.map((department) => (
                <button
                  key={department.id}
                  type="button"
                  onClick={() => handleTabChange(department.id)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  <span>{department.name}</span>
                  <span className="text-xs text-slate-400">{department.employeeCount}</span>
                </button>
              ))}
            </div>
          )}
        </nav>

        <section className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <EmployeeTable
            state={state}
            selectedIds={selectedIds}
            allVisibleSelected={allVisibleSelected}
            onToggleAll={toggleVisibleEmployees}
            onToggleEmployee={toggleEmployee}
          />
        </section>

        {state.kind === 'ready' && (
          <footer className="mt-4 flex flex-col gap-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <p>
              {formatNumber(rangeStart)}-{formatNumber(rangeEnd)} / {formatNumber(total)}件
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                disabled={page === 1}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-lg text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="前のページ"
              >
                ←
              </button>
              <span className="min-w-24 text-center font-medium text-slate-800">
                ページ {page}/{totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                disabled={page === totalPages}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-lg text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="次のページ"
              >
                →
              </button>
            </div>
          </footer>
        )}
      </div>
    </main>
  )
}

interface SummaryBadgeProps {
  readonly label: string
  readonly value: string
}

function SummaryBadge({ label, value }: SummaryBadgeProps): ReactElement {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-white px-3 py-1.5 text-sm text-slate-600 ring-1 ring-slate-200">
      {label}
      <strong className="font-semibold text-slate-950">{value}</strong>
    </span>
  )
}

interface FilterTabProps {
  readonly label: string
  readonly active: boolean
  readonly onClick: () => void
}

function FilterTab({ label, active, onClick }: FilterTabProps): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 border-b-2 px-1 pb-3 text-sm font-semibold ${
        active
          ? 'border-indigo-600 text-indigo-700'
          : 'border-transparent text-slate-500 hover:text-slate-900'
      }`}
    >
      {label}
    </button>
  )
}

interface EmployeeTableProps {
  readonly state: EmployeeListState
  readonly selectedIds: ReadonlySet<string>
  readonly allVisibleSelected: boolean
  readonly onToggleAll: () => void
  readonly onToggleEmployee: (employeeId: string) => void
}

function EmployeeTable({
  state,
  selectedIds,
  allVisibleSelected,
  onToggleAll,
  onToggleEmployee,
}: EmployeeTableProps): ReactElement {
  if (state.kind === 'loading') {
    return <div className="px-6 py-16 text-center text-sm text-slate-500">読み込み中...</div>
  }

  if (state.kind === 'error') {
    return (
      <div className="px-6 py-16 text-center text-sm text-rose-700">
        <p className="font-semibold">社員名簿を取得できませんでした</p>
        <p className="mt-1 text-xs">{state.message}</p>
      </div>
    )
  }

  if (state.employees.length === 0) {
    return (
      <div className="px-6 py-16 text-center text-sm text-slate-500">該当する社員はいません</div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
          <tr>
            <th className="w-12 px-4 py-3">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={onToggleAll}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                aria-label="表示中の社員を選択"
              />
            </th>
            <th className="px-4 py-3">社員</th>
            <th className="px-4 py-3">社員番号</th>
            <th className="px-4 py-3">部署・役職</th>
            <th className="px-4 py-3">等級</th>
            <th className="px-4 py-3">入社日</th>
            <th className="px-4 py-3">ステータス</th>
            <th className="w-12 px-4 py-3 text-right">▶</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {state.employees.map((employee) => (
            <EmployeeRow
              key={employee.id}
              employee={employee}
              selected={selectedIds.has(employee.id)}
              onToggle={() => onToggleEmployee(employee.id)}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface EmployeeRowProps {
  readonly employee: Employee
  readonly selected: boolean
  readonly onToggle: () => void
}

function EmployeeRow({ employee, selected, onToggle }: EmployeeRowProps): ReactElement {
  return (
    <tr className="hover:bg-slate-50">
      <td className="px-4 py-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="h-4 w-4 rounded border-slate-300 text-indigo-600"
          aria-label={`${employee.lastName} ${employee.firstName}を選択`}
        />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${employee.avatarColor}`}
          >
            {getInitials(employee)}
          </span>
          <div>
            <p className="font-semibold text-slate-950">
              {employee.lastName} {employee.firstName}
            </p>
            <p className="text-xs text-slate-500">{employee.email}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 font-mono text-xs text-slate-600">{employee.employeeNumber}</td>
      <td className="px-4 py-3">
        <p className="text-slate-700">{employee.departmentName}</p>
        <p className="text-xs text-slate-500">{employee.roleName}</p>
      </td>
      <td className="px-4 py-3">
        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
          {employee.grade}
        </span>
      </td>
      <td className="px-4 py-3 text-slate-600">{employee.joinDate}</td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 before:h-2 before:w-2 before:rounded-full before:content-[''] ${STATUS_STYLES[employee.status]}`}
        >
          {STATUS_LABELS[employee.status]}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <a
          href={`/employees/search?keyword=${encodeURIComponent(employee.employeeNumber)}`}
          className="text-lg font-semibold text-slate-400 hover:text-indigo-600"
          aria-label={`${employee.lastName} ${employee.firstName}の詳細`}
        >
          ›
        </a>
      </td>
    </tr>
  )
}
