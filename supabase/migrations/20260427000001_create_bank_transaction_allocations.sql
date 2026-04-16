-- =============================================================
-- CAMT.053 Phase 1: Zwei Allocation-Tabellen + Rück-FK-Spalten
-- Plan: thoughts/shared/plans/2026-04-14-camt053-import.md
--
-- Pattern B (zwei separate Tabellen pro Parent-Typ), konsistent mit
-- billing_payments vs. inbound_invoice_payments.
-- =============================================================

-- Credit-Pfad: BillingDocument-Allocation
CREATE TABLE billing_document_bank_allocations (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bank_transaction_id  UUID        NOT NULL REFERENCES bank_transactions(id) ON DELETE CASCADE,
  billing_document_id  UUID        NOT NULL REFERENCES billing_documents(id) ON DELETE RESTRICT,
  billing_payment_id   UUID        REFERENCES billing_payments(id) ON DELETE RESTRICT,
  amount               DOUBLE PRECISION NOT NULL,
  auto_matched         BOOLEAN     NOT NULL DEFAULT FALSE,
  matched_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  matched_by_id        UUID,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_billing_doc_bank_alloc_tenant_tx
  ON billing_document_bank_allocations(tenant_id, bank_transaction_id);
CREATE INDEX idx_billing_doc_bank_alloc_tenant_doc
  ON billing_document_bank_allocations(tenant_id, billing_document_id);
CREATE UNIQUE INDEX uq_billing_doc_bank_alloc_payment
  ON billing_document_bank_allocations(billing_payment_id)
  WHERE billing_payment_id IS NOT NULL;

-- Debit-Pfad: InboundInvoice-Allocation
CREATE TABLE inbound_invoice_bank_allocations (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bank_transaction_id       UUID        NOT NULL REFERENCES bank_transactions(id) ON DELETE CASCADE,
  inbound_invoice_id        UUID        NOT NULL REFERENCES inbound_invoices(id) ON DELETE RESTRICT,
  inbound_invoice_payment_id UUID       REFERENCES inbound_invoice_payments(id) ON DELETE RESTRICT,
  amount                    DOUBLE PRECISION NOT NULL,
  auto_matched              BOOLEAN     NOT NULL DEFAULT FALSE,
  matched_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  matched_by_id             UUID,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inbound_inv_bank_alloc_tenant_tx
  ON inbound_invoice_bank_allocations(tenant_id, bank_transaction_id);
CREATE INDEX idx_inbound_inv_bank_alloc_tenant_inv
  ON inbound_invoice_bank_allocations(tenant_id, inbound_invoice_id);
CREATE UNIQUE INDEX uq_inbound_inv_bank_alloc_payment
  ON inbound_invoice_bank_allocations(inbound_invoice_payment_id)
  WHERE inbound_invoice_payment_id IS NOT NULL;

-- Rück-FK-Spalten auf den Payment-Tabellen. Keine FK-Enforcement an
-- dieser Stelle — die Verbindung läuft vom Allocation-Record aus.
ALTER TABLE billing_payments
  ADD COLUMN bank_allocation_id UUID;
ALTER TABLE inbound_invoice_payments
  ADD COLUMN bank_allocation_id UUID;
