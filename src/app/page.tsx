import Link from 'next/link'

const sections = [
  {
    href: '/dashboard',
    title: 'ダッシュボード',
    description: 'ロール別 KPI をまとめて確認するホーム画面',
  },
  {
    href: '/organization',
    title: '組織管理',
    description: '組織図とポジション編集 UI を開く',
  },
  {
    href: '/skill-map',
    title: 'スキルマップ',
    description: 'スキルサマリー、ヒートマップ、レーダーチャートを表示',
  },
] as const

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_40%,#f8fafc_100%)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
        <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold tracking-[0.3em] text-sky-700 uppercase">
            HR Management System
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">
            人事プラットフォーム
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
            組織、スキル、評価、目標、インセンティブの主要機能へ移動できるエントリーポイントです。
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          {sections.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-sky-300 hover:bg-sky-50"
            >
              <p className="text-lg font-semibold text-slate-900">{section.title}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">{section.description}</p>
              <p className="mt-4 text-xs font-semibold tracking-[0.25em] text-sky-700 uppercase">
                Open
              </p>
            </Link>
          ))}
        </section>
      </div>
    </main>
  )
}
