import type { Metadata } from 'next'
import './globals.css'
import { Sidebar } from '@/components/layout/Sidebar'

export const metadata: Metadata = {
  title: 'HR Management System',
  description: '人事管理プラットフォーム',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ja">
      <body className="flex h-screen overflow-hidden bg-slate-50 text-slate-900 antialiased">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-y-auto">{children}</div>
      </body>
    </html>
  )
}
