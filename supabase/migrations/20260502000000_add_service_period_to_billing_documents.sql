-- §14 UStG: Leistungszeitraum auf BillingDocument
--
-- Adds two optional date columns to billing_documents for invoices and
-- credit notes. §14 Abs. 4 Nr. 6 UStG requires either a Leistungstag
-- (delivery_date) or a Leistungszeitraum on invoices. Previously only
-- delivery_date was available, which is semantically "Liefertermin" and
-- does not cover pure service invoices or recurring billing periods.
--
-- Purely additive — no backfill. Existing rows keep NULL for both columns.

ALTER TABLE billing_documents
  ADD COLUMN service_period_from DATE,
  ADD COLUMN service_period_to   DATE;

COMMENT ON COLUMN billing_documents.service_period_from IS
  '§14 UStG: Start des Leistungszeitraums (optional, nur INVOICE/CREDIT_NOTE)';
COMMENT ON COLUMN billing_documents.service_period_to IS
  '§14 UStG: Ende des Leistungszeitraums (optional, nur INVOICE/CREDIT_NOTE)';
