-- Add optional order and cost center assignment to inbound invoices
ALTER TABLE inbound_invoices
  ADD COLUMN order_id UUID REFERENCES orders(id) ON DELETE SET NULL;

ALTER TABLE inbound_invoices
  ADD COLUMN cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL;

-- Tenant-scoped indexes for query performance
CREATE INDEX idx_inbound_invoices_order ON inbound_invoices(tenant_id, order_id)
  WHERE order_id IS NOT NULL;

CREATE INDEX idx_inbound_invoices_cost_center ON inbound_invoices(tenant_id, cost_center_id)
  WHERE cost_center_id IS NOT NULL;
