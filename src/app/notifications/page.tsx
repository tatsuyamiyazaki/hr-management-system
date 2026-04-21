'use client'

import { useEffect, useState, type ReactElement, type ReactNode } from 'react'

interface NotificationItem {
  readonly id: string
  readonly title: string
  readonly body: string
  readonly category: string
  readonly createdAt: string
  readonly readAt: string | null
}

interface PreferenceItem {
  readonly category: string
  readonly emailEnabled: boolean
}

type NotificationState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | {
      kind: 'ready'
      notifications: readonly NotificationItem[]
      unreadCount: number
      preferences: readonly PreferenceItem[]
    }

export default function NotificationsPage(): ReactElement {
  const [state, setState] = useState<NotificationState>({ kind: 'loading' })

  async function load(): Promise<void> {
    setState({ kind: 'loading' })
    const res = await fetch('/api/notifications', { cache: 'no-store' })
    const body = (await res.json().catch(() => ({}))) as {
      data?: {
        notifications: NotificationItem[]
        unreadCount: number
        preferences: PreferenceItem[]
      }
      error?: string
    }

    if (!res.ok || !body.data) {
      setState({ kind: 'error', message: body.error ?? `HTTP ${res.status}` })
      return
    }

    setState({ kind: 'ready', ...body.data })
  }

  useEffect(() => {
    void load()
  }, [])

  async function markAsRead(id: string): Promise<void> {
    const res = await fetch(`/api/notifications/${id}`, { method: 'PATCH' })
    if (res.ok) {
      await load()
    }
  }

  async function togglePreference(category: string, nextValue: boolean): Promise<void> {
    if (state.kind !== 'ready') return
    const preferences = state.preferences.map((item) =>
      item.category === category ? { ...item, emailEnabled: nextValue } : item,
    )

    const res = await fetch('/api/notifications', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferences }),
    })

    if (res.ok) {
      await load()
    }
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f9fbff_0%,#ffffff_40%,#f8fafc_100%)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold tracking-[0.3em] text-sky-700 uppercase">
            Notifications
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">
            通知センターと既読管理
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
            アプリ内通知の一覧、未読件数、カテゴリ別メール通知設定をまとめて確認できます。
          </p>
        </section>

        {state.kind === 'loading' ? <Panel>通知を読み込み中です...</Panel> : null}
        {state.kind === 'error' ? <Panel tone="error">{state.message}</Panel> : null}
        {state.kind === 'ready' ? (
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <section className="grid gap-4">
              <Panel>
                <p className="text-sm font-semibold text-slate-900">
                  未読 {state.unreadCount} 件 / 全 {state.notifications.length} 件
                </p>
              </Panel>
              {state.notifications.map((item) => (
                <article
                  key={item.id}
                  className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold tracking-[0.2em] text-sky-700 uppercase">
                        {item.category}
                      </p>
                      <h2 className="mt-2 text-lg font-semibold text-slate-950">{item.title}</h2>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{item.body}</p>
                      <p className="mt-3 text-xs text-slate-500">
                        {new Intl.DateTimeFormat('ja-JP', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }).format(new Date(item.createdAt))}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={item.readAt !== null}
                      onClick={() => void markAsRead(item.id)}
                      className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
                    >
                      {item.readAt ? '既読済み' : '既読にする'}
                    </button>
                  </div>
                </article>
              ))}
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-950">メール通知設定</h2>
              <div className="mt-5 grid gap-4">
                {state.preferences.map((item) => (
                  <label
                    key={item.category}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 px-4 py-3"
                  >
                    <span className="text-sm font-medium text-slate-700">{item.category}</span>
                    <input
                      type="checkbox"
                      checked={item.emailEnabled}
                      onChange={(event) =>
                        void togglePreference(item.category, event.target.checked)
                      }
                      className="h-4 w-4"
                    />
                  </label>
                ))}
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </main>
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
