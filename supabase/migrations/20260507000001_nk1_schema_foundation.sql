-- ─────────────────────────────────────────────────────────────────────────────
-- NK-1 Schema Foundation (atomic migration for Phase 1)
-- See: thoughts/shared/plans/2026-04-29-nk-1-einzelauftrag-nachkalkulation.md
-- ─────────────────────────────────────────────────────────────────────────────

-- ───────────────────────────────────────────────────────────────────
-- Phase 1.1: Neue Stammdaten-Tabellen
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE wage_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  internal_hourly_rate DECIMAL(10, 2),
  billing_hourly_rate DECIMAL(10, 2),
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX wage_groups_tenant_id_code_key ON wage_groups(tenant_id, code);
CREATE INDEX idx_wage_groups_tenant_active ON wage_groups(tenant_id, is_active);

CREATE TABLE order_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX order_types_tenant_id_code_key ON order_types(tenant_id, code);
CREATE INDEX idx_order_types_tenant_active ON order_types(tenant_id, is_active);

CREATE TABLE nk_threshold_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_type_id UUID REFERENCES order_types(id) ON DELETE CASCADE,
  margin_amber_from_percent DECIMAL(5, 2) NOT NULL,
  margin_red_from_percent DECIMAL(5, 2) NOT NULL,
  productivity_amber_from_percent DECIMAL(5, 2) NOT NULL,
  productivity_red_from_percent DECIMAL(5, 2) NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);
