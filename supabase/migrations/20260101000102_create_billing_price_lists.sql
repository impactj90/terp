-- ORD_04: Billing Price Lists (Preislisten)

CREATE TABLE billing_price_lists (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID            NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            TEXT            NOT NULL,
    description     TEXT,
    is_default      BOOLEAN         NOT NULL DEFAULT FALSE,
    valid_from      TIMESTAMPTZ,
    valid_to        TIMESTAMPTZ,
    is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    created_by_id   UUID
);

CREATE INDEX idx_billing_price_lists_tenant_default ON billing_price_lists(tenant_id, is_default);
CREATE INDEX idx_billing_price_lists_tenant_active ON billing_price_lists(tenant_id, is_active);

CREATE TRIGGER set_billing_price_lists_updated_at
  BEFORE UPDATE ON billing_price_lists
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE billing_price_list_entries (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    price_list_id   UUID            NOT NULL REFERENCES billing_price_lists(id) ON DELETE CASCADE,
    article_id      UUID,
    item_key        TEXT,
    description     TEXT,
    unit_price      DOUBLE PRECISION NOT NULL,
    min_quantity    DOUBLE PRECISION,
    unit            TEXT,
    valid_from      TIMESTAMPTZ,
    valid_to        TIMESTAMPTZ,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_billing_price_list_entries_list_article ON billing_price_list_entries(price_list_id, article_id);
CREATE INDEX idx_billing_price_list_entries_list_key ON billing_price_list_entries(price_list_id, item_key);

CREATE TRIGGER set_billing_price_list_entries_updated_at
  BEFORE UPDATE ON billing_price_list_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add FK constraint from existing crm_addresses.price_list_id column to billing_price_lists
ALTER TABLE crm_addresses
  ADD CONSTRAINT fk_crm_addresses_price_list
  FOREIGN KEY (price_list_id) REFERENCES billing_price_lists(id) ON DELETE SET NULL;
