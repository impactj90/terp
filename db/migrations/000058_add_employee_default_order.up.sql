-- =============================================================
-- Add default order and default activity to employees
-- ZMI personnel master: Stammauftrag and Stammtaetigkeit
-- Used by target_with_order no-booking behavior
-- =============================================================
ALTER TABLE employees
    ADD COLUMN default_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    ADD COLUMN default_activity_id UUID REFERENCES activities(id) ON DELETE SET NULL;

CREATE INDEX idx_employees_default_order ON employees(default_order_id);
CREATE INDEX idx_employees_default_activity ON employees(default_activity_id);

COMMENT ON COLUMN employees.default_order_id IS 'Stammauftrag: Default order for automatic order booking when no bookings exist.';
COMMENT ON COLUMN employees.default_activity_id IS 'Stammtaetigkeit: Default activity for automatic order booking.';
