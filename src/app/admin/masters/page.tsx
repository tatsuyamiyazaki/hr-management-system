import type { ReactElement } from 'react'

export const metadata = {
  title: 'マスタ管理 | HR Management',
}

interface MasterCard {
  readonly key: string
  readonly title: string
  readonly description: string
  readonly icon: string
  readonly accent: string
}

const MASTER_CARDS: readonly MasterCard[] = [
  {
    key: 'skills',
    title: 'スキルマスタ',
    description:
      'スキル項目・カテゴリ・レベル定義を管理します。スキル登録フォームと評価ロジックから参照されます。',
    icon: '🧠',
    accent: 'from-indigo-500 to-indigo-700',
  },
  {
    key: 'roles',
    title: '職種マスタ',
    description:
      '職種・ロール・責務定義を管理します。社員配置とキャリアマップ、候補者マッチングで使用されます。',
    icon: '🧭',
    accent: 'from-emerald-500 to-emerald-700',
  },
  {
    key: 'grades',
    title: 'グレードマスタ',
    description:
      '等級・職位・評価レベルを管理します。評価制度と給与テーブルに連動する基礎マスタです。',
    icon: '🏅',
    accent: 'from-amber-500 to-amber-700',
  },
  {
    key: 'departments',
    title: '部署マスタ',
    description: '組織階層と部署属性を管理します。組織図と社員一覧の検索ファセットに使われます。',
    icon: '🏢',
    accent: 'from-sky-500 to-sky-700',
  },
]

export default function MastersPage(): ReactElement {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-8 py-10">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-semibold tracking-[0.3em] text-indigo-600 uppercase">
          Admin / Masters
        </p>
        <div className="flex items-end justify-between gap-4">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">マスタ管理</h1>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
            Placeholder
          </span>
        </div>
        <p className="max-w-2xl text-sm leading-6 text-slate-600">
          システム全体で参照される基礎マスタ（スキル・職種・グレード・部署）を管理します。各マスタの編集
          API は未実装のため、現在は構造のみを表示しています。
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        {MASTER_CARDS.map((card) => (
          <MasterCardView key={card.key} card={card} />
        ))}
      </section>

      <section className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-6 text-sm text-slate-600">
        <h2 className="text-sm font-semibold text-slate-900">実装予定の操作</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          <li>マスタレコードの一覧・検索・フィルタリング</li>
          <li>新規レコードの作成と編集（論理削除に対応）</li>
          <li>CSV インポート／エクスポート</li>
          <li>変更履歴の監査ログ連携</li>
        </ul>
      </section>
    </div>
  )
}

function MasterCardView({ card }: { readonly card: MasterCard }): ReactElement {
  return (
    <article className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${card.accent}`}
        aria-hidden
      />
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xl">
          {card.icon}
        </span>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-slate-900">{card.title}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">{card.description}</p>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              className="cursor-not-allowed rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-500"
              disabled
            >
              一覧を開く
            </button>
            <span className="text-xs text-slate-400">API 未実装</span>
          </div>
        </div>
      </div>
    </article>
  )
}
