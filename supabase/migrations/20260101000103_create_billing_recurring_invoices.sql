-- ORD_05: Billing Recurring Invoices (Wiederkehrende Rechnungen)

CREATE TYPE billing_recurring_interval AS ENUM ('MONTHLY', 'QUARTERLY', 'SEMI_ANNUALLY', 'ANNUALLY');

CREATE TABLE billing_recurring_invoices (
    id                UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID            NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name              TEXT            NOT NULL,
    address_id        UUID            NOT NULL REFERENCES crm_addresses(id),
    contact_id        UUID            REFERENCES crm_contacts(id) ON DELETE SET NULL,
    interval          billing_recurring_interval NOT NULL,
    start_date        TIMESTAMPTZ     NOT NULL,
    end_date          TIMESTAMPTZ,
    next_due_date     TIMESTAMPTZ     NOT NULL,
    last_generated_at TIMESTAMPTZ,
    auto_generate     BOOLEAN         NOT NULL DEFAULT FALSE,
    is_active         BOOLEAN         NOT NULL DEFAULT TRUE,

    -- Invoice template fields
    delivery_type     TEXT,
    delivery_terms    TEXT,
    payment_term_days INTEGER,
    discount_percent  DOUBLE PRECISION,
    discount_days     INTEGER,
    notes             TEXT,
    internal_notes    TEXT,

    -- Position template (JSONB array)
    position_template JSONB           NOT NULL,

    -- Audit
    created_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    created_by_id     UUID
);

CREATE INDEX idx_billing_recurring_invoices_tenant_active ON billing_recurring_invoices(tenant_id, is_active);
CREATE INDEX idx_billing_recurring_invoices_tenant_due ON billing_recurring_invoices(tenant_id, next_due_date);

CREATE TRIGGER set_billing_recurring_invoices_updated_at
  BEFORE UPDATE ON billing_recurring_invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
