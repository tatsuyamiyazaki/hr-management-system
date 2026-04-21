/**
 * Issue #174 / Task 9.3 / Req 14.5, 14.6: プロフィール編集画面
 *
 * - 全ロールアクセス可能（自分のプロフィールのみ編集）
 * - GET /api/profile/me でプロフィールを取得
 * - PATCH /api/profile/me でプロフィールを更新
 * - ADMIN または自分自身: 全項目表示・編集可
 * - その他: 基本情報のみ表示
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

interface ProfileViewFull {
  readonly kind: 'full'
  readonly userId: string
  readonly firstName: string
  readonly lastName: string
  readonly firstNameKana: string | null
  readonly lastNameKana: string | null
  readonly employeeCode: string | null
  readonly phoneNumber: string | null
  readonly avatarUrl: string | null
  readonly selfIntro: string | null
  readonly email: string
}

interface ProfileViewBasic {
  readonly kind: 'basic'
  readonly userId: string
  readonly firstName: string
  readonly lastName: string
  readonly avatarUrl: string | null
  readonly selfIntro: string | null
}

type ProfileView = ProfileViewFull | ProfileViewBasic

interface ProfileEnvelope {
  readonly success?: boolean
  readonly data?: ProfileView
  readonly error?: string
}

type LoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly profile: ProfileView }

type SaveState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'saving' }
  | { readonly kind: 'success' }
  | { readonly kind: 'error'; readonly message: string }

const PROFILE_ME_URL = '/api/profile/me'

export default function ProfilePage(): ReactElement {
  const [loadState, setLoadState] = useState<LoadState>({ kind: 'loading' })
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' })

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(PROFILE_ME_URL, { cache: 'no-store' })
        const payload = (await res.json().catch(() => ({}))) as ProfileEnvelope
        if (!res.ok || !payload.data) {
          throw new Error(payload.error ?? `HTTP ${res.status}`)
        }
        if (!cancelled) setLoadState({ kind: 'ready', profile: payload.data })
      } catch (err) {
        if (!cancelled) setLoadState({ kind: 'error', message: readError(err) })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleSave = useCallback(async (input: Record<string, unknown>) => {
    setSaveState({ kind: 'saving' })
    try {
      const res = await fetch(PROFILE_ME_URL, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      setSaveState({ kind: 'success' })
      setLoadState((prev) => {
        if (prev.kind !== 'ready' || prev.profile.kind !== 'full') return prev
        return { ...prev, profile: { ...prev.profile, ...input } as ProfileViewFull }
      })
      setTimeout(() => setSaveState({ kind: 'idle' }), 2000)
    } catch (err) {
      setSaveState({ kind: 'error', message: readError(err) })
    }
  }, [])

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <header className="mb-8">
        <p className="text-xs font-semibold tracking-widest text-indigo-600 uppercase">Profile</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">プロフィール編集</h1>
        <p className="mt-2 text-sm text-slate-600">自分のプロフィール情報を確認・編集できます。</p>
      </header>

      <PageBody loadState={loadState} saveState={saveState} onSave={handleSave} />
    </main>
  )
}

interface PageBodyProps {
  readonly loadState: LoadState
  readonly saveState: SaveState
  readonly onSave: (input: Record<string, unknown>) => void
}

function PageBody({ loadState, saveState, onSave }: PageBodyProps): ReactElement {
  if (loadState.kind === 'loading') {
    return (
      <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white py-16 text-sm text-slate-500">
        <span className="animate-pulse">プロフィールを読み込み中…</span>
      </div>
    )
  }

  if (loadState.kind === 'error') {
    return (
      <div className="rounded-xl border border-rose-300 bg-rose-50 p-6 text-sm text-rose-800">
        <p className="font-semibold">プロフィールの取得に失敗しました</p>
        <p className="mt-1 text-xs">{loadState.message}</p>
      </div>
    )
  }

  const { profile } = loadState

  if (profile.kind === 'basic') {
    return <BasicProfileView profile={profile} />
  }

  return <FullProfileForm profile={profile} saveState={saveState} onSave={onSave} />
}

interface BasicProfileViewProps {
  readonly profile: ProfileViewBasic
}

function BasicProfileView({ profile }: BasicProfileViewProps): ReactElement {
  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100 text-xl font-bold text-indigo-600">
          {profile.lastName.slice(0, 1)}
        </div>
        <p className="text-lg font-semibold text-slate-900">
          {profile.lastName} {profile.firstName}
        </p>
      </div>
      {profile.selfIntro !== null && (
        <p className="border-t border-slate-100 pt-4 text-sm text-slate-600">{profile.selfIntro}</p>
      )}
    </div>
  )
}

interface FullProfileFormProps {
  readonly profile: ProfileViewFull
  readonly saveState: SaveState
  readonly onSave: (input: Record<string, unknown>) => void
}

function FullProfileForm({ profile, saveState, onSave }: FullProfileFormProps): ReactElement {
  const [lastName, setLastName] = useState(profile.lastName)
  const [firstName, setFirstName] = useState(profile.firstName)
  const [lastNameKana, setLastNameKana] = useState(profile.lastNameKana ?? '')
  const [firstNameKana, setFirstNameKana] = useState(profile.firstNameKana ?? '')
  const [phoneNumber, setPhoneNumber] = useState(profile.phoneNumber ?? '')
  const [selfIntro, setSelfIntro] = useState(profile.selfIntro ?? '')

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault()
      onSave({
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        firstNameKana: firstNameKana.trim() || null,
        lastNameKana: lastNameKana.trim() || null,
        phoneNumber: phoneNumber.trim() || null,
        selfIntro: selfIntro.trim() || null,
      })
    },
    [firstName, lastName, firstNameKana, lastNameKana, phoneNumber, selfIntro, onSave],
  )

  const saving = saveState.kind === 'saving'

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div className="flex items-center gap-4 border-b border-slate-100 pb-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100 text-xl font-bold text-indigo-600">
          {profile.lastName.slice(0, 1)}
        </div>
        <div>
          <p className="text-xs text-slate-500">{profile.email}</p>
          {profile.employeeCode !== null && (
            <p className="mt-0.5 text-xs text-slate-400">社員番号: {profile.employeeCode}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="姓" required>
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
            className={inputCls}
          />
        </Field>
        <Field label="名" required>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
            className={inputCls}
          />
        </Field>
        <Field label="姓（カナ）">
          <input
            type="text"
            value={lastNameKana}
            onChange={(e) => setLastNameKana(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="名（カナ）">
          <input
            type="text"
            value={firstNameKana}
            onChange={(e) => setFirstNameKana(e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>

      <Field label="電話番号">
        <input
          type="tel"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          placeholder="090-0000-0000"
          className={inputCls}
        />
      </Field>

      <Field label="自己紹介">
        <textarea
          value={selfIntro}
          onChange={(e) => setSelfIntro(e.target.value)}
          rows={4}
          maxLength={500}
          placeholder="500文字以内で入力してください"
          className={`${inputCls} resize-none`}
        />
        <p className="mt-1 text-right text-xs text-slate-400">{selfIntro.length} / 500</p>
      </Field>

      <div className="flex items-center gap-3 border-t border-slate-100 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {saving ? '保存中…' : '保存する'}
        </button>
        {saveState.kind === 'success' && (
          <span className="text-sm font-medium text-emerald-600">✓ 保存しました</span>
        )}
        {saveState.kind === 'error' && (
          <span className="text-sm font-medium text-rose-600">
            保存に失敗しました: {saveState.message}
          </span>
        )}
      </div>
    </form>
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
