-- Add type column to billing_price_lists to distinguish sales vs purchase price lists
ALTER TABLE billing_price_lists
  ADD COLUMN type VARCHAR(20) NOT NULL DEFAULT 'sales';

-- All existing price lists are sales price lists (default 'sales' handles this)

-- Index for type-based queries
CREATE INDEX idx_billing_price_lists_tenant_type
  ON billing_price_lists (tenant_id, type);

-- Unique partial index: only one default per type per tenant
CREATE UNIQUE INDEX uq_billing_price_lists_tenant_type_default
  ON billing_price_lists (tenant_id, type) WHERE is_default = true;

-- Add purchase_price_list_id to crm_addresses
ALTER TABLE crm_addresses
  ADD COLUMN purchase_price_list_id UUID REFERENCES billing_price_lists(id);

-- Rename existing price_list_id to sales_price_list_id
ALTER TABLE crm_addresses
  RENAME COLUMN price_list_id TO sales_price_list_id;

-- Index for purchase price list lookups
CREATE INDEX idx_crm_addresses_purchase_price_list
  ON crm_addresses (tenant_id, purchase_price_list_id);
