-- ORD_03: Billing Payments (Offene Posten / Zahlungen)

CREATE TYPE billing_payment_type AS ENUM ('CASH', 'BANK');
CREATE TYPE billing_payment_status AS ENUM ('ACTIVE', 'CANCELLED');

CREATE TABLE billing_payments (
    id                UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID                    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    document_id       UUID                    NOT NULL REFERENCES billing_documents(id),
    date              TIMESTAMPTZ             NOT NULL,
    amount            DOUBLE PRECISION        NOT NULL,
    type              billing_payment_type    NOT NULL,
    status            billing_payment_status  NOT NULL DEFAULT 'ACTIVE',
    is_discount       BOOLEAN                 NOT NULL DEFAULT FALSE,
    notes             TEXT,
    cancelled_at      TIMESTAMPTZ,
    cancelled_by_id   UUID,
    created_at        TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
    created_by_id     UUID
);

-- Indexes
CREATE INDEX idx_billing_payments_tenant_document ON billing_payments(tenant_id, document_id);
CREATE INDEX idx_billing_payments_tenant_date ON billing_payments(tenant_id, date);

-- Trigger for updated_at
CREATE TRIGGER set_billing_payments_updated_at
  BEFORE UPDATE ON billing_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
