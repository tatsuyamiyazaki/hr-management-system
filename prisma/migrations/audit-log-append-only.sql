-- =============================================================================
-- Migration: 監査ログ Append-Only 構造
-- Requirement 17.1, 17.2, 17.3, 17.5, 17.7
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Enum 型の作成
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE "AuditAction" AS ENUM (
  -- 認証イベント (Requirement 17.1)
  'LOGIN_SUCCESS',
  'LOGIN_FAILURE',
  'LOGOUT',
  'ACCOUNT_LOCKED',
  'PASSWORD_RESET_REQUESTED',
  'PASSWORD_CHANGED',
  -- 権限変更イベント (Requirement 17.2)
  'ROLE_CHANGE',
  'PERMISSION_CHANGE',
  -- 組織変更イベント (Requirement 17.2)
  'ORGANIZATION_CHANGE',
  -- マスタ変更イベント (Requirement 17.2)
  'MASTER_DATA_CHANGE',
  -- 汎用レコード操作
  'RECORD_CREATE',
  'RECORD_UPDATE',
  'RECORD_DELETE',
  -- 評価確定イベント (Requirement 17.2)
  'EVALUATION_FINALIZED',
  -- データエクスポートイベント (Requirement 17.2)
  'DATA_EXPORT'
);

CREATE TYPE "AuditResourceType" AS ENUM (
  'USER',
  'SESSION',
  'ORGANIZATION',
  'POSITION',
  'EVALUATION',
  'EVALUATION_CYCLE',
  'FEEDBACK',
  'GOAL',
  'ONE_ON_ONE',
  'MASTER_DATA',
  'EXPORT_JOB',
  'SYSTEM_CONFIG'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. INSERT 専用ロールの作成 (Requirement 17.7)
-- 監査ログへの UPDATE/DELETE を DB レベルで物理的に禁止する
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'audit_writer') THEN
    CREATE ROLE audit_writer NOLOGIN;
  END IF;
END
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. 親テーブル（パーティションテーブル）の作成
-- 月次 RANGE パーティショニング on occurredAt (Requirement 17.5)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_logs (
  id             TEXT        NOT NULL,
  "userId"       TEXT,
  action         "AuditAction" NOT NULL,
  "resourceType" "AuditResourceType" NOT NULL,
  "resourceId"   TEXT,
  "ipAddress"    TEXT        NOT NULL,
  "userAgent"    TEXT        NOT NULL,
  before         JSONB,
  after          JSONB,
  "occurredAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, "occurredAt")
) PARTITION BY RANGE ("occurredAt");

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. インデックスの作成
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS audit_logs_occurred_at_idx
  ON audit_logs ("occurredAt" DESC);

CREATE INDEX IF NOT EXISTS audit_logs_user_occurred_idx
  ON audit_logs ("userId", "occurredAt" DESC);

CREATE INDEX IF NOT EXISTS audit_logs_action_occurred_idx
  ON audit_logs (action, "occurredAt" DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. audit_writer ロールの権限設定 (Requirement 17.7)
-- INSERT のみ許可、UPDATE/DELETE は権限なし（デフォルトで付与されない）
-- ─────────────────────────────────────────────────────────────────────────────

GRANT INSERT ON audit_logs TO audit_writer;
-- UPDATE/DELETE は明示的に REVOKE（念のため）
REVOKE UPDATE, DELETE ON audit_logs FROM PUBLIC;
REVOKE UPDATE, DELETE ON audit_logs FROM audit_writer;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Row Level Security で物理的な改竄防止 (Requirement 17.7)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- audit_writer は INSERT のみ可
CREATE POLICY audit_logs_insert_policy
  ON audit_logs
  FOR INSERT
  TO audit_writer
  WITH CHECK (true);

-- オーナー（superuser/migration ロール）は SELECT 可（閲覧用）
CREATE POLICY audit_logs_select_policy
  ON audit_logs
  FOR SELECT
  USING (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. 最初の月次パーティションを作成（現在月と翌月）
-- 本番では pg_cron 等で毎月自動生成する
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  cur_month DATE := DATE_TRUNC('month', NOW());
  next_month DATE := DATE_TRUNC('month', NOW() + INTERVAL '1 month');
  cur_label TEXT := TO_CHAR(cur_month, 'YYYY_MM');
  next_label TEXT := TO_CHAR(next_month, 'YYYY_MM');
BEGIN
  -- 当月パーティション
  EXECUTE FORMAT(
    'CREATE TABLE IF NOT EXISTS audit_logs_%s
     PARTITION OF audit_logs
     FOR VALUES FROM (%L) TO (%L)',
    cur_label,
    cur_month::TEXT,
    next_month::TEXT
  );

  -- 翌月パーティション（先行作成）
  EXECUTE FORMAT(
    'CREATE TABLE IF NOT EXISTS audit_logs_%s
     PARTITION OF audit_logs
     FOR VALUES FROM (%L) TO (%L)',
    next_label,
    next_month::TEXT,
    (next_month + INTERVAL '1 month')::TEXT
  );
END
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. 7年保持ポリシーのコメント
-- 月次パーティション削除は別途 pg_cron ジョブで実施:
-- DELETE partitions older than 84 months (7 years)
-- ─────────────────────────────────────────────────────────────────────────────

COMMENT ON TABLE audit_logs IS
  '監査ログ（Append-Only）。7年保持（月次パーティション）。Requirement 17.1, 17.2, 17.3, 17.5, 17.7。';
