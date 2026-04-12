-- WH_11: Warehouse Correction Assistant tables

-- Enum: severity levels for correction messages
CREATE TYPE wh_correction_severity AS ENUM ('ERROR', 'WARNING', 'INFO');

-- Enum: status lifecycle for correction messages
CREATE TYPE wh_correction_status AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED', 'IGNORED');

-- Correction run: one row per check execution (cron or manual)
CREATE TABLE wh_correction_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  trigger         varchar(20) NOT NULL,       -- 'MANUAL' or 'CRON'
  checks_run      int NOT NULL DEFAULT 0,
  issues_found    int NOT NULL DEFAULT 0,
  triggered_by_id uuid
);

CREATE INDEX idx_wh_correction_runs_tenant ON wh_correction_runs(tenant_id);
CREATE INDEX idx_wh_correction_runs_tenant_started ON wh_correction_runs(tenant_id, started_at);

-- Correction message: one row per detected issue
CREATE TABLE wh_correction_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  run_id          uuid REFERENCES wh_correction_runs(id) ON DELETE SET NULL,
  code            varchar(50) NOT NULL,       -- e.g. 'NEGATIVE_STOCK', 'DUPLICATE_RECEIPT'
  severity        wh_correction_severity NOT NULL,
  status          wh_correction_status NOT NULL DEFAULT 'OPEN',
  message         text NOT NULL,              -- Human-readable description
  article_id      uuid,                       -- FK to wh_articles (optional, for article-related issues)
  document_id     uuid,                       -- FK to purchase order or other document (optional)
  details         jsonb,                       -- Additional structured data (expected vs actual, etc.)
  resolved_at     timestamptz,
  resolved_by_id  uuid,
  resolved_note   text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wh_correction_messages_tenant_status ON wh_correction_messages(tenant_id, status);
CREATE INDEX idx_wh_correction_messages_tenant_code ON wh_correction_messages(tenant_id, code);
CREATE INDEX idx_wh_correction_messages_tenant_article ON wh_correction_messages(tenant_id, article_id);
