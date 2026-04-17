/**
 * Global setup: Clean E2E test data before running the suite.
 * This ensures tests are idempotent across repeated runs without needing db:reset.
 */
import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const CLEANUP_SQL = `
-- ═══════════════════════════════════════════════════════════════════════════
-- Cross-tenant isolation test: cleanup Tenant B (security-tenant-isolation.spec.ts)
-- Uses deterministic UUID prefix e2e150ff for easy identification
-- ═══════════════════════════════════════════════════════════════════════════
DELETE FROM billing_document_positions WHERE document_id IN (
  SELECT id FROM billing_documents WHERE tenant_id = 'e2e150ff-0000-4000-a000-000000000001'
);
DELETE FROM billing_documents WHERE tenant_id = 'e2e150ff-0000-4000-a000-000000000001';
DELETE FROM absence_days WHERE tenant_id = 'e2e150ff-0000-4000-a000-000000000001';
DELETE FROM bookings WHERE tenant_id = 'e2e150ff-0000-4000-a000-000000000001';
DELETE FROM booking_types WHERE tenant_id = 'e2e150ff-0000-4000-a000-000000000001';
DELETE FROM absence_types WHERE tenant_id = 'e2e150ff-0000-4000-a000-000000000001';
DELETE FROM employees WHERE tenant_id = 'e2e150ff-0000-4000-a000-000000000001';
DELETE FROM crm_addresses WHERE tenant_id = 'e2e150ff-0000-4000-a000-000000000001';
DELETE FROM tenant_modules WHERE tenant_id = 'e2e150ff-0000-4000-a000-000000000001';
DELETE FROM tenants WHERE id = 'e2e150ff-0000-4000-a000-000000000001';

-- Child records first (FK dependencies)
DELETE FROM macro_assignments WHERE macro_id IN (SELECT id FROM macros WHERE name LIKE 'E2E%');
DELETE FROM macro_executions WHERE macro_id IN (SELECT id FROM macros WHERE name LIKE 'E2E%');
DELETE FROM schedule_task_executions WHERE execution_id IN (SELECT id FROM schedule_executions WHERE schedule_id IN (SELECT id FROM schedules WHERE name LIKE 'E2E%'));
DELETE FROM schedule_executions WHERE schedule_id IN (SELECT id FROM schedules WHERE name LIKE 'E2E%');
DELETE FROM schedule_tasks WHERE schedule_id IN (SELECT id FROM schedules WHERE name LIKE 'E2E%');
DELETE FROM order_assignments WHERE order_id IN (SELECT id FROM orders WHERE code LIKE 'E2E%');
DELETE FROM order_bookings WHERE order_id IN (SELECT id FROM orders WHERE code LIKE 'E2E%');
DELETE FROM employee_access_assignments WHERE access_profile_id IN (SELECT id FROM access_profiles WHERE code LIKE 'E2E%');
DELETE FROM employee_tariff_assignments WHERE employee_id IN (SELECT id FROM employees WHERE personnel_number LIKE 'E2E%');
DELETE FROM employee_contacts WHERE employee_id IN (SELECT id FROM employees WHERE personnel_number LIKE 'E2E%');
DELETE FROM employee_cards WHERE employee_id IN (SELECT id FROM employees WHERE personnel_number LIKE 'E2E%');
DELETE FROM team_members WHERE employee_id IN (SELECT id FROM employees WHERE personnel_number LIKE 'E2E%');
DELETE FROM shift_assignments WHERE employee_id IN (SELECT id FROM employees WHERE personnel_number LIKE 'E2E%');

-- Parent records (specs 08-12)
DELETE FROM macros WHERE name LIKE 'E2E%';
DELETE FROM schedules WHERE name LIKE 'E2E%';
DELETE FROM orders WHERE code LIKE 'E2E%';
DELETE FROM access_profiles WHERE code LIKE 'E2E%';
DELETE FROM access_zones WHERE code LIKE 'E2E%';
DELETE FROM shifts WHERE code LIKE 'E2E%';
DELETE FROM employees WHERE personnel_number LIKE 'E2E%';
DELETE FROM calculation_rules WHERE code LIKE 'E2E%';

-- Inbound invoice records (spec 50) — must come before CRM addresses cleanup
DELETE FROM inbound_invoice_approvals WHERE tenant_id = '10000000-0000-0000-0000-000000000001'
  AND invoice_id IN (SELECT id FROM inbound_invoices WHERE number LIKE 'E2E%' OR number LIKE 'ER-%');
DELETE FROM inbound_invoice_approval_policies WHERE tenant_id = '10000000-0000-0000-0000-000000000001';
DELETE FROM inbound_invoice_line_items WHERE invoice_id IN (
  SELECT id FROM inbound_invoices WHERE tenant_id = '10000000-0000-0000-0000-000000000001'
  AND (number LIKE 'E2E%' OR number LIKE 'ER-%')
);
DELETE FROM inbound_email_log WHERE tenant_id = '10000000-0000-0000-0000-000000000001';
DELETE FROM inbound_invoices WHERE tenant_id = '10000000-0000-0000-0000-000000000001'
  AND (number LIKE 'E2E%' OR number LIKE 'ER-%');
DELETE FROM tenant_imap_configs WHERE tenant_id = '10000000-0000-0000-0000-000000000001';

-- Enable inbound_invoices module for seed tenant
INSERT INTO tenant_modules (tenant_id, module, enabled_at)
VALUES ('10000000-0000-0000-0000-000000000001', 'inbound_invoices', NOW())
ON CONFLICT DO NOTHING;

-- Seed approval policy: Regular User (00..02) approves all inbound invoices
-- Admin (00..01) submits → User approves (submitter ≠ approver)
INSERT INTO inbound_invoice_approval_policies (
  id, tenant_id, amount_min, amount_max, step_order,
  approver_user_id, is_active, created_at, updated_at
) VALUES (
  'e2e00000-0000-4000-a000-000000000501',
  '10000000-0000-0000-0000-000000000001',
  0, NULL, 1,
  '00000000-0000-0000-0000-000000000002',
  true, NOW(), NOW()
) ON CONFLICT (id) DO NOTHING;

-- Template records (cache-invalidation.spec.ts)
DELETE FROM billing_document_templates
WHERE name LIKE 'E2E%'
  AND tenant_id = '10000000-0000-0000-0000-000000000001';

-- Price list records (spec 33) — must come before CRM addresses cleanup
UPDATE crm_addresses SET price_list_id = NULL WHERE company LIKE 'E2E%';
DELETE FROM billing_price_list_entries WHERE price_list_id IN (
  SELECT id FROM billing_price_lists WHERE name LIKE 'Standardpreisliste%'
  AND tenant_id = '10000000-0000-0000-0000-000000000001'
);
DELETE FROM billing_price_lists WHERE name LIKE 'Standardpreisliste%'
  AND tenant_id = '10000000-0000-0000-0000-000000000001';

-- Payment records (spec 32) — must come before billing docs cleanup
DELETE FROM billing_payments WHERE document_id IN (
  SELECT bd.id FROM billing_documents bd
  JOIN crm_addresses ca ON bd.address_id = ca.id
  WHERE ca.company LIKE 'E2E%'
);

-- Service case records (spec 31) — must come before billing docs and CRM addresses
DELETE FROM billing_service_cases WHERE address_id IN (
  SELECT id FROM crm_addresses WHERE company LIKE 'E2E%'
);

-- Recurring invoice records (spec 34) — must come before billing docs and CRM addresses
DELETE FROM billing_recurring_invoices WHERE address_id IN (
  SELECT id FROM crm_addresses WHERE company LIKE 'E2E%'
);

-- Dunning records (spec 53 mahnwesen) — must come before billing docs cleanup.
-- Wipes every reminder from the dev tenant, not just E2E-seeded ones, so
-- leftover rows from prior manual testing cannot collide with the fresh
-- reminder-number sequence on re-run.
DELETE FROM reminder_items WHERE tenant_id = '10000000-0000-0000-0000-000000000001';
DELETE FROM reminders WHERE tenant_id = '10000000-0000-0000-0000-000000000001';
-- Reset dunning number sequences so each run starts from a clean state.
DELETE FROM number_sequences WHERE tenant_id = '10000000-0000-0000-0000-000000000001' AND key LIKE 'dunning_%';

-- Billing document records (spec 30, 31)
DELETE FROM billing_document_positions WHERE document_id IN (
  SELECT bd.id FROM billing_documents bd
  JOIN crm_addresses ca ON bd.address_id = ca.id
  WHERE ca.company LIKE 'E2E%'
);
DELETE FROM billing_documents WHERE address_id IN (
  SELECT id FROM crm_addresses WHERE company LIKE 'E2E%'
);

-- CRM task records (spec 23)
DELETE FROM crm_task_assignees WHERE task_id IN (SELECT id FROM crm_tasks WHERE subject LIKE 'E2E%');
DELETE FROM crm_tasks WHERE subject LIKE 'E2E%';

-- CRM inquiry records (spec 22)
-- First unlink correspondences from inquiries
UPDATE crm_correspondences SET inquiry_id = NULL WHERE inquiry_id IN (SELECT id FROM crm_inquiries WHERE title LIKE 'E2E%');
-- Delete inquiries
DELETE FROM crm_inquiries WHERE title LIKE 'E2E%';

-- CRM correspondence records (spec 21)
DELETE FROM crm_correspondences WHERE address_id IN (SELECT id FROM crm_addresses WHERE company LIKE 'E2E%');

-- CRM records (spec 20)
DELETE FROM crm_contacts WHERE address_id IN (SELECT id FROM crm_addresses WHERE company LIKE 'E2E%');
DELETE FROM crm_bank_accounts WHERE address_id IN (SELECT id FROM crm_addresses WHERE company LIKE 'E2E%');
DELETE FROM crm_addresses WHERE company LIKE 'E2E%';

-- Supplier invoice cleanup (spec 45) — must come before PO cleanup
DELETE FROM wh_supplier_payments WHERE invoice_id IN (
  SELECT id FROM wh_supplier_invoices WHERE tenant_id = '10000000-0000-0000-0000-000000000001'
  AND supplier_id IN (SELECT id FROM crm_addresses WHERE company LIKE 'E2E%')
);
DELETE FROM wh_supplier_invoices WHERE tenant_id = '10000000-0000-0000-0000-000000000001'
  AND supplier_id IN (SELECT id FROM crm_addresses WHERE company LIKE 'E2E%');

-- Warehouse stock reservations (spec 49) — must come before article cleanup
DELETE FROM wh_stock_reservations WHERE article_id IN (
  SELECT id FROM wh_articles WHERE name LIKE 'E2E%'
);

-- Warehouse withdrawal movements (spec 44) — must come before article cleanup
DELETE FROM wh_stock_movements WHERE type = 'WITHDRAWAL'
  AND tenant_id = '10000000-0000-0000-0000-000000000001'
  AND article_id IN (SELECT id FROM wh_articles WHERE name LIKE 'E2E%');

-- Warehouse purchase order data (spec 42, 43) — must come before CRM addresses
DELETE FROM wh_stock_movements WHERE purchase_order_id IN (
  SELECT id FROM wh_purchase_orders WHERE tenant_id = '10000000-0000-0000-0000-000000000001'
  AND supplier_id IN (SELECT id FROM crm_addresses WHERE company LIKE 'E2E%')
);
DELETE FROM wh_purchase_order_positions WHERE purchase_order_id IN (
  SELECT id FROM wh_purchase_orders WHERE tenant_id = '10000000-0000-0000-0000-000000000001'
  AND supplier_id IN (SELECT id FROM crm_addresses WHERE company LIKE 'E2E%')
);
DELETE FROM wh_purchase_orders WHERE tenant_id = '10000000-0000-0000-0000-000000000001'
  AND supplier_id IN (SELECT id FROM crm_addresses WHERE company LIKE 'E2E%');

-- Warehouse price list entries for E2E articles (spec 41)
DELETE FROM billing_price_list_entries WHERE article_id IN (
  SELECT id FROM wh_articles WHERE name LIKE 'E2E%'
);

-- Warehouse article records (spec 40)
DELETE FROM wh_bill_of_materials WHERE parent_article_id IN (
  SELECT id FROM wh_articles WHERE name LIKE 'E2E%'
) OR child_article_id IN (
  SELECT id FROM wh_articles WHERE name LIKE 'E2E%'
);
DELETE FROM wh_article_suppliers WHERE article_id IN (
  SELECT id FROM wh_articles WHERE name LIKE 'E2E%'
);
DELETE FROM wh_articles WHERE name LIKE 'E2E%';
DELETE FROM wh_article_groups WHERE name LIKE 'E2E%';

-- Reset number sequences to safe values (above seeded K-1..K-6, L-1..L-3)
INSERT INTO number_sequences (id, tenant_id, key, prefix, next_value, created_at, updated_at)
VALUES
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'customer', 'K-', 100, NOW(), NOW()),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'supplier', 'L-', 100, NOW(), NOW()),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'inquiry', 'V-', 100, NOW(), NOW()),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'offer', 'A-', 100, NOW(), NOW()),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'order_confirmation', 'AB-', 100, NOW(), NOW()),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'delivery_note', 'LS-', 100, NOW(), NOW()),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'service_note', 'LN-', 100, NOW(), NOW()),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'return_delivery', 'R-', 100, NOW(), NOW()),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'invoice', 'RE-', 100, NOW(), NOW()),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'credit_note', 'G-', 100, NOW(), NOW()),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'service_case', 'KD-', 100, NOW(), NOW()),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'article', 'ART-', 100, NOW(), NOW()),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'inbound_invoice', 'ER-', 100, NOW(), NOW())
ON CONFLICT (tenant_id, key) DO UPDATE SET next_value = GREATEST(number_sequences.next_value, 100);

-- Parent records (specs 01-03)
DELETE FROM locations WHERE code LIKE 'E2E%';
DELETE FROM cost_centers WHERE code LIKE 'E2E%';
DELETE FROM employment_types WHERE code LIKE 'E2E%';
DELETE FROM contact_types WHERE code LIKE 'E2E%';
DELETE FROM booking_types WHERE code LIKE 'E2E%';
DELETE FROM absence_types WHERE code LIKE 'UE2E%' OR code LIKE 'E2E%';
DELETE FROM overtime_payouts WHERE employee_id IN (SELECT id FROM employees WHERE personnel_number LIKE 'E2E%');
DELETE FROM employee_overtime_payout_overrides WHERE employee_id IN (SELECT id FROM employees WHERE personnel_number LIKE 'E2E%');
DELETE FROM day_plans WHERE code LIKE 'E2E%';
DELETE FROM week_plans WHERE code LIKE 'E2E%';
DELETE FROM tariffs WHERE code LIKE 'E2E%';
DELETE FROM accounts WHERE code LIKE 'E2E%';
DELETE FROM departments WHERE code LIKE 'E2E%';
DELETE FROM teams WHERE name LIKE 'E2E%';

-- Data-hydration test cleanup (spec 13)
UPDATE absence_days
SET status = 'pending', approved_by = NULL, approved_at = NULL
WHERE employee_id = '00000000-0000-0000-0000-000000000013'
  AND absence_date IN ('2026-01-29', '2026-01-30');
UPDATE vacation_balances SET taken = (
  SELECT COALESCE(SUM(ad.duration), 0)
  FROM absence_days ad
  JOIN absence_types at ON ad.absence_type_id = at.id
  WHERE ad.employee_id = vacation_balances.employee_id
    AND EXTRACT(YEAR FROM ad.absence_date) = vacation_balances.year
    AND ad.status = 'approved'
    AND at.deducts_vacation = true
) WHERE employee_id = '00000000-0000-0000-0000-000000000013' AND year = 2026;
DELETE FROM absence_days WHERE notes LIKE 'E2E%';
DELETE FROM bookings WHERE notes LIKE 'E2E%';

DELETE FROM user_tenants WHERE user_id IN (SELECT id FROM users WHERE email = 'e2e-test@dev.local');
DELETE FROM users WHERE email = 'e2e-test@dev.local';
DELETE FROM user_groups WHERE code = 'E2E-GRP';

-- Support session records (spec 99-platform-support-consent.spec.ts)
DELETE FROM platform_audit_logs WHERE support_session_id IN (
  SELECT id FROM support_sessions WHERE reason LIKE 'E2E%'
);
DELETE FROM support_sessions WHERE reason LIKE 'E2E%';
DELETE FROM holidays WHERE tenant_id = '10000000-0000-0000-0000-000000000001' AND holiday_date >= '2027-01-01' AND holiday_date < '2028-01-01';

-- ═══════════════════════════════════════════════════════════════════════════
-- Probezeit (spec 55-probezeit.spec.ts)
-- Cleans ledger rows + probation-scoped notifications, then seeds one
-- employee whose probation ends within the 30-day window so the dashboard
-- widget and list filter have deterministic content.
-- ═══════════════════════════════════════════════════════════════════════════

-- Clear ledger + probation-scoped notifications for deterministic re-runs.
DELETE FROM employee_probation_reminders WHERE tenant_id = '10000000-0000-0000-0000-000000000001';
DELETE FROM notifications
  WHERE tenant_id = '10000000-0000-0000-0000-000000000001'
  AND type = 'reminders'
  AND (link LIKE '/admin/employees/%' OR title LIKE 'Probezeit%');

-- Clear any prior seeded probezeit employees so entry_date stays current.
DELETE FROM employees
  WHERE tenant_id = '10000000-0000-0000-0000-000000000001'
  AND personnel_number LIKE 'E2EPROB%';

-- Seed an employee whose 6-month probation ends 14 days from today.
-- entry_date = today - 6 months + 14 days -> probation ends in ~14 days.
INSERT INTO employees (
  id, tenant_id, personnel_number, pin, first_name, last_name,
  entry_date, probation_months, is_active, weekly_hours, vacation_days_per_year,
  created_at, updated_at
) VALUES (
  'e2e9b0fe-0000-4000-a000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'E2EPROB-001', '8801', 'E2E', 'Probezeit',
  (CURRENT_DATE - INTERVAL '6 months' + INTERVAL '14 days')::date,
  6, true, 40, 30, NOW(), NOW()
) ON CONFLICT (id) DO UPDATE SET
  entry_date = (CURRENT_DATE - INTERVAL '6 months' + INTERVAL '14 days')::date,
  probation_months = 6,
  is_active = true;

-- ═══════════════════════════════════════════════════════════════════════════
-- Bank Inbox (spec 65-bank-inbox.spec.ts)
-- Seeds bank transactions for manual match, ignore, and upload test flows.
-- ═══════════════════════════════════════════════════════════════════════════

-- Cleanup previous bank inbox E2E data
DELETE FROM inbound_invoice_bank_allocations WHERE tenant_id = '10000000-0000-0000-0000-000000000001'
  AND bank_transaction_id IN (SELECT id FROM bank_transactions WHERE bank_reference LIKE 'E2E%');
DELETE FROM billing_document_bank_allocations WHERE tenant_id = '10000000-0000-0000-0000-000000000001'
  AND bank_transaction_id IN (SELECT id FROM bank_transactions WHERE bank_reference LIKE 'E2E%');
DELETE FROM inbound_invoice_payments WHERE tenant_id = '10000000-0000-0000-0000-000000000001'
  AND notes LIKE '%E2E%';
DELETE FROM billing_payments WHERE tenant_id = '10000000-0000-0000-0000-000000000001'
  AND notes LIKE '%E2E%';
DELETE FROM bank_transactions WHERE tenant_id = '10000000-0000-0000-0000-000000000001'
  AND bank_reference LIKE 'E2E%';
DELETE FROM bank_statements WHERE tenant_id = '10000000-0000-0000-0000-000000000001'
  AND file_name LIKE 'E2E%';

-- Enable bank_statements module
INSERT INTO tenant_modules (tenant_id, module, enabled_at)
VALUES ('10000000-0000-0000-0000-000000000001', 'bank_statements', NOW())
ON CONFLICT DO NOTHING;

-- Seed a bank statement so we can attach pre-seeded transactions
INSERT INTO bank_statements (
  id, tenant_id, file_name, sha256_hash, xml_storage_path,
  account_iban, statement_id, period_from, period_to,
  opening_balance, closing_balance, currency, imported_at
) VALUES (
  'e2ebafe0-0000-4000-a000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'E2E-seed-statement.xml',
  'e2e_seed_hash_bank_inbox_' || gen_random_uuid(),
  '10000000-0000-0000-0000-000000000001/e2e-seed.xml',
  'DE89370400440532013000', 'E2E-STMT-001',
  '2026-04-01', '2026-04-30',
  50000, 48000, 'EUR', NOW()
) ON CONFLICT (id) DO NOTHING;

-- Tx 1: Unmatched CREDIT for manual-match test (Müller Maschinenbau, RE-6 = 8092 EUR)
INSERT INTO bank_transactions (
  id, tenant_id, statement_id, booking_date, value_date,
  amount, currency, direction, counterparty_iban, counterparty_name,
  remittance_info, end_to_end_id, bank_reference, status,
  suggested_address_id, created_at, updated_at
) VALUES (
  'e2ebafe0-0000-4000-a000-000000000011',
  '10000000-0000-0000-0000-000000000001',
  'e2ebafe0-0000-4000-a000-000000000001',
  '2026-04-10', '2026-04-10',
  8092, 'EUR', 'CREDIT', 'DE89370400440532013000', 'Mueller Maschinenbau GmbH',
  'Zahlung RE-6', 'E2E-MATCH-001', 'E2E-REF-MATCH-001', 'unmatched',
  'c1000000-0000-4000-a000-000000000001',
  NOW(), NOW()
) ON CONFLICT (id) DO NOTHING;

-- Tx 2: Unmatched DEBIT for ignore test (Bankgebuehr)
INSERT INTO bank_transactions (
  id, tenant_id, statement_id, booking_date, value_date,
  amount, currency, direction, counterparty_iban, counterparty_name,
  remittance_info, end_to_end_id, bank_reference, status,
  created_at, updated_at
) VALUES (
  'e2ebafe0-0000-4000-a000-000000000012',
  '10000000-0000-0000-0000-000000000001',
  'e2ebafe0-0000-4000-a000-000000000001',
  '2026-04-15', '2026-04-15',
  12.50, 'EUR', 'DEBIT', 'DE00000000000000000000', 'Commerzbank AG',
  'Kontofuehrungsgebuehr', 'E2E-IGNORE-001', 'E2E-REF-IGNORE-001', 'unmatched',
  NOW(), NOW()
) ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- Cross-tenant isolation test: seed Tenant B (security-tenant-isolation.spec.ts)
-- Re-insert after cleanup so tests have deterministic data every run
-- ═══════════════════════════════════════════════════════════════════════════

-- Tenant B
INSERT INTO tenants (id, name, slug, created_at, updated_at)
VALUES ('e2e150ff-0000-4000-a000-000000000001', 'E2E Isolation Tenant B', 'e2e-iso-b', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Enable billing module for Tenant B (needed for billing document FK)
INSERT INTO tenant_modules (tenant_id, module, enabled_at)
VALUES ('e2e150ff-0000-4000-a000-000000000001', 'billing', NOW())
ON CONFLICT DO NOTHING;

-- Tenant B employee
INSERT INTO employees (id, tenant_id, personnel_number, pin, first_name, last_name, entry_date, is_active, weekly_hours, vacation_days_per_year, created_at, updated_at)
VALUES ('e2e150ff-0000-4000-a000-000000000011', 'e2e150ff-0000-4000-a000-000000000001', 'ISO-B-001', '9999', 'Isolation', 'Employee', '2026-01-01', true, 40, 30, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Tenant B booking type
INSERT INTO booking_types (id, tenant_id, code, name, direction, is_active, created_at, updated_at)
VALUES ('e2e150ff-0000-4000-a000-000000000051', 'e2e150ff-0000-4000-a000-000000000001', 'ISO-K', 'Kommen', 'in', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Tenant B booking
INSERT INTO bookings (id, tenant_id, employee_id, booking_type_id, booking_date, original_time, edited_time, source, created_at, updated_at)
VALUES ('e2e150ff-0000-4000-a000-000000000021', 'e2e150ff-0000-4000-a000-000000000001', 'e2e150ff-0000-4000-a000-000000000011', 'e2e150ff-0000-4000-a000-000000000051', '2026-01-15', 480, 480, 'web', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Tenant B absence type
INSERT INTO absence_types (id, tenant_id, code, name, category, color, deducts_vacation, is_active, created_at, updated_at)
VALUES ('e2e150ff-0000-4000-a000-000000000052', 'e2e150ff-0000-4000-a000-000000000001', 'U-ISO', 'Urlaub ISO', 'vacation', '#4CAF50', true, true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Tenant B absence day
INSERT INTO absence_days (id, tenant_id, employee_id, absence_type_id, absence_date, duration, status, created_at, updated_at)
VALUES ('e2e150ff-0000-4000-a000-000000000031', 'e2e150ff-0000-4000-a000-000000000001', 'e2e150ff-0000-4000-a000-000000000011', 'e2e150ff-0000-4000-a000-000000000052', '2026-03-15', 1, 'pending', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Tenant B CRM address (needed for billing document FK)
INSERT INTO crm_addresses (id, tenant_id, number, company, type, created_at, updated_at)
VALUES ('e2e150ff-0000-4000-a000-000000000061', 'e2e150ff-0000-4000-a000-000000000001', 'ISO-K-1', 'ISO GmbH', 'CUSTOMER', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Tenant B billing document
INSERT INTO billing_documents (id, tenant_id, number, type, status, address_id, document_date, created_at, updated_at)
VALUES ('e2e150ff-0000-4000-a000-000000000041', 'e2e150ff-0000-4000-a000-000000000001', 'ISO-RE-001', 'INVOICE', 'DRAFT', 'e2e150ff-0000-4000-a000-000000000061', '2026-03-01', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- Mahnwesen happy-path seed (spec 53-mahnwesen-happy-path.spec.ts)
-- Seeds a customer + two overdue invoices in the main dev tenant so the
-- dunning proposal page has concrete data to render without the test having
-- to drive the full billing document creation flow.
-- ═══════════════════════════════════════════════════════════════════════════

-- Clear any previous reminder settings / templates for the dev tenant so
-- the run starts from a known configuration (enabled=true, 3 levels,
-- 7/14/21 grace, 0/2.5/5 EUR fees, 9% interest).
DELETE FROM reminder_templates WHERE tenant_id = '10000000-0000-0000-0000-000000000001' AND name LIKE 'E2E Mahn%';
DELETE FROM reminder_settings WHERE tenant_id = '10000000-0000-0000-0000-000000000001';

-- Enable dunning with default settings.
INSERT INTO reminder_settings (
  id, tenant_id, enabled, max_level, grace_period_days, fee_amounts,
  interest_enabled, interest_rate_percent, fees_enabled, created_at, updated_at
) VALUES (
  gen_random_uuid(), '10000000-0000-0000-0000-000000000001',
  true, 3, ARRAY[7,14,21]::int[], ARRAY[0, 2.5, 5]::double precision[],
  true, 9, true, NOW(), NOW()
);

-- Default templates for levels 1-3 so createRun can resolve headers/footers.
INSERT INTO reminder_templates (
  id, tenant_id, name, level, header_text, footer_text,
  email_subject, email_body, is_default, created_at, updated_at
) VALUES
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001',
   'E2E Mahn Stufe 1', 1,
   'Sehr geehrte Damen und Herren, folgende Rechnungen sind offen.',
   'Wir bitten um zeitnahen Ausgleich.',
   'Zahlungserinnerung {{rechnungsnummer}}',
   'Sehr geehrte Damen und Herren, anbei unsere Zahlungserinnerung.',
   true, NOW(), NOW()),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001',
   'E2E Mahn Stufe 2', 2,
   'Trotz unserer Erinnerung ist noch kein Zahlungseingang feststellbar.',
   'Bitte begleichen Sie den Gesamtbetrag.',
   'Mahnung {{rechnungsnummer}} Stufe 2',
   'Sehr geehrte Damen und Herren, anbei unsere Mahnung Stufe 2.',
   true, NOW(), NOW()),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001',
   'E2E Mahn Stufe 3', 3,
   'Trotz wiederholter Mahnungen sind folgende Rechnungen offen.',
   'Letzte Zahlungsaufforderung.',
   'Letzte Mahnung {{rechnungsnummer}}',
   'Sehr geehrte Damen und Herren, anbei unsere letzte Mahnung.',
   true, NOW(), NOW());

-- Seeded customer for the happy path. UUID prefix e2e-mahn... keeps it
-- distinct from the billing-documents spec customer and easy to clean up.
INSERT INTO crm_addresses (
  id, tenant_id, number, type, company, email, street, zip, city,
  payment_term_days, dunning_blocked, is_active, created_at, updated_at
) VALUES (
  'e2e4ad00-0000-4000-a000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'K-E2E-MAHN', 'CUSTOMER', 'E2E Mahnkunde GmbH',
  'mahnkunde@e2e.local', 'Mahnweg 1', '12345', 'Teststadt',
  7, false, true, NOW(), NOW()
) ON CONFLICT (id) DO NOTHING;

-- Two overdue invoices: document_date 30 days ago + 7-day term → due 23 days ago.
-- Status PRINTED is one of the allowed statuses in the eligibility filter.
INSERT INTO billing_documents (
  id, tenant_id, number, type, status, address_id, document_date,
  payment_term_days, subtotal_net, total_vat, total_gross,
  dunning_blocked, created_at, updated_at
) VALUES
  ('e2e4ad00-0000-4000-a000-000000000101',
   '10000000-0000-0000-0000-000000000001',
   'E2E-MAHN-RE-001', 'INVOICE', 'PRINTED',
   'e2e4ad00-0000-4000-a000-000000000001',
   NOW() - INTERVAL '30 days',
   7, 84.03, 15.97, 100.00,
   false, NOW(), NOW()),
  ('e2e4ad00-0000-4000-a000-000000000102',
   '10000000-0000-0000-0000-000000000001',
   'E2E-MAHN-RE-002', 'INVOICE', 'PRINTED',
   'e2e4ad00-0000-4000-a000-000000000001',
   NOW() - INTERVAL '45 days',
   7, 168.07, 31.93, 200.00,
   false, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
`;

export default function globalSetup() {
  const tmpFile = join(__dirname, ".cleanup.sql");
  try {
    writeFileSync(tmpFile, CLEANUP_SQL);
    execSync(
      `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f "${tmpFile}"`,
      { stdio: "pipe", timeout: 10_000 },
    );
  } catch (err) {
    console.log(
      "[global-setup] Could not clean E2E data:",
      (err as Error).message?.slice(0, 200),
    );
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {}
  }
}
