-- =============================================================
-- Mahnwesen (Dunning) — Phase 1
-- Plan: thoughts/shared/plans/2026-04-13-mahnwesen.md
--
-- Creates four reminder tables (settings, templates, reminders,
-- reminder_items) and adds dunning_blocked / dunning_block_reason
-- flags to crm_addresses and billing_documents.
-- =============================================================

-- reminder_settings: one row per tenant
CREATE TABLE reminder_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  max_level INT NOT NULL DEFAULT 3,
  grace_period_days INT[] NOT NULL DEFAULT ARRAY[7, 14, 21],
  fee_amounts DOUBLE PRECISION[] NOT NULL DEFAULT ARRAY[0, 2.5, 5]::double precision[],
  interest_enabled BOOLEAN NOT NULL DEFAULT true,
  interest_rate_percent DOUBLE PRECISION NOT NULL DEFAULT 9,
  fees_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reminder_settings_max_level_chk CHECK (max_level BETWEEN 1 AND 4)
);

-- reminder_templates: parallel to billing_document_templates
CREATE TABLE reminder_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  level INT NOT NULL,
  header_text TEXT NOT NULL DEFAULT '',
  footer_text TEXT NOT NULL DEFAULT '',
  email_subject VARCHAR(255) NOT NULL DEFAULT '',
  email_body TEXT NOT NULL DEFAULT '',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT reminder_templates_level_chk CHECK (level BETWEEN 1 AND 4)
);

CREATE INDEX idx_reminder_templates_tenant_level
  ON reminder_templates (tenant_id, level);

-- reminders: one dunning letter per customer
CREATE TABLE reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  number VARCHAR(50) NOT NULL,
  customer_address_id UUID NOT NULL REFERENCES crm_addresses(id) ON DELETE RESTRICT,
  level INT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  sent_at TIMESTAMPTZ,
  sent_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  send_method VARCHAR(20),
  pdf_storage_path TEXT,
  total_open_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_interest DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_fees DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_due DOUBLE PRECISION NOT NULL DEFAULT 0,
  header_text TEXT NOT NULL DEFAULT '',
  footer_text TEXT NOT NULL DEFAULT '',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT reminders_level_chk CHECK (level BETWEEN 1 AND 4),
  CONSTRAINT reminders_status_chk CHECK (status IN ('DRAFT', 'SENT', 'CANCELLED')),
  CONSTRAINT reminders_send_method_chk CHECK (
    send_method IS NULL OR send_method IN ('email', 'letter', 'manual')
  ),
  CONSTRAINT reminders_number_unique UNIQUE (tenant_id, number)
);

CREATE INDEX idx_reminders_tenant_status
  ON reminders (tenant_id, status);
CREATE INDEX idx_reminders_tenant_customer
  ON reminders (tenant_id, customer_address_id);
CREATE INDEX idx_reminders_tenant_sent_at
  ON reminders (tenant_id, sent_at);

-- reminder_items: one row per invoice within a reminder
CREATE TABLE reminder_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reminder_id UUID NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,
  billing_document_id UUID NOT NULL REFERENCES billing_documents(id) ON DELETE RESTRICT,
  invoice_number VARCHAR(50) NOT NULL,
  invoice_date TIMESTAMPTZ NOT NULL,
  due_date TIMESTAMPTZ NOT NULL,
  original_amount DOUBLE PRECISION NOT NULL,
  open_amount_at_reminder DOUBLE PRECISION NOT NULL,
  days_overdue INT NOT NULL,
  interest_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  fee_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  level_at_reminder INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reminder_items_level_chk CHECK (level_at_reminder BETWEEN 1 AND 4)
);

CREATE INDEX idx_reminder_items_reminder
  ON reminder_items (reminder_id);
CREATE INDEX idx_reminder_items_billing_document
  ON reminder_items (billing_document_id);

-- Dunning block flags on existing models
ALTER TABLE crm_addresses
  ADD COLUMN dunning_blocked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN dunning_block_reason TEXT;

ALTER TABLE billing_documents
  ADD COLUMN dunning_blocked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN dunning_block_reason TEXT;
