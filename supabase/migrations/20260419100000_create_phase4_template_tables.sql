-- ═══════════════════════════════════════════════════════════════════
-- Phase 4: Template Polish + Advanced Features
-- ═══════════════════════════════════════════════════════════════════
-- Adds:
--   - export_template_snapshots   (4.2 — snapshot/golden-file tests)
--   - export_template_schedules   (4.4 — cron-driven automatic exports)
--   - four new permissions on ADMIN group (version restore, snapshot,
--     share, schedule)
--
-- Versioning (4.1) and sharing (4.3) reuse existing tables:
--   - export_template_versions already exists (migration 20260417100000)
--   - Cross-tenant sharing is a service-level copy, no new tables
--
-- Multi-file export (4.5) is a template-body convention
-- (`{% file "name" %}...{% endfile %}` Liquid blocks), no schema.
-- ═══════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────
-- export_template_snapshots — stores golden-file test snapshots
-- ──────────────────────────────────────────────────────────────────
-- One row per saved expected output. `expected_hash` is the SHA-256 of
-- the rendered-and-encoded bytes at snapshot time. `expected_body` is
-- kept so the UI can show a diff when the current render differs.
--
CREATE TABLE export_template_snapshots (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    template_id           UUID NOT NULL REFERENCES export_templates(id) ON DELETE CASCADE,
    name                  VARCHAR(200) NOT NULL,
    description           TEXT,
    period_year           INT NOT NULL,
    period_month          INT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    expected_hash         VARCHAR(64) NOT NULL,
    expected_body         TEXT NOT NULL,
    expected_byte_size    INT NOT NULL DEFAULT 0,
    last_verified_at      TIMESTAMPTZ,
    last_verified_status  VARCHAR(16),  -- "match" | "mismatch" | "error"
    last_verified_message TEXT,
    last_verified_hash    VARCHAR(64),
    created_by            UUID,
    created_at            TIMESTAMPTZ DEFAULT now(),
    updated_at            TIMESTAMPTZ DEFAULT now(),
    UNIQUE(template_id, name)
);
CREATE INDEX idx_export_template_snapshots_tenant ON export_template_snapshots(tenant_id);
CREATE INDEX idx_export_template_snapshots_template ON export_template_snapshots(template_id);

CREATE TRIGGER trigger_export_template_snapshots_updated_at
BEFORE UPDATE ON export_template_snapshots
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ──────────────────────────────────────────────────────────────────
-- export_template_schedules — cron-driven automatic exports
-- ──────────────────────────────────────────────────────────────────
-- frequency:
--   "daily"    — runs every day at hour_of_day
--   "weekly"   — runs on day_of_week (0=Sunday..6=Saturday) at hour_of_day
--   "monthly"  — runs on day_of_month (1..28) at hour_of_day
--
-- day_period: which period to export on run
--   "previous_month" (default) — exports the month before today
--   "current_month"            — exports the current month
--
-- recipient_emails: semicolon-separated list, validated at write time
--
CREATE TABLE export_template_schedules (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    template_id           UUID NOT NULL REFERENCES export_templates(id) ON DELETE CASCADE,
    export_interface_id   UUID REFERENCES export_interfaces(id) ON DELETE SET NULL,
    name                  VARCHAR(200) NOT NULL,
    -- Default OFF — schedules must be explicitly activated by the admin
    -- after verifying recipients, template, and cron secret.
    is_active             BOOLEAN NOT NULL DEFAULT false,
    frequency             VARCHAR(10) NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
    day_of_week           INT CHECK (day_of_week BETWEEN 0 AND 6),
    day_of_month          INT CHECK (day_of_month BETWEEN 1 AND 28),
    hour_of_day           INT NOT NULL DEFAULT 6 CHECK (hour_of_day BETWEEN 0 AND 23),
    day_period            VARCHAR(20) NOT NULL DEFAULT 'previous_month'
                          CHECK (day_period IN ('previous_month', 'current_month')),
    recipient_emails      TEXT NOT NULL DEFAULT '',
    last_run_at           TIMESTAMPTZ,
    last_run_status       VARCHAR(16),  -- "success" | "error"
    last_run_message      TEXT,
    next_run_at           TIMESTAMPTZ,
    created_by            UUID,
    updated_by            UUID,
    created_at            TIMESTAMPTZ DEFAULT now(),
    updated_at            TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tenant_id, name)
);
CREATE INDEX idx_export_template_schedules_tenant ON export_template_schedules(tenant_id);
CREATE INDEX idx_export_template_schedules_due ON export_template_schedules(next_run_at, is_active);

CREATE TRIGGER trigger_export_template_schedules_updated_at
BEFORE UPDATE ON export_template_schedules
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ──────────────────────────────────────────────────────────────────
-- Phase 4 permissions — assigned to ADMIN only
-- ──────────────────────────────────────────────────────────────────
-- UUIDv5 with namespace f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1:
--   export_template.restore_version = 33dc2e6b-2fca-5abb-a64c-21b3ddc13a04
--   export_template.snapshot        = 56b68b90-74d8-55a8-8884-d50356d3204a
--   export_template.share           = 7b152863-fe45-5aa4-bcc7-b3155f56601f
--   export_template.schedule        = c82361d8-71ab-5749-864f-91dc7a8f80cb
--
-- Kept admin-only — these are power-user features managed by the
-- implementation partner / administrator, not by day-to-day roles.
--
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"33dc2e6b-2fca-5abb-a64c-21b3ddc13a04"'::jsonb  -- restore_version
    UNION ALL SELECT '"56b68b90-74d8-55a8-8884-d50356d3204a"'::jsonb  -- snapshot
    UNION ALL SELECT '"7b152863-fe45-5aa4-bcc7-b3155f56601f"'::jsonb  -- share
    UNION ALL SELECT '"c82361d8-71ab-5749-864f-91dc7a8f80cb"'::jsonb  -- schedule
  ) sub
) WHERE code = 'ADMIN' AND tenant_id IS NULL;
