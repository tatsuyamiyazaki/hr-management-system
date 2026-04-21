import Link from 'next/link'

const sections = [
  {
    href: '/dashboard',
    title: 'ダッシュボード',
    description: 'ロール別 KPI と主要指標を確認します。',
  },
  {
    href: '/organization',
    title: '組織管理',
    description: '組織図とポジション管理の UI を確認します。',
  },
  {
    href: '/skill-map',
    title: 'スキルマップ',
    description: 'スキルサマリー、ヒートマップ、レーダーチャートを確認します。',
  },
  {
    href: '/auth/sessions',
    title: 'セッション管理',
    description: '現在のログイン端末一覧と手動失効を確認します。',
  },
  {
    href: '/admin/users/invitations',
    title: 'ユーザー招待',
    description: '招待発行と初回パスワード設定フローを確認します。',
  },
  {
    href: '/notifications',
    title: '通知センター',
    description: 'アプリ内通知一覧とメール通知設定を確認します。',
  },
  {
    href: '/admin/ai-monitoring',
    title: 'AI運用',
    description: 'コスト推移、失敗率、プロバイダ比較を確認します。',
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
            画面一覧ポータル
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
            組織、スキル、認証、通知、AI運用まで、現在利用できる主要画面へここから移動できます。
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
