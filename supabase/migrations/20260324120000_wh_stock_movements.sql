-- WH_04: Stock Movements (Wareneingang / Lagerbewegungen)

-- Enum
CREATE TYPE wh_stock_movement_type AS ENUM (
  'GOODS_RECEIPT',
  'WITHDRAWAL',
  'ADJUSTMENT',
  'INVENTORY',
  'RETURN'
);

-- Table
CREATE TABLE wh_stock_movements (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  article_id                 UUID NOT NULL REFERENCES wh_articles(id),
  type                       wh_stock_movement_type NOT NULL,
  quantity                   DOUBLE PRECISION NOT NULL,
  previous_stock             DOUBLE PRECISION NOT NULL,
  new_stock                  DOUBLE PRECISION NOT NULL,
  date                       TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  purchase_order_id          UUID REFERENCES wh_purchase_orders(id) ON DELETE SET NULL,
  purchase_order_position_id UUID,
  document_id                UUID,
  order_id                   UUID,
  inventory_session_id       UUID,

  reason                     TEXT,
  notes                      TEXT,
  created_by_id              UUID,
  created_at                 TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_wh_stock_movements_tenant_article ON wh_stock_movements(tenant_id, article_id);
CREATE INDEX idx_wh_stock_movements_tenant_type ON wh_stock_movements(tenant_id, type);
CREATE INDEX idx_wh_stock_movements_tenant_date ON wh_stock_movements(tenant_id, date);
CREATE INDEX idx_wh_stock_movements_tenant_po ON wh_stock_movements(tenant_id, purchase_order_id);

-- RLS
ALTER TABLE wh_stock_movements ENABLE ROW LEVEL SECURITY;
