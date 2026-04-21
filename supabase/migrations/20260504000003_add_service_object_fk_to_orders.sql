-- Plan: 2026-04-21-serviceobjekte-stammdaten.md
-- Phase A: Optional FK on orders referencing service_objects.

ALTER TABLE orders
    ADD COLUMN service_object_id UUID
        REFERENCES service_objects(id) ON DELETE SET NULL;

CREATE INDEX idx_orders_tenant_service_object
    ON orders(tenant_id, service_object_id)
    WHERE service_object_id IS NOT NULL;
