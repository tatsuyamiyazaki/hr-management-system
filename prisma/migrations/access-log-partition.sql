-- =============================================================================
-- Migration: アクセスログ 月次パーティション & 自動ローテート
-- Requirement 17.6
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. 親テーブル（月次 RANGE パーティション on requestedAt）
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS access_logs (
  id           TEXT        NOT NULL,
  method       TEXT        NOT NULL,
  path         TEXT        NOT NULL,
  "statusCode" INT         NOT NULL,
  "durationMs" INT         NOT NULL,
  "ipAddress"  TEXT        NOT NULL,
  "userAgent"  TEXT        NOT NULL,
  "userId"     TEXT,
  "requestId"  TEXT        NOT NULL,
  "requestedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, "requestedAt")
) PARTITION BY RANGE ("requestedAt");

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. インデックス
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS access_logs_requested_at_idx
  ON access_logs ("requestedAt" DESC);

CREATE INDEX IF NOT EXISTS access_logs_user_requested_idx
  ON access_logs ("userId", "requestedAt" DESC);

CREATE INDEX IF NOT EXISTS access_logs_path_requested_idx
  ON access_logs (path, "requestedAt" DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. 当月・翌月パーティションを作成
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  cur_month  DATE := DATE_TRUNC('month', NOW());
  next_month DATE := DATE_TRUNC('month', NOW() + INTERVAL '1 month');
  cur_label  TEXT := TO_CHAR(cur_month, 'YYYY_MM');
  next_label TEXT := TO_CHAR(next_month, 'YYYY_MM');
BEGIN
  EXECUTE FORMAT(
    'CREATE TABLE IF NOT EXISTS access_logs_%s
     PARTITION OF access_logs
     FOR VALUES FROM (%L) TO (%L)',
    cur_label, cur_month::TEXT, next_month::TEXT
  );
  EXECUTE FORMAT(
    'CREATE TABLE IF NOT EXISTS access_logs_%s
     PARTITION OF access_logs
     FOR VALUES FROM (%L) TO (%L)',
    next_label, next_month::TEXT, (next_month + INTERVAL '1 month')::TEXT
  );
END
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. 翌月パーティション自動作成 + 12ヶ月超パーティション自動ドロップ関数
--    本番では pg_cron で毎日 00:05 に実行する:
--    SELECT cron.schedule('rotate-access-logs', '5 0 * * *',
--      'SELECT rotate_access_log_partitions()');
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION rotate_access_log_partitions()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  next_month     DATE := DATE_TRUNC('month', NOW() + INTERVAL '1 month');
  -- 13ヶ月前の月頭 = そのパーティションの最終行が NOW()-13month 以前に確実に収まる
  -- 例: 2026-04-01 実行 → drop_threshold = 2025-03-01
  --     2025_03 パーティション (2025-03-01〜2025-03-31) のデータは全て13ヶ月以上前
  --     → 1年間（12ヶ月）保持を確実に満たしてからドロップ
  drop_threshold DATE := DATE_TRUNC('month', NOW() - INTERVAL '13 months');
  next_label     TEXT := TO_CHAR(next_month, 'YYYY_MM');
  drop_label     TEXT := TO_CHAR(drop_threshold, 'YYYY_MM');
  partition_name TEXT;
BEGIN
  -- 翌月パーティションを先行作成（存在しない場合のみ）
  partition_name := 'access_logs_' || next_label;
  IF NOT EXISTS (
    SELECT FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = partition_name AND n.nspname = 'public'
  ) THEN
    EXECUTE FORMAT(
      'CREATE TABLE %I PARTITION OF access_logs
       FOR VALUES FROM (%L) TO (%L)',
      partition_name,
      next_month::TEXT,
      (next_month + INTERVAL '1 month')::TEXT
    );
  END IF;

  -- 13ヶ月前の月パーティションをドロップ（Requirement 17.6: 1年間保持を確実に満たす）
  -- 12ヶ月前だと月末データがまだ12ヶ月以内に入るため、13ヶ月前を使用する
  partition_name := 'access_logs_' || drop_label;
  IF EXISTS (
    SELECT FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = partition_name AND n.nspname = 'public'
  ) THEN
    EXECUTE FORMAT('DROP TABLE IF EXISTS %I', partition_name);
  END IF;
END;
$$;

COMMENT ON TABLE access_logs IS
  'APIアクセスログ（1年間保持 / 月次パーティション）。Requirement 17.6。';

COMMENT ON FUNCTION rotate_access_log_partitions() IS
  '翌月パーティション作成 + 12ヶ月超パーティション自動ドロップ。pg_cron で毎日実行する。';
