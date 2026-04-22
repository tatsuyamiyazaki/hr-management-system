/**
 * Issue #176 / Task 12.2 / Req 5.1, 5.3, 5.4: キャリアマップ / ギャップ表示画面
 *
 * - 全ロールアクセス可能
 * - GET /api/career/map/roles で役職一覧を取得（Req 5.1）
 * - GET /api/career/map/gap?desiredRoleId=... でスキルギャップを計算（Req 5.3）
 * - GET /api/career/map/subordinates/wishes で部下の希望一覧（MANAGER+ / Req 5.4）
 */
'use client'

import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from 'react'

interface SkillRequirement {
  readonly skillId: string
  readonly skillName: string
  readonly requiredLevel: number
}

interface RoleNode {
  readonly id: string
  readonly name: string
  readonly skillRequirements: readonly SkillRequirement[]
}

interface SkillGapItem {
  readonly skillId: string
  readonly skillName: string
  readonly requiredLevel: number
  readonly actualLevel: number
  readonly gap: number
}

interface CareerGapResult {
  readonly currentRoleId: string | null
  readonly desiredRoleId: string
  readonly gaps: readonly SkillGapItem[]
  readonly totalGap: number
  readonly fulfillmentRate: number
}

interface SubordinateWish {
  readonly userId: string
  readonly userName?: string
  readonly currentRoleId: string | null
  readonly desiredRoleId: string
  readonly desiredRoleName: string
  readonly desiredAt: string
  readonly fulfillmentRate: number
}

interface ApiEnvelope<T> {
  readonly success?: boolean
  readonly data?: T
  readonly error?: string
}

type RolesState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly roles: readonly RoleNode[] }

type GapState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly result: CareerGapResult }

type SubordinatesState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly wishes: readonly SubordinateWish[] }
  | { readonly kind: 'hidden' }

const ROLES_URL = '/api/career/map/roles'
const GAP_URL = '/api/career/map/gap'
const SUBORDINATES_URL = '/api/career/map/subordinates/wishes'

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' })
  const envelope = (await res.json().catch(() => ({}))) as ApiEnvelope<T>
  if (!res.ok) throw new Error(envelope.error ?? `HTTP ${res.status}`)
  return (envelope.data ?? null) as T
}

