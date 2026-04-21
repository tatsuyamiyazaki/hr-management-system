'use client'

import Link from 'next/link'
import { useEffect, useState, type ReactElement, type ReactNode } from 'react'

interface SessionItem {
  readonly id: string
  readonly email: string
  readonly role: string
  readonly createdAt: string
  readonly lastAccessAt: string
  readonly ipAddress?: string
  readonly userAgent?: string
  readonly isCurrent: boolean
}

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; sessions: readonly SessionItem[] }

export default function AuthSessionsPage(): ReactElement {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [revokingId, setRevokingId] = useState<string | null>(null)

  async function load(): Promise<void> {
    setState({ kind: 'loading' })
    const res = await fetch('/api/auth/sessions', { cache: 'no-store' })
    const body = (await res.json().catch(() => ({}))) as {
      sessions?: SessionItem[]
      error?: string
    }

    if (!res.ok || !body.sessions) {
      setState({ kind: 'error', message: body.error ?? `HTTP ${res.status}` })
      return
    }

    setState({ kind: 'ready', sessions: body.sessions })
  }

  useEffect(() => {
    void load()
  }, [])

  async function revokeSession(sessionId: string): Promise<void> {
    setRevokingId(sessionId)
    try {
      const res = await fetch(`/api/auth/sessions/${sessionId}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      await load()
    } catch (error) {
      setState({
        kind: 'error',
        message: error instanceof Error ? error.message : 'セッション失効に失敗しました',
      })
    } finally {
      setRevokingId(null)
    }
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_45%,#f8fafc_100%)]">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-10">
        <Header
          eyebrow="Auth"
          title="セッション一覧と手動失効"
          description="現在ログイン中のデバイスや最終アクセスを確認し、不要なセッションを手動で失効できます。"
        />
        <NavLinks
          links={[
            { href: '/admin/users/invitations', label: 'ユーザー招待' },
            { href: '/notifications', label: '通知センター' },
            { href: '/admin/ai-monitoring', label: 'AI運用ダッシュボード' },
          ]}
        />
        {state.kind === 'loading' ? <Panel>読み込み中です...</Panel> : null}
        {state.kind === 'error' ? <Panel tone="error">{state.message}</Panel> : null}
        {state.kind === 'ready' ? (
          <section className="grid gap-4">
            {state.sessions.map((session) => (
              <article
                key={session.id}
                className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="text-lg font-semibold text-slate-950">
                        {session.userAgent ?? 'Unknown device'}
                      </h2>
                      {session.isCurrent ? (
                        <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
                          Current
                        </span>
                      ) : null}
                    </div>
                    <dl className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-2">
                      <div>
                        <dt className="font-medium text-slate-800">IP</dt>
                        <dd>{session.ipAddress ?? 'N/A'}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-slate-800">Role</dt>
                        <dd>{session.role}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-slate-800">Created</dt>
                        <dd>{formatDateTime(session.createdAt)}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-slate-800">Last access</dt>
                        <dd>{formatDateTime(session.lastAccessAt)}</dd>
                      </div>
                    </dl>
                  </div>
                  <button
                    type="button"
                    disabled={session.isCurrent || revokingId === session.id}
                    onClick={() => void revokeSession(session.id)}
                    className="rounded-full border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {session.isCurrent
                      ? '現在のセッション'
                      : revokingId === session.id
                        ? '失効中...'
                        : '失効する'}
                  </button>
                </div>
              </article>
            ))}
          </section>
        ) : null}
      </div>
    </main>
  )
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function Header(props: {
  readonly eyebrow: string
  readonly title: string
  readonly description: string
}): ReactElement {
  return (
    <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold tracking-[0.3em] text-sky-700 uppercase">
        {props.eyebrow}
      </p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">{props.title}</h1>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">{props.description}</p>
    </header>
  )
}

function NavLinks(props: {
  readonly links: readonly { href: string; label: string }[]
}): ReactElement {
  return (
    <div className="flex flex-wrap gap-3">
      {props.links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm"
        >
          {link.label}
        </Link>
      ))}
    </div>
  )
}

function Panel(props: {
  readonly children: ReactNode
  readonly tone?: 'neutral' | 'error'
}): ReactElement {
  const className =
    props.tone === 'error'
      ? 'border-rose-200 bg-rose-50 text-rose-900'
      : 'border-slate-200 bg-white text-slate-700'

  return (
    <section className={`rounded-3xl border p-6 shadow-sm ${className}`}>{props.children}</section>
  )
}
