-- =============================================================
-- Create payment_runs + payment_run_items tables
-- SEPA-Zahlungsläufe (pain.001.001.09) für Eingangsrechnungen
-- Plan: thoughts/shared/plans/2026-04-12-sepa-payment-runs.md Phase 1
-- =============================================================

-- payment_runs: Kopf-Tabelle eines SEPA-Sammellaufs
CREATE TABLE payment_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  number VARCHAR(50) NOT NULL, -- PR-2026-001
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  execution_date DATE NOT NULL, -- gewünschtes Ausführungsdatum (ReqdExctnDt)
  debtor_name VARCHAR(70) NOT NULL, -- Snapshot BillingTenantConfig.companyName
  debtor_iban VARCHAR(34) NOT NULL, -- Snapshot BillingTenantConfig.iban
  debtor_bic VARCHAR(11),
  total_amount_cents BIGINT NOT NULL DEFAULT 0,
  item_count INTEGER NOT NULL DEFAULT 0,
  xml_storage_path TEXT,
  xml_generated_at TIMESTAMPTZ,
  booked_at TIMESTAMPTZ,
  booked_by UUID,
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID,
  cancelled_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  CONSTRAINT payment_runs_status_chk CHECK (status IN ('DRAFT','EXPORTED','BOOKED','CANCELLED')),
  CONSTRAINT payment_runs_number_unique UNIQUE (tenant_id, number)
);

CREATE INDEX idx_payment_runs_tenant_status ON payment_runs (tenant_id, status);
CREATE INDEX idx_payment_runs_tenant_created ON payment_runs (tenant_id, created_at DESC);

-- payment_run_items: Snapshot der im Lauf enthaltenen Rechnungen
CREATE TABLE payment_run_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  payment_run_id UUID NOT NULL REFERENCES payment_runs(id) ON DELETE CASCADE,
  inbound_invoice_id UUID NOT NULL REFERENCES inbound_invoices(id) ON DELETE RESTRICT,

  -- Snapshot — NICHT mutierbar nach PaymentRun.created
  effective_creditor_name VARCHAR(70) NOT NULL,
  effective_iban VARCHAR(34) NOT NULL,
  effective_bic VARCHAR(11),
  effective_street VARCHAR(70),
  effective_zip VARCHAR(16),
  effective_city VARCHAR(35) NOT NULL,
  effective_country VARCHAR(2) NOT NULL, -- ISO 3166-1 alpha-2
  effective_amount_cents BIGINT NOT NULL,
  effective_currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
  effective_remittance_info VARCHAR(140) NOT NULL, -- invoiceNumber / Rechnungsnummer

  iban_source VARCHAR(10) NOT NULL,     -- 'CRM' | 'INVOICE' | 'MANUAL'
  address_source VARCHAR(10) NOT NULL,  -- 'CRM' | 'INVOICE' | 'MANUAL'

  end_to_end_id VARCHAR(35) NOT NULL,   -- EndToEndIdentification (pain.001)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT pri_iban_source_chk CHECK (iban_source IN ('CRM','INVOICE','MANUAL')),
  CONSTRAINT pri_address_source_chk CHECK (address_source IN ('CRM','INVOICE','MANUAL'))
);

CREATE INDEX idx_pri_tenant_run ON payment_run_items (tenant_id, payment_run_id);
CREATE INDEX idx_pri_inbound_invoice ON payment_run_items (tenant_id, inbound_invoice_id);

-- NumberSequence Seed: Retro-Seed für existierende Tenants (Prefix "PR-")
INSERT INTO number_sequences (tenant_id, key, prefix, next_value)
SELECT t.id, 'payment_run', 'PR-', 1
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM number_sequences ns WHERE ns.tenant_id = t.id AND ns.key = 'payment_run'
);
