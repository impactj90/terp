-- Create crm_correspondence_attachments table
CREATE TABLE crm_correspondence_attachments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correspondence_id UUID NOT NULL REFERENCES crm_correspondences(id) ON DELETE CASCADE,
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  filename          TEXT NOT NULL,
  storage_path      TEXT NOT NULL,
  mime_type         TEXT NOT NULL,
  size_bytes        INT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id     UUID
);

CREATE INDEX idx_crm_corr_attachments_correspondence ON crm_correspondence_attachments (correspondence_id);
CREATE INDEX idx_crm_corr_attachments_tenant ON crm_correspondence_attachments (tenant_id);

-- Drop legacy JSON attachments column from crm_correspondences
ALTER TABLE crm_correspondences DROP COLUMN IF EXISTS attachments;
