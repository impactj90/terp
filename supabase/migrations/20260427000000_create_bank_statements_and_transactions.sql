-- =============================================================
-- CAMT.053 Phase 1: BankStatement + BankTransaction + Enums
-- Plan: thoughts/shared/plans/2026-04-14-camt053-import.md
-- =============================================================

-- Enums
CREATE TYPE bank_transaction_direction AS ENUM ('CREDIT', 'DEBIT');
CREATE TYPE bank_transaction_status    AS ENUM ('unmatched', 'matched', 'ignored');

-- BankStatement — Kopf-Tabelle pro hochgeladener CAMT-Datei
CREATE TABLE bank_statements (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  file_name         VARCHAR(255) NOT NULL,
  sha256_hash       CHAR(64)    NOT NULL,
  xml_storage_path  TEXT        NOT NULL,
  account_iban      VARCHAR(34) NOT NULL,
  statement_id      VARCHAR(255) NOT NULL,
  period_from       TIMESTAMPTZ NOT NULL,
  period_to         TIMESTAMPTZ NOT NULL,
  opening_balance   DOUBLE PRECISION NOT NULL,
  closing_balance   DOUBLE PRECISION NOT NULL,
  currency          CHAR(3)     NOT NULL,
  imported_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  imported_by_id    UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_bank_statements_tenant_hash
  ON bank_statements(tenant_id, sha256_hash);
CREATE INDEX idx_bank_statements_tenant_imported_at
  ON bank_statements(tenant_id, imported_at DESC);

CREATE TRIGGER set_bank_statements_updated_at
  BEFORE UPDATE ON bank_statements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- BankTransaction — eine Row pro CAMT-Buchung (iteriert über
-- Stmt/Ntry/NtryDtls/TxDtls, nicht pro <Ntry>-Atom).
CREATE TABLE bank_transactions (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  statement_id         UUID        NOT NULL REFERENCES bank_statements(id) ON DELETE CASCADE,
  booking_date         TIMESTAMPTZ NOT NULL,
  value_date           TIMESTAMPTZ NOT NULL,
  amount               DOUBLE PRECISION NOT NULL,
  currency             CHAR(3)     NOT NULL,
  direction            bank_transaction_direction NOT NULL,
  counterparty_iban    VARCHAR(34),
  counterparty_name    TEXT,
  counterparty_bic     VARCHAR(11),
  remittance_info      TEXT,
  end_to_end_id        VARCHAR(255),
  mandate_id           VARCHAR(255),
  bank_reference       VARCHAR(255),
  bank_tx_code         JSONB,
  status               bank_transaction_status NOT NULL DEFAULT 'unmatched',
  suggested_address_id UUID REFERENCES crm_addresses(id) ON DELETE SET NULL,
  ignored_at           TIMESTAMPTZ,
  ignored_by_id        UUID,
  ignored_reason       TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bank_transactions_tenant_status
  ON bank_transactions(tenant_id, status);
CREATE INDEX idx_bank_transactions_tenant_booking_date
  ON bank_transactions(tenant_id, booking_date);
CREATE INDEX idx_bank_transactions_tenant_counterparty_iban
  ON bank_transactions(tenant_id, counterparty_iban);
CREATE INDEX idx_bank_transactions_tenant_statement
  ON bank_transactions(tenant_id, statement_id);

CREATE TRIGGER set_bank_transactions_updated_at
  BEFORE UPDATE ON bank_transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
