-- Plan: 2026-04-27-rechnungs-uebernahme-arbeitsschein-r1.md
-- Phase A: Add workReportId FKs for OrderBooking → WorkReport (selective billing
-- source) and BillingDocument → WorkReport (idempotency check).
-- Both FKs are nullable with ON DELETE SET NULL so historical references are
-- preserved when a work report or booking is removed.

-- OrderBooking.workReportId — selective billing source per booking.
ALTER TABLE order_bookings
    ADD COLUMN work_report_id UUID
        REFERENCES work_reports(id) ON DELETE SET NULL;

CREATE INDEX idx_order_bookings_tenant_workreport
    ON order_bookings(tenant_id, work_report_id);

-- BillingDocument.workReportId — idempotency check (Service-side, not DB).
-- Index used by both findFirst() lookups in preview and generate.
ALTER TABLE billing_documents
    ADD COLUMN work_report_id UUID
        REFERENCES work_reports(id) ON DELETE SET NULL;

CREATE INDEX idx_billing_documents_tenant_workreport
    ON billing_documents(tenant_id, work_report_id);
