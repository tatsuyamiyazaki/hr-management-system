'use client'

import { useState, type FormEvent, type ReactElement } from 'react'

export default function InvitationAcceptPage({
  params,
}: {
  readonly params: { token: string }
}): ReactElement {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const token = params.token

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (password !== confirmPassword) {
      setStatus('確認用パスワードが一致しません。')
      return
    }

    setStatus('設定中...')
    const res = await fetch(`/api/auth/invitations/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    const body = (await res.json().catch(() => ({}))) as { error?: string; rule?: string }

    if (!res.ok) {
      if (body.rule) {
        setStatus(`パスワードポリシー違反: ${body.rule}`)
        return
      }
      setStatus(body.error ?? `初回設定に失敗しました (HTTP ${res.status})`)
      return
    }

    setStatus('パスワード設定が完了しました。ログインして利用を開始してください。')
    setPassword('')
    setConfirmPassword('')
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_40%,#f8fafc_100%)]">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-12">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold tracking-[0.3em] text-sky-700 uppercase">
            Invitation
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">
            初回パスワード設定
          </h1>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            招待トークンを受け取ったユーザー向けのセットアップ画面です。パスワード設定後にアカウントを有効化します。
          </p>
          <form className="mt-6 grid gap-4" onSubmit={(event) => void submit(event)}>
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-400"
                minLength={12}
                required
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Confirm password
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-400"
                minLength={12}
                required
              />
            </label>
            <button
              type="submit"
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
            >
              パスワードを設定
            </button>
          </form>
          {status ? <p className="mt-4 text-sm text-slate-600">{status}</p> : null}
        </section>
      </div>
    </main>
  )
}
