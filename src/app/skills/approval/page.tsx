/**
 * Issue #175 / Task 11.2 / Req 4.5: マネージャースキル承認画面
 *
 * - MANAGER / HR_MANAGER / ADMIN のみアクセス可能
 * - GET /api/skills/pending で承認待ちスキル一覧を取得
 * - GET /api/skills/catalog でスキル名を解決
 * - POST /api/skills/{id}/approve で承認
 */
'use client'

import { useCallback, useEffect, useState, type ReactElement, type ReactNode } from 'react'

interface SkillMasterItem {
  readonly id: string
  readonly name: string
  readonly category: string
}

interface PendingSkill {
  readonly id: string
  readonly userId: string
  readonly skillId: string
  readonly level: number
  readonly acquiredAt: string
  readonly approvedByManagerId: string | null
}

interface ApiEnvelope<T> {
  readonly success?: boolean
  readonly data?: T
  readonly error?: string
}

type LoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | {
      readonly kind: 'ready'
      readonly pendingSkills: readonly PendingSkill[]
      readonly catalog: readonly SkillMasterItem[]
    }

type ApproveState = Record<string, 'approving' | 'done' | 'error'>

const PENDING_URL = '/api/skills/pending'
const CATALOG_URL = '/api/skills/catalog'

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' })
  const envelope = (await res.json().catch(() => ({}))) as ApiEnvelope<T>
  if (!res.ok) throw new Error(envelope.error ?? `HTTP ${res.status}`)
  return (envelope.data ?? []) as T
}

export default function SkillApprovalPage(): ReactElement {
  const [loadState, setLoadState] = useState<LoadState>({ kind: 'loading' })
  const [approveStates, setApproveStates] = useState<ApproveState>({})

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [pendingSkills, catalog] = await Promise.all([
          fetchJson<PendingSkill[]>(PENDING_URL),
          fetchJson<SkillMasterItem[]>(CATALOG_URL),
        ])
        if (!cancelled) setLoadState({ kind: 'ready', pendingSkills, catalog })
      } catch (err) {
        if (!cancelled) setLoadState({ kind: 'error', message: readError(err) })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleApprove = useCallback(async (skillId: string) => {
    setApproveStates((prev) => ({ ...prev, [skillId]: 'approving' }))
    try {
      const res = await fetch(`/api/skills/${skillId}/approve`, { method: 'POST' })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      setApproveStates((prev) => ({ ...prev, [skillId]: 'done' }))
      // 承認済みを一覧から除去
      setLoadState((prev) => {
        if (prev.kind !== 'ready') return prev
        return {
          ...prev,
          pendingSkills: prev.pendingSkills.filter((s) => s.id !== skillId),
        }
      })
    } catch {
      setApproveStates((prev) => ({ ...prev, [skillId]: 'error' }))
      setTimeout(() => {
        setApproveStates((prev) => {
          const { [skillId]: _, ...rest } = prev
          void _
          return rest
        })
      }, 3000)
    }
  }, [])

  return (
    <main className="mx-auto max-w-6xl px-8 py-10">
      <header className="mb-8">
        <p className="text-xs font-semibold tracking-widest text-indigo-600 uppercase">Skills</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">スキル承認</h1>
        <p className="mt-2 text-sm text-slate-600">
          部下から申請されたスキルを確認し、承認してください。
        </p>
      </header>

      <PageBody loadState={loadState} approveStates={approveStates} onApprove={handleApprove} />
    </main>
  )
}

interface PageBodyProps {
  readonly loadState: LoadState
  readonly approveStates: ApproveState
  readonly onApprove: (skillId: string) => void
}

function PageBody({ loadState, approveStates, onApprove }: PageBodyProps): ReactElement {
  if (loadState.kind === 'loading') {
    return (
      <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white py-16 text-sm text-slate-500">
        <span className="animate-pulse">データを読み込み中…</span>
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

  const { pendingSkills, catalog } = loadState

  if (pendingSkills.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-500">
        承認待ちのスキルはありません
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-xs font-medium text-slate-600">
          承認待ち: <span className="font-semibold text-slate-900">{pendingSkills.length}</span> 件
        </p>
      </div>
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200">
          <tr>
            <Th>社員 ID</Th>
            <Th>スキル名</Th>
            <Th>カテゴリ</Th>
            <Th>レベル</Th>
            <Th>習得日</Th>
            <Th>操作</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {pendingSkills.map((skill) => {
            const masterItem = catalog.find((c) => c.id === skill.skillId)
            const state = approveStates[skill.id]
            return (
              <tr key={skill.id} className="transition-colors hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{skill.userId}</td>
                <td className="px-4 py-3 font-medium text-slate-900">
                  {masterItem?.name ?? skill.skillId}
                </td>
                <td className="px-4 py-3 text-slate-600">{masterItem?.category ?? '—'}</td>
                <td className="px-4 py-3 text-slate-700">
                  <span className="font-semibold text-indigo-600">{skill.level}</span>
                  <span className="text-slate-400"> / 5</span>
                </td>
                <td className="px-4 py-3 text-slate-600">{skill.acquiredAt.slice(0, 10)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onApprove(skill.id)}
                      disabled={state === 'approving' || state === 'done'}
                      className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      {state === 'approving' ? '承認中…' : '承認'}
                    </button>
                    {state === 'error' && (
                      <span className="text-xs font-medium text-rose-600">失敗</span>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
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