export default function CareerMapPage(): ReactElement {
  const [rolesState, setRolesState] = useState<RolesState>({ kind: 'loading' })
  const [gapState, setGapState] = useState<GapState>({ kind: 'idle' })
  const [subordinatesState, setSubordinatesState] = useState<SubordinatesState>({
    kind: 'loading',
  })
  const [selectedRoleId, setSelectedRoleId] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const roles = await fetchJson<RoleNode[]>(ROLES_URL)
        const safeRoles = Array.isArray(roles) ? roles : []
        setRolesState({ kind: 'ready', roles: safeRoles })
        if (safeRoles.length > 0) {
          setSelectedRoleId(safeRoles[0]?.id ?? '')
        }
      } catch (err) {
        setRolesState({ kind: 'error', message: readError(err) })
      }

      try {
        const wishes = await fetchJson<SubordinateWish[]>(SUBORDINATES_URL)
        const safeWishes = Array.isArray(wishes) ? wishes : []
        setSubordinatesState({ kind: 'ready', wishes: safeWishes })
      } catch (err) {
        const msg = readError(err)
        if (msg.includes('403') || msg.toLowerCase().includes('forbidden')) {
          setSubordinatesState({ kind: 'hidden' })
        } else {
          setSubordinatesState({ kind: 'error', message: msg })
        }
      }
    }
    void load()
  }, [])

  const handleGapSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      if (!selectedRoleId) return
      setGapState({ kind: 'loading' })
      try {
        const result = await fetchJson<CareerGapResult>(
          `${GAP_URL}?desiredRoleId=${encodeURIComponent(selectedRoleId)}`,
        )
        setGapState({ kind: 'ready', result })
      } catch (err) {
        setGapState({ kind: 'error', message: readError(err) })
      }
    },
    [selectedRoleId],
  )

  return (
    <main className="mx-auto max-w-5xl space-y-10 px-6 py-10">
      <header>
        <p className="text-xs font-semibold tracking-widest text-indigo-600 uppercase">Career</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">キャリアマップ</h1>
        <p className="mt-2 text-sm text-slate-600">
          役職一覧を確認し、希望役職へのスキルギャップを把握できます。
        </p>
      </header>

      {/* 役職一覧 */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-slate-900">役職一覧</h2>
        <RolesSection state={rolesState} />
      </section>

      {/* ギャップ計算 */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-slate-900">スキルギャップ確認</h2>
        <GapSection
          rolesState={rolesState}
          gapState={gapState}
          selectedRoleId={selectedRoleId}
          onRoleChange={setSelectedRoleId}
          onSubmit={handleGapSubmit}
        />
      </section>

      {/* 部下のキャリア希望（MANAGER+） */}
      {subordinatesState.kind !== 'hidden' && (
        <section>
          <h2 className="mb-4 text-lg font-semibold text-slate-900">部下のキャリア希望</h2>
          <SubordinatesSection state={subordinatesState} />
        </section>
      )}
    </main>
  )
}

function RolesSection({ state }: { readonly state: RolesState }): ReactElement {
  if (state.kind === 'loading') {
    return (
      <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white py-10 text-sm text-slate-500">
        <span className="animate-pulse">読み込み中…</span>
      </div>
    )
  }
  if (state.kind === 'error') {
    return (
      <div className="rounded-xl border border-rose-300 bg-rose-50 p-5 text-sm text-rose-800">
        <p className="font-semibold">役職一覧の取得に失敗しました</p>
        <p className="mt-1 text-xs">{state.message}</p>
      </div>
    )
  }
  if (state.roles.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white py-10 text-center text-sm text-slate-400">
        役職データがありません
      </div>
    )
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {state.roles.map((role) => (
        <div key={role.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="font-semibold text-slate-900">{role.name}</p>
          {role.skillRequirements.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {role.skillRequirements.map((req) => (
                <li key={req.skillId} className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">{req.skillName}</span>
                  <span className="ml-2 font-semibold text-indigo-600">Lv {req.requiredLevel}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-slate-400">スキル要件なし</p>
          )}
        </div>
      ))}
    </div>
  )
}

interface GapSectionProps {
  readonly rolesState: RolesState
  readonly gapState: GapState
  readonly selectedRoleId: string
  readonly onRoleChange: (id: string) => void
  readonly onSubmit: (e: FormEvent) => void
}

function GapSection({
  rolesState,
  gapState,
  selectedRoleId,
  onRoleChange,
  onSubmit,
}: GapSectionProps): ReactElement {
  const roles = rolesState.kind === 'ready' ? rolesState.roles : []

  return (
    <div className="space-y-4">
      <form
        onSubmit={onSubmit}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="flex-1 space-y-1">
          <label className="block text-xs font-medium text-slate-700">希望役職</label>
          <select
            value={selectedRoleId}
            onChange={(e) => onRoleChange(e.target.value)}
            disabled={rolesState.kind !== 'ready'}
            className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none disabled:bg-slate-50"
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={!selectedRoleId || gapState.kind === 'loading'}
          className="rounded-md bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {gapState.kind === 'loading' ? '計算中…' : 'ギャップを確認'}
        </button>
      </form>

      {gapState.kind === 'error' && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800">
          <p className="font-semibold">ギャップの取得に失敗しました</p>
          <p className="mt-1 text-xs">{gapState.message}</p>
        </div>
      )}

      {gapState.kind === 'ready' && <GapResult result={gapState.result} />}
    </div>
  )
}

function GapResult({ result }: { readonly result: CareerGapResult }): ReactElement {
  const pct = Math.round(result.fulfillmentRate * 100)
  const color = pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-rose-500'

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50 px-5 py-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-800">スキルギャップ分析</p>
          <div className="flex items-center gap-2">
            <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
              <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-sm font-semibold text-slate-700">{pct}%</span>
          </div>
        </div>
      </div>
      {result.gaps.length === 0 ? (
        <div className="py-10 text-center text-sm text-emerald-600">
          ✓ スキルギャップはありません
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200">
            <tr>
              <Th>スキル</Th>
              <Th>現在レベル</Th>
              <Th>必要レベル</Th>
              <Th>ギャップ</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {result.gaps.map((gap) => (
              <tr key={gap.skillId} className="transition-colors hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{gap.skillName}</td>
                <td className="px-4 py-3 text-slate-700">{gap.actualLevel}</td>
                <td className="px-4 py-3 text-slate-700">{gap.requiredLevel}</td>
                <td className="px-4 py-3">
                  {gap.gap > 0 ? (
                    <span className="font-semibold text-rose-600">−{gap.gap}</span>
                  ) : (
                    <span className="font-semibold text-emerald-600">✓</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function SubordinatesSection({ state }: { readonly state: SubordinatesState }): ReactElement {
  if (state.kind === 'loading') {
    return (
      <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white py-10 text-sm text-slate-500">
        <span className="animate-pulse">読み込み中…</span>
      </div>
    )
  }
  if (state.kind === 'error') {
    return (
      <div className="rounded-xl border border-rose-300 bg-rose-50 p-5 text-sm text-rose-800">
        <p className="font-semibold">部下の希望一覧の取得に失敗しました</p>
        <p className="mt-1 text-xs">{state.message}</p>
      </div>
    )
  }
  if (state.kind !== 'ready' || state.wishes.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white py-10 text-center text-sm text-slate-400">
        部下のキャリア希望データがありません
      </div>
    )
  }
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            <Th>社員</Th>
            <Th>希望役職</Th>
            <Th>希望時期</Th>
            <Th>充足率</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {state.wishes.map((wish) => {
            const pct = Math.round(wish.fulfillmentRate * 100)
            const color = pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-rose-500'
            return (
              <tr key={wish.userId} className="transition-colors hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-xs text-slate-500">
                  {wish.userName ?? wish.userId}
                </td>
                <td className="px-4 py-3 font-medium text-slate-900">{wish.desiredRoleName}</td>
                <td className="px-4 py-3 text-slate-600">{wish.desiredAt.slice(0, 10)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-8 text-right text-xs font-semibold text-slate-700">
                      {pct}%
                    </span>
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
