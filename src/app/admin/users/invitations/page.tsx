'use client'

import Link from 'next/link'
import { useState, type FormEvent, type ReactElement } from 'react'

const DEMO_LINK = '/auth/invitations/demo-invite-admin'

export default function UserInvitationsPage(): ReactElement {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('EMPLOYEE')
  const [status, setStatus] = useState<string | null>(null)

  async function submitInvite(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setStatus('送信中...')

    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, role }),
    })

    const body = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) {
      setStatus(body.error ?? `送信に失敗しました (HTTP ${res.status})`)
      return
    }

    setStatus('招待を登録しました。開発環境では下のデモリンクから受諾画面も確認できます。')
    setEmail('')
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fffdf7_0%,#ffffff_40%,#f8fafc_100%)]">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-10">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold tracking-[0.3em] text-amber-700 uppercase">Admin</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">
            ユーザー招待と初回パスワード設定
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
            ADMIN
            がメールアドレスとロールを指定して招待を発行し、受諾側はトークンURLから初回パスワードを設定します。
          </p>
        </section>
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">招待を発行する</h2>
            <form className="mt-5 grid gap-4" onSubmit={(event) => void submitInvite(event)}>
              <label className="grid gap-2 text-sm font-medium text-slate-700">
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-400"
                  placeholder="member@example.com"
                  required
                />
              </label>
              <label className="grid gap-2 text-sm font-medium text-slate-700">
                Role
                <select
                  value={role}
                  onChange={(event) => setRole(event.target.value)}
                  className="rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-400"
                >
                  <option value="EMPLOYEE">EMPLOYEE</option>
                  <option value="MANAGER">MANAGER</option>
                  <option value="HR_MANAGER">HR_MANAGER</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </label>
              <button
                type="submit"
                className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
              >
                招待メールを送信
              </button>
            </form>
            {status ? <p className="mt-4 text-sm text-slate-600">{status}</p> : null}
          </section>

          <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-amber-950">受諾フローの確認</h2>
            <p className="mt-3 text-sm leading-6 text-amber-900">
              開発環境ではデモ用トークンを固定で用意しています。招待メール本文の代わりに、下のリンクから初回パスワード設定画面を確認できます。
            </p>
            <Link
              href={DEMO_LINK}
              className="mt-5 inline-flex rounded-full border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-900"
            >
              デモ招待リンクを開く
            </Link>
            <div className="mt-6 grid gap-3 text-sm text-amber-950">
              <p>推奨パスワード条件</p>
              <p>12文字以上、英大文字・英小文字・数字・記号のうち3種類以上を含めてください。</p>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
