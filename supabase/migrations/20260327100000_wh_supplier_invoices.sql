-- WH_06: Supplier invoices and payments
-- Creates wh_supplier_invoices and wh_supplier_payments tables.

-- Create enum
CREATE TYPE wh_supplier_invoice_status AS ENUM ('OPEN', 'PARTIAL', 'PAID', 'CANCELLED');

-- Create wh_supplier_invoices table
CREATE TABLE wh_supplier_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  number TEXT NOT NULL,
  supplier_id UUID NOT NULL REFERENCES crm_addresses(id),
  purchase_order_id UUID REFERENCES wh_purchase_orders(id) ON DELETE SET NULL,
  status wh_supplier_invoice_status NOT NULL DEFAULT 'OPEN',
  invoice_date TIMESTAMPTZ(6) NOT NULL,
  received_date TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  total_net DOUBLE PRECISION NOT NULL,
  total_vat DOUBLE PRECISION NOT NULL,
  total_gross DOUBLE PRECISION NOT NULL,

  -- Payment terms
  payment_term_days INTEGER,
  due_date TIMESTAMPTZ(6),
  discount_percent DOUBLE PRECISION,
  discount_days INTEGER,
  discount_percent_2 DOUBLE PRECISION,
  discount_days_2 INTEGER,

  notes TEXT,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  created_by_id UUID
);

-- Create indexes
CREATE INDEX idx_wh_supplier_invoices_tenant_supplier ON wh_supplier_invoices(tenant_id, supplier_id);
CREATE INDEX idx_wh_supplier_invoices_tenant_status ON wh_supplier_invoices(tenant_id, status);
CREATE INDEX idx_wh_supplier_invoices_tenant_due_date ON wh_supplier_invoices(tenant_id, due_date);

-- Create wh_supplier_payments table
CREATE TABLE wh_supplier_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES wh_supplier_invoices(id) ON DELETE CASCADE,
  date TIMESTAMPTZ(6) NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  type billing_payment_type NOT NULL,
  is_discount BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  status billing_payment_status NOT NULL DEFAULT 'ACTIVE',
  cancelled_at TIMESTAMPTZ(6),
  cancelled_by_id UUID,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  created_by_id UUID
);

-- Create indexes
CREATE INDEX idx_wh_supplier_payments_invoice ON wh_supplier_payments(invoice_id);
CREATE INDEX idx_wh_supplier_payments_tenant ON wh_supplier_payments(tenant_id);
