-- Rechnungsausgangsbuch (Outgoing Invoice Book) — permission seed.
--
-- Two new permissions (scoped under resource "outgoing_invoice_book"):
--   outgoing_invoice_book.view   — list/read the StB report (table + filter)
--   outgoing_invoice_book.export — download PDF/CSV of the report
--
-- Permission UUIDs are deterministic (UUIDv5 with namespace
-- f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1), matching the TS catalog:
--   outgoing_invoice_book.view   = 088c802e-ebd7-5927-8bf3-9972f629b54f
--   outgoing_invoice_book.export = 2fc044e1-35d6-5ede-a790-f9ee31d14773
--
-- Grants (system-level groups, tenant_id IS NULL):
--   ADMIN is_admin=true → bypasses checks, not updated.
--   BUCHHALTUNG → view + export (primary consumer, steuerberater workflow).
--   VERTRIEB    → view only (can see report, cannot hand out to StB).
--
-- Pattern B (dedup-safe): jsonb_agg(DISTINCT val) guarantees no duplicates
-- when the migration is re-run against an existing database.

UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"088c802e-ebd7-5927-8bf3-9972f629b54f"'::jsonb  -- outgoing_invoice_book.view
    UNION ALL SELECT '"2fc044e1-35d6-5ede-a790-f9ee31d14773"'::jsonb  -- outgoing_invoice_book.export
  ) sub
) WHERE code = 'BUCHHALTUNG' AND tenant_id IS NULL;

UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"088c802e-ebd7-5927-8bf3-9972f629b54f"'::jsonb  -- outgoing_invoice_book.view
  ) sub
) WHERE code = 'VERTRIEB' AND tenant_id IS NULL;
