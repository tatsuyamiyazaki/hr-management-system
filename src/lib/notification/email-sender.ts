import { Resend } from 'resend'

// ─────────────────────────────────────────────────────────────────────────────
// Interface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * メール送信抽象。
 * 実装は Resend 等のベンダー固有 SDK を隠蔽する。
 */
export interface EmailSender {
  send(input: SendEmailInput): Promise<void>
}

export interface SendEmailInput {
  /** 宛先メールアドレス */
  to: string
  /** 差出人 (省略時は env FROM / ハードコードされたデフォルト) */
  from?: string
  /** メール件名 */
  subject: string
  /** メール本文 (レンダリング済み HTML) */
  html: string
}

// ─────────────────────────────────────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 差出人フォールバック。環境変数 `EMAIL_FROM` で上書き可能。
 * 本番では自社ドメインに差し替えること。
 */
const DEFAULT_FROM = 'HR Management System <noreply@example.com>'

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

class ResendEmailSender implements EmailSender {
  private readonly client: Resend
  private readonly defaultFrom: string

  constructor(client: Resend, defaultFrom: string) {
    this.client = client
    this.defaultFrom = defaultFrom
  }

  async send(input: SendEmailInput): Promise<void> {
    const response = await this.client.emails.send({
      from: input.from ?? this.defaultFrom,
      to: input.to,
      subject: input.subject,
      html: input.html,
    })

    // Resend SDK は { data, error } の Result 型を返す。
    // エラー時は BullMQ のリトライ機構に委ねるため throw する。
    if (response.error) {
      throw new Error(
        `Resend send failed: ${response.error.name} - ${response.error.message}`,
      )
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resend クライアントをラップした EmailSender を生成する。
 * API キーが空の場合はフェイルファストする（サイレントな送信失敗を防ぐ）。
 *
 * @param apiKey Resend API キー。通常 `process.env.RESEND_API_KEY` から渡す
 * @param defaultFrom 差出人メールアドレス。省略時は env `EMAIL_FROM` → DEFAULT_FROM
 */
export function createResendEmailSender(
  apiKey: string,
  defaultFrom?: string,
): EmailSender {
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error('RESEND_API_KEY is required to create an email sender')
  }

  const client = new Resend(apiKey)
  const resolvedFrom = defaultFrom ?? process.env.EMAIL_FROM ?? DEFAULT_FROM
  return new ResendEmailSender(client, resolvedFrom)
}
