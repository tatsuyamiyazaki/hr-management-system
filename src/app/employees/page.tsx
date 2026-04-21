/**
 * Issue #174 / Task 9.2 / Req 14.2, 14.3, 14.4: 社員ステータス管理画面
 *
 * - HR_MANAGER / ADMIN のみアクセス可能
 * - 社員一覧を表示し、ステータス（在籍/休職/退職/入社予定）を変更できる
 * - PATCH /api/lifecycle/employees/{id}/status でステータス更新
 */
'use client'

import { useCallback, useEffect, useState, type ReactElement } from 'react'

type EmployeeStatus = 'ACTIVE' | 'ON_LEAVE' | 'RESIGNED' | 'PENDING_JOIN'

interface Employee {
  readonly id: string
  readonly email: string
  readonly firstName: string
  readonly lastName: string
  readonly role: string
  readonly hireDate: string
  readonly status: EmployeeStatus
  readonly departmentId: string | null
  readonly positionId: string | null
}

interface EmployeeListEnvelope {
  readonly success?: boolean
  readonly data?: readonly Employee[]
  readonly error?: string
}

type LoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly employees: readonly Employee[] }

interface StatusUpdateState {
  readonly [employeeId: string]: 'saving' | 'success' | 'error'
}

const EMPLOYEES_URL = '/api/lifecycle/employees'

const STATUS_LABELS: Record<EmployeeStatus, string> = {
  ACTIVE: '在籍',
  ON_LEAVE: '休職',
  RESIGNED: '退職',
  PENDING_JOIN: '入社予定',
}

const STATUS_COLORS: Record<EmployeeStatus, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-800',
  ON_LEAVE: 'bg-amber-100 text-amber-800',
  RESIGNED: 'bg-slate-100 text-slate-600',
  PENDING_JOIN: 'bg-blue-100 text-blue-800',
}

export default function EmployeeStatusPage(): ReactElement {
  const [loadState, setLoadState] = useState<LoadState>({ kind: 'loading' })
  const [updateStates, setUpdateStates] = useState<StatusUpdateState>({})

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(EMPLOYEES_URL, { cache: 'no-store' })
        const payload = ((await res.json().catch(() => ({}))) ?? {}) as EmployeeListEnvelope
        if (!res.ok) throw new Error(payload.error ?? `HTTP ${res.status}`)
        if (!cancelled) setLoadState({ kind: 'ready', employees: payload.data ?? [] })
      } catch (err) {
        if (!cancelled) setLoadState({ kind: 'error', message: readError(err) })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleStatusChange = useCallback(
    async (employeeId: string, newStatus: EmployeeStatus, effectiveDate: string) => {
      setUpdateStates((prev) => ({ ...prev, [employeeId]: 'saving' }))
      try {
        const res = await fetch(`${EMPLOYEES_URL}/${employeeId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newStatus, effectiveDate }),
        })
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(body.error ?? `HTTP ${res.status}`)
        }
        setUpdateStates((prev) => ({ ...prev, [employeeId]: 'success' }))
        setLoadState((prev) => {
          if (prev.kind !== 'ready') return prev
          return {
            ...prev,
            employees: prev.employees.map((e) =>
              e.id === employeeId ? { ...e, status: newStatus } : e,
            ),
          }
        })
        setTimeout(() => {
          setUpdateStates((prev) => {
            const { [employeeId]: _, ...rest } = prev
            void _
            return rest
          })
        }, 2000)
      } catch {
        setUpdateStates((prev) => ({ ...prev, [employeeId]: 'error' }))
        setTimeout(() => {
          setUpdateStates((prev) => {
            const { [employeeId]: _, ...rest } = prev
            void _
            return rest
          })
        }, 3000)
      }
    },
    [],
  )

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8">
        <p className="text-xs font-semibold tracking-widest text-indigo-600 uppercase">Employees</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">社員ステータス管理</h1>
        <p className="mt-2 text-sm text-slate-600">
          社員の在籍状態を管理します。退職・休職処理は進行中の評価から自動除外されます。
        </p>
      </header>

      <PageBody
        loadState={loadState}
        updateStates={updateStates}
        onStatusChange={handleStatusChange}
      />
    </main>
  )
}

interface PageBodyProps {
  readonly loadState: LoadState
  readonly updateStates: StatusUpdateState
  readonly onStatusChange: (id: string, status: EmployeeStatus, effectiveDate: string) => void
}

function PageBody({ loadState, updateStates, onStatusChange }: PageBodyProps): ReactElement {
  if (loadState.kind === 'loading') {
    return (
      <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white py-16 text-sm text-slate-500">
        <span className="animate-pulse">社員データを読み込み中…</span>
      </div>
    )
  }

  if (loadState.kind === 'error') {
    return (
      <div className="rounded-xl border border-rose-300 bg-rose-50 p-6 text-sm text-rose-800">
        <p className="font-semibold">データの取得に失敗しました</p>
        <p className="mt-1 text-xs">{loadState.message}</p>
      </div>
    )
  }

  if (loadState.employees.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-500">
        社員が登録されていません
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left font-semibold text-slate-700">氏名</th>
            <th className="px-4 py-3 text-left font-semibold text-slate-700">メール</th>
            <th className="px-4 py-3 text-left font-semibold text-slate-700">入社日</th>
            <th className="px-4 py-3 text-left font-semibold text-slate-700">現在のステータス</th>
            <th className="px-4 py-3 text-left font-semibold text-slate-700">ステータス変更</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {loadState.employees.map((employee) => (
            <EmployeeRow
              key={employee.id}
              employee={employee}
              updateState={updateStates[employee.id]}
              onStatusChange={onStatusChange}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface EmployeeRowProps {
  readonly employee: Employee
  readonly updateState: 'saving' | 'success' | 'error' | undefined
  readonly onStatusChange: (id: string, status: EmployeeStatus, effectiveDate: string) => void
}

function EmployeeRow({ employee, updateState, onStatusChange }: EmployeeRowProps): ReactElement {
  const [selectedStatus, setSelectedStatus] = useState<EmployeeStatus>(employee.status)
  const [effectiveDate, setEffectiveDate] = useState<string>(new Date().toISOString().slice(0, 10))

  const changed = selectedStatus !== employee.status

  return (
    <tr className="transition-colors hover:bg-slate-50">
      <td className="px-4 py-3 font-medium text-slate-900">
        {employee.lastName} {employee.firstName}
      </td>
      <td className="px-4 py-3 text-slate-600">{employee.email}</td>
      <td className="px-4 py-3 text-slate-600">{employee.hireDate}</td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[employee.status]}`}
        >
          {STATUS_LABELS[employee.status]}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value as EmployeeStatus)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
          >
            {(Object.keys(STATUS_LABELS) as EmployeeStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>

          {changed && (
            <>
              <input
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => onStatusChange(employee.id, selectedStatus, effectiveDate)}
                disabled={updateState === 'saving'}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {updateState === 'saving' ? '更新中…' : '更新'}
              </button>
            </>
          )}

          {updateState === 'success' && (
            <span className="text-xs font-medium text-emerald-600">✓ 更新しました</span>
          )}
          {updateState === 'error' && (
            <span className="text-xs font-medium text-rose-600">更新に失敗しました</span>
          )}
        </div>
      </td>
    </tr>
  )
}

function readError(err: unknown): string {
  if (err instanceof Error) return err.message
  return '予期せぬエラーが発生しました'
}
