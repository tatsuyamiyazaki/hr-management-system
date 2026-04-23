/**
 * Issue #175 / Task 11.2 / Req 4.4, 4.5: 社員スキル登録画面
 *
 * - 全ロールアクセス可能（自分のスキルのみ登録）
 * - GET /api/skills/catalog でスキルマスタ一覧を取得（フォームのドロップダウン）
 * - GET /api/skills で自分の登録済みスキルを取得
 * - POST /api/skills でスキルを新規登録
 * - 承認済み（approvedByManagerId != null）は ✓ 承認済み と表示
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

interface SkillMasterItem {
  readonly id: string
  readonly name: string
  readonly category: string
}

interface EmployeeSkill {
  readonly id: string
  readonly skillId: string
  readonly level: number
  readonly acquiredAt: string
  readonly approvedByManagerId: string | null
  readonly approvedAt: string | null
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
      readonly catalog: readonly SkillMasterItem[]
      readonly mySkills: readonly EmployeeSkill[]
    }

type SaveState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'saving' }
  | { readonly kind: 'success' }
  | { readonly kind: 'error'; readonly message: string }

const CATALOG_URL = '/api/skills/catalog'
const SKILLS_URL = '/api/skills'
const LEVEL_MIN = 1
const LEVEL_MAX = 5

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' })
  const envelope = (await res.json().catch(() => ({}))) as ApiEnvelope<T>
  if (!res.ok) throw new Error(envelope.error ?? `HTTP ${res.status}`)
  return (envelope.data ?? []) as T
}

export default function SkillRegisterPage(): ReactElement {
  const [loadState, setLoadState] = useState<LoadState>({ kind: 'loading' })
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' })

  const [selectedSkillId, setSelectedSkillId] = useState('')
  const [level, setLevel] = useState<number>(3)
  const [acquiredAt, setAcquiredAt] = useState(new Date().toISOString().slice(0, 10))

  const loadData = useCallback(async () => {
    setLoadState({ kind: 'loading' })
    try {
      const [catalog, mySkills] = await Promise.all([
        fetchJson<SkillMasterItem[]>(CATALOG_URL),
        fetchJson<EmployeeSkill[]>(SKILLS_URL),
      ])
      setLoadState({ kind: 'ready', catalog, mySkills })
      if (catalog.length > 0 && !selectedSkillId) {
        setSelectedSkillId(catalog[0]?.id ?? '')
      }
    } catch (err) {
      setLoadState({ kind: 'error', message: readError(err) })
    }
  }, [selectedSkillId])

  useEffect(() => {
    void loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      if (!selectedSkillId) return
      setSaveState({ kind: 'saving' })
      try {
        const res = await fetch(SKILLS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ skillId: selectedSkillId, level, acquiredAt }),
        })
        const body = (await res.json().catch(() => ({}))) as ApiEnvelope<unknown>
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
        setSaveState({ kind: 'success' })
        // 登録後リストを再取得
        const refreshed = await fetchJson<EmployeeSkill[]>(SKILLS_URL)
        setLoadState((prev) => {
          if (prev.kind !== 'ready') return prev
          return { ...prev, mySkills: refreshed }
        })
        setTimeout(() => setSaveState({ kind: 'idle' }), 2000)
      } catch (err) {
        setSaveState({ kind: 'error', message: readError(err) })
      }
    },
    [selectedSkillId, level, acquiredAt],
  )

  return (
    <main className="mx-auto max-w-6xl px-8 py-10">
      <header className="mb-8">
        <p className="text-xs font-semibold tracking-widest text-indigo-600 uppercase">Skills</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">スキル登録</h1>
        <p className="mt-2 text-sm text-slate-600">
          自分の保有スキルとレベルを登録します。登録後はマネージャーの承認を受けてください。
        </p>
      </header>

      <PageBody
        loadState={loadState}
        saveState={saveState}
        selectedSkillId={selectedSkillId}
        level={level}
        acquiredAt={acquiredAt}
        onSkillChange={setSelectedSkillId}
        onLevelChange={setLevel}
        onAcquiredAtChange={setAcquiredAt}
        onSubmit={handleSubmit}
      />
    </main>
  )
}

interface PageBodyProps {
  readonly loadState: LoadState
  readonly saveState: SaveState
  readonly selectedSkillId: string
  readonly level: number
  readonly acquiredAt: string
  readonly onSkillChange: (id: string) => void
  readonly onLevelChange: (v: number) => void
  readonly onAcquiredAtChange: (v: string) => void
  readonly onSubmit: (e: FormEvent) => void
}

function PageBody({
  loadState,
  saveState,
  selectedSkillId,
  level,
  acquiredAt,
  onSkillChange,
  onLevelChange,
  onAcquiredAtChange,
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

  const { catalog, mySkills } = loadState
  const saving = saveState.kind === 'saving'

  // カタログをカテゴリ別にグループ化
  const grouped = catalog.reduce<Record<string, SkillMasterItem[]>>((acc, s) => {
    const cat = s.category
    return { ...acc, [cat]: [...(acc[cat] ?? []), s] }
  }, {})

  return (
    <div className="space-y-6">
      {/* 登録フォーム */}
      <form
        onSubmit={onSubmit}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="text-sm font-semibold text-slate-800">スキルを追加 / 更新</h2>

        <Field label="スキル" required>
          <select
            value={selectedSkillId}
            onChange={(e) => onSkillChange(e.target.value)}
            required
            className={inputCls}
          >
            {Object.entries(grouped).map(([cat, items]) => (
              <optgroup key={cat} label={cat}>
                {items.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>

        <Field label={`レベル（${LEVEL_MIN}〜${LEVEL_MAX}）`} required>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={LEVEL_MIN}
              max={LEVEL_MAX}
              step={1}
              value={level}
              onChange={(e) => onLevelChange(Number(e.target.value))}
              className="flex-1"
            />
            <span className="w-6 text-center text-sm font-semibold text-indigo-600">{level}</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            1: 入門 / 2: 基礎 / 3: 中級 / 4: 上級 / 5: エキスパート
          </p>
        </Field>

        <Field label="習得日" required>
          <input
            type="date"
            value={acquiredAt}
            onChange={(e) => onAcquiredAtChange(e.target.value)}
            required
            className={inputCls}
          />
        </Field>

        <div className="flex items-center gap-3 border-t border-slate-100 pt-2">
          <button
            type="submit"
            disabled={saving || !selectedSkillId}
            className="rounded-md bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {saving ? '登録中…' : '登録する'}
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
      </form>

      {/* 登録済みスキル一覧 */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">
            登録済みスキル{' '}
            <span className="font-normal text-slate-500">({mySkills.length} 件)</span>
          </h2>
        </div>
        {mySkills.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">スキルが登録されていません</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200">
              <tr>
                <Th>スキル名</Th>
                <Th>レベル</Th>
                <Th>習得日</Th>
                <Th>承認状態</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {mySkills.map((skill) => {
                const masterItem = catalog.find((c) => c.id === skill.skillId)
                const approved = skill.approvedByManagerId !== null
                return (
                  <tr key={skill.id} className="transition-colors hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {masterItem?.name ?? skill.skillId}
                      {masterItem && (
                        <span className="ml-2 text-xs text-slate-400">{masterItem.category}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      <LevelBadge level={skill.level} />
                    </td>
                    <td className="px-4 py-3 text-slate-600">{skill.acquiredAt.slice(0, 10)}</td>
                    <td className="px-4 py-3">
                      {approved ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                          ✓ 承認済み
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                          承認待ち
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function LevelBadge({ level }: { readonly level: number }): ReactElement {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="font-semibold text-indigo-600">{level}</span>
      <span className="text-slate-400">/ 5</span>
    </span>
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

function Th({ children }: { readonly children: ReactNode }): ReactElement {
  return <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">{children}</th>
}

function readError(err: unknown): string {
  if (err instanceof Error) return err.message
  return '予期せぬエラーが発生しました'
}
