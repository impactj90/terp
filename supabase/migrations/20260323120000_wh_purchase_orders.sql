-- WH_03: Purchase Orders (Einkauf / Bestellungen)

-- 1. Create enums
CREATE TYPE wh_purchase_order_status AS ENUM (
  'DRAFT',
  'ORDERED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CANCELLED'
);

CREATE TYPE wh_purchase_order_method AS ENUM (
  'PHONE',
  'EMAIL',
  'FAX',
  'PRINT'
);

-- 2. Create purchase orders table
CREATE TABLE wh_purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  number VARCHAR(50) NOT NULL,
  supplier_id UUID NOT NULL REFERENCES crm_addresses(id),
  contact_id UUID REFERENCES crm_contacts(id) ON DELETE SET NULL,
  inquiry_id UUID REFERENCES crm_inquiries(id) ON DELETE SET NULL,
  status wh_purchase_order_status NOT NULL DEFAULT 'DRAFT',
  order_date TIMESTAMPTZ(6),
  requested_delivery TIMESTAMPTZ(6),
  confirmed_delivery TIMESTAMPTZ(6),
  order_method wh_purchase_order_method,
  order_method_note TEXT,
  notes TEXT,
  subtotal_net DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_gross DOUBLE PRECISION NOT NULL DEFAULT 0,
  printed_at TIMESTAMPTZ(6),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  created_by_id UUID,
  CONSTRAINT uq_wh_purchase_orders_tenant_number UNIQUE(tenant_id, number)
);

-- 3. Create purchase order positions table
CREATE TABLE wh_purchase_order_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES wh_purchase_orders(id) ON DELETE CASCADE,
  sort_order INT NOT NULL,
  article_id UUID NOT NULL REFERENCES wh_articles(id),
  supplier_article_number VARCHAR(100),
  description TEXT,
  quantity DOUBLE PRECISION NOT NULL,
  received_quantity DOUBLE PRECISION NOT NULL DEFAULT 0,
  unit VARCHAR(20),
  unit_price DOUBLE PRECISION,
  flat_costs DOUBLE PRECISION,
  total_price DOUBLE PRECISION,
  requested_delivery TIMESTAMPTZ(6),
  confirmed_delivery TIMESTAMPTZ(6),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

-- 4. Create indexes
CREATE INDEX idx_wh_purchase_orders_tenant_status ON wh_purchase_orders(tenant_id, status);
CREATE INDEX idx_wh_purchase_orders_tenant_supplier ON wh_purchase_orders(tenant_id, supplier_id);
CREATE INDEX idx_wh_purchase_orders_tenant_delivery ON wh_purchase_orders(tenant_id, requested_delivery);
CREATE INDEX idx_wh_purchase_order_positions_order_sort ON wh_purchase_order_positions(purchase_order_id, sort_order);
