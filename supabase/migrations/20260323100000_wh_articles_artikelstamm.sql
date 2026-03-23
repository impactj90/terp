-- WH_01: Article master data (Artikelstamm)

-- 1. Article Groups (hierarchical tree)
CREATE TABLE wh_article_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES wh_article_groups(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wh_article_groups_tenant_parent ON wh_article_groups(tenant_id, parent_id);

-- 2. Articles
CREATE TABLE wh_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  number VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  description_alt TEXT,
  group_id UUID REFERENCES wh_article_groups(id) ON DELETE SET NULL,
  match_code VARCHAR(100),
  unit VARCHAR(20) NOT NULL DEFAULT 'Stk',
  vat_rate DOUBLE PRECISION NOT NULL DEFAULT 19.0,
  sell_price DOUBLE PRECISION,
  buy_price DOUBLE PRECISION,
  discount_group VARCHAR(50),
  order_type VARCHAR(50),
  stock_tracking BOOLEAN NOT NULL DEFAULT false,
  current_stock DOUBLE PRECISION NOT NULL DEFAULT 0,
  min_stock DOUBLE PRECISION,
  warehouse_location VARCHAR(255),
  images JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id UUID,
  CONSTRAINT uq_wh_articles_tenant_number UNIQUE(tenant_id, number)
);

CREATE INDEX idx_wh_articles_tenant_group ON wh_articles(tenant_id, group_id);
CREATE INDEX idx_wh_articles_tenant_match_code ON wh_articles(tenant_id, match_code);
CREATE INDEX idx_wh_articles_tenant_name ON wh_articles(tenant_id, name);
CREATE INDEX idx_wh_articles_tenant_active ON wh_articles(tenant_id, is_active);

-- 3. Article-Supplier junction
CREATE TABLE wh_article_suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID NOT NULL REFERENCES wh_articles(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES crm_addresses(id),
  supplier_article_number VARCHAR(100),
  supplier_description TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  order_unit VARCHAR(20),
  lead_time_days INT,
  default_order_qty DOUBLE PRECISION,
  buy_price DOUBLE PRECISION,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_wh_article_suppliers_article_supplier UNIQUE(article_id, supplier_id)
);

CREATE INDEX idx_wh_article_suppliers_supplier ON wh_article_suppliers(supplier_id);

-- 4. Bill of Materials
CREATE TABLE wh_bill_of_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_article_id UUID NOT NULL REFERENCES wh_articles(id) ON DELETE CASCADE,
  child_article_id UUID NOT NULL REFERENCES wh_articles(id) ON DELETE CASCADE,
  quantity DOUBLE PRECISION NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_wh_bom_parent_child UNIQUE(parent_article_id, child_article_id)
);
