-- =============================================================
-- Create stocktake (Inventur) tables
-- Tables: wh_stocktakes, wh_stocktake_positions
-- =============================================================

-- Stocktake status enum
CREATE TYPE wh_stocktake_status AS ENUM ('DRAFT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- wh_stocktakes: Main stocktake session header
CREATE TABLE wh_stocktakes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  number VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status wh_stocktake_status NOT NULL DEFAULT 'DRAFT',
  reference_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  scope VARCHAR(50),
  scope_filter JSONB,
  notes TEXT,
  printed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id UUID,
  completed_by_id UUID,
  UNIQUE(tenant_id, number)
);

CREATE INDEX idx_wh_stocktakes_tenant_status ON wh_stocktakes(tenant_id, status);
CREATE INDEX idx_wh_stocktakes_tenant_date ON wh_stocktakes(tenant_id, reference_date DESC);

-- wh_stocktake_positions: Per-article expected/counted quantities
CREATE TABLE wh_stocktake_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stocktake_id UUID NOT NULL REFERENCES wh_stocktakes(id) ON DELETE CASCADE,
  article_id UUID NOT NULL,
  article_number VARCHAR(50) NOT NULL,
  article_name VARCHAR(255) NOT NULL,
  unit VARCHAR(20) NOT NULL,
  warehouse_location VARCHAR(255),
  expected_quantity FLOAT NOT NULL,
  counted_quantity FLOAT,
  difference FLOAT,
  value_difference FLOAT,
  buy_price FLOAT,
  note TEXT,
  reviewed BOOLEAN NOT NULL DEFAULT false,
  skipped BOOLEAN NOT NULL DEFAULT false,
  skip_reason TEXT,
  counted_by_id UUID,
  counted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(stocktake_id, article_id)
);

CREATE INDEX idx_wh_stocktake_positions_stocktake ON wh_stocktake_positions(stocktake_id);
CREATE INDEX idx_wh_stocktake_positions_article ON wh_stocktake_positions(article_id);
