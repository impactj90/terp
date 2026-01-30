-- =============================================================
-- Create import_batches table for tracking terminal import batches
-- ZMI-TICKET-027: Terminal Integration and Raw Booking Ingest
-- =============================================================

CREATE TABLE import_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    batch_reference VARCHAR(255) NOT NULL,
    source VARCHAR(50) NOT NULL DEFAULT 'terminal',
    terminal_id VARCHAR(100),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    records_total INT NOT NULL DEFAULT 0,
    records_imported INT NOT NULL DEFAULT 0,
    records_failed INT NOT NULL DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_import_batches_tenant ON import_batches(tenant_id);
CREATE INDEX idx_import_batches_reference ON import_batches(tenant_id, batch_reference);
CREATE UNIQUE INDEX idx_import_batches_unique_ref ON import_batches(tenant_id, batch_reference);
CREATE INDEX idx_import_batches_status ON import_batches(status);

CREATE TRIGGER update_import_batches_updated_at
    BEFORE UPDATE ON import_batches
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE import_batches IS 'Tracks terminal import batches for idempotent processing (ZMI-TICKET-027).';
COMMENT ON COLUMN import_batches.batch_reference IS 'Unique batch identifier per tenant for idempotent imports.';
COMMENT ON COLUMN import_batches.status IS 'Batch status: pending, processing, completed, failed.';
