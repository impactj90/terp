-- WH_13: Article images table
CREATE TABLE wh_article_images (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id    UUID NOT NULL REFERENCES wh_articles(id) ON DELETE CASCADE,
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  filename      TEXT NOT NULL,
  storage_path  TEXT NOT NULL,
  thumbnail_path TEXT,
  mime_type     TEXT NOT NULL,
  size_bytes    INT NOT NULL,
  sort_order    INT NOT NULL DEFAULT 0,
  is_primary    BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id UUID
);

CREATE INDEX idx_wh_article_images_article_sort ON wh_article_images (article_id, sort_order);
CREATE INDEX idx_wh_article_images_tenant ON wh_article_images (tenant_id);
