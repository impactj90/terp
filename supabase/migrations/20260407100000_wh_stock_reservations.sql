-- WH_10: Stock Reservations (Artikelreservierungen)

CREATE TABLE wh_stock_reservations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  article_id      UUID NOT NULL REFERENCES wh_articles(id),
  document_id     UUID NOT NULL,
  position_id     UUID NOT NULL,
  quantity        DOUBLE PRECISION NOT NULL,
  status          TEXT NOT NULL DEFAULT 'ACTIVE',
  released_at     TIMESTAMPTZ(6),
  released_by_id  UUID,
  release_reason  TEXT,
  created_at      TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  created_by_id   UUID
);

CREATE INDEX idx_wh_stock_reservations_tenant_article_status
  ON wh_stock_reservations(tenant_id, article_id, status);

CREATE INDEX idx_wh_stock_reservations_tenant_document
  ON wh_stock_reservations(tenant_id, document_id);

ALTER TABLE wh_stock_reservations ENABLE ROW LEVEL SECURITY;
