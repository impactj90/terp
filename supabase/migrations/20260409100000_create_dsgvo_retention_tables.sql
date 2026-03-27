-- SYS_01: Create DSGVO retention rules and delete log tables

CREATE TABLE dsgvo_retention_rules (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  data_type        VARCHAR(50) NOT NULL,
  retention_months INTEGER NOT NULL,
  action           VARCHAR(20) NOT NULL DEFAULT 'DELETE',
  is_active        BOOLEAN NOT NULL DEFAULT true,
  description      TEXT,
  created_at       TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, data_type)
);

CREATE INDEX idx_dsgvo_retention_rules_tenant ON dsgvo_retention_rules(tenant_id);

CREATE TABLE dsgvo_delete_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  data_type     VARCHAR(50) NOT NULL,
  action        VARCHAR(20) NOT NULL,
  record_count  INTEGER NOT NULL,
  cutoff_date   DATE NOT NULL,
  executed_at   TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  executed_by   UUID,
  duration_ms   INTEGER,
  error         TEXT,
  details       JSONB
);

CREATE INDEX idx_dsgvo_delete_logs_tenant ON dsgvo_delete_logs(tenant_id);
CREATE INDEX idx_dsgvo_delete_logs_tenant_executed ON dsgvo_delete_logs(tenant_id, executed_at);

-- Insert default retention rules for all existing tenants
INSERT INTO dsgvo_retention_rules (tenant_id, data_type, retention_months, action, is_active, description)
SELECT t.id, rules.data_type, rules.retention_months, rules.action, false, rules.description
FROM tenants t
CROSS JOIN (VALUES
  ('BOOKINGS',           36,  'DELETE',    'Stempelbuchungen (Kommen/Gehen)'),
  ('DAILY_VALUES',       36,  'DELETE',    'Tageswerte (berechnete Zeiten)'),
  ('ABSENCES',           36,  'ANONYMIZE', 'Abwesenheiten (Urlaub, Krank etc.)'),
  ('MONTHLY_VALUES',     60,  'DELETE',    'Monatswerte (Konten, Flexzeit)'),
  ('AUDIT_LOGS',         24,  'DELETE',    'Audit-Protokoll'),
  ('TERMINAL_BOOKINGS',  12,  'DELETE',    'Terminal-Rohdaten'),
  ('PERSONNEL_FILE',     120, 'DELETE',    'Personalakten-Eintraege'),
  ('CORRECTION_MESSAGES',12,  'DELETE',    'Korrekturassistent-Meldungen'),
  ('STOCK_MOVEMENTS',    120, 'ANONYMIZE', 'Lagerbewegungen')
) AS rules(data_type, retention_months, action, description);
