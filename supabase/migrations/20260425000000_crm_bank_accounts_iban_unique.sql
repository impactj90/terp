-- =============================================================
-- CAMT-Preflight Phase 1: IBAN Unique + Index auf crm_bank_accounts
-- Plan: thoughts/shared/plans/2026-04-14-camt-preflight-items.md
--
-- Fügt einen Composite-Index und eine Composite-Unique-Constraint
-- auf (tenant_id, iban) hinzu. Vorgelagerter Dedup-Schritt entfernt
-- gleiche-Adresse-Duplikate (newest-wins); Cross-Adresse-Duplikate
-- müssen vorher manuell aufgeräumt werden — die Migration bricht
-- in diesem Fall mit einem RAISE EXCEPTION ab.
--
-- Research: thoughts/shared/research/2026-04-13-camt053-import.md
--   Abschnitt 2.5 + 5.6
-- =============================================================

-- Schritt 1: Pre-Check — Cross-Adresse-Duplikate sind ein Abbruchkriterium.
DO $$
DECLARE
  cross_addr_dupes INT;
BEGIN
  SELECT COUNT(*)
    INTO cross_addr_dupes
    FROM (
      SELECT tenant_id, iban
        FROM crm_bank_accounts
       GROUP BY tenant_id, iban
      HAVING COUNT(DISTINCT address_id) > 1
    ) AS sub;

  IF cross_addr_dupes > 0 THEN
    RAISE EXCEPTION
      'crm_bank_accounts: % (tenant_id, iban)-Gruppen haben Duplikate auf unterschiedlichen address_ids. Diese müssen vor dieser Migration manuell bereinigt werden. Siehe thoughts/shared/plans/2026-04-14-camt-preflight-items.md Phase 1 Step 0.',
      cross_addr_dupes;
  END IF;
END $$;

-- Schritt 2: Same-Address-Duplikate löschen (newest wins).
-- Keine FKs referenzieren crm_bank_accounts.id → reiner DELETE.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY tenant_id, iban, address_id
           ORDER BY created_at DESC, id DESC
         ) AS rn
    FROM crm_bank_accounts
)
DELETE FROM crm_bank_accounts
 WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Schritt 3: Composite-Index für Lookup-Performance.
CREATE INDEX idx_crm_bank_accounts_tenant_iban
  ON crm_bank_accounts(tenant_id, iban);

-- Schritt 4: Unique-Constraint.
ALTER TABLE crm_bank_accounts
  ADD CONSTRAINT crm_bank_accounts_tenant_iban_unique
  UNIQUE (tenant_id, iban);
