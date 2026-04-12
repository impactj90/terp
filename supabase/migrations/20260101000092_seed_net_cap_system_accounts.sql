-- Seed NET and CAP system accounts (global, available to all tenants)
INSERT INTO accounts (tenant_id, code, name, account_type, unit, is_system, description, sort_order)
VALUES
  (NULL, 'NET', 'Netto-Arbeitszeit', 'day', 'minutes', true, 'Automatisch berechnete Netto-Arbeitszeit pro Tag', 10),
  (NULL, 'CAP', 'Kappungszeit',      'day', 'minutes', true, 'Über die maximale Nettoarbeitszeit hinausgehende Minuten', 11)
ON CONFLICT DO NOTHING;
