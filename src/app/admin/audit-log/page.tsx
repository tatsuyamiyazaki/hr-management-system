import type { ReactElement } from 'react'

export const metadata = {
  title: '監査ログ | HR Management',
}

interface LogColumn {
  readonly key: string
  readonly label: string
}

const COLUMNS: readonly LogColumn[] = [
  { key: 'timestamp', label: '日時' },
  { key: 'actor', label: '実行者' },
  { key: 'action', label: 'アクション' },
  { key: 'target', label: '対象リソース' },
  { key: 'ip', label: 'IPアドレス' },
]

const ACTION_TYPES: readonly string[] = [
  'すべて',
  'ログイン',
  '社員データ編集',
  'スキル承認',
  '評価提出',
  '権限変更',
]

export default function AuditLogPage(): ReactElement {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-8 py-10">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-semibold tracking-[0.3em] text-indigo-600 uppercase">
          Admin / Audit
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950">監査ログ</h1>
        <p className="max-w-2xl text-sm leading-6 text-slate-600">
          システム全体の操作履歴を確認します。社員データの編集、権限変更、評価提出などの重要アクションを追跡できます。
        </p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">フィルタ</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <FilterField label="開始日">
            <input
              type="date"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              disabled
            />
          </FilterField>
          <FilterField label="終了日">
            <input
              type="date"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              disabled
            />
          </FilterField>
          <FilterField label="アクション種別">
            <select
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
              disabled
            >
              {ACTION_TYPES.map((action) => (
                <option key={action}>{action}</option>
              ))}
            </select>
          </FilterField>
          <FilterField label="実行者">
            <input
              type="text"
              placeholder="社員ID / 氏名"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400"
              disabled
            />
          </FilterField>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            className="cursor-not-allowed rounded-md bg-slate-200 px-4 py-2 text-sm font-medium text-slate-500"
            disabled
          >
            検索（API 未実装）
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-900">ログ一覧</h2>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
            Placeholder
          </span>
        </header>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-semibold tracking-wider text-slate-500 uppercase"
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td
                  colSpan={COLUMNS.length}
                  className="px-6 py-16 text-center text-sm text-slate-500"
                >
                  監査ログ API は未実装です。実装後にここへログエントリが表示されます。
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function FilterField({
  label,
  children,
}: {
  readonly label: string
  readonly children: ReactElement
}): ReactElement {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  )
}
