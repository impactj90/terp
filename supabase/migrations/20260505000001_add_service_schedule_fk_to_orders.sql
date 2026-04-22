-- Plan: 2026-04-22-serviceobjekte-wartungsintervalle.md
-- Phase A: nullable FK orders → service_schedules for plan traceability.

ALTER TABLE orders
    ADD COLUMN service_schedule_id UUID
        REFERENCES service_schedules(id) ON DELETE SET NULL;

CREATE INDEX idx_orders_tenant_service_schedule
    ON orders(tenant_id, service_schedule_id);
