import * as React from 'react'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface NotificationEmailProps {
  /** メール本文の見出し */
  title: string
  /** メール本文（改行は \n で区切る） */
  body: string
  /** 任意の CTA 導線。未指定ならボタン非表示 */
  actionUrl?: string
  /** CTA ボタンのラベル。actionUrl 指定時のみ使用。既定値は "詳細を確認" */
  actionLabel?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles（インライン: メールクライアントの CSS 対応バラつきを吸収）
// ─────────────────────────────────────────────────────────────────────────────

const COLOR_TEXT = '#1f2937'
const COLOR_MUTED = '#6b7280'
const COLOR_BORDER = '#e5e7eb'
const COLOR_ACCENT = '#2563eb'
const COLOR_ACCENT_TEXT = '#ffffff'

const main: React.CSSProperties = {
  backgroundColor: '#f9fafb',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Hiragino Kaku Gothic ProN", "Hiragino Sans", "Yu Gothic", Meiryo, sans-serif',
  padding: '24px 0',
}

const container: React.CSSProperties = {
  backgroundColor: '#ffffff',
  border: `1px solid ${COLOR_BORDER}`,
  borderRadius: '8px',
  margin: '0 auto',
  maxWidth: '600px',
  padding: '32px',
}

const heading: React.CSSProperties = {
  color: COLOR_TEXT,
  fontSize: '20px',
  fontWeight: 600,
  lineHeight: 1.4,
  margin: '0 0 16px',
}

const paragraph: React.CSSProperties = {
  color: COLOR_TEXT,
  fontSize: '14px',
  lineHeight: 1.7,
  margin: '0 0 12px',
  whiteSpace: 'pre-wrap',
}

const actionSection: React.CSSProperties = {
  margin: '24px 0 8px',
  textAlign: 'center',
}

const actionButton: React.CSSProperties = {
  backgroundColor: COLOR_ACCENT,
  borderRadius: '6px',
  color: COLOR_ACCENT_TEXT,
  display: 'inline-block',
  fontSize: '14px',
  fontWeight: 600,
  padding: '12px 24px',
  textDecoration: 'none',
}

const divider: React.CSSProperties = {
  border: 'none',
  borderTop: `1px solid ${COLOR_BORDER}`,
  margin: '24px 0',
}

const footerText: React.CSSProperties = {
  color: COLOR_MUTED,
  fontSize: '12px',
  lineHeight: 1.6,
  margin: 0,
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 汎用通知メールテンプレート。
 * タイトル、本文、任意のアクション URL を受け取り、レスポンシブな
 * HTML メールを生成する。
 */
export function NotificationEmail({
  title,
  body,
  actionUrl,
  actionLabel = '詳細を確認',
}: NotificationEmailProps) {
  return (
    <Html lang="ja">
      <Head />
      <Preview>{title}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading as="h1" style={heading}>
            {title}
          </Heading>
          <Section>
            <Text style={paragraph}>{body}</Text>
          </Section>
          {actionUrl ? (
            <Section style={actionSection}>
              <Button href={actionUrl} style={actionButton}>
                {actionLabel}
              </Button>
            </Section>
          ) : null}
          <Hr style={divider} />
          <Text style={footerText}>
            本メールは HR Management System から自動送信されています。
            心当たりのない場合はお手数ですがシステム管理者までご連絡ください。
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export default NotificationEmail
