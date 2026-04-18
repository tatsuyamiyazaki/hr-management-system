-- マスタ管理テーブル (Requirement 2)
-- Issue #24: スキル・役職・等級マスタの CRUD

-- スキルマスタ (Requirement 2.1, 2.4)
CREATE TABLE IF NOT EXISTS skill_masters (
  id          TEXT      NOT NULL PRIMARY KEY,
  name        TEXT      NOT NULL UNIQUE,
  category    TEXT      NOT NULL,
  description TEXT,
  deprecated  BOOLEAN   NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS skill_masters_category_idx ON skill_masters (category);

-- 役職マスタ (Requirement 2.2)
CREATE TABLE IF NOT EXISTS role_masters (
  id        TEXT NOT NULL PRIMARY KEY,
  name      TEXT NOT NULL UNIQUE,
  "gradeId" TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS role_masters_grade_id_idx ON role_masters ("gradeId");

-- 役職必要スキル要件 (Requirement 2.2, 2.5)
CREATE TABLE IF NOT EXISTS role_skill_requirements (
  id              TEXT    NOT NULL PRIMARY KEY,
  "roleId"        TEXT    NOT NULL,
  "skillId"       TEXT    NOT NULL,
  "requiredLevel" INTEGER NOT NULL,
  CONSTRAINT role_skill_requirements_role_id_skill_id_key UNIQUE ("roleId", "skillId"),
  CONSTRAINT role_skill_requirements_role_id_fkey FOREIGN KEY ("roleId")
    REFERENCES role_masters (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS role_skill_requirements_skill_id_idx ON role_skill_requirements ("skillId");

-- 等級マスタ (Requirement 2.3)
-- w1+w2+w3 = 1 はアプリ層で検証
CREATE TABLE IF NOT EXISTS grade_masters (
  id                  TEXT             NOT NULL PRIMARY KEY,
  label               TEXT             NOT NULL UNIQUE,
  "performanceWeight" DOUBLE PRECISION NOT NULL,
  "goalWeight"        DOUBLE PRECISION NOT NULL,
  "feedbackWeight"    DOUBLE PRECISION NOT NULL
);
