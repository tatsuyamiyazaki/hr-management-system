/**
 * Issue #176 / Task 12.1 / Req 5.2, 5.6: キャリア希望登録・表示画面
 *
 * - 全ロールアクセス可能（自分の希望のみ登録・閲覧）
 * - GET /api/career/map/roles でドロップダウン用の役職一覧を取得
 * - GET /api/career/wishes で現在の希望を取得
 * - POST /api/career/wishes で新規登録（旧希望は supersededAt で履歴保持）
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

interface RoleNode {
  readonly id: string
  readonly name: string
}

interface CareerWish {
  readonly id: string
  readonly userId: string
  readonly desiredRoleId: string
  readonly desiredRoleName: string
  readonly desiredAt: string
  readonly comment: string | null
  readonly supersededAt: string | null
  readonly createdAt: string
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
      readonly roles: readonly RoleNode[]
      readonly currentWish: CareerWish | null
    }

type SaveState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'saving' }
  | { readonly kind: 'success' }
  | { readonly kind: 'error'; readonly message: string }

const ROLES_URL = '/api/career/map/roles'
const WISHES_URL = '/api/career/wishes'

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' })
  const envelope = (await res.json().catch(() => ({}))) as ApiEnvelope<T>
  if (!res.ok) throw new Error(envelope.error ?? `HTTP ${res.status}`)
  return (envelope.data ?? null) as T
}

export default function CareerWishPage(): ReactElement {
  const [loadState, setLoadState] = useState<LoadState>({ kind: 'loading' })
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' })

  const [selectedRoleId, setSelectedRoleId] = useState('')
  const [desiredAt, setDesiredAt] = useState(
    new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  )
  const [comment, setComment] = useState('')

  const loadData = useCallback(async () => {
    setLoadState({ kind: 'loading' })
    try {
      const [roles, currentWish] = await Promise.all([
        fetchJson<RoleNode[]>(ROLES_URL),
        fetchJson<CareerWish | null>(WISHES_URL),
      ])
      const safeRoles = Array.isArray(roles) ? roles : []
      setLoadState({ kind: 'ready', roles: safeRoles, currentWish })
      if (safeRoles.length > 0 && !selectedRoleId) {
        setSelectedRoleId(safeRoles[0]?.id ?? '')
      }
    } catch (err) {
      setLoadState({ kind: 'error', message: readError(err) })
    }
  }, [selectedRoleId])

  useEffect(() => {
    void loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      if (!selectedRoleId) return
      setSaveState({ kind: 'saving' })
      try {
        const res = await fetch(WISHES_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            desiredRoleId: selectedRoleId,
            desiredAt,
            comment: comment.trim() || null,
          }),
        })
        const body = (await res.json().catch(() => ({}))) as ApiEnvelope<CareerWish>
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
        setSaveState({ kind: 'success' })
        const newWish = body.data ?? null
        setLoadState((prev) => {
          if (prev.kind !== 'ready') return prev
          return { ...prev, currentWish: newWish }
        })
        setTimeout(() => setSaveState({ kind: 'idle' }), 2000)
      } catch (err) {
        setSaveState({ kind: 'error', message: readError(err) })
      }
    },
    [selectedRoleId, desiredAt, comment],
  )

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <header className="mb-8">
        <p className="text-xs font-semibold tracking-widest text-indigo-600 uppercase">Career</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">キャリア希望登録</h1>
        <p className="mt-2 text-sm text-slate-600">
          希望する役職と時期を登録します。更新すると旧希望は履歴として保持されます。
        </p>
      </header>

      <PageBody
        loadState={loadState}
        saveState={saveState}
        selectedRoleId={selectedRoleId}
        desiredAt={desiredAt}
        comment={comment}
        onRoleChange={setSelectedRoleId}
        onDesiredAtChange={setDesiredAt}
        onCommentChange={setComment}
        onSubmit={handleSubmit}
      />
    </main>
  )
}

interface PageBodyProps {
  readonly loadState: LoadState
  readonly saveState: SaveState
  readonly selectedRoleId: string
  readonly desiredAt: string
  readonly comment: string
  readonly onRoleChange: (id: string) => void
  readonly onDesiredAtChange: (v: string) => void
  readonly onCommentChange: (v: string) => void
  readonly onSubmit: (e: FormEvent) => void
}

function PageBody({
  loadState,
  saveState,
  selectedRoleId,
  desiredAt,
  comment,
  onRoleChange,
  onDesiredAtChange,
  onCommentChange,
  onSubmit,
}: PageBodyProps): ReactElement {
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

  const { roles, currentWish } = loadState
  const saving = saveState.kind === 'saving'

  return (
    <div className="space-y-6">
      {/* 現在の希望 */}
      {currentWish && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-5">
          <p className="mb-2 text-xs font-semibold tracking-wide text-indigo-700 uppercase">
            現在の希望
          </p>
          <p className="text-lg font-semibold text-indigo-900">{currentWish.desiredRoleName}</p>
          <p className="mt-1 text-sm text-indigo-700">
            希望時期: {currentWish.desiredAt.slice(0, 10)}
          </p>
          {currentWish.comment && (
            <p className="mt-1 text-sm text-indigo-600">{currentWish.comment}</p>
          )}
          <p className="mt-2 text-xs text-indigo-400">
            登録日: {currentWish.createdAt.slice(0, 10)}
          </p>
        </div>
      )}

      {/* 登録フォーム */}
      <form
        onSubmit={onSubmit}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="text-sm font-semibold text-slate-800">
          {currentWish ? '希望を更新する' : '希望を登録する'}
        </h2>

        <Field label="希望役職" required>
          <select
            value={selectedRoleId}
            onChange={(e) => onRoleChange(e.target.value)}
            required
            className={inputCls}
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="希望時期" required>
          <input
            type="date"
            value={desiredAt}
            onChange={(e) => onDesiredAtChange(e.target.value)}
            required
            className={inputCls}
          />
        </Field>

        <Field label="コメント（任意）">
          <textarea
            value={comment}
            onChange={(e) => onCommentChange(e.target.value)}
            rows={3}
            placeholder="希望の背景や意気込みを記入（任意）"
            className={`${inputCls} resize-none`}
          />
        </Field>

        <div className="flex items-center gap-3 border-t border-slate-100 pt-2">
          <button
            type="submit"
            disabled={saving || !selectedRoleId}
            className="rounded-md bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {saving ? '登録中…' : currentWish ? '更新する' : '登録する'}
          </button>
          {saveState.kind === 'success' && (
            <span className="text-sm font-medium text-emerald-600">✓ 登録しました</span>
          )}
          {saveState.kind === 'error' && (
            <span className="text-sm font-medium text-rose-600">
              登録に失敗: {saveState.message}
            </span>
          )}
        </div>

        {currentWish && (
          <p className="text-xs text-slate-400">※ 更新すると現在の希望は履歴として保持されます。</p>
        )}
      </form>
    </div>
  )
}

const inputCls =
  'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500'

interface FieldProps {
  readonly label: string
  readonly required?: boolean
  readonly children: ReactNode
}

function Field({ label, required = false, children }: FieldProps): ReactElement {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-slate-700">
        {label}
        {required && <span className="ml-1 text-rose-500">*</span>}
      </label>
      {children}
    </div>
  )
}

function readError(err: unknown): string {
  if (err instanceof Error) return err.message
  return '予期せぬエラーが発生しました'
}
