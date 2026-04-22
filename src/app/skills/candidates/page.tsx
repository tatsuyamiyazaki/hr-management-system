/**
 * Issue #175 / Task 11.4 / Req 4.6, 4.7, 4.8: ポスト候補者リスト / 採用アラート画面
 *
 * - HR_MANAGER / ADMIN のみアクセス可能
 * - 採用アラート: GET /api/skills/post-candidates/understaffed?threshold=0.6
 * - スキルギャップランキング: GET /api/skills/post-candidates/gap-ranking
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

interface UnderstaffedPost {
  readonly positionId: string
  readonly roleId: string
  readonly roleName: string
  readonly fulfillmentRate: number
}

interface SkillGapRankItem {
  readonly skillId: string
  readonly skillName: string
  readonly averageGap: number
  readonly affectedEmployeeCount: number
}

interface ApiEnvelope<T> {
  readonly success?: boolean
  readonly data?: T
  readonly error?: string
}

type AlertState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly posts: readonly UnderstaffedPost[] }

type RankingState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly items: readonly SkillGapRankItem[] }

const DEFAULT_THRESHOLD = 0.6

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' })
  const envelope = (await res.json().catch(() => ({}))) as ApiEnvelope<T>
  if (!res.ok) throw new Error(envelope.error ?? `HTTP ${res.status}`)
  return (envelope.data ?? []) as T
}

export default function SkillCandidatesPage(): ReactElement {
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD)
  const [thresholdInput, setThresholdInput] = useState(String(DEFAULT_THRESHOLD))
  const [alertState, setAlertState] = useState<AlertState>({ kind: 'loading' })
  const [rankingState, setRankingState] = useState<RankingState>({ kind: 'loading' })

  const loadAlerts = useCallback(async (t: number) => {
    setAlertState({ kind: 'loading' })
    try {
      const posts = await fetchJson<UnderstaffedPost[]>(
        `/api/skills/post-candidates/understaffed?threshold=${t}`,
      )
      setAlertState({ kind: 'ready', posts })
    } catch (err) {
      setAlertState({ kind: 'error', message: readError(err) })
    }
  }, [])

  const loadRanking = useCallback(async () => {
    setRankingState({ kind: 'loading' })
    try {
      const items = await fetchJson<SkillGapRankItem[]>('/api/skills/post-candidates/gap-ranking')
      setRankingState({ kind: 'ready', items })
    } catch (err) {
      setRankingState({ kind: 'error', message: readError(err) })
    }
  }, [])

  useEffect(() => {
    void loadAlerts(threshold)
    void loadRanking()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleThresholdSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault()
      const parsed = parseFloat(thresholdInput)
      if (isNaN(parsed) || parsed < 0 || parsed > 1) return
      setThreshold(parsed)
      void loadAlerts(parsed)
    },
    [thresholdInput, loadAlerts],
  )

  return (
    <main className="mx-auto max-w-5xl space-y-10 px-6 py-10">
      <header>
        <p className="text-xs font-semibold tracking-widest text-indigo-600 uppercase">Skills</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">ポスト候補者 / 採用アラート</h1>
        <p className="mt-2 text-sm text-slate-600">
          役職ごとのスキル充足率と組織全体のスキルギャップを確認できます。
        </p>
      </header>

      {/* 採用アラートセクション */}
      <section>
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <h2 className="text-lg font-semibold text-slate-900">採用アラート</h2>
          <form onSubmit={handleThresholdSubmit} className="flex items-center gap-2">
            <label className="text-xs text-slate-600">充足率閾値</label>
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={thresholdInput}
              onChange={(e) => setThresholdInput(e.target.value)}
              className="w-20 rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
            >
              更新
            </button>
          </form>
          <p className="text-xs text-slate-400">
            現在: {Math.round(threshold * 100)}% 未満のポストを表示
          </p>
        </div>

        <AlertSection state={alertState} />
      </section>

      {/* スキルギャップランキングセクション */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-slate-900">スキルギャップランキング</h2>
        <RankingSection state={rankingState} />
      </section>
    </main>
  )
}

function AlertSection({ state }: { readonly state: AlertState }): ReactElement {
  if (state.kind === 'loading') {
    return (
      <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white py-12 text-sm text-slate-500">
        <span className="animate-pulse">読み込み中…</span>
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <div className="rounded-xl border border-rose-300 bg-rose-50 p-5 text-sm text-rose-800">
        <p className="font-semibold">採用アラートの取得に失敗しました</p>
        <p className="mt-1 text-xs">{state.message}</p>
      </div>
    )
  }

  if (state.posts.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 py-12 text-center text-sm text-emerald-700">
        ✓ 充足率が閾値を下回るポストはありません
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-amber-200 bg-white shadow-sm">
      <div className="border-b border-amber-200 bg-amber-50 px-4 py-3">
        <p className="text-xs font-medium text-amber-800">
          ⚠ 充足率不足: <span className="font-semibold">{state.posts.length}</span> ポスト
        </p>
      </div>
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200">
          <tr>
            <Th>役職名</Th>
            <Th>役割 ID</Th>
            <Th>充足率</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {state.posts.map((post) => (
            <tr key={post.positionId} className="transition-colors hover:bg-slate-50">
              <td className="px-4 py-3 font-medium text-slate-900">{post.roleName}</td>
              <td className="px-4 py-3 font-mono text-xs text-slate-500">{post.roleId}</td>
              <td className="px-4 py-3">
                <FulfillmentBar rate={post.fulfillmentRate} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RankingSection({ state }: { readonly state: RankingState }): ReactElement {
  if (state.kind === 'loading') {
    return (
      <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white py-12 text-sm text-slate-500">
        <span className="animate-pulse">読み込み中…</span>
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <div className="rounded-xl border border-rose-300 bg-rose-50 p-5 text-sm text-rose-800">
        <p className="font-semibold">ギャップランキングの取得に失敗しました</p>
        <p className="mt-1 text-xs">{state.message}</p>
      </div>
    )
  }

  if (state.items.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white py-12 text-center text-sm text-slate-500">
        スキルギャップデータがありません
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            <Th>順位</Th>
            <Th>スキル名</Th>
            <Th>平均ギャップ</Th>
            <Th>影響人数</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {state.items.map((item, idx) => (
            <tr key={item.skillId} className="transition-colors hover:bg-slate-50">
              <td className="px-4 py-3 text-center font-semibold text-slate-500">{idx + 1}</td>
              <td className="px-4 py-3 font-medium text-slate-900">{item.skillName}</td>
              <td className="px-4 py-3">
                <span className="font-semibold text-rose-600">{item.averageGap.toFixed(2)}</span>
                <span className="ml-1 text-xs text-slate-400">レベル不足</span>
              </td>
              <td className="px-4 py-3 text-slate-700">
                {item.affectedEmployeeCount}
                <span className="ml-1 text-xs text-slate-400">名</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FulfillmentBar({ rate }: { readonly rate: number }): ReactElement {
  const pct = Math.round(rate * 100)
  const color = pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-rose-500'
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 text-right text-xs font-semibold text-slate-700">{pct}%</span>
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
