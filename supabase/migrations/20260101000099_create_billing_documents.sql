-- ORD_01: Billing Documents (Belegkette)

CREATE TYPE billing_document_type AS ENUM (
  'OFFER',
  'ORDER_CONFIRMATION',
  'DELIVERY_NOTE',
  'SERVICE_NOTE',
  'RETURN_DELIVERY',
  'INVOICE',
  'CREDIT_NOTE'
);

CREATE TYPE billing_document_status AS ENUM (
  'DRAFT',
  'PRINTED',
  'PARTIALLY_FORWARDED',
  'FORWARDED',
  'CANCELLED'
);

CREATE TYPE billing_position_type AS ENUM (
  'ARTICLE',
  'FREE',
  'TEXT',
  'PAGE_BREAK',
  'SUBTOTAL'
);

CREATE TYPE billing_price_type AS ENUM (
  'STANDARD',
  'ESTIMATE',
  'BY_EFFORT'
);

CREATE TABLE billing_documents (
    id                    UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID                    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    number                VARCHAR(50)             NOT NULL,
    type                  billing_document_type   NOT NULL,
    status                billing_document_status NOT NULL DEFAULT 'DRAFT',

    -- Customer / Address
    address_id            UUID                    NOT NULL REFERENCES crm_addresses(id),
    contact_id            UUID                    REFERENCES crm_contacts(id) ON DELETE SET NULL,
    delivery_address_id   UUID                    REFERENCES crm_addresses(id) ON DELETE SET NULL,
    invoice_address_id    UUID                    REFERENCES crm_addresses(id) ON DELETE SET NULL,

    -- Links
    inquiry_id            UUID                    REFERENCES crm_inquiries(id) ON DELETE SET NULL,
    order_id              UUID                    REFERENCES orders(id) ON DELETE SET NULL,
    parent_document_id    UUID                    REFERENCES billing_documents(id) ON DELETE SET NULL,

    -- Dates
    order_date            TIMESTAMPTZ,
    document_date         TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
    delivery_date         TIMESTAMPTZ,

    -- Terms & Conditions
    delivery_type         TEXT,
    delivery_terms        TEXT,
    payment_term_days     INTEGER,
    discount_percent      DOUBLE PRECISION,
    discount_days         INTEGER,
    discount_percent_2    DOUBLE PRECISION,
    discount_days_2       INTEGER,
    shipping_cost_net     DOUBLE PRECISION,
    shipping_cost_vat_rate DOUBLE PRECISION,

    -- Totals (computed, stored)
    subtotal_net          DOUBLE PRECISION        NOT NULL DEFAULT 0,
    total_vat             DOUBLE PRECISION        NOT NULL DEFAULT 0,
    total_gross           DOUBLE PRECISION        NOT NULL DEFAULT 0,

    -- Notes
    notes                 TEXT,
    internal_notes        TEXT,

    -- Print state
    printed_at            TIMESTAMPTZ,
    printed_by_id         UUID,

    -- Audit
    created_at            TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
    created_by_id         UUID
);

-- Unique constraint: number per tenant
ALTER TABLE billing_documents
  ADD CONSTRAINT uq_billing_documents_tenant_number UNIQUE (tenant_id, number);

-- Indexes
CREATE INDEX idx_billing_documents_tenant_type ON billing_documents(tenant_id, type);
CREATE INDEX idx_billing_documents_tenant_status ON billing_documents(tenant_id, status);
CREATE INDEX idx_billing_documents_tenant_address ON billing_documents(tenant_id, address_id);
CREATE INDEX idx_billing_documents_tenant_inquiry ON billing_documents(tenant_id, inquiry_id);
CREATE INDEX idx_billing_documents_tenant_parent ON billing_documents(tenant_id, parent_document_id);
CREATE INDEX idx_billing_documents_tenant_date ON billing_documents(tenant_id, document_date);

-- Trigger for updated_at
CREATE TRIGGER set_billing_documents_updated_at
  BEFORE UPDATE ON billing_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Positions table
CREATE TABLE billing_document_positions (
    id                UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id       UUID                  NOT NULL REFERENCES billing_documents(id) ON DELETE CASCADE,
    sort_order        INTEGER               NOT NULL,
    type              billing_position_type NOT NULL DEFAULT 'FREE',
    article_id        UUID,
    article_number    VARCHAR(50),
    description       TEXT,
    quantity          DOUBLE PRECISION,
    unit              VARCHAR(20),
    unit_price        DOUBLE PRECISION,
    flat_costs        DOUBLE PRECISION,
    total_price       DOUBLE PRECISION,
    price_type        billing_price_type,
    vat_rate          DOUBLE PRECISION,
    delivery_date     TIMESTAMPTZ,
    confirmed_date    TIMESTAMPTZ,
    created_at        TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ           NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_billing_positions_document_sort ON billing_document_positions(document_id, sort_order);

-- Trigger for updated_at
CREATE TRIGGER set_billing_document_positions_updated_at
  BEFORE UPDATE ON billing_document_positions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
