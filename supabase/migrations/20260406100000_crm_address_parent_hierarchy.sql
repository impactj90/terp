-- Add parent_address_id self-reference to crm_addresses for Konzern/Filialen hierarchy
ALTER TABLE crm_addresses
  ADD COLUMN parent_address_id UUID REFERENCES crm_addresses(id) ON DELETE SET NULL;

-- Index for parent lookups and hierarchy queries
CREATE INDEX idx_crm_addresses_parent_address
  ON crm_addresses (tenant_id, parent_address_id);
