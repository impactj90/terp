-- =============================================================
-- CAMT-Preflight Phase 3a: InboundInvoice Payment-Status
--
-- 1) Enums für payment_status + payment_type + payment_status auf der
--    Payment-Row.
-- 2) Spalten auf inbound_invoices: payment_status, paid_at, paid_amount.
-- 3) Tabelle inbound_invoice_payments (analog billing_payments, ohne
--    isDiscount).
--
-- Plan: thoughts/shared/plans/2026-04-14-camt-preflight-items.md
-- =============================================================

-- Enums
CREATE TYPE inbound_invoice_payment_status AS ENUM ('UNPAID', 'PARTIAL', 'PAID');
CREATE TYPE inbound_invoice_payment_type   AS ENUM ('CASH', 'BANK');
CREATE TYPE inbound_invoice_payment_row_status AS ENUM ('ACTIVE', 'CANCELLED');

-- Spalten auf inbound_invoices
ALTER TABLE inbound_invoices
  ADD COLUMN payment_status inbound_invoice_payment_status NOT NULL DEFAULT 'UNPAID',
  ADD COLUMN paid_at        TIMESTAMPTZ,
  ADD COLUMN paid_amount    DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE INDEX idx_inbound_invoices_tenant_payment_status
  ON inbound_invoices(tenant_id, payment_status);

-- Tabelle
CREATE TABLE inbound_invoice_payments (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id        UUID        NOT NULL REFERENCES inbound_invoices(id) ON DELETE RESTRICT,
  date              TIMESTAMPTZ NOT NULL,
  amount            DOUBLE PRECISION NOT NULL,
  type              inbound_invoice_payment_type NOT NULL,
  status            inbound_invoice_payment_row_status NOT NULL DEFAULT 'ACTIVE',
  notes             TEXT,
  cancelled_at      TIMESTAMPTZ,
  cancelled_by_id   UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_id     UUID
);

CREATE INDEX idx_inbound_invoice_payments_tenant_invoice
  ON inbound_invoice_payments(tenant_id, invoice_id);
CREATE INDEX idx_inbound_invoice_payments_tenant_date
  ON inbound_invoice_payments(tenant_id, date);

CREATE TRIGGER set_inbound_invoice_payments_updated_at
  BEFORE UPDATE ON inbound_invoice_payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
