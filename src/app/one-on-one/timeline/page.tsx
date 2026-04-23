/**
 * Issue #204: 1on1 画面リデザイン
 *
 * - 左ペイン: セッションログ一覧（時系列、新しい順）
 * - 右ペイン: 関連情報サイドパネル（今期目標進捗 + 評価履歴）
 * - API 未実装時はモックデータにフォールバック
 *
 * GET /api/one-on-one/sessions?userId={id}     — セッション一覧
 * GET /api/one-on-one/related-info?userId={id} — 関連情報
 */
'use client'

import { useEffect, useState, type ReactElement } from 'react'
import { useSearchParams } from 'next/navigation'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ApiEnvelope<T> {
  readonly success?: boolean
  readonly data?: T
  readonly error?: string
}

interface EmployeeProfile {
  readonly id: string
  readonly name: string
  readonly department: string
  readonly role: string
  readonly nextSessionAt: string | null // ISO datetime
}

interface OneOnOneSession {
  readonly id: string
  readonly title: string
  readonly conductedAt: string // ISO datetime
  readonly durationMinutes: number
  readonly goalReferenceCount: number
  readonly agenda: string
  readonly minutes: string
  readonly nextActions: readonly string[]
  readonly visibleToEmployee: boolean
}

interface GoalProgress {
  readonly goalId: string
  readonly title: string
  readonly progressPercent: number
}

interface EvaluationRecord {
  readonly period: string
  readonly score360: number
  readonly grade: string
}

interface RelatedInfo {
  readonly currentGoal: GoalProgress | null
  readonly evaluationHistory: readonly EvaluationRecord[]
}

type PageState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | {
      readonly kind: 'ready'
      readonly profile: EmployeeProfile
      readonly sessions: readonly OneOnOneSession[]
      readonly relatedInfo: RelatedInfo
    }

// ─────────────────────────────────────────────────────────────────────────────
// Mock data
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_PROFILE: EmployeeProfile = {
  id: 'usr-tanaka',
  name: '田中 一郎',
  department: '開発部',
  role: 'シニアエンジニア',
  nextSessionAt: '2026-05-15T14:00:00',
}

const MOCK_SESSIONS: readonly OneOnOneSession[] = [
  {
    id: 'ses-004',
    title: 'キャリアパスと次期プロジェクトアサイン',
    conductedAt: '2026-04-10T14:00:00',
    durationMinutes: 30,
    goalReferenceCount: 2,
    agenda: 'キャリア目標の確認 / 次期プロジェクト希望',
    minutes:
      'Q2 のリードエンジニア候補として検討中。本人も積極的な意向を示した。スキルギャップとして Infra 領域の補強が必要。',
    nextActions: [
      'Infra 基礎研修のスケジュール確認（〜4/20）',
      '次期プロジェクト詳細を HR と調整（〜4/25）',
    ],
    visibleToEmployee: true,
  },
  {
    id: 'ses-003',
    title: 'Q1 振り返りと目標進捗確認',
    conductedAt: '2026-03-14T15:00:00',
    durationMinutes: 45,
    goalReferenceCount: 3,
    agenda: 'Q1 目標振り返り / チーム内コミュニケーション改善',
    minutes:
      'API 設計目標は 90% 達成。チームレビュー文化の醸成については改善余地あり。定期ランチ MTG を提案し受け入れられた。',
    nextActions: [
      '月次ランチ MTG の日程調整（〜3/20）',
      '目標シートを最新化して HR に提出（〜3/31）',
    ],
    visibleToEmployee: true,
  },
  {
    id: 'ses-002',
    title: 'メンタルヘルスとワークライフバランス',
    conductedAt: '2026-02-12T14:30:00',
    durationMinutes: 30,
    goalReferenceCount: 0,
    agenda: '残業状況の確認 / ストレス要因ヒアリング',
    minutes:
      '残業時間が先月 25h 超。主な要因は仕様変更への対応。チーム内タスク配分を見直すことで改善できる見込み。',
    nextActions: ['タスク配分の見直しをチームリーダーと協議（〜2/19）'],
    visibleToEmployee: false,
  },
  {
    id: 'ses-001',
    title: '入社後初回 1on1 — オンボーディング確認',
    conductedAt: '2026-01-15T10:00:00',
    durationMinutes: 60,
    goalReferenceCount: 1,
    agenda: 'オンボーディング進捗 / 疑問点の解消 / 初期目標設定',
    minutes:
      '環境構築完了。チームの開発フローを概ね把握。最初の担当タスクとして検索 API のリファクタリングをアサイン。',
    nextActions: [
      '担当タスクのスコープ確認（〜1/20）',
      '開発ガイドラインを一読して質問を整理（〜1/22）',
    ],
    visibleToEmployee: true,
  },
]

