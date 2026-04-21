-- Plan: 2026-04-21-serviceobjekte-stammdaten.md
-- Phase A: service_objects table — master data for service objects with
-- self-referential hierarchy and mandatory customer link.

CREATE TABLE service_objects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    number VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,

    kind service_object_kind NOT NULL DEFAULT 'EQUIPMENT',
    parent_id UUID REFERENCES service_objects(id) ON DELETE SET NULL,

    customer_address_id UUID NOT NULL REFERENCES crm_addresses(id),

    internal_number VARCHAR(100),
    manufacturer VARCHAR(255),
    model VARCHAR(255),
    serial_number VARCHAR(255),
    year_built INT,
    in_service_since DATE,

    status service_object_status NOT NULL DEFAULT 'OPERATIONAL',
    is_active BOOLEAN NOT NULL DEFAULT true,

    qr_code_payload TEXT,
    custom_fields JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by_id UUID,

    CONSTRAINT uq_service_objects_tenant_number UNIQUE (tenant_id, number)
);

CREATE INDEX idx_service_objects_tenant ON service_objects(tenant_id);
CREATE INDEX idx_service_objects_tenant_customer ON service_objects(tenant_id, customer_address_id);
CREATE INDEX idx_service_objects_tenant_parent ON service_objects(tenant_id, parent_id);
CREATE INDEX idx_service_objects_tenant_active ON service_objects(tenant_id, is_active);
CREATE INDEX idx_service_objects_tenant_kind ON service_objects(tenant_id, kind);

CREATE TRIGGER update_service_objects_updated_at
    BEFORE UPDATE ON service_objects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE service_objects ENABLE ROW LEVEL SECURITY;
