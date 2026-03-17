-- CRM_03: Inquiry / Vorgang Management

CREATE TYPE crm_inquiry_status AS ENUM ('OPEN', 'IN_PROGRESS', 'CLOSED', 'CANCELLED');

CREATE TABLE crm_inquiries (
    id               UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID              NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    number           VARCHAR(50)       NOT NULL,
    title            VARCHAR(255)      NOT NULL,
    address_id       UUID              NOT NULL REFERENCES crm_addresses(id) ON DELETE CASCADE,
    contact_id       UUID              REFERENCES crm_contacts(id) ON DELETE SET NULL,
    status           crm_inquiry_status NOT NULL DEFAULT 'OPEN',
    effort           VARCHAR(20),
    credit_rating    VARCHAR(50),
    notes            TEXT,
    order_id         UUID              REFERENCES orders(id) ON DELETE SET NULL,
    closed_at        TIMESTAMPTZ,
    closed_by_id     UUID,
    closing_reason   TEXT,
    closing_remarks  TEXT,
    created_at       TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    created_by_id    UUID,

    CONSTRAINT uq_crm_inquiries_tenant_number UNIQUE (tenant_id, number)
);

CREATE INDEX idx_crm_inquiries_tenant_status ON crm_inquiries(tenant_id, status);
CREATE INDEX idx_crm_inquiries_tenant_address ON crm_inquiries(tenant_id, address_id);
CREATE INDEX idx_crm_inquiries_tenant_order ON crm_inquiries(tenant_id, order_id);

-- Add FK from crm_correspondences.inquiry_id to crm_inquiries.id
ALTER TABLE crm_correspondences
  ADD CONSTRAINT fk_crm_correspondences_inquiry
  FOREIGN KEY (inquiry_id) REFERENCES crm_inquiries(id) ON DELETE SET NULL;
