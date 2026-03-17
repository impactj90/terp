-- ORD_02: Billing Service Cases (Kundendienst)

CREATE TYPE billing_service_case_status AS ENUM (
  'OPEN',
  'IN_PROGRESS',
  'CLOSED',
  'INVOICED'
);

CREATE TABLE billing_service_cases (
    id                    UUID                           PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID                           NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    number                VARCHAR(50)                    NOT NULL,
    title                 VARCHAR(255)                   NOT NULL,
    address_id            UUID                           NOT NULL REFERENCES crm_addresses(id),
    contact_id            UUID                           REFERENCES crm_contacts(id) ON DELETE SET NULL,
    inquiry_id            UUID                           REFERENCES crm_inquiries(id) ON DELETE SET NULL,
    status                billing_service_case_status    NOT NULL DEFAULT 'OPEN',
    reported_at           TIMESTAMPTZ                    NOT NULL DEFAULT NOW(),
    customer_notified_cost BOOLEAN                       NOT NULL DEFAULT false,
    assigned_to_id        UUID                           REFERENCES employees(id) ON DELETE SET NULL,
    description           TEXT,
    closing_reason        TEXT,
    closed_at             TIMESTAMPTZ,
    closed_by_id          UUID,
    order_id              UUID                           REFERENCES orders(id) ON DELETE SET NULL,
    invoice_document_id   UUID                           REFERENCES billing_documents(id) ON DELETE SET NULL,
    created_at            TIMESTAMPTZ                    NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ                    NOT NULL DEFAULT NOW(),
    created_by_id         UUID
);

-- Unique constraint: number per tenant
ALTER TABLE billing_service_cases
  ADD CONSTRAINT uq_billing_service_cases_tenant_number UNIQUE (tenant_id, number);

-- Indexes
CREATE INDEX idx_billing_service_cases_tenant_status ON billing_service_cases(tenant_id, status);
CREATE INDEX idx_billing_service_cases_tenant_address ON billing_service_cases(tenant_id, address_id);
CREATE INDEX idx_billing_service_cases_tenant_assigned ON billing_service_cases(tenant_id, assigned_to_id);

-- Trigger for updated_at
CREATE TRIGGER set_billing_service_cases_updated_at
  BEFORE UPDATE ON billing_service_cases
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
