-- §14 UStG: servicePeriodMode für wiederkehrende Rechnungen
--
-- Bestimmt, ob das Leistungszeitraum-Intervall beim Generieren einer
-- Rechnung aus einer Recurring-Template NACHTRÄGLICH berechnet wird
-- (Reinigung: Monat im April rechnet März ab) oder IM VORAUS (Miete:
-- Monat im April rechnet April ab).
--
-- Purely additive. Default IN_ARREARS = bisher gelebte Praxis.

CREATE TYPE billing_recurring_service_period_mode AS ENUM ('IN_ARREARS', 'IN_ADVANCE');

ALTER TABLE billing_recurring_invoices
  ADD COLUMN service_period_mode billing_recurring_service_period_mode
    NOT NULL DEFAULT 'IN_ARREARS';

COMMENT ON COLUMN billing_recurring_invoices.service_period_mode IS
  'Leistungszeitraum-Berechnung bei Generierung: IN_ARREARS (Standard, nachträglich) oder IN_ADVANCE (Vorkasse/Miete)';
