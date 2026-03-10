-- =============================================================
-- Create orders table
-- ZMI Auftrag module: Orders/projects for time tracking
-- =============================================================
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('planned', 'active', 'completed', 'cancelled')),
    customer VARCHAR(255),
    cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
    billing_rate_per_hour DECIMAL(10,2),
    valid_from DATE,
    valid_to DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_orders_tenant ON orders(tenant_id);
CREATE INDEX idx_orders_tenant_active ON orders(tenant_id, is_active);
CREATE INDEX idx_orders_tenant_status ON orders(tenant_id, status);
CREATE INDEX idx_orders_cost_center ON orders(cost_center_id);

CREATE TRIGGER update_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE orders IS 'Orders/projects (Auftraege) for order-based time tracking.';
COMMENT ON COLUMN orders.status IS 'Order status: planned, active, completed, cancelled.';
COMMENT ON COLUMN orders.billing_rate_per_hour IS 'Billing rate per hour for this order (for reporting).';
