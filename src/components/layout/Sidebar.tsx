'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactElement } from 'react'

interface NavItem {
  readonly href: string
  readonly label: string
  readonly icon: string
}

interface NavSection {
  readonly label: string
  readonly items: readonly NavItem[]
}

const NAV_SECTIONS: readonly NavSection[] = [
  {
    label: 'ホーム',
    items: [{ href: '/dashboard', label: 'ダッシュボード', icon: '📊' }],
  },
  {
    label: '人事管理',
    items: [
      { href: '/employees', label: '社員一覧', icon: '👥' },
      { href: '/employees/search', label: '社員検索', icon: '🔍' },
      { href: '/organization', label: '組織管理', icon: '🏢' },
      { href: '/profile', label: 'プロフィール', icon: '👤' },
    ],
  },
  {
    label: 'スキル・キャリア',
    items: [
      { href: '/skill-map', label: 'スキルマップ', icon: '📈' },
      { href: '/skills/register', label: 'スキル登録', icon: '✏️' },
      { href: '/skills/approval', label: 'スキル承認', icon: '✅' },
      { href: '/skills/candidates', label: '採用候補', icon: '🎯' },
      { href: '/career/wish', label: 'キャリア希望', icon: '💫' },
      { href: '/career/map', label: 'キャリアマップ', icon: '🗺️' },
    ],
  },
  {
    label: '目標管理',
    items: [
      { href: '/goals/personal', label: '個人目標', icon: '🎯' },
      { href: '/goals/tree', label: '目標ツリー', icon: '🌳' },
      { href: '/goals/progress', label: '進捗管理', icon: '📊' },
    ],
  },
  {
    label: '1on1',
    items: [
      { href: '/one-on-one/schedule', label: 'スケジュール', icon: '📅' },
      { href: '/one-on-one/timeline', label: 'タイムライン', icon: '📋' },
      { href: '/one-on-one/reminder', label: 'リマインダー', icon: '🔔' },
    ],
  },
  {
    label: '評価',
    items: [
      { href: '/evaluation/cycles', label: '評価サイクル', icon: '🔄' },
      { href: '/evaluation/assignments', label: '評価割り当て', icon: '📝' },
      { href: '/evaluation/form', label: '評価フォーム', icon: '📋' },
      { href: '/evaluation/progress', label: '進捗確認', icon: '📊' },
      { href: '/evaluation/feedback', label: 'フィードバック', icon: '💬' },
      { href: '/evaluation/total/preview', label: '総合評価', icon: '🏆' },
      { href: '/evaluation/appeals', label: '異議申立て', icon: '⚖️' },
    ],
  },
  {
    label: '管理',
    items: [
      { href: '/admin/ai-monitoring', label: 'AIモニタリング', icon: '🤖' },
      { href: '/admin/users/invitations', label: 'ユーザー招待', icon: '📧' },
      { href: '/admin/audit-log', label: '監査ログ', icon: '📜' },
      { href: '/admin/masters', label: 'マスタ管理', icon: '⚙️' },
    ],
  },
]

export function Sidebar(): ReactElement {
  const pathname = usePathname()

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-slate-800 bg-slate-900 text-slate-100">
      <div className="px-5 py-6">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
            HR
          </span>
          <span className="text-base font-semibold tracking-tight text-white">HR Management</span>
        </Link>
      </div>
      <nav className="flex-1 px-3 pb-6">
        {NAV_SECTIONS.map((section) => (
          <SidebarSection key={section.label} section={section} pathname={pathname} />
        ))}
      </nav>
    </aside>
  )
}

function SidebarSection({
  section,
  pathname,
}: {
  readonly section: NavSection
  readonly pathname: string | null
}): ReactElement {
  return (
    <div className="mb-5">
      <p className="px-3 pt-2 pb-2 text-xs font-semibold tracking-wider text-slate-400 uppercase">
        {section.label}
      </p>
      <ul className="space-y-0.5">
        {section.items.map((item) => (
          <li key={item.href}>
            <SidebarLink item={item} isActive={isActive(pathname, item.href)} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function SidebarLink({
  item,
  isActive,
}: {
  readonly item: NavItem
  readonly isActive: boolean
}): ReactElement {
  const base = 'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors duration-150'
  const active = 'bg-indigo-600 text-white shadow-sm'
  const inactive = 'text-slate-300 hover:bg-slate-800 hover:text-white'

  return (
    <Link href={item.href} className={`${base} ${isActive ? active : inactive}`}>
      <span className="text-base leading-none" aria-hidden>
        {item.icon}
      </span>
      <span className="truncate">{item.label}</span>
    </Link>
  )
}

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false
  if (pathname === href) return true
  return pathname.startsWith(`${href}/`)
}
