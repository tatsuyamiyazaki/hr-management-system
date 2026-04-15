import type { Metadata } from 'next'
import './globals.css'

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
      <body>{children}</body>
    </html>
  )
}