-- Pro Tenant + Auftragstyp einmal (Default = order_type_id IS NULL).
-- COALESCE-Trick erlaubt Unique auch wenn order_type_id NULL ist.
CREATE UNIQUE INDEX nk_threshold_configs_tenant_order_type_key
  ON nk_threshold_configs(tenant_id, COALESCE(order_type_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX idx_nk_threshold_configs_tenant ON nk_threshold_configs(tenant_id);

CREATE TABLE order_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  version INT NOT NULL DEFAULT 1,
  valid_from DATE NOT NULL,
  valid_to DATE,
  target_hours DECIMAL(10, 2),
  target_material_cost DECIMAL(12, 2),
  target_travel_minutes INT,
  target_external_cost DECIMAL(12, 2),
  target_revenue DECIMAL(12, 2),
  target_unit_items JSONB,
  change_reason VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  created_by UUID
);
CREATE INDEX idx_order_targets_tenant_order_valid
  ON order_targets(tenant_id, order_id, valid_to);
CREATE INDEX idx_order_targets_order_valid
  ON order_targets(order_id, valid_from, valid_to);

-- Enforce: pro Order höchstens eine offene Version (valid_to IS NULL)
CREATE UNIQUE INDEX idx_order_targets_active_per_order
  ON order_targets(order_id) WHERE valid_to IS NULL;

-- ───────────────────────────────────────────────────────────────────
-- Phase 1.2: Spalten-Erweiterungen bestehender Tabellen
-- ───────────────────────────────────────────────────────────────────

ALTER TABLE orders ADD COLUMN order_type_id UUID
  REFERENCES order_types(id) ON DELETE SET NULL;
CREATE INDEX idx_orders_tenant_order_type ON orders(tenant_id, order_type_id);

-- OrderBooking: Snapshot-Felder + PER_UNIT-Mengen-Spalte (Decision 14, Decision 26)
ALTER TABLE order_bookings ADD COLUMN hourly_rate_at_booking DECIMAL(10, 2);
ALTER TABLE order_bookings ADD COLUMN hourly_rate_source_at_booking VARCHAR(20);
ALTER TABLE order_bookings ADD COLUMN quantity DECIMAL(10, 2);

-- WorkReport: Travel-Snapshot (Decision 27)
ALTER TABLE work_reports ADD COLUMN travel_rate_at_sign DECIMAL(10, 2);
ALTER TABLE work_reports ADD COLUMN travel_rate_source_at_sign VARCHAR(20);

-- Employee: WageGroup-FK (Decision 2)
ALTER TABLE employees ADD COLUMN wage_group_id UUID
  REFERENCES wage_groups(id) ON DELETE SET NULL;
CREATE INDEX idx_employees_tenant_wage_group ON employees(tenant_id, wage_group_id);

-- Activity: Pricing-Erweiterung (Decision 7, Decision 33)
CREATE TYPE activity_pricing_type AS ENUM ('HOURLY', 'FLAT_RATE', 'PER_UNIT');
ALTER TABLE activities ADD COLUMN pricing_type activity_pricing_type
  NOT NULL DEFAULT 'HOURLY';
ALTER TABLE activities ADD COLUMN flat_rate DECIMAL(10, 2);
ALTER TABLE activities ADD COLUMN hourly_rate DECIMAL(10, 2);
ALTER TABLE activities ADD COLUMN unit VARCHAR(20);
ALTER TABLE activities ADD COLUMN calculated_hour_equivalent DECIMAL(8, 2);

-- WhStockMovement: Snapshot + FK to InboundInvoiceLineItem (Decision 4, Decision 5)
ALTER TABLE wh_stock_movements ADD COLUMN unit_cost_at_movement DECIMAL(12, 4);
ALTER TABLE wh_stock_movements ADD COLUMN inbound_invoice_line_item_id UUID;
-- FK constraint added below after inbound_invoice_line_items has its tenantId backfilled
CREATE INDEX idx_wh_stock_movements_tenant_order
  ON wh_stock_movements(tenant_id, order_id);
CREATE INDEX idx_wh_stock_movements_inbound_li
  ON wh_stock_movements(inbound_invoice_line_item_id);

-- InboundInvoiceLineItem: tenantId + orderId + costCenterId (Decision 5)
ALTER TABLE inbound_invoice_line_items ADD COLUMN tenant_id UUID;
ALTER TABLE inbound_invoice_line_items ADD COLUMN order_id UUID
  REFERENCES orders(id) ON DELETE SET NULL;
ALTER TABLE inbound_invoice_line_items ADD COLUMN cost_center_id UUID
  REFERENCES cost_centers(id) ON DELETE SET NULL;

-- ───────────────────────────────────────────────────────────────────
-- Phase 1.3: Bestandsdaten-Backfill
-- ───────────────────────────────────────────────────────────────────

-- 1.3a: InboundInvoiceLineItem.tenantId aus InboundInvoice.tenantId
UPDATE inbound_invoice_line_items li
SET tenant_id = ii.tenant_id
FROM inbound_invoices ii
WHERE li.invoice_id = ii.id;

-- jetzt NOT NULL erzwingen + FK
ALTER TABLE inbound_invoice_line_items ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE inbound_invoice_line_items
  ADD CONSTRAINT inbound_invoice_line_items_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

CREATE INDEX idx_inbound_li_invoice_order
  ON inbound_invoice_line_items(invoice_id, order_id);
CREATE INDEX idx_inbound_li_invoice_cost_center
  ON inbound_invoice_line_items(invoice_id, cost_center_id);
CREATE INDEX idx_inbound_li_tenant
  ON inbound_invoice_line_items(tenant_id);

-- 1.3b: Add the WhStockMovement -> InboundInvoiceLineItem FK now that the
-- referenced table is settled.
ALTER TABLE wh_stock_movements
  ADD CONSTRAINT wh_stock_movements_inbound_invoice_line_item_id_fkey
  FOREIGN KEY (inbound_invoice_line_item_id)
  REFERENCES inbound_invoice_line_items(id) ON DELETE SET NULL;

-- 1.3c: InboundInvoiceLineItem.orderId aus InboundInvoice.orderId (1:1)
UPDATE inbound_invoice_line_items li
SET order_id = ii.order_id, cost_center_id = ii.cost_center_id
FROM inbound_invoices ii
WHERE li.invoice_id = ii.id
  AND ii.order_id IS NOT NULL;

-- 1.3d: Activity.pricing_type ist bereits via DEFAULT 'HOURLY' gesetzt — kein
--       expliziter UPDATE nötig.
