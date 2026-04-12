-- WH_05: Add machine_id column for equipment/machine withdrawal references
ALTER TABLE wh_stock_movements ADD COLUMN machine_id TEXT;

-- Index for machine_id queries (tenant-scoped)
CREATE INDEX idx_wh_stock_movements_tenant_machine ON wh_stock_movements (tenant_id, machine_id) WHERE machine_id IS NOT NULL;
