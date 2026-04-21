-- Plan: 2026-04-21-serviceobjekte-stammdaten.md
-- Phase A: Optional FK on wh_stock_movements referencing service_objects.
-- Parallel path to the existing machine_id freetext column. machine_id stays.

ALTER TABLE wh_stock_movements
    ADD COLUMN service_object_id UUID
        REFERENCES service_objects(id) ON DELETE SET NULL;

CREATE INDEX idx_wh_stock_movements_tenant_service_object
    ON wh_stock_movements(tenant_id, service_object_id)
    WHERE service_object_id IS NOT NULL;