const MOCK_RELATED: RelatedInfo = {
  currentGoal: {
    goalId: 'goal-001',
    title: '検索 API パフォーマンス改善（レスポンスタイム 50% 削減）',
    progressPercent: 72,
  },
  evaluationHistory: [
    { period: '2025年度下期', score360: 87, grade: 'B+' },
    { period: '2025年度上期', score360: 82, grade: 'B' },
    { period: '2024年度下期', score360: 78, grade: 'B' },
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function readError(err: unknown): string {
  if (err instanceof Error) return err.message
  return '予期せぬエラーが発生しました'
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' })
    const envelope = (await res.json().catch(() => ({}))) as ApiEnvelope<T>
    if (!res.ok || !envelope.data) return null
    return envelope.data
  } catch {
    return null
  }
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function OneOnOneTimelinePage(): ReactElement {
  const searchParams = useSearchParams()
  const initialUserId =
    searchParams.get('userId') ?? searchParams.get('employeeId') ?? MOCK_PROFILE.id

  const [state, setState] = useState<PageState>({ kind: 'loading' })
  const [userIdInput, setUserIdInput] = useState(initialUserId)

  async function loadData(uid: string): Promise<void> {
    const trimmed = uid.trim()
    if (!trimmed) return
    setState({ kind: 'loading' })
    try {
      const [sessionsData, relatedData, profileData] = await Promise.all([
        fetchJson<readonly OneOnOneSession[]>(
          `/api/one-on-one/sessions?userId=${encodeURIComponent(trimmed)}`,
        ),
        fetchJson<RelatedInfo>(
          `/api/one-on-one/related-info?userId=${encodeURIComponent(trimmed)}`,
        ),
        fetchJson<EmployeeProfile>(`/api/employees/${encodeURIComponent(trimmed)}`),
      ])
      setState({
        kind: 'ready',
        profile: profileData ?? { ...MOCK_PROFILE, id: trimmed },
        sessions: sessionsData ?? MOCK_SESSIONS,
        relatedInfo: relatedData ?? MOCK_RELATED,
      })
    } catch (err) {
      setState({ kind: 'error', message: readError(err) })
    }
  }

  useEffect(() => {
    void loadData(initialUserId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (state.kind === 'loading') {
    return (
      <main className="mx-auto max-w-7xl px-8 py-10">
        <div className="flex h-64 animate-pulse items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-400">
          読み込み中…
        </div>
      </main>
    )
  }

  if (state.kind === 'error') {
    return (
      <main className="mx-auto max-w-7xl px-8 py-10">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
          <p className="font-semibold">データの取得に失敗しました</p>
          <p className="mt-1 text-xs opacity-80">{state.message}</p>
        </div>
      </main>
    )
  }

  const { profile, sessions, relatedInfo } = state
  const sorted = [...sessions].sort(
    (a, b) => new Date(b.conductedAt).getTime() - new Date(a.conductedAt).getTime(),
  )

  return (
    <main className="mx-auto max-w-7xl px-8 py-10">
      {/* Page Header */}
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.3em] text-indigo-600 uppercase">1on1</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
            1on1 — {profile.name}
          </h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span>
              {profile.department}・{profile.role}
            </span>
            {profile.nextSessionAt != null && (
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-600">
                次回 {formatDateShort(profile.nextSessionAt)}
              </span>
            )}
          </p>
          {/* User switcher */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void loadData(userIdInput)
            }}
            className="mt-3 flex items-center gap-2"
          >
            <input
              value={userIdInput}
              onChange={(e) => setUserIdInput(e.target.value)}
              placeholder="社員 ID を変更"
              className="rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-xs text-slate-700 focus:border-indigo-400 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              切り替え
            </button>
          </form>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <a
            href="/one-on-one/schedule"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            予定を登録
          </a>
          <button
            type="button"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            ＋ ログを追加
          </button>
        </div>
      </header>

      {/* 2-column layout */}
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* Left: Session log list */}
        <div className="space-y-4">
          {sorted.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400">
              セッションログがありません
            </div>
          ) : (
            sorted.map((session) => <SessionCard key={session.id} session={session} />)
          )}
        </div>

        {/* Right: Related info */}
        <RelatedInfoPanel info={relatedInfo} />
      </div>
    </main>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SessionCard
// ─────────────────────────────────────────────────────────────────────────────

function SessionCard({ session }: { readonly session: OneOnOneSession }): ReactElement {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {/* Card Header */}
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">{session.title}</h2>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            session.visibleToEmployee
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-slate-100 text-slate-500'
          }`}
        >
          {session.visibleToEmployee ? '本人開示可' : '本人非開示'}
        </span>
      </div>

      {/* Meta line */}
      <p className="mt-1.5 text-xs text-slate-400">
        実施: {formatDateTime(session.conductedAt)} · {session.durationMinutes}分
        {session.goalReferenceCount > 0 && (
          <span> · 目標{session.goalReferenceCount}件参照</span>
        )}
      </p>

      <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
        {/* Agenda */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            議題
          </p>
          <p className="mt-0.5 text-sm text-slate-700">{session.agenda}</p>
        </div>

        {/* Minutes */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            議事
          </p>
          <p className="mt-0.5 text-sm leading-relaxed text-slate-700">{session.minutes}</p>
        </div>

        {/* Next Actions */}
        {session.nextActions.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              ネクストアクション
            </p>
            <ul className="mt-1.5 space-y-1">
              {session.nextActions.map((action, i) => (
                <li key={i} className="flex items-start gap-1.5 text-sm text-slate-700">
                  <span className="mt-0.5 shrink-0 text-indigo-400">・</span>
                  {action}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </article>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// RelatedInfoPanel
// ─────────────────────────────────────────────────────────────────────────────

function RelatedInfoPanel({ info }: { readonly info: RelatedInfo }): ReactElement {
  return (
    <aside className="space-y-5">
      {/* Goal Progress */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-slate-800">今期の目標進捗</p>
        {info.currentGoal != null ? (
          <div className="mt-3">
            <a
              href="/goals/personal"
              className="line-clamp-2 text-sm font-medium text-indigo-700 hover:underline"
            >
              {info.currentGoal.title}
            </a>
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>進捗</span>
                <span className="font-semibold tabular-nums text-slate-700">
                  {info.currentGoal.progressPercent}%
                </span>
              </div>
              <div className="mt-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-2 rounded-full transition-all ${
                    info.currentGoal.progressPercent >= 80
                      ? 'bg-emerald-500'
                      : info.currentGoal.progressPercent >= 50
                        ? 'bg-indigo-500'
                        : 'bg-amber-500'
                  }`}
                  style={{ width: `${info.currentGoal.progressPercent}%` }}
                />
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-xs text-slate-400">目標が設定されていません</p>
        )}
      </div>

      {/* Evaluation History */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-slate-800">評価履歴</p>
        {info.evaluationHistory.length > 0 ? (
          <div className="mt-3 space-y-2">
            {info.evaluationHistory.map((rec) => (
              <div
                key={rec.period}
                className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5 text-xs"
              >
                <span className="font-medium text-slate-700">{rec.period}</span>
                <div className="flex items-center gap-2.5">
                  <span className="tabular-nums text-slate-500">
                    360度点{' '}
                    <span className="font-semibold text-slate-800">{rec.score360}</span>
                  </span>
                  <span
                    className={`inline-flex h-6 w-9 items-center justify-center rounded-md text-xs font-bold ${
                      rec.grade.startsWith('A')
                        ? 'bg-emerald-100 text-emerald-700'
                        : rec.grade.startsWith('B')
                          ? 'bg-indigo-100 text-indigo-700'
                          : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {rec.grade}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-slate-400">評価履歴がありません</p>
        )}
      </div>
    </aside>
  )
}
