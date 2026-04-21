-- Plan: 2026-04-21-serviceobjekte-stammdaten.md
-- Phase A: service_object_attachments table — per-object file attachments.

CREATE TABLE service_object_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    service_object_id UUID NOT NULL REFERENCES service_objects(id) ON DELETE CASCADE,

    filename VARCHAR(255) NOT NULL,
    storage_path TEXT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size_bytes INT NOT NULL,

    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    uploaded_by_id UUID
);

CREATE INDEX idx_service_object_attachments_tenant_object
    ON service_object_attachments(tenant_id, service_object_id);

ALTER TABLE service_object_attachments ENABLE ROW LEVEL SECURITY;
