-- 組織管理テーブル (Requirement 3)
-- Issue #27: Department / Position / TransferRecord の DDL
-- Department の parent / Position の supervisor は自己参照。論理削除は deletedAt で表現。

-- 部署 (Requirement 3.6)
CREATE TABLE IF NOT EXISTS departments (
  id          TEXT         NOT NULL PRIMARY KEY,
  name        TEXT         NOT NULL,
  "parentId"  TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3)
);

CREATE INDEX IF NOT EXISTS departments_parent_id_idx ON departments ("parentId");

-- ポジション (Requirement 3.6, 3.7)
CREATE TABLE IF NOT EXISTS positions (
  id                     TEXT NOT NULL PRIMARY KEY,
  "departmentId"         TEXT NOT NULL,
  "roleId"               TEXT NOT NULL,
  "holderUserId"         TEXT,
  "supervisorPositionId" TEXT
);

CREATE INDEX IF NOT EXISTS positions_department_id_idx ON positions ("departmentId");
CREATE INDEX IF NOT EXISTS positions_supervisor_position_id_idx ON positions ("supervisorPositionId");

-- 異動履歴 (Requirement 3.7)
CREATE TABLE IF NOT EXISTS transfer_records (
  id               TEXT         NOT NULL PRIMARY KEY,
  "userId"         TEXT         NOT NULL,
  "fromPositionId" TEXT,
  "toPositionId"   TEXT,
  "effectiveDate"  TIMESTAMP(3) NOT NULL,
  "changedBy"      TEXT         NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS transfer_records_user_id_effective_date_idx
  ON transfer_records ("userId", "effectiveDate");
