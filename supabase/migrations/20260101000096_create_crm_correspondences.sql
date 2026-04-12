-- CRM_02: Correspondence Protocol
CREATE TYPE crm_correspondence_direction AS ENUM ('INCOMING', 'OUTGOING', 'INTERNAL');

CREATE TABLE crm_correspondences (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID            NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    address_id      UUID            NOT NULL REFERENCES crm_addresses(id) ON DELETE CASCADE,
    direction       crm_correspondence_direction NOT NULL,
    type            TEXT            NOT NULL,
    date            TIMESTAMPTZ     NOT NULL,
    contact_id      UUID            REFERENCES crm_contacts(id) ON DELETE SET NULL,
    inquiry_id      UUID,
    from_user       TEXT,
    to_user         TEXT,
    subject         TEXT            NOT NULL,
    content         TEXT,
    attachments     JSONB,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    created_by_id   UUID
);

CREATE INDEX idx_crm_correspondences_tenant_address ON crm_correspondences(tenant_id, address_id);
CREATE INDEX idx_crm_correspondences_tenant_date ON crm_correspondences(tenant_id, date);
CREATE INDEX idx_crm_correspondences_tenant_inquiry ON crm_correspondences(tenant_id, inquiry_id);
