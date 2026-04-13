-- =============================================================
-- Race-condition safeguard for payment_run_items
--
-- An inbound invoice must not be scheduled in more than one
-- non-cancelled payment run at the same time. Postgres does not
-- support sub-queries in partial index predicates, so we enforce
-- the rule via a BEFORE INSERT trigger that checks for existing
-- active bindings and raises unique_violation on conflict.
--
-- Plan: thoughts/shared/plans/2026-04-12-sepa-payment-runs.md Phase 4.2
-- =============================================================

CREATE OR REPLACE FUNCTION check_payment_run_item_active_unique()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM payment_run_items pri
    JOIN payment_runs pr ON pr.id = pri.payment_run_id
    WHERE pri.tenant_id = NEW.tenant_id
      AND pri.inbound_invoice_id = NEW.inbound_invoice_id
      AND pri.id <> NEW.id
      AND pr.status <> 'CANCELLED'
  ) THEN
    RAISE EXCEPTION 'Invoice % is already in an active payment run', NEW.inbound_invoice_id
      USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payment_run_item_active_unique ON payment_run_items;

CREATE TRIGGER trg_payment_run_item_active_unique
  BEFORE INSERT ON payment_run_items
  FOR EACH ROW
  EXECUTE FUNCTION check_payment_run_item_active_unique();
