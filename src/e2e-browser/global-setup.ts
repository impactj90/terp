/**
 * Global setup: Clean E2E test data before running the suite.
 * This ensures tests are idempotent across repeated runs without needing db:reset.
 */
import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const CLEANUP_SQL = `
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

-- Billing document records (spec 30)
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
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'credit_note', 'G-', 100, NOW(), NOW())
ON CONFLICT (tenant_id, key) DO UPDATE SET next_value = GREATEST(number_sequences.next_value, 100);

-- Parent records (specs 01-03)
DELETE FROM locations WHERE code LIKE 'E2E%';
DELETE FROM cost_centers WHERE code LIKE 'E2E%';
DELETE FROM employment_types WHERE code LIKE 'E2E%';
DELETE FROM contact_types WHERE code LIKE 'E2E%';
DELETE FROM booking_types WHERE code LIKE 'E2E%';
DELETE FROM absence_types WHERE code LIKE 'UE2E%' OR code LIKE 'E2E%';
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
DELETE FROM holidays WHERE tenant_id = '10000000-0000-0000-0000-000000000001' AND holiday_date >= '2027-01-01' AND holiday_date < '2028-01-01';
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
