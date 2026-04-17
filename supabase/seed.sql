-- Supabase Dev Seed Script
--
-- Seeds everything needed for local development:
--   1. Auth users (admin + regular user)
--   2. Dev tenant
--   3. Admin user group (all permissions)
--   4. Public users (linked to auth users)
--   5. User-tenant access entries
--   6. Employees
--   7. Link users to employees
--   8. Departments
--   9. Day plans + breaks
--  10. Week plans
--  11. Tariffs
--  12. Employee tariff assignments
--  13. Holidays (Bavaria 2026)
--  14. Teams + team members
--  15. Accounts
--  16. Bookings (January 2026)
--  17. Daily values (January 2026)
--  18. Monthly values (2025 historical + January 2026)
--  19. Vacation balances
--  20. Absence days
--  21. Vacation config (special calcs, calc groups, capping rules)
--  22. Employee day plans (January 2026)
--  23. Billing documents (offers, confirmations, delivery notes, invoices, credit notes)
--  24. Billing document positions
--  25. Billing service cases
--  26. Billing payments (cash, bank, partial, discount)
--  27. Warehouse article groups, articles, suppliers, BOM
--  28. Warehouse purchase orders + positions
--  29. Warehouse stock movements
--  30. Warehouse supplier invoices + payments
--  31. HR personnel file entries + attachments
--
-- Run via: pnpm db:reset (applies seed.sql after migrations)
--
-- Dev credentials:
--   admin@dev.local / dev-password-admin
--   user@dev.local  / dev-password-user

-- Tenant ID used throughout
-- 10000000-0000-0000-0000-000000000001

-- =============================================================
-- 1. Auth users
-- =============================================================

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_user_meta_data, raw_app_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token,
  email_change, email_change_token_new, email_change_token_current
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'admin@dev.local',
  crypt('dev-password-admin', gen_salt('bf')),
  NOW(), '{"display_name": "Dev Admin"}'::jsonb,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  NOW(), NOW(),
  '', '',
  '', '', ''
) ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000000001', 'email', 'admin@dev.local'),
  'email', '00000000-0000-0000-0000-000000000001',
  NOW(), NOW(), NOW()
) ON CONFLICT (provider_id, provider) DO NOTHING;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_user_meta_data, raw_app_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token,
  email_change, email_change_token_new, email_change_token_current
) VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'user@dev.local',
  crypt('dev-password-user', gen_salt('bf')),
  NOW(), '{"display_name": "Dev User"}'::jsonb,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  NOW(), NOW(),
  '', '',
  '', '', ''
) ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000002',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000000002', 'email', 'user@dev.local'),
  'email', '00000000-0000-0000-0000-000000000002',
  NOW(), NOW(), NOW()
) ON CONFLICT (provider_id, provider) DO NOTHING;

-- =============================================================
-- 2. Dev tenant
-- =============================================================

INSERT INTO tenants (id, name, slug, is_active, created_at, updated_at)
VALUES (
  '10000000-0000-0000-0000-000000000001',
  'Dev Company',
  'dev-company',
  true,
  NOW(), NOW()
) ON CONFLICT (id) DO NOTHING;

-- =============================================================
-- 3. User groups
-- =============================================================

INSERT INTO user_groups (id, tenant_id, name, code, description, permissions, is_admin, is_system, is_active, created_at, updated_at)
VALUES (
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'Administrators',
  'admin',
  'Full access to all features',
  '[]'::jsonb,
  true, true, true,
  NOW(), NOW()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO user_groups (id, tenant_id, name, code, description, permissions, is_admin, is_system, is_active, created_at, updated_at)
VALUES (
  '20000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001',
  'Users',
  'user',
  'Standard user access',
  '["time_tracking.view_own", "time_tracking.edit", "absences.request"]'::jsonb,
  false, false, true,
  NOW(), NOW()
) ON CONFLICT (id) DO NOTHING;

-- =============================================================
-- 4. Public users
-- =============================================================

INSERT INTO users (id, email, username, display_name, role, is_active, tenant_id, user_group_id, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'admin@dev.local', 'admin@dev.local', 'Dev Admin', 'admin', true,
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  NOW(), NOW()
) ON CONFLICT (id) DO UPDATE SET
  tenant_id = EXCLUDED.tenant_id,
  user_group_id = EXCLUDED.user_group_id,
  role = EXCLUDED.role,
  updated_at = NOW();

INSERT INTO users (id, email, username, display_name, role, is_active, tenant_id, user_group_id, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  'user@dev.local', 'user@dev.local', 'Dev User', 'user', true,
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002',
  NOW(), NOW()
) ON CONFLICT (id) DO UPDATE SET
  tenant_id = EXCLUDED.tenant_id,
  user_group_id = EXCLUDED.user_group_id,
  role = EXCLUDED.role,
  updated_at = NOW();

-- =============================================================
-- 5. User-tenant access
-- =============================================================

INSERT INTO user_tenants (user_id, tenant_id, role, created_at)
VALUES
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'admin', NOW()),
  ('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'member', NOW())
ON CONFLICT (user_id, tenant_id) DO NOTHING;

-- =============================================================
-- 6. Employees (insert BEFORE departments so manager_employee_id FK works)
-- =============================================================
-- Employee IDs:
--   Admin:  00000000-0000-0000-0000-000000000011
--   User:   00000000-0000-0000-0000-000000000012
--   Maria:  00000000-0000-0000-0000-000000000013
--   Thomas: 00000000-0000-0000-0000-000000000014
--   Anna:   00000000-0000-0000-0000-000000000015
--   Sabine: 00000000-0000-0000-0000-000000000016
--   Markus: 00000000-0000-0000-0000-000000000017
--   Julia:  00000000-0000-0000-0000-000000000018
--   Stefan: 00000000-0000-0000-0000-000000000019
--   Petra:  00000000-0000-0000-0000-00000000001a

INSERT INTO employees (id, tenant_id, personnel_number, pin, first_name, last_name, email, entry_date, weekly_hours, vacation_days_per_year, is_active, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001', 'EMP001', '1001', 'Admin', 'User', 'admin@dev.local', '2020-01-01', 40.00, 30.00, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000001', 'EMP002', '1002', 'Regular', 'User', 'user@dev.local', '2021-03-15', 40.00, 28.00, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000001', 'EMP003', '1003', 'Maria', 'Schmidt', 'maria.schmidt@dev.local', '2022-06-01', 20.00, 15.00, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-000000000001', 'EMP004', '1004', 'Thomas', 'Mueller', 'thomas.mueller@dev.local', '2024-01-15', 40.00, 30.00, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000015', '10000000-0000-0000-0000-000000000001', 'EMP005', '1005', 'Anna', 'Weber', 'anna.weber@dev.local', '2015-09-01', 35.00, 32.00, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000016', '10000000-0000-0000-0000-000000000001', 'EMP006', '1006', 'Sabine', 'Fischer', 'sabine.fischer@dev.local', '2023-01-15', 40.00, 30.00, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000017', '10000000-0000-0000-0000-000000000001', 'EMP007', '1007', 'Markus', 'Braun', 'markus.braun@dev.local', '2023-06-01', 40.00, 30.00, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000018', '10000000-0000-0000-0000-000000000001', 'EMP008', '1008', 'Julia', 'Hoffmann', 'julia.hoffmann@dev.local', '2022-03-01', 38.00, 30.00, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000019', '10000000-0000-0000-0000-000000000001', 'EMP009', '1009', 'Stefan', 'Lang', 'stefan.lang@dev.local', '2024-09-01', 40.00, 30.00, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000001a', '10000000-0000-0000-0000-000000000001', 'EMP010', '1010', 'Petra', 'Neumann', 'petra.neumann@dev.local', '2025-02-01', 20.00, 15.00, true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- =============================================================
-- 7. Link users to employees
-- =============================================================

UPDATE users SET employee_id = '00000000-0000-0000-0000-000000000011' WHERE id = '00000000-0000-0000-0000-000000000001';
UPDATE users SET employee_id = '00000000-0000-0000-0000-000000000012' WHERE id = '00000000-0000-0000-0000-000000000002';

-- =============================================================
-- 8. Departments (hierarchy: Company -> IT, HR, Finance, Ops; IT -> Dev, Infra)
-- =============================================================

-- Root first (no parent, no manager yet to avoid circular dep)
INSERT INTO departments (id, tenant_id, code, name, description, parent_id, manager_employee_id, is_active, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000801', '10000000-0000-0000-0000-000000000001', 'COMPANY', 'Dev Company', 'Root organization department', NULL, NULL, true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- First-level departments
INSERT INTO departments (id, tenant_id, code, name, description, parent_id, manager_employee_id, is_active, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000802', '10000000-0000-0000-0000-000000000001', 'IT', 'Information Technology', 'IT department handling all technology needs', '00000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000011', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000803', '10000000-0000-0000-0000-000000000001', 'HR', 'Human Resources', 'HR department for employee management and recruitment', '00000000-0000-0000-0000-000000000801', NULL, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000804', '10000000-0000-0000-0000-000000000001', 'FIN', 'Finance', 'Finance and accounting department', '00000000-0000-0000-0000-000000000801', NULL, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000805', '10000000-0000-0000-0000-000000000001', 'OPS', 'Operations', 'Operations and logistics department', '00000000-0000-0000-0000-000000000801', NULL, true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Second-level departments (under IT)
INSERT INTO departments (id, tenant_id, code, name, description, parent_id, manager_employee_id, is_active, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000806', '10000000-0000-0000-0000-000000000001', 'DEV', 'Software Development', 'Software development and engineering team', '00000000-0000-0000-0000-000000000802', '00000000-0000-0000-0000-000000000011', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000807', '10000000-0000-0000-0000-000000000001', 'INFRA', 'Infrastructure', 'IT infrastructure and DevOps team', '00000000-0000-0000-0000-000000000802', NULL, true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Set manager on root department now that employees exist
UPDATE departments SET manager_employee_id = '00000000-0000-0000-0000-000000000011' WHERE id = '00000000-0000-0000-0000-000000000801';

-- =============================================================
-- 9. Day plans
-- =============================================================
-- Day plan IDs:
--   FREE:    00000000-0000-0000-0000-000000000501
--   STD-8H:  00000000-0000-0000-0000-000000000502
--   PART-4H: 00000000-0000-0000-0000-000000000503
--   FLEX-8H: 00000000-0000-0000-0000-000000000504
--   FRI-6H:  00000000-0000-0000-0000-000000000505

INSERT INTO day_plans (id, tenant_id, code, name, description, plan_type, come_from, come_to, go_from, go_to, regular_hours, is_active, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000501', '10000000-0000-0000-0000-000000000001', 'FREE', 'Free Day', 'Non-working day (weekends, etc.)', 'fixed', NULL, NULL, NULL, NULL, 0, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000502', '10000000-0000-0000-0000-000000000001', 'STD-8H', 'Standard 8h Day', 'Standard 8-hour fixed workday (08:00-17:00)', 'fixed', 480, NULL, NULL, 1020, 480, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000503', '10000000-0000-0000-0000-000000000001', 'PART-4H', 'Part-time 4h Day', 'Part-time 4-hour day (08:00-12:00)', 'fixed', 480, NULL, NULL, 720, 240, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000504', '10000000-0000-0000-0000-000000000001', 'FLEX-8H', 'Flextime 8h Day', 'Flexible 8-hour day (arrive 06:00-09:00, leave 15:00-19:00)', 'flextime', 360, 540, 900, 1140, 480, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000505', '10000000-0000-0000-0000-000000000001', 'FRI-6H', 'Friday Short Day', 'Shortened Friday (08:00-14:00)', 'fixed', 480, NULL, NULL, 840, 360, true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Day plan breaks (30 min lunch break for 8h and 6h plans)
INSERT INTO day_plan_breaks (id, day_plan_id, break_type, start_time, end_time, duration, after_work_minutes, auto_deduct, is_paid, sort_order, created_at, updated_at)
VALUES
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000502', 'fixed', 720, 750, 30, NULL, true, false, 1, NOW(), NOW()),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000504', 'fixed', 720, 750, 30, NULL, true, false, 1, NOW(), NOW()),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000505', 'fixed', 720, 750, 30, NULL, true, false, 1, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- =============================================================
-- 10. Week plans
-- =============================================================

INSERT INTO week_plans (id, tenant_id, code, name, description, monday_day_plan_id, tuesday_day_plan_id, wednesday_day_plan_id, thursday_day_plan_id, friday_day_plan_id, saturday_day_plan_id, sunday_day_plan_id, is_active, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000601', '10000000-0000-0000-0000-000000000001', 'WEEK-40H', 'Standard 40h Week', 'Standard 5-day week, 8 hours per day (Mon-Fri)',
   '00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000502',
   '00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000501', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000602', '10000000-0000-0000-0000-000000000001', 'WEEK-38H', 'Standard 38h Week', '5-day week with short Friday (Mon-Thu 8h, Fri 6h)',
   '00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000505',
   '00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000501', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000603', '10000000-0000-0000-0000-000000000001', 'WEEK-FLEX', 'Flextime 40h Week', 'Flexible 5-day week, 8 hours per day (Mon-Fri)',
   '00000000-0000-0000-0000-000000000504', '00000000-0000-0000-0000-000000000504', '00000000-0000-0000-0000-000000000504', '00000000-0000-0000-0000-000000000504', '00000000-0000-0000-0000-000000000504',
   '00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000501', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000604', '10000000-0000-0000-0000-000000000001', 'WEEK-20H', 'Part-time 20h Week', 'Part-time 5-day week, 4 hours per day (Mon-Fri)',
   '00000000-0000-0000-0000-000000000503', '00000000-0000-0000-0000-000000000503', '00000000-0000-0000-0000-000000000503', '00000000-0000-0000-0000-000000000503', '00000000-0000-0000-0000-000000000503',
   '00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000501', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- =============================================================
-- 11. Tariffs
-- =============================================================

INSERT INTO tariffs (id, tenant_id, code, name, description, week_plan_id, is_active,
  annual_vacation_days, work_days_per_week, vacation_basis,
  daily_target_hours, weekly_target_hours, monthly_target_hours,
  max_flextime_per_month, upper_limit_annual, lower_limit_annual,
  flextime_threshold, credit_type, rhythm_type, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000701', '10000000-0000-0000-0000-000000000001',
   'TAR-40H', 'Full-time 40h', 'Standard full-time tariff with 40 hours per week, 30 vacation days',
   '00000000-0000-0000-0000-000000000601', true,
   30.00, 5, 'calendar_year', 8.00, 40.00, 173.33, 1200, 2400, -600, NULL, 'no_evaluation', 'weekly', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000702', '10000000-0000-0000-0000-000000000001',
   'TAR-38H', 'Full-time 38h', 'Full-time tariff with 38 hours per week (short Friday), 30 vacation days',
   '00000000-0000-0000-0000-000000000602', true,
   30.00, 5, 'calendar_year', 7.60, 38.00, 164.67, 1200, 2400, -600, NULL, 'no_evaluation', 'weekly', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000703', '10000000-0000-0000-0000-000000000001',
   'TAR-FLEX', 'Flextime 40h', 'Flextime tariff with flexible arrival/departure, 30 vacation days',
   '00000000-0000-0000-0000-000000000603', true,
   30.00, 5, 'calendar_year', 8.00, 40.00, 173.33, 1800, 3600, -1200, 30, 'complete', 'weekly', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000704', '10000000-0000-0000-0000-000000000001',
   'TAR-20H', 'Part-time 20h', 'Part-time tariff with 20 hours per week, 15 vacation days (pro-rated)',
   '00000000-0000-0000-0000-000000000604', true,
   15.00, 5, 'calendar_year', 4.00, 20.00, 86.67, 600, 1200, -300, NULL, 'no_evaluation', 'weekly', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000705', '10000000-0000-0000-0000-000000000001',
   'TAR-AZUBI', 'Apprentice', 'Apprentice tariff with 40 hours per week, entry-date-based vacation',
   '00000000-0000-0000-0000-000000000601', true,
   25.00, 5, 'entry_date', 8.00, 40.00, 173.33, 600, 1200, -300, NULL, 'no_carryover', 'weekly', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000706', '10000000-0000-0000-0000-000000000001',
   'TAR-MGMT', 'Management', 'Management tariff without flextime tracking, 30 vacation days',
   '00000000-0000-0000-0000-000000000601', true,
   30.00, 5, 'calendar_year', 8.00, 40.00, 173.33, NULL, NULL, NULL, NULL, 'no_evaluation', 'weekly', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- =============================================================
-- 12. Employee tariff assignments
-- =============================================================
-- Admin(40h)->TAR-40H, User(40h)->TAR-FLEX, Maria(20h)->TAR-20H,
-- Thomas(40h)->TAR-40H, Anna(35h)->TAR-38H

-- Deterministische IDs (eine ETA pro Mitarbeiter) damit der Seed idempotent bleibt.
INSERT INTO employee_tariff_assignments (id, tenant_id, employee_id, tariff_id, effective_from, effective_to, overwrite_behavior, is_active, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000019011', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000701', '2020-01-01', NULL, 'preserve_manual', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000019012', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000703', '2021-03-15', NULL, 'preserve_manual', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000019013', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000704', '2022-06-01', NULL, 'preserve_manual', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000019014', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000701', '2024-01-15', NULL, 'preserve_manual', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000019015', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-000000000702', '2015-09-01', NULL, 'preserve_manual', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000019016', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000016', '00000000-0000-0000-0000-000000000703', '2023-01-15', NULL, 'preserve_manual', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000019017', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-000000000701', '2023-06-01', NULL, 'preserve_manual', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000019018', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000018', '00000000-0000-0000-0000-000000000702', '2022-03-01', NULL, 'preserve_manual', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000019019', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000019', '00000000-0000-0000-0000-000000000701', '2024-09-01', NULL, 'preserve_manual', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000001901a', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000001a', '00000000-0000-0000-0000-000000000704', '2025-02-01', NULL, 'preserve_manual', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Also set tariff_id on the employees directly
UPDATE employees SET tariff_id = '00000000-0000-0000-0000-000000000701' WHERE id = '00000000-0000-0000-0000-000000000011';
UPDATE employees SET tariff_id = '00000000-0000-0000-0000-000000000703' WHERE id = '00000000-0000-0000-0000-000000000012';
UPDATE employees SET tariff_id = '00000000-0000-0000-0000-000000000704' WHERE id = '00000000-0000-0000-0000-000000000013';
UPDATE employees SET tariff_id = '00000000-0000-0000-0000-000000000701' WHERE id = '00000000-0000-0000-0000-000000000014';
UPDATE employees SET tariff_id = '00000000-0000-0000-0000-000000000702' WHERE id = '00000000-0000-0000-0000-000000000015';
UPDATE employees SET tariff_id = '00000000-0000-0000-0000-000000000703' WHERE id = '00000000-0000-0000-0000-000000000016';
UPDATE employees SET tariff_id = '00000000-0000-0000-0000-000000000701' WHERE id = '00000000-0000-0000-0000-000000000017';
UPDATE employees SET tariff_id = '00000000-0000-0000-0000-000000000702' WHERE id = '00000000-0000-0000-0000-000000000018';
UPDATE employees SET tariff_id = '00000000-0000-0000-0000-000000000701' WHERE id = '00000000-0000-0000-0000-000000000019';
UPDATE employees SET tariff_id = '00000000-0000-0000-0000-000000000704' WHERE id = '00000000-0000-0000-0000-00000000001a';

-- =============================================================
-- 13. Holidays (Bavaria 2026)
-- =============================================================

INSERT INTO holidays (id, tenant_id, holiday_date, name, holiday_category, applies_to_all, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000401', '10000000-0000-0000-0000-000000000001', '2026-01-01', 'Neujahr', 1, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000402', '10000000-0000-0000-0000-000000000001', '2026-01-06', 'Heilige Drei Koenige', 1, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000403', '10000000-0000-0000-0000-000000000001', '2026-04-03', 'Karfreitag', 1, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000404', '10000000-0000-0000-0000-000000000001', '2026-04-06', 'Ostermontag', 1, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000405', '10000000-0000-0000-0000-000000000001', '2026-05-01', 'Tag der Arbeit', 1, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000406', '10000000-0000-0000-0000-000000000001', '2026-05-14', 'Christi Himmelfahrt', 1, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000407', '10000000-0000-0000-0000-000000000001', '2026-05-25', 'Pfingstmontag', 1, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000408', '10000000-0000-0000-0000-000000000001', '2026-06-04', 'Fronleichnam', 1, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000409', '10000000-0000-0000-0000-000000000001', '2026-08-15', 'Mariae Himmelfahrt', 1, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000410', '10000000-0000-0000-0000-000000000001', '2026-10-03', 'Tag der Deutschen Einheit', 1, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000411', '10000000-0000-0000-0000-000000000001', '2026-11-01', 'Allerheiligen', 1, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000412', '10000000-0000-0000-0000-000000000001', '2026-12-25', '1. Weihnachtstag', 1, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000413', '10000000-0000-0000-0000-000000000001', '2026-12-26', '2. Weihnachtstag', 1, true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- =============================================================
-- 14. Teams + team members
-- =============================================================

INSERT INTO teams (id, tenant_id, name, description, department_id, leader_employee_id, is_active, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000901', '10000000-0000-0000-0000-000000000001', 'Backend Team', 'Backend API and server-side development', '00000000-0000-0000-0000-000000000806', '00000000-0000-0000-0000-000000000011', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000902', '10000000-0000-0000-0000-000000000001', 'Frontend Team', 'Frontend web and mobile development', '00000000-0000-0000-0000-000000000806', '00000000-0000-0000-0000-000000000015', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000903', '10000000-0000-0000-0000-000000000001', 'DevOps Team', 'DevOps, CI/CD, and cloud infrastructure', '00000000-0000-0000-0000-000000000807', NULL, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000904', '10000000-0000-0000-0000-000000000001', 'HR Core Team', 'Core HR operations and employee relations', '00000000-0000-0000-0000-000000000803', NULL, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000905', '10000000-0000-0000-0000-000000000001', 'Accounting Team', 'Financial accounting and reporting', '00000000-0000-0000-0000-000000000804', NULL, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000906', '10000000-0000-0000-0000-000000000001', 'Betrieb', 'Betrieb und Facility Management', '00000000-0000-0000-0000-000000000805', NULL, true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO team_members (team_id, employee_id, role, joined_at)
VALUES
  -- Backend Team
  ('00000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-000000000011', 'lead', NOW()),
  ('00000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-000000000014', 'member', NOW()),
  ('00000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-000000000013', 'member', NOW()),
  -- Frontend Team
  ('00000000-0000-0000-0000-000000000902', '00000000-0000-0000-0000-000000000015', 'lead', NOW()),
  ('00000000-0000-0000-0000-000000000902', '00000000-0000-0000-0000-000000000012', 'member', NOW()),
  ('00000000-0000-0000-0000-000000000902', '00000000-0000-0000-0000-000000000017', 'member', NOW()),
  -- DevOps Team
  ('00000000-0000-0000-0000-000000000903', '00000000-0000-0000-0000-000000000014', 'member', NOW()),
  ('00000000-0000-0000-0000-000000000903', '00000000-0000-0000-0000-000000000016', 'member', NOW()),
  -- HR Core Team
  ('00000000-0000-0000-0000-000000000904', '00000000-0000-0000-0000-000000000013', 'deputy', NOW()),
  ('00000000-0000-0000-0000-000000000904', '00000000-0000-0000-0000-000000000018', 'lead', NOW()),
  -- Accounting Team
  ('00000000-0000-0000-0000-000000000905', '00000000-0000-0000-0000-000000000015', 'member', NOW()),
  ('00000000-0000-0000-0000-000000000905', '00000000-0000-0000-0000-000000000019', 'member', NOW()),
  -- Betrieb
  ('00000000-0000-0000-0000-000000000906', '00000000-0000-0000-0000-00000000001a', 'member', NOW())
ON CONFLICT (team_id, employee_id) DO NOTHING;

-- =============================================================
-- 15. Accounts (tenant-specific, system accounts exist from migration)
-- =============================================================

INSERT INTO accounts (id, tenant_id, code, name, account_type, unit, is_system, is_active, is_payroll_relevant, payroll_code, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000001101', '10000000-0000-0000-0000-000000000001', 'NIGHT',   'Night Shift Bonus',   'bonus', 'minutes', false, true, true,  '1015', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000001102', '10000000-0000-0000-0000-000000000001', 'SAT',     'Saturday Bonus',      'bonus', 'minutes', false, true, true,  '1020', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000001103', '10000000-0000-0000-0000-000000000001', 'SUN',     'Sunday Bonus',        'bonus', 'minutes', false, true, true,  '1025', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000001107', '10000000-0000-0000-0000-000000000001', 'HOLIDAY', 'Holiday Bonus',       'bonus', 'minutes', false, true, true,  '1030', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000001104', '10000000-0000-0000-0000-000000000001', 'ONCALL',  'On-Call Duty',        'day',   'minutes', false, true, false, NULL,   NOW(), NOW()),
  ('00000000-0000-0000-0000-000000001105', '10000000-0000-0000-0000-000000000001', 'TRAVEL',  'Travel Time',         'day',   'minutes', false, true, false, NULL,   NOW(), NOW()),
  ('00000000-0000-0000-0000-000000001106', '10000000-0000-0000-0000-000000000001', 'SICK',    'Sick Leave Balance',  'month', 'days',    false, true, false, NULL,   NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- =============================================================
-- 16. Bookings (January 2026)
-- =============================================================
-- Uses actual booking_type IDs from migration:
--   A1 (Kommen/Clock In):   482a72e3-e2c5-4e13-b4be-bed489214563
--   A2 (Gehen/Clock Out):   f14159fa-7755-4abc-bbb6-4f2e19021e95
--   P1 (Pause Beginn):      645b9228-7dbb-4e26-929f-cd8331fd2335
--   P2 (Pause Ende):        9cee0784-cc3e-41ce-9b7c-7aa2ba0cb6f9

-- Helper: look up booking type IDs dynamically to avoid hardcoding migration UUIDs
DO $$
DECLARE
  bt_a1 uuid;
  bt_a2 uuid;
  bt_p1 uuid;
  bt_p2 uuid;
  t_id uuid := '10000000-0000-0000-0000-000000000001';
BEGIN
  SELECT id INTO bt_a1 FROM booking_types WHERE code = 'A1' LIMIT 1;
  SELECT id INTO bt_a2 FROM booking_types WHERE code = 'A2' LIMIT 1;
  SELECT id INTO bt_p1 FROM booking_types WHERE code = 'P1' LIMIT 1;
  SELECT id INTO bt_p2 FROM booking_types WHERE code = 'P2' LIMIT 1;

  -- Admin Employee bookings (Jan 2026)
  -- Jan 2 (Fri) 08:00-17:00, break 12:00-12:30
  INSERT INTO bookings (id, tenant_id, employee_id, booking_date, booking_type_id, original_time, edited_time, pair_id, source, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000001002', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-02', bt_a1, 480, 480, '00000000-0000-0000-0000-000000001000', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000001003', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-02', bt_a2, 1020, 1020, '00000000-0000-0000-0000-000000001000', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000001004', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-02', bt_p1, 720, 720, '00000000-0000-0000-0000-000000001001', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000001005', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-02', bt_p2, 750, 750, '00000000-0000-0000-0000-000000001001', 'terminal', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Jan 5 (Mon) 07:45-16:45, break 12:00-12:30
  INSERT INTO bookings (id, tenant_id, employee_id, booking_date, booking_type_id, original_time, edited_time, pair_id, source, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000001012', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-05', bt_a1, 465, 465, '00000000-0000-0000-0000-000000001010', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000001013', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-05', bt_a2, 1005, 1005, '00000000-0000-0000-0000-000000001010', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000001014', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-05', bt_p1, 720, 720, '00000000-0000-0000-0000-000000001011', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000001015', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-05', bt_p2, 750, 750, '00000000-0000-0000-0000-000000001011', 'terminal', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Jan 6 (Tue) 08:00-17:30, break 12:15-12:45
  INSERT INTO bookings (id, tenant_id, employee_id, booking_date, booking_type_id, original_time, edited_time, pair_id, source, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000001022', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-06', bt_a1, 480, 480, '00000000-0000-0000-0000-000000001020', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000001023', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-06', bt_a2, 1050, 1050, '00000000-0000-0000-0000-000000001020', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000001024', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-06', bt_p1, 735, 735, '00000000-0000-0000-0000-000000001021', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000001025', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-06', bt_p2, 765, 765, '00000000-0000-0000-0000-000000001021', 'terminal', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Jan 7 (Wed) 08:30-17:00, break 12:00-12:30
  INSERT INTO bookings (id, tenant_id, employee_id, booking_date, booking_type_id, original_time, edited_time, pair_id, source, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000001032', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-07', bt_a1, 510, 510, '00000000-0000-0000-0000-000000001030', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000001033', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-07', bt_a2, 1020, 1020, '00000000-0000-0000-0000-000000001030', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000001034', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-07', bt_p1, 720, 720, '00000000-0000-0000-0000-000000001031', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000001035', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-07', bt_p2, 750, 750, '00000000-0000-0000-0000-000000001031', 'terminal', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Jan 8 (Thu) 08:00-16:30, break 12:00-12:30
  INSERT INTO bookings (id, tenant_id, employee_id, booking_date, booking_type_id, original_time, edited_time, pair_id, source, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000001042', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-08', bt_a1, 480, 480, '00000000-0000-0000-0000-000000001040', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000001043', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-08', bt_a2, 990, 990, '00000000-0000-0000-0000-000000001040', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000001044', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-08', bt_p1, 720, 720, '00000000-0000-0000-0000-000000001041', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000001045', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-08', bt_p2, 750, 750, '00000000-0000-0000-0000-000000001041', 'terminal', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Jan 9 (Fri) 08:00-17:00, break 12:00-12:30
  INSERT INTO bookings (id, tenant_id, employee_id, booking_date, booking_type_id, original_time, edited_time, pair_id, source, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000001052', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-09', bt_a1, 480, 480, '00000000-0000-0000-0000-000000001050', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000001053', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-09', bt_a2, 1020, 1020, '00000000-0000-0000-0000-000000001050', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000001054', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-09', bt_p1, 720, 720, '00000000-0000-0000-0000-000000001051', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000001055', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-09', bt_p2, 750, 750, '00000000-0000-0000-0000-000000001051', 'terminal', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Jan 12 (Mon) 08:00-17:15, break 12:00-12:30
  INSERT INTO bookings (id, tenant_id, employee_id, booking_date, booking_type_id, original_time, edited_time, pair_id, source, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000001062', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-12', bt_a1, 480, 480, '00000000-0000-0000-0000-000000001060', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000001063', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-12', bt_a2, 1035, 1035, '00000000-0000-0000-0000-000000001060', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000001064', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-12', bt_p1, 720, 720, '00000000-0000-0000-0000-000000001061', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000001065', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-12', bt_p2, 750, 750, '00000000-0000-0000-0000-000000001061', 'terminal', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Jan 13 (Tue) 07:30-16:30, break 12:00-12:30
  INSERT INTO bookings (id, tenant_id, employee_id, booking_date, booking_type_id, original_time, edited_time, pair_id, source, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000001072', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-13', bt_a1, 450, 450, '00000000-0000-0000-0000-000000001070', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000001073', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-13', bt_a2, 990, 990, '00000000-0000-0000-0000-000000001070', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000001074', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-13', bt_p1, 720, 720, '00000000-0000-0000-0000-000000001071', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000001075', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-13', bt_p2, 750, 750, '00000000-0000-0000-0000-000000001071', 'terminal', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Jan 14 (Wed) 08:15-17:30, break 12:15-12:45
  INSERT INTO bookings (id, tenant_id, employee_id, booking_date, booking_type_id, original_time, edited_time, pair_id, source, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000001082', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-14', bt_a1, 495, 495, '00000000-0000-0000-0000-000000001080', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000001083', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-14', bt_a2, 1050, 1050, '00000000-0000-0000-0000-000000001080', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000001084', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-14', bt_p1, 735, 735, '00000000-0000-0000-0000-000000001081', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000001085', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-14', bt_p2, 765, 765, '00000000-0000-0000-0000-000000001081', 'terminal', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Jan 15 (Thu) 08:00-17:00, break 12:00-12:30
  INSERT INTO bookings (id, tenant_id, employee_id, booking_date, booking_type_id, original_time, edited_time, pair_id, source, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000001092', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-15', bt_a1, 480, 480, '00000000-0000-0000-0000-000000001090', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000001093', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-15', bt_a2, 1020, 1020, '00000000-0000-0000-0000-000000001090', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000001094', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-15', bt_p1, 720, 720, '00000000-0000-0000-0000-000000001091', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000001095', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-15', bt_p2, 750, 750, '00000000-0000-0000-0000-000000001091', 'terminal', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Jan 16 (Fri) 08:00-16:00, break 12:00-12:30 (short Friday)
  INSERT INTO bookings (id, tenant_id, employee_id, booking_date, booking_type_id, original_time, edited_time, pair_id, source, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000001102', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-16', bt_a1, 480, 480, '00000000-0000-0000-0000-000000001100', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000001103', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-16', bt_a2, 960, 960, '00000000-0000-0000-0000-000000001100', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000001104', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-16', bt_p1, 720, 720, '00000000-0000-0000-0000-000000001101', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000001105', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-16', bt_p2, 750, 750, '00000000-0000-0000-0000-000000001101', 'terminal', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Jan 19 (Mon) 08:00-18:00, break 12:00-12:30 (long day)
  INSERT INTO bookings (id, tenant_id, employee_id, booking_date, booking_type_id, original_time, edited_time, pair_id, source, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000001112', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-19', bt_a1, 480, 480, '00000000-0000-0000-0000-000000001110', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000001113', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-19', bt_a2, 1080, 1080, '00000000-0000-0000-0000-000000001110', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000001114', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-19', bt_p1, 720, 720, '00000000-0000-0000-0000-000000001111', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000001115', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-19', bt_p2, 750, 750, '00000000-0000-0000-0000-000000001111', 'terminal', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Jan 20 (Tue) 08:00-17:00, break 12:00-12:30
  INSERT INTO bookings (id, tenant_id, employee_id, booking_date, booking_type_id, original_time, edited_time, pair_id, source, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000001122', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-20', bt_a1, 480, 480, '00000000-0000-0000-0000-000000001120', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000001123', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-20', bt_a2, 1020, 1020, '00000000-0000-0000-0000-000000001120', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000001124', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-20', bt_p1, 720, 720, '00000000-0000-0000-0000-000000001121', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000001125', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-20', bt_p2, 750, 750, '00000000-0000-0000-0000-000000001121', 'terminal', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Jan 21 (Wed) 08:00-17:00, NO break (error day)
  INSERT INTO bookings (id, tenant_id, employee_id, booking_date, booking_type_id, original_time, edited_time, pair_id, source, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000001132', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-21', bt_a1, 480, 480, '00000000-0000-0000-0000-000000001130', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000001133', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-21', bt_a2, 1020, 1020, '00000000-0000-0000-0000-000000001130', 'terminal', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Jan 22 (Thu) 08:00-17:00, break 12:00-12:30
  INSERT INTO bookings (id, tenant_id, employee_id, booking_date, booking_type_id, original_time, edited_time, pair_id, source, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000001142', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-22', bt_a1, 480, 480, '00000000-0000-0000-0000-000000001140', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000001143', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-22', bt_a2, 1020, 1020, '00000000-0000-0000-0000-000000001140', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000001144', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-22', bt_p1, 720, 720, '00000000-0000-0000-0000-000000001141', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000001145', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-22', bt_p2, 750, 750, '00000000-0000-0000-0000-000000001141', 'terminal', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Jan 23 (Fri) 08:00-16:30, break 12:00-12:30
  INSERT INTO bookings (id, tenant_id, employee_id, booking_date, booking_type_id, original_time, edited_time, pair_id, source, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000001152', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-23', bt_a1, 480, 480, '00000000-0000-0000-0000-000000001150', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000001153', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-23', bt_a2, 990, 990, '00000000-0000-0000-0000-000000001150', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000001154', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-23', bt_p1, 720, 720, '00000000-0000-0000-0000-000000001151', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000001155', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-23', bt_p2, 750, 750, '00000000-0000-0000-0000-000000001151', 'terminal', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  ---------------------------------------------------------------
  -- Regular User Employee bookings (Jan 2026, source=web)
  ---------------------------------------------------------------

  -- Jan 2: 09:00-18:00, break 12:30-13:00
  INSERT INTO bookings (id, tenant_id, employee_id, booking_date, booking_type_id, original_time, edited_time, pair_id, source, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000002002', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-02', bt_a1, 540, 540, '00000000-0000-0000-0000-000000002000', 'web', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000002003', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-02', bt_a2, 1080, 1080, '00000000-0000-0000-0000-000000002000', 'web', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000002004', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-02', bt_p1, 750, 750, '00000000-0000-0000-0000-000000002001', 'web', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000002005', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-02', bt_p2, 780, 780, '00000000-0000-0000-0000-000000002001', 'web', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Jan 5: 08:45-17:45, break 12:30-13:00
  INSERT INTO bookings (id, tenant_id, employee_id, booking_date, booking_type_id, original_time, edited_time, pair_id, source, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000002012', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-05', bt_a1, 525, 525, '00000000-0000-0000-0000-000000002010', 'web', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000002013', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-05', bt_a2, 1065, 1065, '00000000-0000-0000-0000-000000002010', 'web', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000002014', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-05', bt_p1, 750, 750, '00000000-0000-0000-0000-000000002011', 'web', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000002015', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-05', bt_p2, 780, 780, '00000000-0000-0000-0000-000000002011', 'web', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Jan 6-9, 12, 14-16, 19-23 for User (representative subset)
  -- Jan 6: 09:00-18:30, break 12:30-13:15 (45 min)
  INSERT INTO bookings (id, tenant_id, employee_id, booking_date, booking_type_id, original_time, edited_time, pair_id, source, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000002022', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-06', bt_a1, 540, 540, '00000000-0000-0000-0000-000000002020', 'web', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000002023', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-06', bt_a2, 1110, 1110, '00000000-0000-0000-0000-000000002020', 'web', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000002024', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-06', bt_p1, 750, 750, '00000000-0000-0000-0000-000000002021', 'web', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000002025', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-06', bt_p2, 795, 795, '00000000-0000-0000-0000-000000002021', 'web', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Jan 7: 09:00-17:30, break 12:30-13:00
  INSERT INTO bookings (id, tenant_id, employee_id, booking_date, booking_type_id, original_time, edited_time, pair_id, source, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000002032', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-07', bt_a1, 540, 540, '00000000-0000-0000-0000-000000002030', 'web', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000002033', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-07', bt_a2, 1050, 1050, '00000000-0000-0000-0000-000000002030', 'web', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000002034', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-07', bt_p1, 750, 750, '00000000-0000-0000-0000-000000002031', 'web', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000002035', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-07', bt_p2, 780, 780, '00000000-0000-0000-0000-000000002031', 'web', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Jan 8: 09:00-17:00, break 12:30-13:00
  INSERT INTO bookings (id, tenant_id, employee_id, booking_date, booking_type_id, original_time, edited_time, pair_id, source, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000002042', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-08', bt_a1, 540, 540, '00000000-0000-0000-0000-000000002040', 'web', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000002043', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-08', bt_a2, 1020, 1020, '00000000-0000-0000-0000-000000002040', 'web', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000002044', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-08', bt_p1, 750, 750, '00000000-0000-0000-0000-000000002041', 'web', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000002045', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-08', bt_p2, 780, 780, '00000000-0000-0000-0000-000000002041', 'web', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Jan 9: 09:00-17:30, break 12:30-13:00
  INSERT INTO bookings (id, tenant_id, employee_id, booking_date, booking_type_id, original_time, edited_time, pair_id, source, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000002052', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-09', bt_a1, 540, 540, '00000000-0000-0000-0000-000000002050', 'web', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000002053', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-09', bt_a2, 1050, 1050, '00000000-0000-0000-0000-000000002050', 'web', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000002054', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-09', bt_p1, 750, 750, '00000000-0000-0000-0000-000000002051', 'web', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000002055', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-09', bt_p2, 780, 780, '00000000-0000-0000-0000-000000002051', 'web', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Jan 12: 09:00-18:00, break 12:30-13:00
  INSERT INTO bookings (id, tenant_id, employee_id, booking_date, booking_type_id, original_time, edited_time, pair_id, source, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000002062', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-12', bt_a1, 540, 540, '00000000-0000-0000-0000-000000002060', 'web', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000002063', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-12', bt_a2, 1080, 1080, '00000000-0000-0000-0000-000000002060', 'web', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000002064', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-12', bt_p1, 750, 750, '00000000-0000-0000-0000-000000002061', 'web', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000002065', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-12', bt_p2, 780, 780, '00000000-0000-0000-0000-000000002061', 'web', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Jan 13: 09:00 clock in only (missing clock out - ERROR day)
  INSERT INTO bookings (id, tenant_id, employee_id, booking_date, booking_type_id, original_time, edited_time, pair_id, source, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000002072', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-13', bt_a1, 540, 540, '00000000-0000-0000-0000-000000002070', 'web', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Jan 14-16, 19-23 for User (standard days)
  INSERT INTO bookings (id, tenant_id, employee_id, booking_date, booking_type_id, original_time, edited_time, pair_id, source, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000002082', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-14', bt_a1, 540, 540, '00000000-0000-0000-0000-000000002080', 'web', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000002083', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-14', bt_a2, 1080, 1080, '00000000-0000-0000-0000-000000002080', 'web', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000002084', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-14', bt_p1, 750, 750, '00000000-0000-0000-0000-000000002081', 'web', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000002085', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-14', bt_p2, 780, 780, '00000000-0000-0000-0000-000000002081', 'web', NOW(), NOW()),
    -- Jan 15
    ('00000000-0000-0000-0000-000000002092', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-15', bt_a1, 540, 540, '00000000-0000-0000-0000-000000002090', 'web', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000002093', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-15', bt_a2, 1050, 1050, '00000000-0000-0000-0000-000000002090', 'web', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000002094', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-15', bt_p1, 750, 750, '00000000-0000-0000-0000-000000002091', 'web', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000002095', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-15', bt_p2, 780, 780, '00000000-0000-0000-0000-000000002091', 'web', NOW(), NOW()),
    -- Jan 16
    ('00000000-0000-0000-0000-000000002102', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-16', bt_a1, 540, 540, '00000000-0000-0000-0000-000000002100', 'web', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000002103', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-16', bt_a2, 990, 990, '00000000-0000-0000-0000-000000002100', 'web', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000002104', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-16', bt_p1, 750, 750, '00000000-0000-0000-0000-000000002101', 'web', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000002105', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-16', bt_p2, 780, 780, '00000000-0000-0000-0000-000000002101', 'web', NOW(), NOW()),
    -- Jan 19: 09:00-18:30
    ('00000000-0000-0000-0000-000000002112', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-19', bt_a1, 540, 540, '00000000-0000-0000-0000-000000002110', 'web', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000002113', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-19', bt_a2, 1110, 1110, '00000000-0000-0000-0000-000000002110', 'web', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000002114', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-19', bt_p1, 750, 750, '00000000-0000-0000-0000-000000002111', 'web', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000002115', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-19', bt_p2, 780, 780, '00000000-0000-0000-0000-000000002111', 'web', NOW(), NOW()),
    -- Jan 20-23: 09:00-17:30 standard
    ('00000000-0000-0000-0000-000000002122', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-20', bt_a1, 540, 540, '00000000-0000-0000-0000-000000002120', 'web', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000002123', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-20', bt_a2, 1050, 1050, '00000000-0000-0000-0000-000000002120', 'web', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000002124', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-20', bt_p1, 750, 750, '00000000-0000-0000-0000-000000002121', 'web', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000002125', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-20', bt_p2, 780, 780, '00000000-0000-0000-0000-000000002121', 'web', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000002132', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-21', bt_a1, 540, 540, '00000000-0000-0000-0000-000000002130', 'web', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000002133', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-21', bt_a2, 1050, 1050, '00000000-0000-0000-0000-000000002130', 'web', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000002134', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-21', bt_p1, 750, 750, '00000000-0000-0000-0000-000000002131', 'web', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000002135', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-21', bt_p2, 780, 780, '00000000-0000-0000-0000-000000002131', 'web', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000002142', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-22', bt_a1, 540, 540, '00000000-0000-0000-0000-000000002140', 'web', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000002143', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-22', bt_a2, 1050, 1050, '00000000-0000-0000-0000-000000002140', 'web', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000002144', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-22', bt_p1, 750, 750, '00000000-0000-0000-0000-000000002141', 'web', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000002145', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-22', bt_p2, 780, 780, '00000000-0000-0000-0000-000000002141', 'web', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000002152', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-23', bt_a1, 540, 540, '00000000-0000-0000-0000-000000002150', 'web', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000002153', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-23', bt_a2, 1020, 1020, '00000000-0000-0000-0000-000000002150', 'web', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000002154', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-23', bt_p1, 750, 750, '00000000-0000-0000-0000-000000002151', 'web', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000002155', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-23', bt_p2, 780, 780, '00000000-0000-0000-0000-000000002151', 'web', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  ---------------------------------------------------------------
  -- Maria Schmidt bookings (part-time 4h, no breaks, terminal)
  ---------------------------------------------------------------
  INSERT INTO bookings (id, tenant_id, employee_id, booking_date, booking_type_id, original_time, edited_time, pair_id, source, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000006002', t_id, '00000000-0000-0000-0000-000000000013', '2026-01-02', bt_a1, 540, 540, '00000000-0000-0000-0000-000000006000', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000006003', t_id, '00000000-0000-0000-0000-000000000013', '2026-01-02', bt_a2, 780, 780, '00000000-0000-0000-0000-000000006000', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000006012', t_id, '00000000-0000-0000-0000-000000000013', '2026-01-05', bt_a1, 525, 525, '00000000-0000-0000-0000-000000006010', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000006013', t_id, '00000000-0000-0000-0000-000000000013', '2026-01-05', bt_a2, 765, 765, '00000000-0000-0000-0000-000000006010', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000006022', t_id, '00000000-0000-0000-0000-000000000013', '2026-01-06', bt_a1, 540, 540, '00000000-0000-0000-0000-000000006020', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000006023', t_id, '00000000-0000-0000-0000-000000000013', '2026-01-06', bt_a2, 780, 780, '00000000-0000-0000-0000-000000006020', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000006032', t_id, '00000000-0000-0000-0000-000000000013', '2026-01-07', bt_a1, 555, 555, '00000000-0000-0000-0000-000000006030', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000006033', t_id, '00000000-0000-0000-0000-000000000013', '2026-01-07', bt_a2, 795, 795, '00000000-0000-0000-0000-000000006030', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000006042', t_id, '00000000-0000-0000-0000-000000000013', '2026-01-08', bt_a1, 540, 540, '00000000-0000-0000-0000-000000006040', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000006043', t_id, '00000000-0000-0000-0000-000000000013', '2026-01-08', bt_a2, 765, 765, '00000000-0000-0000-0000-000000006040', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000006052', t_id, '00000000-0000-0000-0000-000000000013', '2026-01-09', bt_a1, 540, 540, '00000000-0000-0000-0000-000000006050', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000006053', t_id, '00000000-0000-0000-0000-000000000013', '2026-01-09', bt_a2, 780, 780, '00000000-0000-0000-0000-000000006050', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000006062', t_id, '00000000-0000-0000-0000-000000000013', '2026-01-12', bt_a1, 525, 525, '00000000-0000-0000-0000-000000006060', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000006063', t_id, '00000000-0000-0000-0000-000000000013', '2026-01-12', bt_a2, 780, 780, '00000000-0000-0000-0000-000000006060', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000006072', t_id, '00000000-0000-0000-0000-000000000013', '2026-01-13', bt_a1, 540, 540, '00000000-0000-0000-0000-000000006070', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000006073', t_id, '00000000-0000-0000-0000-000000000013', '2026-01-13', bt_a2, 780, 780, '00000000-0000-0000-0000-000000006070', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000006082', t_id, '00000000-0000-0000-0000-000000000013', '2026-01-14', bt_a1, 540, 540, '00000000-0000-0000-0000-000000006080', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000006083', t_id, '00000000-0000-0000-0000-000000000013', '2026-01-14', bt_a2, 810, 810, '00000000-0000-0000-0000-000000006080', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000006092', t_id, '00000000-0000-0000-0000-000000000013', '2026-01-15', bt_a1, 540, 540, '00000000-0000-0000-0000-000000006090', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000006093', t_id, '00000000-0000-0000-0000-000000000013', '2026-01-15', bt_a2, 780, 780, '00000000-0000-0000-0000-000000006090', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000006102', t_id, '00000000-0000-0000-0000-000000000013', '2026-01-16', bt_a1, 540, 540, '00000000-0000-0000-0000-000000006100', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000006103', t_id, '00000000-0000-0000-0000-000000000013', '2026-01-16', bt_a2, 750, 750, '00000000-0000-0000-0000-000000006100', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000006112', t_id, '00000000-0000-0000-0000-000000000013', '2026-01-19', bt_a1, 540, 540, '00000000-0000-0000-0000-000000006110', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000006113', t_id, '00000000-0000-0000-0000-000000000013', '2026-01-19', bt_a2, 795, 795, '00000000-0000-0000-0000-000000006110', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000006122', t_id, '00000000-0000-0000-0000-000000000013', '2026-01-20', bt_a1, 540, 540, '00000000-0000-0000-0000-000000006120', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000006123', t_id, '00000000-0000-0000-0000-000000000013', '2026-01-20', bt_a2, 780, 780, '00000000-0000-0000-0000-000000006120', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000006132', t_id, '00000000-0000-0000-0000-000000000013', '2026-01-21', bt_a1, 540, 540, '00000000-0000-0000-0000-000000006130', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000006133', t_id, '00000000-0000-0000-0000-000000000013', '2026-01-21', bt_a2, 780, 780, '00000000-0000-0000-0000-000000006130', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000006142', t_id, '00000000-0000-0000-0000-000000000013', '2026-01-22', bt_a1, 540, 540, '00000000-0000-0000-0000-000000006140', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000006143', t_id, '00000000-0000-0000-0000-000000000013', '2026-01-22', bt_a2, 780, 780, '00000000-0000-0000-0000-000000006140', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000006152', t_id, '00000000-0000-0000-0000-000000000013', '2026-01-23', bt_a1, 540, 540, '00000000-0000-0000-0000-000000006150', 'terminal', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000006153', t_id, '00000000-0000-0000-0000-000000000013', '2026-01-23', bt_a2, 780, 780, '00000000-0000-0000-0000-000000006150', 'terminal', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

END $$;

-- =============================================================
-- 17. Daily values (January 2026)
-- =============================================================

INSERT INTO daily_values (id, tenant_id, employee_id, value_date, gross_time, net_time, target_time, overtime, undertime, break_time, has_error, error_codes, warnings, first_come, last_go, booking_count, status, created_at, updated_at)
VALUES
  -- Admin Employee daily values (target=480 min = 8h)
  ('00000000-0000-0000-0000-000000003000', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '2026-01-02', 540, 510, 480, 30, 0, 30, false, NULL, NULL, 480, 1020, 4, 'calculated', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000003001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '2026-01-05', 540, 510, 480, 30, 0, 30, false, NULL, NULL, 465, 1005, 4, 'calculated', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000003002', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '2026-01-06', 570, 540, 480, 60, 0, 30, false, NULL, '{"HIGH_OVERTIME"}', 480, 1050, 4, 'calculated', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000003003', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '2026-01-07', 510, 480, 480, 0, 0, 30, false, NULL, NULL, 510, 1020, 4, 'calculated', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000003004', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '2026-01-08', 510, 480, 480, 0, 0, 30, false, NULL, NULL, 480, 990, 4, 'calculated', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000003005', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '2026-01-09', 540, 510, 480, 30, 0, 30, false, NULL, NULL, 480, 1020, 4, 'calculated', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000003006', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '2026-01-12', 555, 525, 480, 45, 0, 30, false, NULL, NULL, 480, 1035, 4, 'calculated', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000003007', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '2026-01-13', 540, 510, 480, 30, 0, 30, false, NULL, NULL, 450, 990, 4, 'calculated', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000003008', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '2026-01-14', 555, 525, 480, 45, 0, 30, false, NULL, NULL, 495, 1050, 4, 'calculated', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000003009', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '2026-01-15', 540, 510, 480, 30, 0, 30, false, NULL, NULL, 480, 1020, 4, 'calculated', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000003010', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '2026-01-16', 480, 450, 480, 0, 30, 30, false, NULL, NULL, 480, 960, 4, 'calculated', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000003011', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '2026-01-19', 600, 570, 480, 90, 0, 30, false, NULL, '{"APPROACHING_WORK_LIMIT","HIGH_OVERTIME"}', 480, 1080, 4, 'calculated', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000003012', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '2026-01-20', 540, 510, 480, 30, 0, 30, false, NULL, NULL, 480, 1020, 4, 'calculated', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000003013', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '2026-01-21', 540, 540, 480, 60, 0, 0, true, '{"NO_BREAK_RECORDED"}', NULL, 480, 1020, 2, 'calculated', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000003014', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '2026-01-22', 540, 510, 480, 30, 0, 30, false, NULL, NULL, 480, 1020, 4, 'calculated', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000003015', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '2026-01-23', 510, 480, 480, 0, 0, 30, false, NULL, NULL, 480, 990, 4, 'calculated', NOW(), NOW()),

  -- Regular User daily values (target=480)
  ('00000000-0000-0000-0000-000000004000', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', '2026-01-02', 540, 510, 480, 30, 0, 30, false, NULL, NULL, 540, 1080, 4, 'calculated', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000004001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', '2026-01-05', 540, 510, 480, 30, 0, 30, false, NULL, NULL, 525, 1065, 4, 'calculated', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000004002', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', '2026-01-06', 570, 525, 480, 45, 0, 45, false, NULL, NULL, 540, 1110, 4, 'calculated', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000004003', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', '2026-01-07', 510, 480, 480, 0, 0, 30, false, NULL, NULL, 540, 1050, 4, 'calculated', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000004004', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', '2026-01-08', 480, 450, 480, 0, 30, 30, false, NULL, NULL, 540, 1020, 4, 'calculated', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000004005', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', '2026-01-09', 510, 480, 480, 0, 0, 30, false, NULL, NULL, 540, 1050, 4, 'calculated', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000004006', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', '2026-01-12', 540, 510, 480, 30, 0, 30, false, NULL, NULL, 540, 1080, 4, 'calculated', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000004007', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', '2026-01-13', 0, 0, 480, 0, 0, 0, true, '{"MISSING_GO"}', NULL, 540, NULL, 1, 'calculated', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000004008', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', '2026-01-14', 540, 510, 480, 30, 0, 30, false, NULL, NULL, 540, 1080, 4, 'calculated', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000004009', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', '2026-01-15', 510, 480, 480, 0, 0, 30, false, NULL, NULL, 540, 1050, 4, 'calculated', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000004010', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', '2026-01-16', 450, 420, 480, 0, 60, 30, false, NULL, NULL, 540, 990, 4, 'calculated', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000004011', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', '2026-01-19', 570, 540, 480, 60, 0, 30, false, NULL, '{"HIGH_OVERTIME"}', 540, 1110, 4, 'calculated', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000004012', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', '2026-01-20', 510, 480, 480, 0, 0, 30, false, NULL, NULL, 540, 1050, 4, 'calculated', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000004013', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', '2026-01-21', 510, 480, 480, 0, 0, 30, false, NULL, NULL, 540, 1050, 4, 'calculated', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000004014', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', '2026-01-22', 510, 480, 480, 0, 0, 30, false, NULL, NULL, 540, 1050, 4, 'calculated', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000004015', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', '2026-01-23', 480, 450, 480, 0, 30, 30, false, NULL, NULL, 540, 1020, 4, 'calculated', NOW(), NOW()),

  -- Maria Schmidt daily values (target=240 min = 4h, no breaks)
  ('00000000-0000-0000-0000-000000006500', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000013', '2026-01-02', 240, 240, 240, 0, 0, 0, false, NULL, NULL, 540, 780, 2, 'calculated', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000006501', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000013', '2026-01-05', 240, 240, 240, 0, 0, 0, false, NULL, NULL, 525, 765, 2, 'calculated', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000006502', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000013', '2026-01-06', 240, 240, 240, 0, 0, 0, false, NULL, NULL, 540, 780, 2, 'calculated', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000006503', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000013', '2026-01-07', 240, 240, 240, 0, 0, 0, false, NULL, NULL, 555, 795, 2, 'calculated', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000006504', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000013', '2026-01-08', 225, 225, 240, 0, 15, 0, false, NULL, NULL, 540, 765, 2, 'calculated', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000006505', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000013', '2026-01-09', 240, 240, 240, 0, 0, 0, false, NULL, NULL, 540, 780, 2, 'calculated', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000006506', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000013', '2026-01-12', 255, 255, 240, 15, 0, 0, false, NULL, NULL, 525, 780, 2, 'calculated', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000006507', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000013', '2026-01-13', 240, 240, 240, 0, 0, 0, false, NULL, NULL, 540, 780, 2, 'calculated', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000006508', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000013', '2026-01-14', 270, 270, 240, 30, 0, 0, false, NULL, NULL, 540, 810, 2, 'calculated', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000006509', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000013', '2026-01-15', 240, 240, 240, 0, 0, 0, false, NULL, NULL, 540, 780, 2, 'calculated', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000006510', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000013', '2026-01-16', 210, 210, 240, 0, 30, 0, false, NULL, NULL, 540, 750, 2, 'calculated', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000006511', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000013', '2026-01-19', 255, 255, 240, 15, 0, 0, false, NULL, NULL, 540, 795, 2, 'calculated', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000006512', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000013', '2026-01-20', 240, 240, 240, 0, 0, 0, false, NULL, NULL, 540, 780, 2, 'calculated', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000006513', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000013', '2026-01-21', 240, 240, 240, 0, 0, 0, false, NULL, NULL, 540, 780, 2, 'calculated', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000006514', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000013', '2026-01-22', 240, 240, 240, 0, 0, 0, false, NULL, NULL, 540, 780, 2, 'calculated', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000006515', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000013', '2026-01-23', 240, 240, 240, 0, 0, 0, false, NULL, NULL, 540, 780, 2, 'calculated', NOW(), NOW())
ON CONFLICT (employee_id, value_date) DO NOTHING;

-- =============================================================
-- 17b. Daily account values (January 2026)
-- =============================================================
-- Simulates what DailyCalcService.postDailyAccountValues() + postSurchargeValues() would produce.
-- Accounts:
--   NIGHT  (00000000-0000-0000-0000-000000001101) - Night Shift Bonus (surcharge)
--   SAT    (00000000-0000-0000-0000-000000001102) - Saturday Bonus (surcharge)
--   SUN    (00000000-0000-0000-0000-000000001103) - Sunday/Holiday Bonus (surcharge)
--   ONCALL (00000000-0000-0000-0000-000000001104) - On-Call Duty (net_time)
--   TRAVEL (00000000-0000-0000-0000-000000001105) - Travel Time (net_time)
-- Employees with bookings:
--   Admin User (EMP001):       TRAVEL (business trips ~2x/week), occasional NIGHT
--   Regular User (EMP002):     ONCALL (on-call rotation), occasional TRAVEL
--   Thomas Mueller (EMP004):   NIGHT (shift worker, most nights), SAT/SUN surcharges
--   Markus Braun (EMP007):     TRAVEL (field service, frequent), occasional ONCALL
--   Stefan Lang (EMP009):      NIGHT (shift worker), SUN surcharges

INSERT INTO daily_account_values (id, tenant_id, employee_id, account_id, value_date, value_minutes, source, day_plan_id, created_at, updated_at)
VALUES
  -- Admin User (EMP001) - TRAVEL: business trips Tue/Thu, 60-120 min each
  ('00000000-0000-0000-0000-00000000a001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000001105', '2026-01-06', 90, 'net_time', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a002', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000001105', '2026-01-08', 120, 'net_time', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a003', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000001105', '2026-01-13', 60, 'net_time', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a004', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000001105', '2026-01-15', 90, 'net_time', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a005', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000001105', '2026-01-20', 120, 'net_time', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a006', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000001105', '2026-01-22', 60, 'net_time', NULL, NOW(), NOW()),
  -- Admin User (EMP001) - NIGHT: one late evening session
  ('00000000-0000-0000-0000-00000000a007', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000001101', '2026-01-19', 120, 'surcharge', NULL, NOW(), NOW()),

  -- Regular User (EMP002) - ONCALL: on-call week 2 and week 4
  ('00000000-0000-0000-0000-00000000a010', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000001104', '2026-01-05', 480, 'net_time', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a011', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000001104', '2026-01-06', 480, 'net_time', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a012', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000001104', '2026-01-07', 480, 'net_time', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a013', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000001104', '2026-01-08', 480, 'net_time', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a014', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000001104', '2026-01-09', 480, 'net_time', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a015', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000001104', '2026-01-19', 480, 'net_time', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a016', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000001104', '2026-01-20', 480, 'net_time', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a017', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000001104', '2026-01-21', 480, 'net_time', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a018', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000001104', '2026-01-22', 480, 'net_time', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a019', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000001104', '2026-01-23', 480, 'net_time', NULL, NOW(), NOW()),
  -- Regular User (EMP002) - TRAVEL: occasional trips
  ('00000000-0000-0000-0000-00000000a01a', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000001105', '2026-01-14', 90, 'net_time', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a01b', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000001105', '2026-01-21', 60, 'net_time', NULL, NOW(), NOW()),

  -- Thomas Mueller (EMP004) - NIGHT: shift worker, night surcharge most days
  ('00000000-0000-0000-0000-00000000a020', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000001101', '2026-01-02', 180, 'surcharge', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a021', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000001101', '2026-01-05', 180, 'surcharge', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a022', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000001101', '2026-01-06', 180, 'surcharge', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a023', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000001101', '2026-01-07', 180, 'surcharge', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a024', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000001101', '2026-01-08', 180, 'surcharge', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a025', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000001101', '2026-01-09', 120, 'surcharge', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a026', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000001101', '2026-01-12', 180, 'surcharge', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a027', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000001101', '2026-01-13', 180, 'surcharge', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a028', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000001101', '2026-01-14', 180, 'surcharge', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a029', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000001101', '2026-01-15', 180, 'surcharge', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a02a', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000001101', '2026-01-16', 120, 'surcharge', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a02b', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000001101', '2026-01-19', 180, 'surcharge', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a02c', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000001101', '2026-01-20', 180, 'surcharge', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a02d', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000001101', '2026-01-21', 180, 'surcharge', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a02e', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000001101', '2026-01-22', 180, 'surcharge', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a02f', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000001101', '2026-01-23', 120, 'surcharge', NULL, NOW(), NOW()),
  -- Thomas Mueller (EMP004) - SAT: Saturday surcharges (Jan 3, 10, 17)
  ('00000000-0000-0000-0000-00000000a030', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000001102', '2026-01-03', 360, 'surcharge', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a031', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000001102', '2026-01-10', 360, 'surcharge', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a032', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000001102', '2026-01-17', 300, 'surcharge', NULL, NOW(), NOW()),
  -- Thomas Mueller (EMP004) - SUN: Sunday surcharges (Jan 4, 11, 18)
  ('00000000-0000-0000-0000-00000000a033', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000001103', '2026-01-04', 360, 'surcharge', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a034', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000001103', '2026-01-11', 360, 'surcharge', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a035', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000001103', '2026-01-18', 300, 'surcharge', NULL, NOW(), NOW()),

  -- Markus Braun (EMP007) - TRAVEL: field service, 3-4x/week
  ('00000000-0000-0000-0000-00000000a040', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-000000001105', '2026-01-02', 120, 'net_time', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a041', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-000000001105', '2026-01-05', 90, 'net_time', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a042', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-000000001105', '2026-01-06', 150, 'net_time', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a043', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-000000001105', '2026-01-07', 60, 'net_time', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a044', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-000000001105', '2026-01-08', 120, 'net_time', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a045', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-000000001105', '2026-01-12', 180, 'net_time', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a046', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-000000001105', '2026-01-13', 90, 'net_time', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a047', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-000000001105', '2026-01-14', 120, 'net_time', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a048', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-000000001105', '2026-01-15', 60, 'net_time', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a049', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-000000001105', '2026-01-19', 150, 'net_time', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a04a', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-000000001105', '2026-01-20', 90, 'net_time', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a04b', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-000000001105', '2026-01-21', 120, 'net_time', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a04c', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-000000001105', '2026-01-22', 60, 'net_time', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a04d', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-000000001105', '2026-01-23', 90, 'net_time', NULL, NOW(), NOW()),
  -- Markus Braun (EMP007) - ONCALL: one on-call week
  ('00000000-0000-0000-0000-00000000a04e', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-000000001104', '2026-01-12', 480, 'net_time', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a04f', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-000000001104', '2026-01-13', 480, 'net_time', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a050', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-000000001104', '2026-01-14', 480, 'net_time', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a051', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-000000001104', '2026-01-15', 480, 'net_time', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a052', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-000000001104', '2026-01-16', 480, 'net_time', NULL, NOW(), NOW()),

  -- Stefan Lang (EMP009) - NIGHT: shift worker, night surcharge most days
  ('00000000-0000-0000-0000-00000000a060', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000019', '00000000-0000-0000-0000-000000001101', '2026-01-02', 150, 'surcharge', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a061', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000019', '00000000-0000-0000-0000-000000001101', '2026-01-05', 150, 'surcharge', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a062', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000019', '00000000-0000-0000-0000-000000001101', '2026-01-06', 180, 'surcharge', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a063', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000019', '00000000-0000-0000-0000-000000001101', '2026-01-07', 150, 'surcharge', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a064', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000019', '00000000-0000-0000-0000-000000001101', '2026-01-08', 150, 'surcharge', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a065', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000019', '00000000-0000-0000-0000-000000001101', '2026-01-09', 120, 'surcharge', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a066', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000019', '00000000-0000-0000-0000-000000001101', '2026-01-12', 150, 'surcharge', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a067', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000019', '00000000-0000-0000-0000-000000001101', '2026-01-13', 180, 'surcharge', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a068', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000019', '00000000-0000-0000-0000-000000001101', '2026-01-14', 150, 'surcharge', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a069', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000019', '00000000-0000-0000-0000-000000001101', '2026-01-15', 150, 'surcharge', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a06a', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000019', '00000000-0000-0000-0000-000000001101', '2026-01-16', 120, 'surcharge', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a06b', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000019', '00000000-0000-0000-0000-000000001101', '2026-01-19', 180, 'surcharge', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a06c', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000019', '00000000-0000-0000-0000-000000001101', '2026-01-20', 150, 'surcharge', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a06d', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000019', '00000000-0000-0000-0000-000000001101', '2026-01-21', 150, 'surcharge', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a06e', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000019', '00000000-0000-0000-0000-000000001101', '2026-01-22', 180, 'surcharge', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a06f', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000019', '00000000-0000-0000-0000-000000001101', '2026-01-23', 120, 'surcharge', NULL, NOW(), NOW()),
  -- Stefan Lang (EMP009) - SUN: Sunday surcharges (Jan 4, 11, 18)
  ('00000000-0000-0000-0000-00000000a070', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000019', '00000000-0000-0000-0000-000000001103', '2026-01-04', 300, 'surcharge', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a071', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000019', '00000000-0000-0000-0000-000000001103', '2026-01-11', 360, 'surcharge', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000a072', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000019', '00000000-0000-0000-0000-000000001103', '2026-01-18', 300, 'surcharge', NULL, NOW(), NOW())
ON CONFLICT (employee_id, value_date, account_id, source) DO NOTHING;

-- =============================================================
-- 18. Monthly values
-- =============================================================
-- Historical 2025 (Jan-Dec closed) + January 2026 (open)
-- Flextime chains: each employee starts 2025 at 0, builds up through the year

INSERT INTO monthly_values (id, tenant_id, employee_id, year, month, total_gross_time, total_net_time, total_target_time, total_overtime, total_undertime, total_break_time, flextime_start, flextime_change, flextime_end, vacation_taken, sick_days, other_absence_days, work_days, days_with_errors, is_closed, created_at, updated_at)
VALUES
  -- Admin Employee 2025 (Jan-Nov generated, Dec hardcoded)
  -- Flextime chain: 0 -> 60 -> 105 -> 135 -> 195 -> 240 -> 300 -> 330 -> 375 -> 435 -> 480 -> 570 -> 720
  ('00000000-0000-0000-0000-000000010001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 2025, 1, 10710, 10140, 10080, 60, 0, 570, 0, 60, 60, 0, 0, 0, 21, 0, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000010002', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 2025, 2, 9165, 8685, 8640, 45, 0, 480, 60, 45, 105, 2, 0, 0, 18, 0, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000010003', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 2025, 3, 10770, 10140, 10110, 30, 0, 630, 105, 30, 135, 0, 2, 0, 21, 1, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000010004', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 2025, 4, 7710, 7260, 7200, 60, 0, 450, 135, 60, 195, 5, 0, 0, 15, 0, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000010005', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 2025, 5, 10245, 9645, 9600, 45, 0, 600, 195, 45, 240, 0, 0, 0, 20, 0, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000010006', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 2025, 6, 8220, 7740, 7680, 60, 0, 480, 240, 60, 300, 3, 0, 0, 16, 0, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000010007', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 2025, 7, 9210, 8670, 8640, 30, 0, 540, 300, 30, 330, 5, 0, 0, 18, 0, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000010008', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 2025, 8, 5445, 5085, 5040, 45, 0, 360, 330, 45, 375, 10, 0, 0, 10, 0, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000010009', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 2025, 9, 11340, 10620, 10560, 60, 0, 720, 375, 60, 435, 0, 0, 0, 22, 1, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000010010', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 2025, 10, 9765, 9165, 9120, 45, 0, 600, 435, 45, 480, 0, 3, 0, 19, 0, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000010011', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 2025, 11, 9780, 9210, 9120, 90, 0, 570, 480, 90, 570, 2, 0, 0, 19, 0, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000005000', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 2025, 12, 10260, 9750, 9600, 150, 0, 510, 570, 150, 720, 2, 0, 0, 20, 0, true, NOW(), NOW()),

  -- Regular User 2025 (Jan-Dec)
  -- Flextime chain: 0 -> 30 -> 15 -> 45 -> 60 -> 90 -> 60 -> 105 -> 120 -> 150 -> 165 -> 180 -> 120
  ('00000000-0000-0000-0000-000000010101', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', 2025, 1, 9270, 8730, 8640, 30, 0+60, 540, 0, 30, 30, 0, 3, 0, 18, 0, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000010102', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', 2025, 2, 10155, 9585, 9600, 0, 15, 570, 30, -15, 15, 0, 0, 0, 19, 1, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000010103', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', 2025, 3, 10710, 10110, 10080, 30, 0, 600, 15, 30, 45, 2, 0, 0, 21, 0, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000010104', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', 2025, 4, 10215, 9615, 9600, 15, 0, 600, 45, 15, 60, 0, 0, 0, 20, 0, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000010105', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', 2025, 5, 8730, 8190, 8160, 30, 0, 540, 60, 30, 90, 3, 0, 0, 17, 0, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000010106', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', 2025, 6, 7230, 6750, 6720, 0+30, 0+60, 480, 90, -30, 60, 5, 0, 0, 14, 0, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000010107', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', 2025, 7, 10845, 10245, 10200, 45, 0, 600, 60, 45, 105, 0, 2, 0, 21, 0, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000010108', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', 2025, 8, 5415, 5055, 5040, 15, 0, 360, 105, 15, 120, 10, 0, 0, 10, 1, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000010109', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', 2025, 9, 9270, 8730, 8640, 30+60, 0, 540, 120, 30, 150, 3, 0, 0, 19, 0, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000010110', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', 2025, 10, 11415, 10815, 10800, 15, 0, 600, 150, 15, 165, 0, 0, 0, 22, 0, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000010111', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', 2025, 11, 9795, 9225, 9120, 15+90, 0, 570, 165, 15, 180, 2, 0, 0, 19, 0, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000005002', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', 2025, 12, 10080, 9540, 9600, 0, 60, 540, 180, -60, 120, 1, 1, 0, 18, 0, true, NOW(), NOW()),

  -- Maria Schmidt 2025 (part-time, target=240/day, no breaks)
  -- Flextime chain: 0 -> 15 -> 0 -> 15 -> 0 -> 15 -> 0 -> 15 -> 0 -> 15 -> 0 -> 0 -> 60
  ('00000000-0000-0000-0000-000000010201', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000013', 2025, 1, 5055, 5055, 5040, 15, 0, 0, 0, 15, 15, 0, 0, 0, 21, 0, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000010202', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000013', 2025, 2, 4785, 4785, 4800, 0, 15, 0, 15, -15, 0, 0, 0, 0, 20, 0, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000010203', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000013', 2025, 3, 5295, 5295, 5280, 15, 0, 0, 0, 15, 15, 0, 1, 0, 22, 0, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000010204', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000013', 2025, 4, 4305, 4305, 4320, 0, 15, 0, 15, -15, 0, 2, 0, 0, 18, 0, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000010205', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000013', 2025, 5, 4815, 4815, 4800, 15, 0, 0, 0, 15, 15, 0, 0, 0, 20, 0, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000010206', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000013', 2025, 6, 4545, 4545, 4560, 0, 15, 0, 15, -15, 0, 0, 0, 0, 19, 0, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000010207', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000013', 2025, 7, 4335, 4335, 4320, 15, 0, 0, 0, 15, 15, 5, 0, 0, 18, 0, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000010208', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000013', 2025, 8, 4065, 4065, 4080, 0, 15, 0, 15, -15, 0, 3, 0, 0, 17, 0, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000010209', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000013', 2025, 9, 5295, 5295, 5280, 15, 0, 0, 0, 15, 15, 0, 0, 0, 22, 0, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000010210', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000013', 2025, 10, 4785, 4785, 4800, 0, 15, 0, 15, -15, 0, 2, 0, 0, 20, 0, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000010211', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000013', 2025, 11, 5040, 5040, 5040, 0, 0, 0, 0, 0, 0, 0, 0, 0, 21, 0, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000005004', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000013', 2025, 12, 4860, 4860, 4800, 60, 0, 0, 0, 60, 60, 0, 0, 0, 20, 0, true, NOW(), NOW()),

  -- Thomas Mueller 2025 (full-time 40h, target=480/day)
  -- Flextime chain: 0 -> 30 -> 45 -> 75 -> 90 -> 120 -> 135 -> 165 -> 180 -> 195 -> 225 -> 240 -> 240
  ('00000000-0000-0000-0000-000000010301', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000014', 2025, 1, 10710, 10110, 10080, 30, 0, 600, 0, 30, 30, 0, 0, 0, 21, 0, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000010302', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000014', 2025, 2, 8775, 8175, 8160, 15, 0, 600, 30, 15, 45, 0, 3, 0, 17, 0, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000010303', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000014', 2025, 3, 10230, 9630, 9600, 30, 0, 600, 45, 30, 75, 3, 0, 0, 20, 0, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000010304', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000014', 2025, 4, 10215, 9615, 9600, 15, 0, 600, 75, 15, 90, 0, 0, 0, 20, 0, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000010305', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000014', 2025, 5, 7830, 7230, 7200, 30, 0, 600, 90, 30, 120, 5, 0, 0, 15, 0, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000010306', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000014', 2025, 6, 9735, 9135, 9120, 15, 0, 600, 120, 15, 135, 0, 0, 0, 19, 0, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000010307', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000014', 2025, 7, 11730, 11070, 11040, 30, 0, 660, 135, 30, 165, 0, 0, 0, 23, 0, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000010308', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000014', 2025, 8, 5415, 4815, 4800, 15, 0, 600, 165, 15, 180, 10, 0, 0, 10, 0, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000010309', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000014', 2025, 9, 10695, 10095, 10080, 15, 0, 600, 180, 15, 195, 0, 1, 0, 21, 0, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000010310', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000014', 2025, 10, 8670, 8190, 8160, 30, 0, 480, 195, 30, 225, 5, 0, 0, 17, 0, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000010311', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000014', 2025, 11, 9795, 9135, 9120, 15, 0, 660, 225, 15, 240, 2, 0, 0, 19, 1, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000005006', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000014', 2025, 12, 10200, 9600, 9600, 0, 0, 600, 240, 0, 240, 3, 0, 0, 17, 0, true, NOW(), NOW()),

  -- Anna Weber 2025 (35h/week, target=420/day)
  -- Flextime chain: 0 -> 15 -> -15 -> 0 -> 30 -> 15 -> 45 -> 30 -> 45 -> 15 -> 30 -> 30 -> 180
  ('00000000-0000-0000-0000-000000010401', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000015', 2025, 1, 8625, 8055, 7980, 15+60, 0, 570, 0, 15, 15, 0, 2, 0, 19, 0, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000010402', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000015', 2025, 2, 8970, 8370, 8400, 0, 30, 600, 15, -30, -15, 0, 0, 0, 20, 0, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000010403', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000015', 2025, 3, 10005, 9315, 9660, 15, 0, 690, -15, 15, 0, 0, 0, 0, 23, 0, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000010404', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000015', 2025, 4, 7470, 6930, 7140, 30, 0+240, 540, 0, 30, 30, 3, 0, 0, 17, 0, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000010405', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000015', 2025, 5, 8985, 8385, 8400, 0, 15, 600, 30, -15, 15, 0, 0, 0, 20, 0, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000010406', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000015', 2025, 6, 8610, 7980, 7980, 30, 0, 630, 15, 30, 45, 0, 0, 0, 19, 1, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000010407', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000015', 2025, 7, 8025, 7545, 7560, 0, 15, 480, 45, -15, 30, 5, 0, 0, 18, 0, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000010408', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000015', 2025, 8, 4935, 4635, 4200, 15+420, 0, 300, 30, 15, 45, 10, 0, 0, 10, 0, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000010409', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000015', 2025, 9, 7710, 7110, 7140, 0, 30, 600, 45, -30, 15, 5, 0, 0, 17, 0, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000010410', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000015', 2025, 10, 8625, 8055, 7980, 15+60, 0, 570, 15, 15, 30, 0, 3, 0, 19, 0, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000010411', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000015', 2025, 11, 8570, 7980, 7980, 0, 0, 570, 30, 0, 30, 2, 0, 0, 19, 0, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000005008', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000015', 2025, 12, 9150, 8550, 8400, 150, 0, 600, 30, 150, 180, 1, 2, 0, 17, 0, true, NOW(), NOW()),

  -- January 2026 values (open, computed from daily values above)
  -- Admin: 16 days, sum from daily values
  ('00000000-0000-0000-0000-000000005001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 2026, 1, 8610, 8100, 7680, 510, 90, 510, 720, 420, 1140, 0, 0, 0, 16, 1, false, NOW(), NOW()),
  -- User: 16 days (1 error day)
  ('00000000-0000-0000-0000-000000005003', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', 2026, 1, 7770, 7305, 7680, 225, 180+420, 465, 120, 45, 165, 0, 0, 0, 16, 1, false, NOW(), NOW()),
  -- Maria: 16 days
  ('00000000-0000-0000-0000-000000005005', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000013', 2026, 1, 3885, 3885, 3840, 75, 45+15, 0, 60, 15, 75, 0, 0, 0, 16, 0, false, NOW(), NOW()),
  -- Thomas placeholder (no bookings seeded but needed for dashboard)
  ('00000000-0000-0000-0000-000000005007', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000014', 2026, 1, 8700, 8160, 7680, 510, 30, 540, 240, 480, 720, 0, 0, 0, 16, 0, false, NOW(), NOW()),
  -- Anna placeholder
  ('00000000-0000-0000-0000-000000005009', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000015', 2026, 1, 7710, 7230, 6720, 510, 0, 480, 180, 510, 690, 0, 0, 0, 16, 0, false, NOW(), NOW())
ON CONFLICT (employee_id, year, month) DO NOTHING;

-- =============================================================
-- 19. Vacation balances (2026)
-- =============================================================

-- taken-Spalte spiegelt genehmigte U/UH-Tage aus Sektion 20 + C2/C2b wider
INSERT INTO vacation_balances (id, tenant_id, employee_id, year, entitlement, carryover, adjustments, taken, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000016000', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 2026, 30.00, 3.00, 0.00, 5.00, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000016001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', 2026, 28.00, 5.00, 0.00, 3.00, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000016002', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000013', 2026, 15.00, 2.00, 0.00, 3.00, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000016003', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000014', 2026, 30.00, 0.00, 0.00, 2.00, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000016004', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000015', 2026, 32.00, 4.00, 0.00, 5.50, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000016005', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000016', 2026, 30.00, 2.00, 0.00, 6.00, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000016006', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000017', 2026, 30.00, 3.00, 0.00, 0.00, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000016007', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000018', 2026, 30.00, 5.00, 0.00, 1.00, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000016008', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000019', 2026, 30.00, 0.00, 0.00, 1.00, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000016009', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000001a', 2026, 15.00, 2.00, 0.00, 0.00, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
-- Klaus, Andrea, Mehmet, Sandra erst nach ihrer Anlage in Sektion S3-11 unten.

-- =============================================================
-- 20. Absence days (last week of January 2026)
-- =============================================================
-- Uses actual absence_type IDs from migration:
--   U  (Urlaub):        a394b265-d90b-446a-9921-88059c4923ce
--   UH (Urlaub halb):   f316b2a9-0f06-4186-9109-c54485c6fcaa
--   K  (Krankheit):     6c84ef9c-7444-4bc3-a402-8916ab746567
--   KK (Kind krank):    0ae2e187-ed82-4400-a37f-65c4172df210

DO $$
DECLARE
  at_u  uuid;
  at_uh uuid;
  at_k  uuid;
  at_kk uuid;
  t_id  uuid := '10000000-0000-0000-0000-000000000001';
BEGIN
  SELECT id INTO at_u  FROM absence_types WHERE code = 'U'  LIMIT 1;
  SELECT id INTO at_uh FROM absence_types WHERE code = 'UH' LIMIT 1;
  SELECT id INTO at_k  FROM absence_types WHERE code = 'K'  LIMIT 1;
  SELECT id INTO at_kk FROM absence_types WHERE code = 'KK' LIMIT 1;

  -- Admin: Jan 26-28 (Mon-Wed) - 3-day approved vacation
  INSERT INTO absence_days (id, tenant_id, employee_id, absence_date, absence_type_id, duration, status, approved_by, approved_at, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000015001', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-26', at_u, 1.00, 'approved', '00000000-0000-0000-0000-000000000001', '2026-01-24 10:00:00+00', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000015002', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-27', at_u, 1.00, 'approved', '00000000-0000-0000-0000-000000000001', '2026-01-24 10:00:00+00', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000015003', t_id, '00000000-0000-0000-0000-000000000011', '2026-01-28', at_u, 1.00, 'approved', '00000000-0000-0000-0000-000000000001', '2026-01-24 10:00:00+00', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- User: Jan 29 (Thu) - pending sick day
  INSERT INTO absence_days (id, tenant_id, employee_id, absence_date, absence_type_id, duration, status, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000015004', t_id, '00000000-0000-0000-0000-000000000012', '2026-01-29', at_k, 1.00, 'pending', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Maria: Jan 29-30 (Thu-Fri) - 2-day pending vacation
  INSERT INTO absence_days (id, tenant_id, employee_id, absence_date, absence_type_id, duration, status, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000015005', t_id, '00000000-0000-0000-0000-000000000013', '2026-01-29', at_u, 1.00, 'pending', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000015006', t_id, '00000000-0000-0000-0000-000000000013', '2026-01-30', at_u, 1.00, 'pending', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Thomas: Jan 26 (Mon) - approved child sick care
  INSERT INTO absence_days (id, tenant_id, employee_id, absence_date, absence_type_id, duration, status, approved_by, approved_at, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000015007', t_id, '00000000-0000-0000-0000-000000000014', '2026-01-26', at_kk, 1.00, 'approved', '00000000-0000-0000-0000-000000000001', '2026-01-24 10:00:00+00', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Thomas: Jan 30 (Fri) - pending vacation
  INSERT INTO absence_days (id, tenant_id, employee_id, absence_date, absence_type_id, duration, status, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000015008', t_id, '00000000-0000-0000-0000-000000000014', '2026-01-30', at_u, 1.00, 'pending', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Anna: Jan 27 (Tue) - approved half-day vacation (afternoon)
  INSERT INTO absence_days (id, tenant_id, employee_id, absence_date, absence_type_id, duration, half_day_period, status, approved_by, approved_at, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000015009', t_id, '00000000-0000-0000-0000-000000000015', '2026-01-27', at_uh, 0.50, 'afternoon', 'approved', '00000000-0000-0000-0000-000000000001', '2026-01-24 10:00:00+00', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Anna: Jan 28 (Wed) - rejected sick day
  INSERT INTO absence_days (id, tenant_id, employee_id, absence_date, absence_type_id, duration, status, rejection_reason, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000015010', t_id, '00000000-0000-0000-0000-000000000015', '2026-01-28', at_k, 1.00, 'rejected', 'Insufficient staffing on this date', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

END $$;

-- =============================================================
-- 21. Vacation config
-- =============================================================

-- Special calculations
INSERT INTO vacation_special_calculations (id, tenant_id, type, threshold, bonus_days, description, is_active, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000017001', '10000000-0000-0000-0000-000000000001', 'age', 50, 2.00, 'Additional 2 days for employees over 50', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000017002', '10000000-0000-0000-0000-000000000001', 'tenure', 5, 1.00, 'Additional 1 day after 5 years of service', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000017003', '10000000-0000-0000-0000-000000000001', 'tenure', 10, 2.00, 'Additional 2 days after 10 years of service', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000017004', '10000000-0000-0000-0000-000000000001', 'disability', 0, 5.00, 'Additional 5 days for severe disability', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000017005', '10000000-0000-0000-0000-000000000001', 'age', 60, 3.00, 'Additional 3 days for employees over 60', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000017006', '10000000-0000-0000-0000-000000000001', 'tenure', 20, 3.00, 'Additional 3 days after 20 years (inactive)', false, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Calculation groups
INSERT INTO vacation_calculation_groups (id, tenant_id, code, name, description, basis, is_active, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000017010', '10000000-0000-0000-0000-000000000001', 'STANDARD', 'Standard Vacation Group', 'Default calculation group for calendar year basis', 'calendar_year', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000017011', '10000000-0000-0000-0000-000000000001', 'ENTRY_BASED', 'Entry Date Group', 'Calculation group based on employee entry date', 'entry_date', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Link special calcs to groups
INSERT INTO vacation_calc_group_special_calcs (id, group_id, special_calculation_id, created_at)
VALUES
  (gen_random_uuid(), '00000000-0000-0000-0000-000000017010', '00000000-0000-0000-0000-000000017001', NOW()),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000017010', '00000000-0000-0000-0000-000000017002', NOW()),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000017010', '00000000-0000-0000-0000-000000017003', NOW()),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000017010', '00000000-0000-0000-0000-000000017004', NOW()),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000017011', '00000000-0000-0000-0000-000000017005', NOW()),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000017011', '00000000-0000-0000-0000-000000017002', NOW())
ON CONFLICT (group_id, special_calculation_id) DO NOTHING;

-- Capping rules
INSERT INTO vacation_capping_rules (id, tenant_id, code, name, description, rule_type, cutoff_month, cutoff_day, cap_value, is_active, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000017020', '10000000-0000-0000-0000-000000000001', 'YEAR_END_10', 'Year-End Cap (10 days)', 'Carry over maximum 10 days at year end', 'year_end', 12, 31, 10.00, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000017021', '10000000-0000-0000-0000-000000000001', 'MID_YEAR_5', 'March 31 Cap (5 days)', 'Previous year vacation capped at 5 days after March 31', 'mid_year', 3, 31, 5.00, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000017022', '10000000-0000-0000-0000-000000000001', 'FORFEIT_ALL', 'Year-End Forfeit All', 'All remaining vacation forfeited at year end', 'year_end', 12, 31, 0.00, true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Capping rule groups
INSERT INTO vacation_capping_rule_groups (id, tenant_id, code, name, description, is_active, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000017030', '10000000-0000-0000-0000-000000000001', 'STANDARD_CAPPING', 'Standard Capping', 'Year-end cap at 10 days plus March 31 carryover cap', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000017031', '10000000-0000-0000-0000-000000000001', 'STRICT_CAPPING', 'Strict Capping', 'Forfeit all vacation at year end', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Link capping rules to groups
INSERT INTO vacation_capping_rule_group_rules (id, group_id, capping_rule_id, created_at)
VALUES
  (gen_random_uuid(), '00000000-0000-0000-0000-000000017030', '00000000-0000-0000-0000-000000017020', NOW()),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000017030', '00000000-0000-0000-0000-000000017021', NOW()),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000017031', '00000000-0000-0000-0000-000000017022', NOW())
ON CONFLICT (group_id, capping_rule_id) DO NOTHING;

-- Employee capping exceptions
INSERT INTO employee_capping_exceptions (id, tenant_id, employee_id, capping_rule_id, exemption_type, retain_days, year, notes, is_active, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000017040', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-000000017020', 'partial', 5.00, 2026, 'Anna retains up to 5 days despite year-end capping', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000017041', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000017020', 'full', NULL, NULL, 'Thomas is fully exempt from year-end capping (all years)', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- =============================================================
-- 22. Employee day plans (Jan 1 -> CURRENT_DATE, all 10 employees)
-- =============================================================

DO $$
DECLARE
  t_id uuid := '10000000-0000-0000-0000-000000000001';
  d date;
  dow int;
  emp record;
  is_holiday boolean;
BEGIN
  FOR emp IN
    SELECT * FROM (VALUES
      ('00000000-0000-0000-0000-000000000011'::uuid, '00000000-0000-0000-0000-000000000502'::uuid, '00000000-0000-0000-0000-000000000502'::uuid),
      ('00000000-0000-0000-0000-000000000012'::uuid, '00000000-0000-0000-0000-000000000504'::uuid, '00000000-0000-0000-0000-000000000504'::uuid),
      ('00000000-0000-0000-0000-000000000013'::uuid, '00000000-0000-0000-0000-000000000503'::uuid, '00000000-0000-0000-0000-000000000503'::uuid),
      ('00000000-0000-0000-0000-000000000014'::uuid, '00000000-0000-0000-0000-000000000502'::uuid, '00000000-0000-0000-0000-000000000502'::uuid),
      ('00000000-0000-0000-0000-000000000015'::uuid, '00000000-0000-0000-0000-000000000502'::uuid, '00000000-0000-0000-0000-000000000505'::uuid),
      ('00000000-0000-0000-0000-000000000016'::uuid, '00000000-0000-0000-0000-000000000504'::uuid, '00000000-0000-0000-0000-000000000504'::uuid),
      ('00000000-0000-0000-0000-000000000017'::uuid, '00000000-0000-0000-0000-000000000502'::uuid, '00000000-0000-0000-0000-000000000502'::uuid),
      ('00000000-0000-0000-0000-000000000018'::uuid, '00000000-0000-0000-0000-000000000502'::uuid, '00000000-0000-0000-0000-000000000505'::uuid),
      ('00000000-0000-0000-0000-000000000019'::uuid, '00000000-0000-0000-0000-000000000502'::uuid, '00000000-0000-0000-0000-000000000502'::uuid),
      ('00000000-0000-0000-0000-00000000001a'::uuid, '00000000-0000-0000-0000-000000000503'::uuid, '00000000-0000-0000-0000-000000000503'::uuid)
    ) AS t(employee_id, mon_thu_plan, fri_plan)
  LOOP
    d := '2026-01-01';
    WHILE d <= CURRENT_DATE + 90 LOOP
      dow := EXTRACT(ISODOW FROM d)::int;
      is_holiday := EXISTS (SELECT 1 FROM holidays WHERE holiday_date = d AND tenant_id = t_id);
      INSERT INTO employee_day_plans (id, tenant_id, employee_id, plan_date, day_plan_id, source, created_at, updated_at)
      VALUES (
        gen_random_uuid(), t_id, emp.employee_id, d,
        CASE
          WHEN is_holiday THEN NULL
          WHEN dow IN (6, 7) THEN NULL
          WHEN dow = 5 THEN emp.fri_plan
          ELSE emp.mon_thu_plan
        END,
        CASE WHEN is_holiday THEN 'holiday' ELSE 'tariff' END,
        NOW(), NOW()
      ) ON CONFLICT (employee_id, plan_date) DO NOTHING;
      d := d + 1;
    END LOOP;
  END LOOP;
END $$;

-- =============================================================
-- PART A: Admin Routes Data
-- =============================================================

-- A1. Locations
INSERT INTO locations (id, tenant_id, code, name, description, address, city, country, timezone, is_active, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000d01', '10000000-0000-0000-0000-000000000001', 'MUC', 'Muenchen Zentrale', 'Hauptsitz', 'Leopoldstr. 10, 80802', 'Muenchen', 'DE', 'Europe/Berlin', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000d02', '10000000-0000-0000-0000-000000000001', 'BER', 'Berlin Buero', 'Zweigniederlassung Berlin', 'Friedrichstr. 50, 10117', 'Berlin', 'DE', 'Europe/Berlin', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000d03', '10000000-0000-0000-0000-000000000001', 'REMOTE', 'Remote / Homeoffice', 'Homeoffice und mobiles Arbeiten', '', '', 'DE', 'Europe/Berlin', true, NOW(), NOW())
ON CONFLICT (tenant_id, code) DO NOTHING;

-- A2. Cost Centers
INSERT INTO cost_centers (id, tenant_id, code, name, description, is_active, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000c01', '10000000-0000-0000-0000-000000000001', 'CC-100', 'Entwicklung', 'Software-Entwicklung und Engineering', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000c02', '10000000-0000-0000-0000-000000000001', 'CC-200', 'Verwaltung', 'Verwaltung und HR', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000c03', '10000000-0000-0000-0000-000000000001', 'CC-300', 'Vertrieb', 'Vertrieb und Kundenbetreuung', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000c04', '10000000-0000-0000-0000-000000000001', 'CC-400', 'Infrastruktur', 'IT-Infrastruktur und Betrieb', true, NOW(), NOW())
ON CONFLICT (tenant_id, code) DO NOTHING;

-- A3. Contact Types + Contact Kinds
INSERT INTO contact_types (id, tenant_id, code, name, data_type, sort_order, is_active, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000e01', '10000000-0000-0000-0000-000000000001', 'PHONE', 'Telefon', 'text', 1, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000e02', '10000000-0000-0000-0000-000000000001', 'EMAIL', 'E-Mail', 'text', 2, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000e03', '10000000-0000-0000-0000-000000000001', 'ADDRESS', 'Adresse', 'text', 3, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000e04', '10000000-0000-0000-0000-000000000001', 'MSGR', 'Messenger', 'text', 4, true, NOW(), NOW())
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO contact_kinds (id, tenant_id, contact_type_id, code, label, sort_order, is_active, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000f01', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000e01', 'MOBIL', 'Mobil', 1, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000f02', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000e01', 'FESTNETZ', 'Festnetz', 2, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000f03', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000e01', 'NOTFALL', 'Notfall', 3, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000f04', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000e02', 'GESCH', 'Geschaeftlich', 1, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000f05', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000e02', 'PRIVAT', 'Privat', 2, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000f06', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000e03', 'HAUPT', 'Hauptwohnsitz', 1, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000f07', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000e03', 'NEBEN', 'Nebenwohnsitz', 2, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000f08', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000e04', 'TEAMS', 'Teams', 1, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000f09', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000e04', 'SLACK', 'Slack', 2, true, NOW(), NOW())
ON CONFLICT (tenant_id, code) DO NOTHING;

-- A4. Calculation Rules
INSERT INTO calculation_rules (id, tenant_id, code, name, description, value, factor, is_active, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000a01', '10000000-0000-0000-0000-000000000001', 'RULE-STD', 'Standard Tagesberechnung', 'Standardmaessige Berechnung der Tageswerte', 0, 1.00, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000a02', '10000000-0000-0000-0000-000000000001', 'RULE-FLEX', 'Gleitzeit Berechnung', 'Gleitzeitberechnung mit Rahmenzeit', 0, 1.00, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000a03', '10000000-0000-0000-0000-000000000001', 'RULE-PART', 'Teilzeit Berechnung', 'Berechnung fuer Teilzeitkraefte', 0, 0.50, true, NOW(), NOW())
ON CONFLICT (tenant_id, code) DO NOTHING;

-- A5. Orders + Activities + Order Assignments
INSERT INTO activities (id, tenant_id, code, name, description, is_active, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000b01', '10000000-0000-0000-0000-000000000001', 'ACT-DEV', 'Entwicklung', 'Software-Entwicklungsarbeit', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000b02', '10000000-0000-0000-0000-000000000001', 'ACT-TEST', 'Testing', 'Qualitaetssicherung und Tests', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000b03', '10000000-0000-0000-0000-000000000001', 'ACT-MEET', 'Besprechung', 'Meetings und Abstimmungen', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000b04', '10000000-0000-0000-0000-000000000001', 'ACT-ADMIN', 'Administration', 'Administrative Taetigkeiten', true, NOW(), NOW())
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO orders (id, tenant_id, code, name, description, status, customer, cost_center_id, valid_from, is_active, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000b10', '10000000-0000-0000-0000-000000000001', 'ORD-001', 'Projekt Alpha', 'Hauptentwicklungsprojekt', 'active', 'Kunde A GmbH', '00000000-0000-0000-0000-000000000c01', '2025-06-01', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000b11', '10000000-0000-0000-0000-000000000001', 'ORD-002', 'Wartung Portal', 'Laufende Wartung des Kundenportals', 'active', 'Kunde B AG', '00000000-0000-0000-0000-000000000c01', '2025-01-01', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000b12', '10000000-0000-0000-0000-000000000001', 'ORD-003', 'Bueroausstattung', 'Bueroausstattung und Einrichtung', 'completed', NULL, '00000000-0000-0000-0000-000000000c04', '2025-03-01', true, NOW(), NOW())
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO order_assignments (id, tenant_id, order_id, employee_id, role, is_active, created_at, updated_at)
VALUES
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000b10', '00000000-0000-0000-0000-000000000011', 'leader', true, NOW(), NOW()),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000b10', '00000000-0000-0000-0000-000000000012', 'worker', true, NOW(), NOW()),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000b10', '00000000-0000-0000-0000-000000000017', 'worker', true, NOW(), NOW()),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000b11', '00000000-0000-0000-0000-000000000014', 'worker', true, NOW(), NOW())
ON CONFLICT (order_id, employee_id, role) DO NOTHING;

-- A6. Shifts (old FRUEH/SPAET/NORMAL removed — replaced by FS/SS/NS in Scenario 3 section)

-- A7. Access Control
INSERT INTO access_zones (id, tenant_id, code, name, description, sort_order, is_active, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000a20', '10000000-0000-0000-0000-000000000001', 'ZONE-HQ', 'Hauptgebaeude', 'Zugang zum Hauptgebaeude', 1, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000a21', '10000000-0000-0000-0000-000000000001', 'ZONE-SERVER', 'Serverraum', 'Zugang zum Serverraum (eingeschraenkt)', 2, true, NOW(), NOW())
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO access_profiles (id, tenant_id, code, name, description, is_active, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000a30', '10000000-0000-0000-0000-000000000001', 'PROF-STD', 'Standard Mitarbeiter', 'Zugang nur zum Hauptgebaeude', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000a31', '10000000-0000-0000-0000-000000000001', 'PROF-IT', 'IT Mitarbeiter', 'Zugang zum Hauptgebaeude und Serverraum', true, NOW(), NOW())
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO employee_access_assignments (id, tenant_id, employee_id, access_profile_id, is_active, created_at, updated_at)
VALUES
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000a31', true, NOW(), NOW()),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000a31', true, NOW(), NOW()),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000a30', true, NOW(), NOW()),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000a31', true, NOW(), NOW()),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-000000000a31', true, NOW(), NOW()),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000016', '00000000-0000-0000-0000-000000000a31', true, NOW(), NOW()),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-000000000a31', true, NOW(), NOW()),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000018', '00000000-0000-0000-0000-000000000a30', true, NOW(), NOW()),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000019', '00000000-0000-0000-0000-000000000a30', true, NOW(), NOW()),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000001a', '00000000-0000-0000-0000-000000000a30', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- A8. Export Interfaces
INSERT INTO export_interfaces (id, tenant_id, interface_number, name, mandant_number, export_path, output_filename, is_active, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000a40', '10000000-0000-0000-0000-000000000001', 1, 'Lohnexport DATEV', '1001', '/exports/datev/', 'lohn_export.csv', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000a41', '10000000-0000-0000-0000-000000000001', 2, 'Fibu Export', '1001', '/exports/fibu/', 'fibu_export.csv', true, NOW(), NOW())
ON CONFLICT (tenant_id, interface_number) DO NOTHING;

-- A9. Schedules + Tasks
INSERT INTO schedules (id, tenant_id, name, description, timing_type, timing_config, is_enabled, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000a50', '10000000-0000-0000-0000-000000000001', 'Tageswertberechnung', 'Taegliche Berechnung der Tageswerte um 02:00', 'daily', '{"hour": 2, "minute": 0}'::jsonb, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000a51', '10000000-0000-0000-0000-000000000001', 'Monatlicher Report', 'Monatlicher Report am 1. des Monats um 06:00', 'monthly', '{"dayOfMonth": 1, "hour": 6, "minute": 0}'::jsonb, true, NOW(), NOW())
ON CONFLICT (tenant_id, name) DO NOTHING;

INSERT INTO schedule_tasks (id, schedule_id, task_type, sort_order, parameters, is_enabled, created_at, updated_at)
VALUES
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000a50', 'calculate_days', 1, '{}'::jsonb, true, NOW(), NOW()),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000a51', 'export_data', 1, '{"format": "xlsx"}'::jsonb, true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- A10. Macros
INSERT INTO macros (id, tenant_id, name, description, macro_type, action_type, action_params, is_active, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000a60', '10000000-0000-0000-0000-000000000001', 'Massenkorrektur Pausenzeit', 'Korrektur fehlender Pausen fuer alle Mitarbeiter', 'monthly', 'log_message', '{"message": "Pausenkorrektur durchgefuehrt"}'::jsonb, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000a61', '10000000-0000-0000-0000-000000000001', 'Monatsabschluss Vorbereitung', 'Vorbereitung des Monatsabschlusses', 'monthly', 'recalculate_target_hours', '{}'::jsonb, true, NOW(), NOW())
ON CONFLICT (tenant_id, name) DO NOTHING;

-- A11. System Settings
INSERT INTO system_settings (id, tenant_id, rounding_relative_to_plan, error_list_enabled, tracked_error_codes, auto_fill_order_end_bookings, birthday_window_days_before, birthday_window_days_after, follow_up_entries_enabled, proxy_enabled, server_alive_enabled, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000a70', '10000000-0000-0000-0000-000000000001', false, true, ARRAY['NO_BREAK_RECORDED','MISSING_GO','HIGH_OVERTIME'], false, 7, 7, false, false, false, NOW(), NOW())
ON CONFLICT (tenant_id) DO NOTHING;

-- A12. Employee Messages
INSERT INTO employee_messages (id, tenant_id, sender_id, subject, body, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000a80', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Betriebsversammlung am 20.03.2026', 'Liebe Kolleginnen und Kollegen, am 20.03.2026 findet um 14:00 Uhr eine Betriebsversammlung im Konferenzraum statt. Mit freundlichen Gruessen, Die Geschaeftsleitung', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000a81', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Neue Zeiterfassungsregeln ab April', 'Ab dem 01.04.2026 gelten neue Regeln fuer die Zeiterfassung. Bitte beachten Sie die aktualisierte Betriebsvereinbarung im Intranet.', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO employee_message_recipients (id, message_id, employee_id, status, sent_at, created_at, updated_at)
SELECT gen_random_uuid(), m.id, e.id, 'sent', NOW(), NOW(), NOW()
FROM employee_messages m
CROSS JOIN employees e
WHERE m.tenant_id = '10000000-0000-0000-0000-000000000001'
  AND e.tenant_id = '10000000-0000-0000-0000-000000000001'
  AND e.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM employee_message_recipients r WHERE r.message_id = m.id AND r.employee_id = e.id
  );

-- A13. Reports
INSERT INTO reports (id, tenant_id, report_type, name, description, status, format, parameters, requested_at, started_at, completed_at, created_by, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000a90', '10000000-0000-0000-0000-000000000001', 'monthly_overview', 'Monatsuebersicht Januar 2026', 'Monatliche Uebersicht aller Mitarbeiter', 'completed', 'xlsx', '{"year": 2026, "month": 1}'::jsonb, '2026-02-01 08:00:00+00', '2026-02-01 08:00:05+00', '2026-02-01 08:00:12+00', '00000000-0000-0000-0000-000000000001', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000a91', '10000000-0000-0000-0000-000000000001', 'absence_report', 'Abwesenheitsbericht Januar 2026', 'Abwesenheiten aller Mitarbeiter', 'completed', 'xlsx', '{"year": 2026, "month": 1}'::jsonb, '2026-02-01 09:00:00+00', '2026-02-01 09:00:03+00', '2026-02-01 09:00:08+00', '00000000-0000-0000-0000-000000000001', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- A14. Payroll Exports
INSERT INTO payroll_exports (id, tenant_id, export_interface_id, year, month, status, export_type, format, parameters, employee_count, total_hours, requested_at, started_at, completed_at, created_by, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000aa0', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000a40', 2026, 1, 'completed', 'standard', 'csv', '{}'::jsonb, 5, 800.50, '2026-02-01 10:00:00+00', '2026-02-01 10:00:02+00', '2026-02-01 10:00:15+00', '00000000-0000-0000-0000-000000000001', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- A15. Notifications
INSERT INTO notifications (id, tenant_id, user_id, type, title, message, link, read_at, created_at, updated_at)
VALUES
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'approval', 'Urlaubsantrag genehmigt', 'Der Urlaubsantrag von Anna Weber wurde genehmigt.', '/admin/approvals', NOW() - INTERVAL '2 days', NOW() - INTERVAL '3 days', NOW()),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'error', 'Fehlbuchung am 21.01', 'Admin User hat am 21.01.2026 eine fehlende Pause.', '/admin/correction-assistant', NULL, NOW() - INTERVAL '1 day', NOW()),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'approval', 'Urlaub genehmigt', 'Ihr Urlaubsantrag wurde genehmigt.', '/absences', NOW() - INTERVAL '5 days', NOW() - INTERVAL '7 days', NOW()),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'info', 'Monatsabschluss Januar', 'Der Monatsabschluss fuer Januar 2026 wurde durchgefuehrt.', '/monthly-evaluation', NULL, NOW() - INTERVAL '1 day', NOW())
ON CONFLICT (id) DO NOTHING;

-- =============================================================
-- PART B: Employee Enrichment
-- =============================================================

DO $$
DECLARE
  t_id uuid := '10000000-0000-0000-0000-000000000001';
  et_vz uuid;
  et_tz uuid;
BEGIN
  SELECT id INTO et_vz FROM employment_types WHERE code = 'VZ' LIMIT 1;
  SELECT id INTO et_tz FROM employment_types WHERE code = 'TZ' LIMIT 1;

  UPDATE employees SET department_id = '00000000-0000-0000-0000-000000000806', cost_center_id = '00000000-0000-0000-0000-000000000c01', employment_type_id = et_vz,
    location_id = '00000000-0000-0000-0000-000000000d01',
    birth_date = '1985-03-15', gender = 'male', address_street = 'Leopoldstr. 1', address_zip = '80802', address_city = 'Muenchen'
    WHERE id = '00000000-0000-0000-0000-000000000011' AND tenant_id = t_id;
  UPDATE employees SET department_id = '00000000-0000-0000-0000-000000000806', cost_center_id = '00000000-0000-0000-0000-000000000c01', employment_type_id = et_vz,
    location_id = '00000000-0000-0000-0000-000000000d01',
    birth_date = '1990-07-22', gender = 'male', address_street = 'Schillerstr. 5', address_zip = '80336', address_city = 'Muenchen'
    WHERE id = '00000000-0000-0000-0000-000000000012' AND tenant_id = t_id;
  UPDATE employees SET department_id = '00000000-0000-0000-0000-000000000803', cost_center_id = '00000000-0000-0000-0000-000000000c02', employment_type_id = et_tz,
    location_id = '00000000-0000-0000-0000-000000000d01',
    birth_date = '1988-11-08', gender = 'female', address_street = 'Maximilianstr. 12', address_zip = '80539', address_city = 'Muenchen'
    WHERE id = '00000000-0000-0000-0000-000000000013' AND tenant_id = t_id;
  UPDATE employees SET department_id = '00000000-0000-0000-0000-000000000806', cost_center_id = '00000000-0000-0000-0000-000000000c01', employment_type_id = et_vz,
    location_id = '00000000-0000-0000-0000-000000000d01',
    birth_date = '1992-04-30', gender = 'male', address_street = 'Arnulfstr. 20', address_zip = '80335', address_city = 'Muenchen'
    WHERE id = '00000000-0000-0000-0000-000000000014' AND tenant_id = t_id;
  UPDATE employees SET department_id = '00000000-0000-0000-0000-000000000806', cost_center_id = '00000000-0000-0000-0000-000000000c01', employment_type_id = et_vz,
    location_id = '00000000-0000-0000-0000-000000000d02',
    birth_date = '1980-12-17', gender = 'female', address_street = 'Isarring 8', address_zip = '81675', address_city = 'Muenchen'
    WHERE id = '00000000-0000-0000-0000-000000000015' AND tenant_id = t_id;
  UPDATE employees SET department_id = '00000000-0000-0000-0000-000000000807', cost_center_id = '00000000-0000-0000-0000-000000000c04', employment_type_id = et_vz,
    location_id = '00000000-0000-0000-0000-000000000d02',
    birth_date = '1987-06-25', gender = 'female', address_street = 'Bayerstr. 3', address_zip = '80335', address_city = 'Muenchen'
    WHERE id = '00000000-0000-0000-0000-000000000016' AND tenant_id = t_id;
  UPDATE employees SET department_id = '00000000-0000-0000-0000-000000000806', cost_center_id = '00000000-0000-0000-0000-000000000c01', employment_type_id = et_vz,
    location_id = '00000000-0000-0000-0000-000000000d01',
    birth_date = '1993-02-14', gender = 'male', address_street = 'Theresienstr. 7', address_zip = '80333', address_city = 'Muenchen'
    WHERE id = '00000000-0000-0000-0000-000000000017' AND tenant_id = t_id;
  UPDATE employees SET department_id = '00000000-0000-0000-0000-000000000803', cost_center_id = '00000000-0000-0000-0000-000000000c02', employment_type_id = et_vz,
    location_id = '00000000-0000-0000-0000-000000000d03',
    birth_date = '1986-09-03', gender = 'female', address_street = 'Ludwigstr. 15', address_zip = '80539', address_city = 'Muenchen'
    WHERE id = '00000000-0000-0000-0000-000000000018' AND tenant_id = t_id;
  UPDATE employees SET department_id = '00000000-0000-0000-0000-000000000804', cost_center_id = '00000000-0000-0000-0000-000000000c03', employment_type_id = et_vz,
    location_id = '00000000-0000-0000-0000-000000000d01',
    birth_date = '1991-01-19', gender = 'male', address_street = 'Sonnenstr. 22', address_zip = '80331', address_city = 'Muenchen'
    WHERE id = '00000000-0000-0000-0000-000000000019' AND tenant_id = t_id;
  UPDATE employees SET department_id = '00000000-0000-0000-0000-000000000805', cost_center_id = '00000000-0000-0000-0000-000000000c04', employment_type_id = et_tz,
    location_id = '00000000-0000-0000-0000-000000000d03',
    birth_date = '1995-08-11', gender = 'female', address_street = 'Prinzregentenstr. 4', address_zip = '81675', address_city = 'Muenchen'
    WHERE id = '00000000-0000-0000-0000-00000000001a' AND tenant_id = t_id;
END $$;

-- Employee Contacts
INSERT INTO employee_contacts (id, employee_id, contact_type, value, label, is_primary, contact_kind_id, created_at, updated_at)
VALUES
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000011', 'phone', '+49 176 10010001', 'Mobil', true, '00000000-0000-0000-0000-000000000f01', NOW(), NOW()),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000011', 'email', 'admin@dev.local', 'Geschaeftlich', true, '00000000-0000-0000-0000-000000000f04', NOW(), NOW()),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000012', 'phone', '+49 176 10020002', 'Mobil', true, '00000000-0000-0000-0000-000000000f01', NOW(), NOW()),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000012', 'email', 'user@dev.local', 'Geschaeftlich', true, '00000000-0000-0000-0000-000000000f04', NOW(), NOW()),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000013', 'phone', '+49 176 10030003', 'Mobil', true, '00000000-0000-0000-0000-000000000f01', NOW(), NOW()),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000014', 'phone', '+49 176 10040004', 'Mobil', true, '00000000-0000-0000-0000-000000000f01', NOW(), NOW()),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000015', 'phone', '+49 176 10050005', 'Mobil', true, '00000000-0000-0000-0000-000000000f01', NOW(), NOW()),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000016', 'phone', '+49 176 10060006', 'Mobil', true, '00000000-0000-0000-0000-000000000f01', NOW(), NOW()),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000016', 'email', 'sabine.fischer@dev.local', 'Geschaeftlich', true, '00000000-0000-0000-0000-000000000f04', NOW(), NOW()),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000017', 'phone', '+49 176 10070007', 'Mobil', true, '00000000-0000-0000-0000-000000000f01', NOW(), NOW()),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000018', 'phone', '+49 176 10080008', 'Mobil', true, '00000000-0000-0000-0000-000000000f01', NOW(), NOW()),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000019', 'phone', '+49 176 10090009', 'Mobil', true, '00000000-0000-0000-0000-000000000f01', NOW(), NOW()),
  (gen_random_uuid(), '00000000-0000-0000-0000-00000000001a', 'phone', '+49 176 10100010', 'Mobil', true, '00000000-0000-0000-0000-000000000f01', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- =============================================================
-- B3. Historical 2025 monthly values for new employees
-- =============================================================

DO $$
DECLARE
  t_id uuid := '10000000-0000-0000-0000-000000000001';
  emp record;
  m int;
  flex_start int;
  flex_change int;
  flex_end int;
  target int;
  wd int;
  brk int;
  base_wd int[] := ARRAY[21,20,22,20,19,20,23,21,22,21,20,20];
BEGIN
  FOR emp IN
    SELECT * FROM (VALUES
      ('00000000-0000-0000-0000-000000000016'::uuid, 480, 30,
       ARRAY[0,0,2,0,0,2,0,10,0,0,2,1]::int[], ARRAY[0,0,0,0,0,0,3,0,0,0,0,0]::int[],
       ARRAY[30,30,-15,30,15,30,-15,30,15,30,15,45]::int[]),
      ('00000000-0000-0000-0000-000000000017'::uuid, 480, 30,
       ARRAY[0,0,0,3,0,5,0,10,0,0,2,3]::int[], ARRAY[0,0,2,0,0,0,0,0,1,0,0,0]::int[],
       ARRAY[15,15,15,15,15,15,-30,15,15,15,15,30]::int[]),
      ('00000000-0000-0000-0000-000000000018'::uuid, 456, 30,
       ARRAY[0,0,0,0,5,0,5,10,0,5,0,2]::int[], ARRAY[0,0,1,0,0,0,0,0,0,0,0,0]::int[],
       ARRAY[15,-15,15,15,-15,15,15,15,-15,15,15,15]::int[]),
      ('00000000-0000-0000-0000-000000000019'::uuid, 480, 30,
       ARRAY[0,0,3,0,0,5,0,10,3,0,0,2]::int[], ARRAY[0,3,0,0,0,0,2,0,0,3,0,0]::int[],
       ARRAY[45,15,30,30,-15,30,15,-30,15,15,15,45]::int[]),
      ('00000000-0000-0000-0000-00000000001a'::uuid, 240, 0,
       ARRAY[0,0,0,2,0,0,5,3,0,2,0,0]::int[], ARRAY[0,0,1,0,0,0,0,0,0,0,0,0]::int[],
       ARRAY[15,-15,15,-15,15,-15,15,-15,15,-15,15,15]::int[])
    ) AS t(emp_id, daily_target, brk_per_day, vacations, sicks, changes)
  LOOP
    flex_start := 0;
    FOR m IN 1..12 LOOP
      flex_change := emp.changes[m];
      flex_end := flex_start + flex_change;
      wd := base_wd[m] - emp.vacations[m] - emp.sicks[m];
      target := wd * emp.daily_target;
      brk := wd * emp.brk_per_day;
      INSERT INTO monthly_values (id, tenant_id, employee_id, year, month,
        total_gross_time, total_net_time, total_target_time,
        total_overtime, total_undertime, total_break_time,
        flextime_start, flextime_change, flextime_end,
        vacation_taken, sick_days, other_absence_days,
        work_days, days_with_errors, is_closed, created_at, updated_at)
      VALUES (gen_random_uuid(), t_id, emp.emp_id, 2025, m,
        target + brk + flex_change, target + flex_change, target,
        GREATEST(0, flex_change), GREATEST(0, -flex_change), brk,
        flex_start, flex_change, flex_end,
        emp.vacations[m], emp.sicks[m], 0,
        wd, CASE WHEN m IN (3,7) THEN 1 ELSE 0 END,
        true, NOW(), NOW())
      ON CONFLICT (employee_id, year, month) DO NOTHING;
      flex_start := flex_end;
    END LOOP;
    -- January 2026 placeholder
    wd := 16; target := wd * emp.daily_target; brk := wd * emp.brk_per_day;
    INSERT INTO monthly_values (id, tenant_id, employee_id, year, month,
      total_gross_time, total_net_time, total_target_time,
      total_overtime, total_undertime, total_break_time,
      flextime_start, flextime_change, flextime_end,
      vacation_taken, sick_days, other_absence_days,
      work_days, days_with_errors, is_closed, created_at, updated_at)
    VALUES (gen_random_uuid(), t_id, emp.emp_id, 2026, 1,
      target + brk + 30, target + 30, target,
      30, 0, brk,
      flex_start, 30, flex_start + 30,
      0, 0, 0, wd, 0, false, NOW(), NOW())
    ON CONFLICT (employee_id, year, month) DO NOTHING;
  END LOOP;
END $$;

-- =============================================================
-- PART C: Dynamic Data (CURRENT_DATE-based)
-- =============================================================

-- C2. Additional absences (Feb-March 2026 + CURRENT_DATE-relative)
DO $$
DECLARE
  at_u  uuid;
  at_k  uuid;
  t_id  uuid := '10000000-0000-0000-0000-000000000001';
BEGIN
  SELECT id INTO at_u FROM absence_types WHERE code = 'U' LIMIT 1;
  SELECT id INTO at_k FROM absence_types WHERE code = 'K' LIMIT 1;

  -- Admin: 2 vacation days mid-Feb
  INSERT INTO absence_days (id, tenant_id, employee_id, absence_date, absence_type_id, duration, status, approved_by, approved_at, created_at, updated_at) VALUES
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000011', '2026-02-16', at_u, 1.00, 'approved', '00000000-0000-0000-0000-000000000001', '2026-02-10 10:00+00', NOW(), NOW()),
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000011', '2026-02-17', at_u, 1.00, 'approved', '00000000-0000-0000-0000-000000000001', '2026-02-10 10:00+00', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- User: 1 sick day Feb, 3 vacation days early March
  INSERT INTO absence_days (id, tenant_id, employee_id, absence_date, absence_type_id, duration, status, approved_by, approved_at, created_at, updated_at) VALUES
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000012', '2026-02-10', at_k, 1.00, 'approved', '00000000-0000-0000-0000-000000000001', '2026-02-10 08:00+00', NOW(), NOW()),
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000012', '2026-03-02', at_u, 1.00, 'approved', '00000000-0000-0000-0000-000000000001', '2026-02-25 10:00+00', NOW(), NOW()),
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000012', '2026-03-03', at_u, 1.00, 'approved', '00000000-0000-0000-0000-000000000001', '2026-02-25 10:00+00', NOW(), NOW()),
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000012', '2026-03-04', at_u, 1.00, 'approved', '00000000-0000-0000-0000-000000000001', '2026-02-25 10:00+00', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Maria: 1 vacation day Feb
  INSERT INTO absence_days (id, tenant_id, employee_id, absence_date, absence_type_id, duration, status, approved_by, approved_at, created_at, updated_at) VALUES
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000013', '2026-02-13', at_u, 1.00, 'approved', '00000000-0000-0000-0000-000000000001', '2026-02-09 10:00+00', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Thomas: 2 sick days Feb
  INSERT INTO absence_days (id, tenant_id, employee_id, absence_date, absence_type_id, duration, status, approved_by, approved_at, created_at, updated_at) VALUES
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000014', '2026-02-19', at_k, 1.00, 'approved', '00000000-0000-0000-0000-000000000001', '2026-02-19 08:00+00', NOW(), NOW()),
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000014', '2026-02-20', at_k, 1.00, 'approved', '00000000-0000-0000-0000-000000000001', '2026-02-19 08:00+00', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Anna: 5 vacation days Mon-Fri early March
  INSERT INTO absence_days (id, tenant_id, employee_id, absence_date, absence_type_id, duration, status, approved_by, approved_at, created_at, updated_at) VALUES
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000015', '2026-03-02', at_u, 1.00, 'approved', '00000000-0000-0000-0000-000000000001', '2026-02-20 10:00+00', NOW(), NOW()),
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000015', '2026-03-03', at_u, 1.00, 'approved', '00000000-0000-0000-0000-000000000001', '2026-02-20 10:00+00', NOW(), NOW()),
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000015', '2026-03-04', at_u, 1.00, 'approved', '00000000-0000-0000-0000-000000000001', '2026-02-20 10:00+00', NOW(), NOW()),
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000015', '2026-03-05', at_u, 1.00, 'approved', '00000000-0000-0000-0000-000000000001', '2026-02-20 10:00+00', NOW(), NOW()),
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000015', '2026-03-06', at_u, 1.00, 'approved', '00000000-0000-0000-0000-000000000001', '2026-02-20 10:00+00', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- New employees: scattered absences
  INSERT INTO absence_days (id, tenant_id, employee_id, absence_date, absence_type_id, duration, status, approved_by, approved_at, created_at, updated_at) VALUES
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000016', '2026-02-25', at_u, 1.00, 'approved', '00000000-0000-0000-0000-000000000001', '2026-02-20 10:00+00', NOW(), NOW()),
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000017', '2026-02-11', at_k, 1.00, 'approved', '00000000-0000-0000-0000-000000000001', '2026-02-11 08:00+00', NOW(), NOW()),
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000018', '2026-03-09', at_u, 1.00, 'approved', '00000000-0000-0000-0000-000000000001', '2026-03-05 10:00+00', NOW(), NOW()),
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000019', '2026-02-26', at_k, 1.00, 'approved', '00000000-0000-0000-0000-000000000001', '2026-02-26 08:00+00', NOW(), NOW()),
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000019', '2026-02-27', at_k, 1.00, 'approved', '00000000-0000-0000-0000-000000000001', '2026-02-26 08:00+00', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- CURRENT_DATE-relative absences
  -- Thomas: on leave today + tomorrow
  INSERT INTO absence_days (id, tenant_id, employee_id, absence_date, absence_type_id, duration, status, approved_by, approved_at, created_at, updated_at) VALUES
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000014', CURRENT_DATE, at_u, 1.00, 'approved', '00000000-0000-0000-0000-000000000001', NOW() - INTERVAL '3 days', NOW(), NOW()),
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000014', CURRENT_DATE + 1, at_u, 1.00, 'approved', '00000000-0000-0000-0000-000000000001', NOW() - INTERVAL '3 days', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Maria: vacation CURRENT_DATE+3 to +4
  INSERT INTO absence_days (id, tenant_id, employee_id, absence_date, absence_type_id, duration, status, approved_by, approved_at, created_at, updated_at) VALUES
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000013', CURRENT_DATE + 3, at_u, 1.00, 'approved', '00000000-0000-0000-0000-000000000001', NOW() - INTERVAL '5 days', NOW(), NOW()),
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000013', CURRENT_DATE + 4, at_u, 1.00, 'approved', '00000000-0000-0000-0000-000000000001', NOW() - INTERVAL '5 days', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- User: pending vacation CURRENT_DATE+7 to +9
  INSERT INTO absence_days (id, tenant_id, employee_id, absence_date, absence_type_id, duration, status, created_at, updated_at) VALUES
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000012', CURRENT_DATE + 7, at_u, 1.00, 'pending', NOW(), NOW()),
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000012', CURRENT_DATE + 8, at_u, 1.00, 'pending', NOW(), NOW()),
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000012', CURRENT_DATE + 9, at_u, 1.00, 'pending', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Sabine: approved vacation CURRENT_DATE+10 to +14
  INSERT INTO absence_days (id, tenant_id, employee_id, absence_date, absence_type_id, duration, status, approved_by, approved_at, created_at, updated_at) VALUES
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000016', CURRENT_DATE + 10, at_u, 1.00, 'approved', '00000000-0000-0000-0000-000000000001', NOW() - INTERVAL '2 days', NOW(), NOW()),
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000016', CURRENT_DATE + 11, at_u, 1.00, 'approved', '00000000-0000-0000-0000-000000000001', NOW() - INTERVAL '2 days', NOW(), NOW()),
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000016', CURRENT_DATE + 12, at_u, 1.00, 'approved', '00000000-0000-0000-0000-000000000001', NOW() - INTERVAL '2 days', NOW(), NOW()),
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000016', CURRENT_DATE + 13, at_u, 1.00, 'approved', '00000000-0000-0000-0000-000000000001', NOW() - INTERVAL '2 days', NOW(), NOW()),
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000016', CURRENT_DATE + 14, at_u, 1.00, 'approved', '00000000-0000-0000-0000-000000000001', NOW() - INTERVAL '2 days', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;
END $$;

-- =============================================================
-- C2b. Additional April 2026 absences for HR demo
-- Fills out all 14 employees with current/upcoming Urlaub & Krank
-- so the Personalabteilung dashboard is populated on 2026-04-15.
-- =============================================================
DO $$
DECLARE
  at_u  uuid;
  at_uh uuid;
  at_k  uuid;
  at_kk uuid;
  t_id  uuid := '10000000-0000-0000-0000-000000000001';
  approver_id uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  SELECT id INTO at_u  FROM absence_types WHERE code = 'U'  LIMIT 1;
  SELECT id INTO at_uh FROM absence_types WHERE code = 'UH' LIMIT 1;
  SELECT id INTO at_k  FROM absence_types WHERE code = 'K'  LIMIT 1;
  SELECT id INTO at_kk FROM absence_types WHERE code = 'KK' LIMIT 1;

  -- Admin (011): sick day early April (approved)
  INSERT INTO absence_days (id, tenant_id, employee_id, absence_date, absence_type_id, duration, status, approved_by, approved_at, created_at, updated_at) VALUES
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000011', '2026-04-08', at_k, 1.00, 'approved', approver_id, '2026-04-08 08:00+00', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Markus (017): sick Apr 2-3 (approved)
  INSERT INTO absence_days (id, tenant_id, employee_id, absence_date, absence_type_id, duration, status, approved_by, approved_at, created_at, updated_at) VALUES
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000017', '2026-04-02', at_k, 1.00, 'approved', approver_id, '2026-04-02 08:00+00', NOW(), NOW()),
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000017', '2026-04-03', at_k, 1.00, 'approved', approver_id, '2026-04-02 08:00+00', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Stefan (019): approved 1-day vacation Apr 10 (Fri)
  INSERT INTO absence_days (id, tenant_id, employee_id, absence_date, absence_type_id, duration, status, approved_by, approved_at, created_at, updated_at) VALUES
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000019', '2026-04-10', at_u, 1.00, 'approved', approver_id, '2026-04-01 10:00+00', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Petra (01a): child sick Apr 9 (approved)
  INSERT INTO absence_days (id, tenant_id, employee_id, absence_date, absence_type_id, duration, status, approved_by, approved_at, created_at, updated_at) VALUES
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-00000000001a', '2026-04-09', at_kk, 1.00, 'approved', approver_id, '2026-04-09 07:30+00', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Klaus/Andrea/Mehmet/Sandra (01b–01e) absences: see Sektion S3 unten,
  -- da diese Schichtarbeiter erst dort angelegt werden.

  -- Julia (018): pending half-day vacation afternoon Apr 22
  INSERT INTO absence_days (id, tenant_id, employee_id, absence_date, absence_type_id, duration, half_day_period, status, created_at, updated_at) VALUES
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000018', '2026-04-22', at_uh, 0.50, 'afternoon', 'pending', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Anna (015): pending vacation Apr 27 - May 1 (Mon-Fri, incl. 01.05 feiertag)
  INSERT INTO absence_days (id, tenant_id, employee_id, absence_date, absence_type_id, duration, status, created_at, updated_at) VALUES
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000015', '2026-04-27', at_u, 1.00, 'pending', NOW(), NOW()),
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000015', '2026-04-28', at_u, 1.00, 'pending', NOW(), NOW()),
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000015', '2026-04-29', at_u, 1.00, 'pending', NOW(), NOW()),
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000015', '2026-04-30', at_u, 1.00, 'pending', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;
END $$;

-- =============================================================
-- C3. Dynamic bookings + daily values (Jan 2 -> yesterday)
-- =============================================================

DO $$
DECLARE
  bt_a1 uuid; bt_a2 uuid; bt_p1 uuid; bt_p2 uuid;
  t_id uuid := '10000000-0000-0000-0000-000000000001';
  emp record;
  d date;
  dow int;
  h int;
  come_time int;
  go_time int;
  break_start int;
  break_dur int;
  target int;
  gross int;
  net int;
  is_err boolean;
  err_type int;
  pair_id uuid;
  brk_pair uuid;
  v_has_error boolean;
  v_error_codes text[];
  bk_count int;
BEGIN
  SELECT id INTO bt_a1 FROM booking_types WHERE code = 'A1' LIMIT 1;
  SELECT id INTO bt_a2 FROM booking_types WHERE code = 'A2' LIMIT 1;
  SELECT id INTO bt_p1 FROM booking_types WHERE code = 'P1' LIMIT 1;
  SELECT id INTO bt_p2 FROM booking_types WHERE code = 'P2' LIMIT 1;

  FOR emp IN
    SELECT * FROM (VALUES
      ('00000000-0000-0000-0000-000000000011'::uuid, 'terminal', 480, 480, 480, true),
      ('00000000-0000-0000-0000-000000000012'::uuid, 'web',      540, 480, 480, true),
      ('00000000-0000-0000-0000-000000000013'::uuid, 'terminal', 540, 240, 240, false),
      ('00000000-0000-0000-0000-000000000014'::uuid, 'terminal', 480, 480, 480, true),
      ('00000000-0000-0000-0000-000000000015'::uuid, 'terminal', 480, 480, 360, true),
      ('00000000-0000-0000-0000-000000000016'::uuid, 'web',      540, 480, 480, true),
      ('00000000-0000-0000-0000-000000000017'::uuid, 'terminal', 495, 480, 480, true),
      ('00000000-0000-0000-0000-000000000018'::uuid, 'terminal', 525, 480, 360, true),
      ('00000000-0000-0000-0000-000000000019'::uuid, 'terminal', 450, 480, 480, true),
      ('00000000-0000-0000-0000-00000000001a'::uuid, 'terminal', 540, 240, 240, false)
    ) AS t(emp_id, src, base_come, mt_target, fri_target, needs_break)
  LOOP
    d := '2026-01-02';
    WHILE d < CURRENT_DATE LOOP
      dow := EXTRACT(ISODOW FROM d)::int;
      IF dow IN (6, 7) THEN d := d + 1; CONTINUE; END IF;
      IF EXISTS (SELECT 1 FROM holidays WHERE holiday_date = d AND tenant_id = t_id) THEN d := d + 1; CONTINUE; END IF;
      IF EXISTS (SELECT 1 FROM bookings WHERE employee_id = emp.emp_id AND booking_date = d) THEN d := d + 1; CONTINUE; END IF;

      target := CASE WHEN dow = 5 THEN emp.fri_target ELSE emp.mt_target END;

      IF EXISTS (SELECT 1 FROM absence_days WHERE employee_id = emp.emp_id AND absence_date = d AND status = 'approved') THEN
        INSERT INTO daily_values (id, tenant_id, employee_id, value_date, gross_time, net_time, target_time, overtime, undertime, break_time, has_error, first_come, last_go, booking_count, status, created_at, updated_at)
        VALUES (gen_random_uuid(), t_id, emp.emp_id, d, 0, 0, target, 0, target, 0, false, NULL, NULL, 0, 'calculated', NOW(), NOW())
        ON CONFLICT (employee_id, value_date) DO NOTHING;
        d := d + 1; CONTINUE;
      END IF;

      h := (hashtext(emp.emp_id::text || d::text) % 31) - 15;
      come_time := emp.base_come + h;
      is_err := (abs(hashtext(emp.emp_id::text || d::text || 'e')) % 20) = 0;
      err_type := abs(hashtext(emp.emp_id::text || d::text || 't')) % 2;

      pair_id := gen_random_uuid();
      break_dur := 0;
      v_has_error := false;
      v_error_codes := NULL;
      bk_count := 0;

      INSERT INTO bookings (id, tenant_id, employee_id, booking_date, booking_type_id, original_time, edited_time, pair_id, source, created_at, updated_at)
      VALUES (gen_random_uuid(), t_id, emp.emp_id, d, bt_a1, come_time, come_time, pair_id, emp.src, NOW(), NOW());
      bk_count := 1;

      IF emp.needs_break AND NOT (is_err AND err_type = 0) THEN
        break_start := 720 + (h % 15);
        break_dur := 30;
        brk_pair := gen_random_uuid();
        INSERT INTO bookings (id, tenant_id, employee_id, booking_date, booking_type_id, original_time, edited_time, pair_id, source, created_at, updated_at)
        VALUES (gen_random_uuid(), t_id, emp.emp_id, d, bt_p1, break_start, break_start, brk_pair, emp.src, NOW(), NOW());
        INSERT INTO bookings (id, tenant_id, employee_id, booking_date, booking_type_id, original_time, edited_time, pair_id, source, created_at, updated_at)
        VALUES (gen_random_uuid(), t_id, emp.emp_id, d, bt_p2, break_start + 30, break_start + 30, brk_pair, emp.src, NOW(), NOW());
        bk_count := bk_count + 2;
      END IF;

      IF NOT (is_err AND err_type = 1) THEN
        go_time := come_time + target + break_dur + (abs(h) % 10);
        INSERT INTO bookings (id, tenant_id, employee_id, booking_date, booking_type_id, original_time, edited_time, pair_id, source, created_at, updated_at)
        VALUES (gen_random_uuid(), t_id, emp.emp_id, d, bt_a2, go_time, go_time, pair_id, emp.src, NOW(), NOW());
        bk_count := bk_count + 1;

        gross := go_time - come_time;
        net := gross - break_dur;
        IF is_err AND err_type = 0 AND emp.needs_break THEN
          v_has_error := true;
          v_error_codes := ARRAY['NO_BREAK_RECORDED'];
        END IF;

        INSERT INTO daily_values (id, tenant_id, employee_id, value_date, gross_time, net_time, target_time, overtime, undertime, break_time, has_error, error_codes, first_come, last_go, booking_count, status, created_at, updated_at)
        VALUES (gen_random_uuid(), t_id, emp.emp_id, d, gross, net, target,
          GREATEST(0, net - target), GREATEST(0, target - net),
          break_dur, v_has_error, v_error_codes,
          come_time, go_time, bk_count, 'calculated', NOW(), NOW())
        ON CONFLICT (employee_id, value_date) DO NOTHING;
      ELSE
        INSERT INTO daily_values (id, tenant_id, employee_id, value_date, gross_time, net_time, target_time, overtime, undertime, break_time, has_error, error_codes, first_come, last_go, booking_count, status, created_at, updated_at)
        VALUES (gen_random_uuid(), t_id, emp.emp_id, d, 0, 0, target, 0, 0, 0, true, ARRAY['MISSING_GO'],
          come_time, NULL, bk_count, 'calculated', NOW(), NOW())
        ON CONFLICT (employee_id, value_date) DO NOTHING;
      END IF;

      d := d + 1;
    END LOOP;
  END LOOP;
END $$;

-- =============================================================
-- C6. Today's partial state
-- =============================================================

DO $$
DECLARE
  bt_a1 uuid; bt_a2 uuid; bt_p1 uuid; bt_p2 uuid;
  t_id uuid := '10000000-0000-0000-0000-000000000001';
  today date := CURRENT_DATE;
  pair_id uuid;
  brk_pair uuid;
BEGIN
  SELECT id INTO bt_a1 FROM booking_types WHERE code = 'A1' LIMIT 1;
  SELECT id INTO bt_a2 FROM booking_types WHERE code = 'A2' LIMIT 1;
  SELECT id INTO bt_p1 FROM booking_types WHERE code = 'P1' LIMIT 1;
  SELECT id INTO bt_p2 FROM booking_types WHERE code = 'P2' LIMIT 1;

  IF EXTRACT(ISODOW FROM today)::int IN (6, 7) THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM holidays WHERE holiday_date = today AND tenant_id = t_id) THEN RETURN; END IF;

  -- Admin: clocked in, past break
  pair_id := gen_random_uuid(); brk_pair := gen_random_uuid();
  INSERT INTO bookings (id, tenant_id, employee_id, booking_date, booking_type_id, original_time, edited_time, pair_id, source, created_at, updated_at) VALUES
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000011', today, bt_a1, 470, 470, pair_id, 'terminal', NOW(), NOW()),
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000011', today, bt_p1, 720, 720, brk_pair, 'terminal', NOW(), NOW()),
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000011', today, bt_p2, 750, 750, brk_pair, 'terminal', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- User: clocked in, past break
  pair_id := gen_random_uuid(); brk_pair := gen_random_uuid();
  INSERT INTO bookings (id, tenant_id, employee_id, booking_date, booking_type_id, original_time, edited_time, pair_id, source, created_at, updated_at) VALUES
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000012', today, bt_a1, 555, 555, pair_id, 'web', NOW(), NOW()),
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000012', today, bt_p1, 765, 765, brk_pair, 'web', NOW(), NOW()),
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000012', today, bt_p2, 795, 795, brk_pair, 'web', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Maria: completed part-time
  pair_id := gen_random_uuid();
  INSERT INTO bookings (id, tenant_id, employee_id, booking_date, booking_type_id, original_time, edited_time, pair_id, source, created_at, updated_at) VALUES
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000013', today, bt_a1, 510, 510, pair_id, 'terminal', NOW(), NOW()),
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000013', today, bt_a2, 750, 750, pair_id, 'terminal', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Anna: clocked in
  pair_id := gen_random_uuid();
  INSERT INTO bookings (id, tenant_id, employee_id, booking_date, booking_type_id, original_time, edited_time, pair_id, source, created_at, updated_at) VALUES
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000015', today, bt_a1, 480, 480, pair_id, 'terminal', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Markus: clocked in, on break
  pair_id := gen_random_uuid(); brk_pair := gen_random_uuid();
  INSERT INTO bookings (id, tenant_id, employee_id, booking_date, booking_type_id, original_time, edited_time, pair_id, source, created_at, updated_at) VALUES
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000017', today, bt_a1, 495, 495, pair_id, 'terminal', NOW(), NOW()),
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000017', today, bt_p1, 720, 720, brk_pair, 'terminal', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Julia: clocked in
  pair_id := gen_random_uuid();
  INSERT INTO bookings (id, tenant_id, employee_id, booking_date, booking_type_id, original_time, edited_time, pair_id, source, created_at, updated_at) VALUES
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000018', today, bt_a1, 525, 525, pair_id, 'terminal', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Stefan: clocked in, past break
  pair_id := gen_random_uuid(); brk_pair := gen_random_uuid();
  INSERT INTO bookings (id, tenant_id, employee_id, booking_date, booking_type_id, original_time, edited_time, pair_id, source, created_at, updated_at) VALUES
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000019', today, bt_a1, 450, 450, pair_id, 'terminal', NOW(), NOW()),
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000019', today, bt_p1, 735, 735, brk_pair, 'terminal', NOW(), NOW()),
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-000000000019', today, bt_p2, 765, 765, brk_pair, 'terminal', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Petra: completed part-time
  pair_id := gen_random_uuid();
  INSERT INTO bookings (id, tenant_id, employee_id, booking_date, booking_type_id, original_time, edited_time, pair_id, source, created_at, updated_at) VALUES
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-00000000001a', today, bt_a1, 540, 540, pair_id, 'terminal', NOW(), NOW()),
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-00000000001a', today, bt_a2, 780, 780, pair_id, 'terminal', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;
END $$;

-- =============================================================
-- C5. Dynamic monthly values (Feb 2026 -> current month)
-- =============================================================

DO $$
DECLARE
  t_id uuid := '10000000-0000-0000-0000-000000000001';
  emp_id uuid;
  m_year int;
  m_month int;
  prev_flex int;
  v_gross int; v_net int; v_target int; v_ot int; v_ut int; v_break int;
  v_work_days int; v_error_days int;
  v_vac numeric; v_sick numeric;
  cur_year int := EXTRACT(YEAR FROM CURRENT_DATE)::int;
  cur_month int := EXTRACT(MONTH FROM CURRENT_DATE)::int;
BEGIN
  FOR emp_id IN
    SELECT e.id FROM employees e WHERE e.tenant_id = t_id AND e.is_active = true
  LOOP
    SELECT COALESCE(flextime_end, 0) INTO prev_flex
    FROM monthly_values WHERE employee_id = emp_id AND year = 2026 AND month = 1;
    IF prev_flex IS NULL THEN prev_flex := 0; END IF;

    m_year := 2026; m_month := 2;
    WHILE (m_year < cur_year) OR (m_year = cur_year AND m_month <= cur_month) LOOP
      IF EXISTS (SELECT 1 FROM monthly_values WHERE employee_id = emp_id AND year = m_year AND month = m_month) THEN
        SELECT flextime_end INTO prev_flex FROM monthly_values WHERE employee_id = emp_id AND year = m_year AND month = m_month;
        m_month := m_month + 1; IF m_month > 12 THEN m_year := m_year + 1; m_month := 1; END IF;
        CONTINUE;
      END IF;

      SELECT
        COALESCE(SUM(gross_time), 0), COALESCE(SUM(net_time), 0),
        COALESCE(SUM(target_time), 0), COALESCE(SUM(overtime), 0),
        COALESCE(SUM(undertime), 0), COALESCE(SUM(break_time), 0),
        COUNT(*) FILTER (WHERE gross_time > 0 OR has_error),
        COUNT(*) FILTER (WHERE has_error = true)
      INTO v_gross, v_net, v_target, v_ot, v_ut, v_break, v_work_days, v_error_days
      FROM daily_values
      WHERE employee_id = emp_id
        AND EXTRACT(YEAR FROM value_date) = m_year
        AND EXTRACT(MONTH FROM value_date) = m_month;

      SELECT
        COALESCE(SUM(CASE WHEN at2.code LIKE 'U%' THEN ad.duration ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN at2.code LIKE 'K%' THEN ad.duration ELSE 0 END), 0)
      INTO v_vac, v_sick
      FROM absence_days ad
      JOIN absence_types at2 ON ad.absence_type_id = at2.id
      WHERE ad.employee_id = emp_id
        AND EXTRACT(YEAR FROM ad.absence_date) = m_year
        AND EXTRACT(MONTH FROM ad.absence_date) = m_month
        AND ad.status = 'approved';

      INSERT INTO monthly_values (id, tenant_id, employee_id, year, month,
        total_gross_time, total_net_time, total_target_time,
        total_overtime, total_undertime, total_break_time,
        flextime_start, flextime_change, flextime_end,
        vacation_taken, sick_days, other_absence_days,
        work_days, days_with_errors,
        is_closed, created_at, updated_at)
      VALUES (gen_random_uuid(), t_id, emp_id, m_year, m_month,
        v_gross, v_net, v_target, v_ot, v_ut, v_break,
        prev_flex, v_net - v_target, prev_flex + (v_net - v_target),
        v_vac, v_sick, 0,
        v_work_days, v_error_days,
        CASE WHEN (m_year < cur_year) OR (m_year = cur_year AND m_month < cur_month)
          THEN true ELSE false END,
        NOW(), NOW())
      ON CONFLICT (employee_id, year, month) DO NOTHING;

      prev_flex := prev_flex + (v_net - v_target);
      m_month := m_month + 1; IF m_month > 12 THEN m_year := m_year + 1; m_month := 1; END IF;
    END LOOP;
  END LOOP;
END $$;

-- =============================================================
-- C7. Vacation balance reconciliation
-- =============================================================

UPDATE vacation_balances SET taken = (
  SELECT COALESCE(SUM(ad.duration), 0)
  FROM absence_days ad
  JOIN absence_types at2 ON ad.absence_type_id = at2.id
  WHERE ad.employee_id = vacation_balances.employee_id
    AND EXTRACT(YEAR FROM ad.absence_date) = vacation_balances.year
    AND at2.code LIKE 'U%'
    AND ad.status IN ('approved', 'pending')
) WHERE year = 2026;

-- =============================================================
-- C8. Tenant modules
-- =============================================================
-- Dev tenant gets "core" (always) + "orders" (for testing existing orders features)

INSERT INTO tenant_modules (tenant_id, module, enabled_at)
VALUES
  ('10000000-0000-0000-0000-000000000001', 'core', NOW()),
  ('10000000-0000-0000-0000-000000000001', 'crm', NOW()),
  ('10000000-0000-0000-0000-000000000001', 'billing', NOW()),
  ('10000000-0000-0000-0000-000000000001', 'warehouse', NOW())
ON CONFLICT DO NOTHING;

-- =============================================================
-- C9. CRM seed data (addresses, contacts, bank accounts)
-- =============================================================

-- Number sequences with sensible prefixes
INSERT INTO number_sequences (id, tenant_id, key, prefix, next_value)
VALUES
  ('c0000000-0000-4000-a000-000000000001', '10000000-0000-0000-0000-000000000001', 'customer', 'K-', 6),
  ('c0000000-0000-4000-a000-000000000002', '10000000-0000-0000-0000-000000000001', 'supplier', 'L-', 4)
ON CONFLICT DO NOTHING;

-- Customers
INSERT INTO crm_addresses (id, tenant_id, number, type, company, street, zip, city, country, phone, email, match_code, payment_term_days, is_active, created_by_id)
VALUES
  ('c1000000-0000-4000-a000-000000000001', '10000000-0000-0000-0000-000000000001', 'K-1', 'CUSTOMER', 'Müller Maschinenbau GmbH', 'Industriestr. 42', '80333', 'München', 'DE', '+49 89 123456', 'info@mueller-maschinenbau.de', 'MUELLER MASCHINENBAU', 30, true, '00000000-0000-0000-0000-000000000001'),
  ('c1000000-0000-4000-a000-000000000002', '10000000-0000-0000-0000-000000000001', 'K-2', 'CUSTOMER', 'Schmidt & Partner KG', 'Hauptstr. 15', '10115', 'Berlin', 'DE', '+49 30 987654', 'kontakt@schmidt-partner.de', 'SCHMIDT PARTNER', 14, true, '00000000-0000-0000-0000-000000000001'),
  ('c1000000-0000-4000-a000-000000000003', '10000000-0000-0000-0000-000000000001', 'K-3', 'CUSTOMER', 'Weber Elektrotechnik AG', 'Siemensallee 8', '70173', 'Stuttgart', 'DE', '+49 711 456789', 'vertrieb@weber-elektro.de', 'WEBER ELEKTROTECHNIK', 30, true, '00000000-0000-0000-0000-000000000001'),
  ('c1000000-0000-4000-a000-000000000004', '10000000-0000-0000-0000-000000000001', 'K-4', 'CUSTOMER', 'Bauer Logistik e.K.', 'Am Hafen 3', '20457', 'Hamburg', 'DE', '+49 40 333222', 'info@bauer-logistik.de', 'BAUER LOGISTIK', 60, true, '00000000-0000-0000-0000-000000000001'),
  ('c1000000-0000-4000-a000-000000000005', '10000000-0000-0000-0000-000000000001', 'K-5', 'CUSTOMER', 'Fischer IT Solutions GmbH', 'Technopark 12', '01069', 'Dresden', 'DE', '+49 351 111222', 'hello@fischer-it.de', 'FISCHER IT', 14, false, '00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- Suppliers
INSERT INTO crm_addresses (id, tenant_id, number, type, company, street, zip, city, country, phone, email, match_code, payment_term_days, discount_percent, discount_days, is_active, created_by_id)
VALUES
  ('c1000000-0000-4000-a000-000000000011', '10000000-0000-0000-0000-000000000001', 'L-1', 'SUPPLIER', 'Stahl-Union Lieferwerk GmbH', 'Werksweg 1', '45127', 'Essen', 'DE', '+49 201 555666', 'einkauf@stahl-union.de', 'STAHL UNION', 45, 2.0, 10, true, '00000000-0000-0000-0000-000000000001'),
  ('c1000000-0000-4000-a000-000000000012', '10000000-0000-0000-0000-000000000001', 'L-2', 'SUPPLIER', 'Kunststoff Meier OHG', 'Gewerbegebiet Süd 5', '90402', 'Nürnberg', 'DE', '+49 911 777888', 'bestellung@meier-kunststoff.de', 'KUNSTSTOFF MEIER', 30, 3.0, 14, true, '00000000-0000-0000-0000-000000000001'),
  ('c1000000-0000-4000-a000-000000000013', '10000000-0000-0000-0000-000000000001', 'L-3', 'SUPPLIER', 'Elektro-Großhandel Braun KG', 'Lagerstr. 20', '50667', 'Köln', 'DE', '+49 221 444555', 'order@braun-elektro.de', 'ELEKTRO BRAUN', 30, NULL, NULL, true, '00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- Both (customer + supplier)
INSERT INTO crm_addresses (id, tenant_id, number, type, company, street, zip, city, country, phone, email, match_code, tax_number, vat_id, payment_term_days, is_active, created_by_id)
VALUES
  ('c1000000-0000-4000-a000-000000000021', '10000000-0000-0000-0000-000000000001', 'K-6', 'BOTH', 'Hoffmann Werkzeuge GmbH & Co. KG', 'Werkzeugstr. 7', '42103', 'Wuppertal', 'DE', '+49 202 888999', 'info@hoffmann-werkzeuge.de', 'HOFFMANN WERKZEUGE', '113/456/78901', 'DE123456789', 30, true, '00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- Contacts
INSERT INTO crm_contacts (id, tenant_id, address_id, first_name, last_name, position, department, phone, email, is_primary)
VALUES
  -- Müller Maschinenbau contacts
  ('c2000000-0000-4000-a000-000000000001', '10000000-0000-0000-0000-000000000001', 'c1000000-0000-4000-a000-000000000001', 'Hans', 'Müller', 'Geschäftsführer', 'Geschäftsleitung', '+49 89 123456-10', 'h.mueller@mueller-maschinenbau.de', true),
  ('c2000000-0000-4000-a000-000000000002', '10000000-0000-0000-0000-000000000001', 'c1000000-0000-4000-a000-000000000001', 'Claudia', 'Berger', 'Einkaufsleiterin', 'Einkauf', '+49 89 123456-20', 'c.berger@mueller-maschinenbau.de', false),
  -- Schmidt & Partner contacts
  ('c2000000-0000-4000-a000-000000000003', '10000000-0000-0000-0000-000000000001', 'c1000000-0000-4000-a000-000000000002', 'Peter', 'Schmidt', 'Inhaber', NULL, '+49 30 987654-0', 'p.schmidt@schmidt-partner.de', true),
  -- Stahl-Union contact
  ('c2000000-0000-4000-a000-000000000004', '10000000-0000-0000-0000-000000000001', 'c1000000-0000-4000-a000-000000000011', 'Karl', 'Wagner', 'Vertriebsleiter', 'Vertrieb', '+49 201 555666-30', 'k.wagner@stahl-union.de', true),
  -- Hoffmann Werkzeuge contacts
  ('c2000000-0000-4000-a000-000000000005', '10000000-0000-0000-0000-000000000001', 'c1000000-0000-4000-a000-000000000021', 'Ulrike', 'Hoffmann', 'Geschäftsführerin', 'Geschäftsleitung', '+49 202 888999-10', 'u.hoffmann@hoffmann-werkzeuge.de', true),
  ('c2000000-0000-4000-a000-000000000006', '10000000-0000-0000-0000-000000000001', 'c1000000-0000-4000-a000-000000000021', 'Jens', 'Krause', 'Buchhaltung', 'Finanzen', '+49 202 888999-20', 'j.krause@hoffmann-werkzeuge.de', false)
ON CONFLICT (id) DO NOTHING;

-- Bank accounts
INSERT INTO crm_bank_accounts (id, tenant_id, address_id, iban, bic, bank_name, account_holder, is_default)
VALUES
  ('c3000000-0000-4000-a000-000000000001', '10000000-0000-0000-0000-000000000001', 'c1000000-0000-4000-a000-000000000001', 'DE89370400440532013000', 'COBADEFFXXX', 'Commerzbank', 'Müller Maschinenbau GmbH', true),
  ('c3000000-0000-4000-a000-000000000002', '10000000-0000-0000-0000-000000000001', 'c1000000-0000-4000-a000-000000000002', 'DE27100777770209299700', 'DEUTDEDBBER', 'Deutsche Bank', 'Schmidt & Partner KG', true),
  ('c3000000-0000-4000-a000-000000000003', '10000000-0000-0000-0000-000000000001', 'c1000000-0000-4000-a000-000000000011', 'DE62370502990000684712', 'COKSDE33XXX', 'Sparkasse Essen', 'Stahl-Union Lieferwerk GmbH', true),
  ('c3000000-0000-4000-a000-000000000004', '10000000-0000-0000-0000-000000000001', 'c1000000-0000-4000-a000-000000000021', 'DE44500105175407324931', 'INGDDEFFXXX', 'ING', 'Hoffmann Werkzeuge GmbH & Co. KG', true),
  ('c3000000-0000-4000-a000-000000000005', '10000000-0000-0000-0000-000000000001', 'c1000000-0000-4000-a000-000000000021', 'DE75512108001245126199', 'SOGEDEFFXXX', 'Société Générale', 'Hoffmann Werkzeuge GmbH & Co. KG', false)
ON CONFLICT (id) DO NOTHING;

-- Correspondence entries
INSERT INTO crm_correspondences (id, tenant_id, address_id, direction, type, date, contact_id, from_user, to_user, subject, content, created_by_id)
VALUES
  -- Müller Maschinenbau GmbH (K-1) — 4 Einträge
  ('c4000000-0000-4000-a000-000000000001', '10000000-0000-0000-0000-000000000001', 'c1000000-0000-4000-a000-000000000001', 'INCOMING', 'phone', '2026-01-10 09:15:00+01', 'c2000000-0000-4000-a000-000000000001', 'Hans Müller', 'Vertrieb intern', 'Anfrage Sonderkonditionen Großauftrag', 'Hr. Müller fragt nach Sonderkonditionen für einen Großauftrag über 50 Frästeile. Rückruf bis Freitag zugesagt.', '00000000-0000-0000-0000-000000000001'),
  ('c4000000-0000-4000-a000-000000000002', '10000000-0000-0000-0000-000000000001', 'c1000000-0000-4000-a000-000000000001', 'OUTGOING', 'email', '2026-01-14 14:30:00+01', 'c2000000-0000-4000-a000-000000000001', 'Vertrieb', 'Hans Müller', 'Angebot Sonderkonditionen Frästeile', 'Angebot mit 8% Mengenrabatt per E-Mail an Hr. Müller gesendet. Lieferzeit 4 Wochen.', '00000000-0000-0000-0000-000000000001'),
  ('c4000000-0000-4000-a000-000000000003', '10000000-0000-0000-0000-000000000001', 'c1000000-0000-4000-a000-000000000001', 'INCOMING', 'email', '2026-02-03 10:45:00+01', 'c2000000-0000-4000-a000-000000000002', 'Claudia Berger', 'Buchhaltung', 'Rückfrage Rechnung RE-2026-0042', 'Fr. Berger bittet um korrigierte Rechnung — falscher Bestellbezug auf Position 3.', '00000000-0000-0000-0000-000000000001'),
  ('c4000000-0000-4000-a000-000000000004', '10000000-0000-0000-0000-000000000001', 'c1000000-0000-4000-a000-000000000001', 'OUTGOING', 'letter', '2026-02-20 08:00:00+01', NULL, 'Geschäftsführung', 'Müller Maschinenbau GmbH', 'Einladung Hausmesse März 2026', 'Einladung zur Hausmesse am 15.03.2026 per Post versendet, inkl. Anfahrtsbeschreibung und Parkausweis.', '00000000-0000-0000-0000-000000000001'),

  -- Schmidt & Partner KG (K-2) — 3 Einträge
  ('c4000000-0000-4000-a000-000000000011', '10000000-0000-0000-0000-000000000001', 'c1000000-0000-4000-a000-000000000002', 'OUTGOING', 'phone', '2026-01-20 11:00:00+01', 'c2000000-0000-4000-a000-000000000003', 'Vertrieb', 'Peter Schmidt', 'Nachfass Angebot AG-2026-0015', 'Hr. Schmidt telefonisch erreicht. Entscheidung fällt nächste Woche im Partnerkreis.', '00000000-0000-0000-0000-000000000001'),
  ('c4000000-0000-4000-a000-000000000012', '10000000-0000-0000-0000-000000000001', 'c1000000-0000-4000-a000-000000000002', 'INCOMING', 'email', '2026-01-28 16:20:00+01', 'c2000000-0000-4000-a000-000000000003', 'Peter Schmidt', 'Vertrieb', 'Auftragserteilung Projekt Berlin-Mitte', 'Bestellung per E-Mail eingegangen. Verweis auf Angebot AG-2026-0015, Lieferadresse abweichend.', '00000000-0000-0000-0000-000000000001'),
  ('c4000000-0000-4000-a000-000000000013', '10000000-0000-0000-0000-000000000001', 'c1000000-0000-4000-a000-000000000002', 'INTERNAL', 'email', '2026-02-05 09:00:00+01', NULL, 'Vertrieb', 'Lager/Versand', 'Interne Abstimmung Liefertermin Schmidt', 'Lager bestätigt Verfügbarkeit KW 8. Versand plant Spedition für 19.02.', '00000000-0000-0000-0000-000000000001'),

  -- Weber Elektrotechnik AG (K-3) — 3 Einträge
  ('c4000000-0000-4000-a000-000000000021', '10000000-0000-0000-0000-000000000001', 'c1000000-0000-4000-a000-000000000003', 'INCOMING', 'phone', '2026-02-10 08:30:00+01', NULL, 'Zentrale Weber', 'Empfang', 'Erstanfrage Schaltschrankkomponenten', 'Telefonische Erstanfrage über Zentrale. Ansprechpartner wird noch benannt. Katalog soll per E-Mail folgen.', '00000000-0000-0000-0000-000000000001'),
  ('c4000000-0000-4000-a000-000000000022', '10000000-0000-0000-0000-000000000001', 'c1000000-0000-4000-a000-000000000003', 'OUTGOING', 'email', '2026-02-10 15:00:00+01', NULL, 'Vertrieb', 'vertrieb@weber-elektro.de', 'Produktkatalog und Preisliste 2026', 'Digitaler Katalog und aktuelle Preisliste als PDF per E-Mail gesendet.', '00000000-0000-0000-0000-000000000001'),
  ('c4000000-0000-4000-a000-000000000023', '10000000-0000-0000-0000-000000000001', 'c1000000-0000-4000-a000-000000000003', 'OUTGOING', 'fax', '2026-02-18 10:00:00+01', NULL, 'Vertrieb', 'Weber Elektrotechnik AG', 'Angebot AG-2026-0031 Schaltschrankzubehör', 'Angebot per Fax gesendet auf Wunsch des Kunden. Original folgt per Post.', '00000000-0000-0000-0000-000000000001'),

  -- Bauer Logistik e.K. (K-4) — 3 Einträge
  ('c4000000-0000-4000-a000-000000000031', '10000000-0000-0000-0000-000000000001', 'c1000000-0000-4000-a000-000000000004', 'INCOMING', 'email', '2026-01-15 12:00:00+01', NULL, 'info@bauer-logistik.de', 'Vertrieb', 'Anfrage Regalsysteme für Neubau', 'Bauer Logistik plant Neubau Lagerhalle in Hamburg-Wilhelmsburg und benötigt Schwerlast-Regalsysteme.', '00000000-0000-0000-0000-000000000001'),
  ('c4000000-0000-4000-a000-000000000032', '10000000-0000-0000-0000-000000000001', 'c1000000-0000-4000-a000-000000000004', 'OUTGOING', 'visit', '2026-02-01 10:00:00+01', NULL, 'Außendienst Nord', 'Bauer Logistik e.K.', 'Vor-Ort-Besichtigung Lagerhalle Neubau', 'Aufmaß vor Ort genommen. 3 Regalgassen à 12m, Tragkraft 2t/Fachboden. Fotos im Anhang.', '00000000-0000-0000-0000-000000000001'),
  ('c4000000-0000-4000-a000-000000000033', '10000000-0000-0000-0000-000000000001', 'c1000000-0000-4000-a000-000000000004', 'OUTGOING', 'email', '2026-02-12 14:00:00+01', NULL, 'Vertrieb', 'info@bauer-logistik.de', 'Angebot AG-2026-0028 Regalsysteme', 'Detailliertes Angebot mit 3D-Zeichnung und Montagezeitplan gesendet. Zahlungsziel 60 Tage.', '00000000-0000-0000-0000-000000000001'),

  -- Fischer IT Solutions GmbH (K-5, inaktiv) — 2 Einträge
  ('c4000000-0000-4000-a000-000000000041', '10000000-0000-0000-0000-000000000001', 'c1000000-0000-4000-a000-000000000005', 'INCOMING', 'phone', '2025-11-05 14:00:00+01', NULL, 'Fischer IT', 'Vertrieb', 'Reklamation Lieferverzug Bestellung B-4711', 'Kunde beschwert sich über 2 Wochen Lieferverzug. Eskalation an Geschäftsführung angekündigt.', '00000000-0000-0000-0000-000000000001'),
  ('c4000000-0000-4000-a000-000000000042', '10000000-0000-0000-0000-000000000001', 'c1000000-0000-4000-a000-000000000005', 'OUTGOING', 'email', '2025-11-07 09:30:00+01', NULL, 'Geschäftsführung', 'hello@fischer-it.de', 'Stellungnahme und Entschuldigung Lieferverzug', 'Entschuldigungsschreiben mit Erklärung (Lieferengpass Vorprodukt) und 5% Gutschrift auf nächste Bestellung.', '00000000-0000-0000-0000-000000000001'),

  -- Stahl-Union Lieferwerk GmbH (L-1) — 3 Einträge
  ('c4000000-0000-4000-a000-000000000051', '10000000-0000-0000-0000-000000000001', 'c1000000-0000-4000-a000-000000000011', 'OUTGOING', 'email', '2026-01-08 08:00:00+01', 'c2000000-0000-4000-a000-000000000004', 'Einkauf', 'Karl Wagner', 'Bestellung Flachstahl S235 — 12 Tonnen', 'Bestellung für Q1 aufgegeben. Lieferung in 3 Chargen à 4t, KW 4/6/8.', '00000000-0000-0000-0000-000000000001'),
  ('c4000000-0000-4000-a000-000000000052', '10000000-0000-0000-0000-000000000001', 'c1000000-0000-4000-a000-000000000011', 'INCOMING', 'phone', '2026-01-22 11:15:00+01', 'c2000000-0000-4000-a000-000000000004', 'Karl Wagner', 'Einkauf', 'Lieferverzug 1. Charge — KW 5 statt KW 4', 'Hr. Wagner informiert über Verzögerung wegen Walzwerksstörung. Neue Lieferung voraussichtlich 30.01.', '00000000-0000-0000-0000-000000000001'),
  ('c4000000-0000-4000-a000-000000000053', '10000000-0000-0000-0000-000000000001', 'c1000000-0000-4000-a000-000000000011', 'INCOMING', 'email', '2026-02-25 13:00:00+01', 'c2000000-0000-4000-a000-000000000004', 'Karl Wagner', 'Einkauf', 'Preiserhöhung Stahl ab April 2026', 'Ankündigung 6% Preiserhöhung ab 01.04.2026 wegen gestiegener Energiekosten. Bitte um Stellungnahme.', '00000000-0000-0000-0000-000000000001'),

  -- Kunststoff Meier OHG (L-2) — 2 Einträge
  ('c4000000-0000-4000-a000-000000000061', '10000000-0000-0000-0000-000000000001', 'c1000000-0000-4000-a000-000000000012', 'OUTGOING', 'phone', '2026-02-03 10:00:00+01', NULL, 'Einkauf', 'Kunststoff Meier', 'Nachbestellung PA6-Granulat 500kg', 'Telefonische Nachbestellung, Lieferung frei Haus bis KW 7.', '00000000-0000-0000-0000-000000000001'),
  ('c4000000-0000-4000-a000-000000000062', '10000000-0000-0000-0000-000000000001', 'c1000000-0000-4000-a000-000000000012', 'INCOMING', 'letter', '2026-02-15 00:00:00+01', NULL, 'Kunststoff Meier OHG', 'Einkauf', 'Neue AGB und Preisliste 2026', 'Aktualisierte AGB und Preisliste per Post erhalten. Weiterleitung an Rechtsabteilung.', '00000000-0000-0000-0000-000000000001'),

  -- Elektro-Großhandel Braun KG (L-3) — 2 Einträge
  ('c4000000-0000-4000-a000-000000000071', '10000000-0000-0000-0000-000000000001', 'c1000000-0000-4000-a000-000000000013', 'OUTGOING', 'email', '2026-01-12 09:00:00+01', NULL, 'Einkauf', 'order@braun-elektro.de', 'Anfrage Verfügbarkeit Siemens S7-1500 CPU', 'Lieferbarkeit und Preis für 5x Siemens 6ES7 515-2AM02-0AB0 angefragt.', '00000000-0000-0000-0000-000000000001'),
  ('c4000000-0000-4000-a000-000000000072', '10000000-0000-0000-0000-000000000001', 'c1000000-0000-4000-a000-000000000013', 'INCOMING', 'email', '2026-01-13 14:30:00+01', NULL, 'order@braun-elektro.de', 'Einkauf', 'RE: Verfügbarkeit Siemens S7-1500 CPU', '3 Stück ab Lager lieferbar, 2 weitere in KW 5. Angebot im Anhang.', '00000000-0000-0000-0000-000000000001'),

  -- Hoffmann Werkzeuge GmbH & Co. KG (K-6, BOTH) — 4 Einträge
  ('c4000000-0000-4000-a000-000000000081', '10000000-0000-0000-0000-000000000001', 'c1000000-0000-4000-a000-000000000021', 'INCOMING', 'visit', '2026-01-25 09:00:00+01', 'c2000000-0000-4000-a000-000000000005', 'Ulrike Hoffmann', 'Geschäftsführung', 'Besuch Fr. Hoffmann — Jahresgespräch', 'Jahresgespräch mit Fr. Hoffmann. Umsatz 2025 +12%. Rahmenvertrag 2026 vereinbart, Konditionen unverändert.', '00000000-0000-0000-0000-000000000001'),
  ('c4000000-0000-4000-a000-000000000082', '10000000-0000-0000-0000-000000000001', 'c1000000-0000-4000-a000-000000000021', 'INCOMING', 'email', '2026-02-08 11:00:00+01', 'c2000000-0000-4000-a000-000000000006', 'Jens Krause', 'Buchhaltung', 'Zahlungsavise Februar 2026', 'Zahlungsavise für 3 offene Rechnungen erhalten. Zahlung per Überweisung am 10.02.', '00000000-0000-0000-0000-000000000001'),
  ('c4000000-0000-4000-a000-000000000083', '10000000-0000-0000-0000-000000000001', 'c1000000-0000-4000-a000-000000000021', 'OUTGOING', 'phone', '2026-02-14 15:30:00+01', 'c2000000-0000-4000-a000-000000000005', 'Vertrieb', 'Ulrike Hoffmann', 'Lieferabruf Werkzeugstahl März', 'Abruf für März besprochen: 2t Werkzeugstahl 1.2343 ESU. Liefertermin 05.03.', '00000000-0000-0000-0000-000000000001'),
  ('c4000000-0000-4000-a000-000000000084', '10000000-0000-0000-0000-000000000001', 'c1000000-0000-4000-a000-000000000021', 'INTERNAL', 'email', '2026-02-16 08:30:00+01', NULL, 'Vertrieb', 'QS/Reklamation', 'Qualitätsproblem letzte Hoffmann-Lieferung', 'Rückläufer 3 Fräser mit Ausbrüchen. QS soll Prüfbericht erstellen vor Reklamation an Hoffmann.', '00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- CRM Inquiry / Vorgang entries (CRM_03)
-- ═══════════════════════════════════════════════════════════════════════════════
INSERT INTO crm_inquiries (id, tenant_id, number, title, address_id, contact_id, status, effort, credit_rating, notes, created_at, updated_at, created_by_id)
VALUES
  -- Müller Maschinenbau GmbH (K-1) — 2 Vorgänge
  ('c5000000-0000-4000-a000-000000000001', '10000000-0000-0000-0000-000000000001', 'V-1', 'Großauftrag Frästeile 50 Stück', 'c1000000-0000-4000-a000-000000000001', 'c2000000-0000-4000-a000-000000000001', 'IN_PROGRESS', 'high', 'gut', 'Anfrage über Sonderkonditionen. Angebot mit 8% Mengenrabatt gesendet.', '2026-01-10 09:00:00+01', '2026-01-14 15:00:00+01', '00000000-0000-0000-0000-000000000001'),
  ('c5000000-0000-4000-a000-000000000002', '10000000-0000-0000-0000-000000000001', 'V-2', 'Einladung Hausmesse März 2026', 'c1000000-0000-4000-a000-000000000001', NULL, 'CLOSED', 'low', NULL, 'Einladung versendet per Post.', '2026-02-20 08:00:00+01', '2026-03-16 10:00:00+01', '00000000-0000-0000-0000-000000000001'),

  -- Schmidt & Partner KG (K-2) — 1 Vorgang
  ('c5000000-0000-4000-a000-000000000011', '10000000-0000-0000-0000-000000000001', 'V-3', 'Projekt Berlin-Mitte Auftragserteilung', 'c1000000-0000-4000-a000-000000000002', 'c2000000-0000-4000-a000-000000000003', 'CLOSED', 'high', 'sehr gut', 'Bestellung eingegangen. Lieferadresse abweichend.', '2026-01-28 16:00:00+01', '2026-02-19 10:00:00+01', '00000000-0000-0000-0000-000000000001'),

  -- Weber Elektrotechnik AG (K-3) — 1 Vorgang
  ('c5000000-0000-4000-a000-000000000021', '10000000-0000-0000-0000-000000000001', 'V-4', 'Erstanfrage Schaltschrankkomponenten', 'c1000000-0000-4000-a000-000000000003', NULL, 'OPEN', 'medium', NULL, 'Telefonische Erstanfrage. Katalog und Preisliste gesendet. Ansprechpartner wird noch benannt.', '2026-02-10 08:30:00+01', '2026-02-10 15:00:00+01', '00000000-0000-0000-0000-000000000001'),

  -- Bauer Logistik e.K. (K-4) — 1 Vorgang
  ('c5000000-0000-4000-a000-000000000031', '10000000-0000-0000-0000-000000000001', 'V-5', 'Regalsysteme Neubau Hamburg-Wilhelmsburg', 'c1000000-0000-4000-a000-000000000004', NULL, 'IN_PROGRESS', 'high', 'gut', 'Vor-Ort-Besichtigung durchgeführt. Angebot mit 3D-Zeichnung gesendet.', '2026-01-15 12:00:00+01', '2026-02-12 14:00:00+01', '00000000-0000-0000-0000-000000000001'),

  -- Fischer IT Solutions GmbH (K-5, inaktiv) — 1 Vorgang
  ('c5000000-0000-4000-a000-000000000041', '10000000-0000-0000-0000-000000000001', 'V-6', 'Reklamation Lieferverzug B-4711', 'c1000000-0000-4000-a000-000000000005', NULL, 'CANCELLED', 'medium', 'kritisch', 'Eskalation wegen 2 Wochen Lieferverzug. Storniert da Kunde abgesprungen.', '2025-11-05 14:00:00+01', '2025-11-10 09:00:00+01', '00000000-0000-0000-0000-000000000001'),

  -- Hoffmann Werkzeuge GmbH & Co. KG (K-6, BOTH) — 1 Vorgang
  ('c5000000-0000-4000-a000-000000000051', '10000000-0000-0000-0000-000000000001', 'V-7', 'Rahmenvertrag 2026 und Qualitätsproblem', 'c1000000-0000-4000-a000-000000000021', 'c2000000-0000-4000-a000-000000000005', 'IN_PROGRESS', 'high', 'sehr gut', 'Jahresgespräch positiv. Aber Qualitätsproblem bei letzter Lieferung — QS prüft.', '2026-01-25 09:00:00+01', '2026-02-16 08:30:00+01', '00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- Set closed inquiry fields for V-2 and V-3
UPDATE crm_inquiries SET
  closed_at = '2026-03-16 10:00:00+01',
  closed_by_id = '00000000-0000-0000-0000-000000000001',
  closing_reason = 'Veranstaltung durchgeführt',
  closing_remarks = 'Hausmesse erfolgreich, 12 Teilnehmer.'
WHERE id = 'c5000000-0000-4000-a000-000000000002';

UPDATE crm_inquiries SET
  closed_at = '2026-02-19 10:00:00+01',
  closed_by_id = '00000000-0000-0000-0000-000000000001',
  closing_reason = 'Auftrag erteilt',
  closing_remarks = 'Bestellung bestätigt. Lieferung KW 8 per Spedition.'
WHERE id = 'c5000000-0000-4000-a000-000000000011';

-- Link some correspondence entries to inquiries
UPDATE crm_correspondences SET inquiry_id = 'c5000000-0000-4000-a000-000000000001'
WHERE id IN ('c4000000-0000-4000-a000-000000000001', 'c4000000-0000-4000-a000-000000000002');

UPDATE crm_correspondences SET inquiry_id = 'c5000000-0000-4000-a000-000000000011'
WHERE id IN ('c4000000-0000-4000-a000-000000000012', 'c4000000-0000-4000-a000-000000000013');

UPDATE crm_correspondences SET inquiry_id = 'c5000000-0000-4000-a000-000000000021'
WHERE id IN ('c4000000-0000-4000-a000-000000000021', 'c4000000-0000-4000-a000-000000000022', 'c4000000-0000-4000-a000-000000000023');

-- Link some inquiries to existing Terp orders (Auftragsverknüpfung)
UPDATE crm_inquiries SET order_id = '00000000-0000-0000-0000-000000000b10'
WHERE id = 'c5000000-0000-4000-a000-000000000001'; -- V-1 (Großauftrag Frästeile) → ORD-001 (Projekt Alpha)

UPDATE crm_inquiries SET order_id = '00000000-0000-0000-0000-000000000b11'
WHERE id = 'c5000000-0000-4000-a000-000000000031'; -- V-5 (Regalsysteme Neubau) → ORD-002 (Wartung Portal)

-- Update number sequence for inquiry to account for seeded data (V-1 through V-7)
INSERT INTO number_sequences (id, tenant_id, key, prefix, next_value, created_at, updated_at)
VALUES (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'inquiry', 'V-', 8, NOW(), NOW())
ON CONFLICT (tenant_id, key) DO UPDATE SET next_value = GREATEST(number_sequences.next_value, 8);

-- ═══════════════════════════════════════════════════════════════════════════════
-- CRM Tasks & Messages (CRM_04)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Tasks (type=TASK) — with due dates and status tracking
INSERT INTO crm_tasks (id, tenant_id, type, subject, description, address_id, contact_id, inquiry_id, status, due_at, due_time, duration_min, completed_at, completed_by_id, created_at, updated_at, created_by_id)
VALUES
  -- Task 1: Open task for Müller Maschinenbau, linked to inquiry V-1
  ('c6000000-0000-4000-a000-000000000001', '10000000-0000-0000-0000-000000000001', 'TASK',
   'Angebot Sonderkonditionen nachfassen',
   'Hr. Müller hat Rückfragen zum Angebot mit 8% Mengenrabatt. Bitte telefonisch klären und ggf. anpassen.',
   'c1000000-0000-4000-a000-000000000001', 'c2000000-0000-4000-a000-000000000001', 'c5000000-0000-4000-a000-000000000001',
   'OPEN', '2026-03-21 00:00:00+01', '10:00', 30,
   NULL, NULL,
   '2026-03-15 09:00:00+01', '2026-03-15 09:00:00+01', '00000000-0000-0000-0000-000000000001'),

  -- Task 2: In progress — Bauer Logistik Regalsysteme
  ('c6000000-0000-4000-a000-000000000002', '10000000-0000-0000-0000-000000000001', 'TASK',
   'Technische Zeichnung Regalsystem prüfen',
   'Die 3D-Zeichnung für Bauer Logistik muss vom technischen Leiter freigegeben werden bevor wir das Angebot finalisieren.',
   'c1000000-0000-4000-a000-000000000004', NULL, 'c5000000-0000-4000-a000-000000000031',
   'IN_PROGRESS', '2026-03-19 00:00:00+01', '14:00', 60,
   NULL, NULL,
   '2026-03-12 10:00:00+01', '2026-03-14 08:00:00+01', '00000000-0000-0000-0000-000000000001'),

  -- Task 3: Completed task — Schmidt & Partner delivery
  ('c6000000-0000-4000-a000-000000000003', '10000000-0000-0000-0000-000000000001', 'TASK',
   'Liefertermin mit Spedition abstimmen',
   'Lieferung KW 8 per Spedition an abweichende Adresse Berlin-Mitte koordinieren.',
   'c1000000-0000-4000-a000-000000000002', 'c2000000-0000-4000-a000-000000000003', 'c5000000-0000-4000-a000-000000000011',
   'COMPLETED', '2026-02-17 00:00:00+01', '09:00', 45,
   '2026-02-16 14:30:00+01', '00000000-0000-0000-0000-000000000001',
   '2026-02-10 11:00:00+01', '2026-02-16 14:30:00+01', '00000000-0000-0000-0000-000000000001'),

  -- Task 4: Open task — Hoffmann quality issue
  ('c6000000-0000-4000-a000-000000000004', '10000000-0000-0000-0000-000000000001', 'TASK',
   'QS-Prüfbericht Hoffmann-Fräser erstellen',
   'Rückläufer 3 Fräser mit Ausbrüchen prüfen und Prüfbericht erstellen für Reklamation an Hoffmann.',
   'c1000000-0000-4000-a000-000000000021', 'c2000000-0000-4000-a000-000000000005', 'c5000000-0000-4000-a000-000000000051',
   'OPEN', '2026-03-20 00:00:00+01', '08:00', 120,
   NULL, NULL,
   '2026-03-16 09:00:00+01', '2026-03-16 09:00:00+01', '00000000-0000-0000-0000-000000000001'),

  -- Task 5: Cancelled task — Fischer IT (inactive customer)
  ('c6000000-0000-4000-a000-000000000005', '10000000-0000-0000-0000-000000000001', 'TASK',
   'Gutschrift für Fischer IT vorbereiten',
   '5% Gutschrift auf nächste Bestellung als Entschuldigung für Lieferverzug. Storniert da Kunde abgesprungen.',
   'c1000000-0000-4000-a000-000000000005', NULL, 'c5000000-0000-4000-a000-000000000041',
   'CANCELLED', '2025-11-15 00:00:00+01', NULL, NULL,
   NULL, NULL,
   '2025-11-07 10:00:00+01', '2025-11-10 09:00:00+01', '00000000-0000-0000-0000-000000000001'),

  -- Task 6: Open task — Weber Elektrotechnik follow-up
  ('c6000000-0000-4000-a000-000000000006', '10000000-0000-0000-0000-000000000001', 'TASK',
   'Ansprechpartner Weber Elektrotechnik klären',
   'Nach der Erstanfrage muss der konkrete Ansprechpartner für Schaltschrankkomponenten identifiziert werden.',
   'c1000000-0000-4000-a000-000000000003', NULL, 'c5000000-0000-4000-a000-000000000021',
   'OPEN', '2026-03-24 00:00:00+01', NULL, NULL,
   NULL, NULL,
   '2026-03-10 09:00:00+01', '2026-03-10 09:00:00+01', '00000000-0000-0000-0000-000000000001'),

  -- Task 7: Open task — Stahl-Union price increase
  ('c6000000-0000-4000-a000-000000000007', '10000000-0000-0000-0000-000000000001', 'TASK',
   'Stellungnahme Preiserhöhung Stahl-Union',
   'Stahl-Union kündigt 6% Preiserhöhung ab April an. Einkauf soll Stellungnahme vorbereiten und Alternative prüfen.',
   'c1000000-0000-4000-a000-000000000011', 'c2000000-0000-4000-a000-000000000004', NULL,
   'OPEN', '2026-03-25 00:00:00+01', '11:00', 90,
   NULL, NULL,
   '2026-02-25 14:00:00+01', '2026-02-25 14:00:00+01', '00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- Messages (type=MESSAGE) — internal notifications without due dates
INSERT INTO crm_tasks (id, tenant_id, type, subject, description, address_id, contact_id, inquiry_id, status, created_at, updated_at, created_by_id)
VALUES
  -- Message 1: Info about Hausmesse
  ('c6000000-0000-4000-a000-000000000011', '10000000-0000-0000-0000-000000000001', 'MESSAGE',
   'Hausmesse 15.03. — Teilnehmerliste aktualisiert',
   'Die Teilnehmerliste für die Hausmesse wurde aktualisiert. Müller Maschinenbau hat 3 Personen angemeldet.',
   'c1000000-0000-4000-a000-000000000001', NULL, 'c5000000-0000-4000-a000-000000000002',
   'OPEN',
   '2026-03-10 08:00:00+01', '2026-03-10 08:00:00+01', '00000000-0000-0000-0000-000000000001'),

  -- Message 2: General info about supplier
  ('c6000000-0000-4000-a000-000000000012', '10000000-0000-0000-0000-000000000001', 'MESSAGE',
   'Kunststoff Meier — neue AGB beachten',
   'Kunststoff Meier hat aktualisierte AGB gesendet. Bitte bei der nächsten Bestellung die neuen Zahlungsbedingungen beachten.',
   'c1000000-0000-4000-a000-000000000012', NULL, NULL,
   'OPEN',
   '2026-02-16 08:00:00+01', '2026-02-16 08:00:00+01', '00000000-0000-0000-0000-000000000001'),

  -- Message 3: Completed message (all read)
  ('c6000000-0000-4000-a000-000000000013', '10000000-0000-0000-0000-000000000001', 'MESSAGE',
   'Speditionspartner gewechselt ab März',
   'Ab 01.03.2026 nutzen wir einen neuen Speditionspartner für Norddeutschland. Details im Intranet.',
   NULL, NULL, NULL,
   'COMPLETED',
   '2026-02-20 09:00:00+01', '2026-02-28 10:00:00+01', '00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- Task Assignees
INSERT INTO crm_task_assignees (id, task_id, employee_id, team_id, read_at, created_at)
VALUES
  -- Task 1 (Angebot Sonderkonditionen): assigned to Admin User + Thomas Mueller
  ('c7000000-0000-4000-a000-000000000001', 'c6000000-0000-4000-a000-000000000001', '00000000-0000-0000-0000-000000000011', NULL, NULL, '2026-03-15 09:00:00+01'),
  ('c7000000-0000-4000-a000-000000000002', 'c6000000-0000-4000-a000-000000000001', '00000000-0000-0000-0000-000000000014', NULL, NULL, '2026-03-15 09:00:00+01'),

  -- Task 2 (Technische Zeichnung): assigned to Backend Team
  ('c7000000-0000-4000-a000-000000000003', 'c6000000-0000-4000-a000-000000000002', NULL, '00000000-0000-0000-0000-000000000901', NULL, '2026-03-12 10:00:00+01'),

  -- Task 3 (Liefertermin Spedition): assigned to Anna Weber (completed, read)
  ('c7000000-0000-4000-a000-000000000004', 'c6000000-0000-4000-a000-000000000003', '00000000-0000-0000-0000-000000000015', NULL, '2026-02-11 08:00:00+01', '2026-02-10 11:00:00+01'),

  -- Task 4 (QS-Prüfbericht): assigned to Markus Braun + Betrieb team
  ('c7000000-0000-4000-a000-000000000005', 'c6000000-0000-4000-a000-000000000004', '00000000-0000-0000-0000-000000000017', NULL, NULL, '2026-03-16 09:00:00+01'),
  ('c7000000-0000-4000-a000-000000000006', 'c6000000-0000-4000-a000-000000000004', NULL, '00000000-0000-0000-0000-000000000906', NULL, '2026-03-16 09:00:00+01'),

  -- Task 5 (Gutschrift Fischer IT): assigned to Sabine Fischer
  ('c7000000-0000-4000-a000-000000000007', 'c6000000-0000-4000-a000-000000000005', '00000000-0000-0000-0000-000000000016', NULL, '2025-11-08 10:00:00+01', '2025-11-07 10:00:00+01'),

  -- Task 6 (Ansprechpartner Weber): assigned to Regular User
  ('c7000000-0000-4000-a000-000000000008', 'c6000000-0000-4000-a000-000000000006', '00000000-0000-0000-0000-000000000012', NULL, NULL, '2026-03-10 09:00:00+01'),

  -- Task 7 (Stellungnahme Preiserhöhung): assigned to Stefan Lang + Admin User
  ('c7000000-0000-4000-a000-000000000009', 'c6000000-0000-4000-a000-000000000007', '00000000-0000-0000-0000-000000000019', NULL, NULL, '2026-02-25 14:00:00+01'),
  ('c7000000-0000-4000-a000-000000000010', 'c6000000-0000-4000-a000-000000000007', '00000000-0000-0000-0000-000000000011', NULL, '2026-02-26 08:00:00+01', '2026-02-25 14:00:00+01'),

  -- Message 1 (Hausmesse): assigned to Frontend Team
  ('c7000000-0000-4000-a000-000000000011', 'c6000000-0000-4000-a000-000000000011', NULL, '00000000-0000-0000-0000-000000000902', NULL, '2026-03-10 08:00:00+01'),

  -- Message 2 (Kunststoff Meier AGB): assigned to Julia Hoffmann + Stefan Lang
  ('c7000000-0000-4000-a000-000000000012', 'c6000000-0000-4000-a000-000000000012', '00000000-0000-0000-0000-000000000018', NULL, '2026-02-17 09:00:00+01', '2026-02-16 08:00:00+01'),
  ('c7000000-0000-4000-a000-000000000013', 'c6000000-0000-4000-a000-000000000012', '00000000-0000-0000-0000-000000000019', NULL, NULL, '2026-02-16 08:00:00+01'),

  -- Message 3 (Speditionspartner): assigned to HR Core Team (all read → completed)
  ('c7000000-0000-4000-a000-000000000014', 'c6000000-0000-4000-a000-000000000013', NULL, '00000000-0000-0000-0000-000000000904', '2026-02-28 10:00:00+01', '2026-02-20 09:00:00+01')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- B1. Billing Documents (ORD_01 — Belegkette)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Realistic document chains across customers:
--
-- Chain A: Müller Maschinenbau (K-1) — Full chain OFFER→AB→LF→RE (paid)
-- Chain B: Schmidt & Partner (K-2) — OFFER→AB→LF→RE (partial payment, overdue)
-- Chain C: Weber Elektrotechnik (K-3) — OFFER→AB→LF→RE (unpaid, not yet overdue)
-- Chain D: Bauer Logistik (K-4) — OFFER→AB→LF→RE (with credit note + discount payment)
-- Chain E: Hoffmann Werkzeuge (K-6) — Direct RE (service invoice, paid with Skonto)
-- Chain F: Müller Maschinenbau (K-1) — Second RE (recent, unpaid)
-- Chain G: Schmidt & Partner (K-2) — RE from Kundendienst (open)
--
-- Document IDs use prefix b1 for billing documents:
--   b1000000-0000-4000-a000-0000000000XX

-- --- Chain A: Müller Maschinenbau — Großauftrag Frästeile (vollständig bezahlt) ---

-- A1: Angebot AG-1 (PRINTED)
INSERT INTO billing_documents (id, tenant_id, number, type, status, address_id, contact_id, inquiry_id, order_date, document_date, delivery_date, delivery_type, delivery_terms, payment_term_days, discount_percent, discount_days, discount_percent_2, discount_days_2, subtotal_net, total_vat, total_gross, notes, printed_at, printed_by_id, created_at, updated_at, created_by_id)
VALUES (
  'b1000000-0000-4000-a000-000000000001', '10000000-0000-0000-0000-000000000001',
  'AG-1', 'OFFER', 'FORWARDED',
  'c1000000-0000-4000-a000-000000000001', 'c2000000-0000-4000-a000-000000000002',
  'c5000000-0000-4000-a000-000000000001',
  '2026-01-10', '2026-01-14', '2026-02-14',
  'Spedition', 'frei Haus', 30, 3.0, 10, 2.0, 20,
  12500.00, 2375.00, 14875.00,
  'Sonderkonditionen lt. Telefonat mit Hr. Müller',
  '2026-01-14 15:00:00+01', '00000000-0000-0000-0000-000000000001',
  '2026-01-14 14:00:00+01', '2026-01-14 15:00:00+01', '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO NOTHING;

-- A2: Auftragsbestätigung AB-1 (FORWARDED, from AG-1)
INSERT INTO billing_documents (id, tenant_id, number, type, status, address_id, contact_id, inquiry_id, order_id, parent_document_id, order_date, document_date, delivery_date, delivery_type, delivery_terms, payment_term_days, discount_percent, discount_days, discount_percent_2, discount_days_2, subtotal_net, total_vat, total_gross, printed_at, printed_by_id, created_at, updated_at, created_by_id)
VALUES (
  'b1000000-0000-4000-a000-000000000002', '10000000-0000-0000-0000-000000000001',
  'AB-1', 'ORDER_CONFIRMATION', 'FORWARDED',
  'c1000000-0000-4000-a000-000000000001', 'c2000000-0000-4000-a000-000000000002',
  'c5000000-0000-4000-a000-000000000001', '00000000-0000-0000-0000-000000000b10',
  'b1000000-0000-4000-a000-000000000001',
  '2026-01-18', '2026-01-20', '2026-02-14',
  'Spedition', 'frei Haus', 30, 3.0, 10, 2.0, 20,
  12500.00, 2375.00, 14875.00,
  '2026-01-20 10:00:00+01', '00000000-0000-0000-0000-000000000001',
  '2026-01-20 09:00:00+01', '2026-01-20 10:00:00+01', '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO NOTHING;

-- A3: Lieferschein LS-1 (FORWARDED, from AB-1)
INSERT INTO billing_documents (id, tenant_id, number, type, status, address_id, contact_id, parent_document_id, order_date, document_date, delivery_date, delivery_type, delivery_terms, payment_term_days, discount_percent, discount_days, discount_percent_2, discount_days_2, subtotal_net, total_vat, total_gross, printed_at, printed_by_id, created_at, updated_at, created_by_id)
VALUES (
  'b1000000-0000-4000-a000-000000000003', '10000000-0000-0000-0000-000000000001',
  'LS-1', 'DELIVERY_NOTE', 'FORWARDED',
  'c1000000-0000-4000-a000-000000000001', 'c2000000-0000-4000-a000-000000000002',
  'b1000000-0000-4000-a000-000000000002',
  '2026-01-18', '2026-02-10', '2026-02-10',
  'Spedition', 'frei Haus', 30, 3.0, 10, 2.0, 20,
  12500.00, 2375.00, 14875.00,
  '2026-02-10 08:00:00+01', '00000000-0000-0000-0000-000000000001',
  '2026-02-10 07:30:00+01', '2026-02-10 08:00:00+01', '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO NOTHING;

-- A4: Rechnung RE-1 (PRINTED, from LS-1) — fully paid
INSERT INTO billing_documents (id, tenant_id, number, type, status, address_id, contact_id, parent_document_id, order_date, document_date, delivery_date, delivery_type, delivery_terms, payment_term_days, discount_percent, discount_days, discount_percent_2, discount_days_2, subtotal_net, total_vat, total_gross, printed_at, printed_by_id, created_at, updated_at, created_by_id)
VALUES (
  'b1000000-0000-4000-a000-000000000004', '10000000-0000-0000-0000-000000000001',
  'RE-1', 'INVOICE', 'PRINTED',
  'c1000000-0000-4000-a000-000000000001', 'c2000000-0000-4000-a000-000000000002',
  'b1000000-0000-4000-a000-000000000003',
  '2026-01-18', '2026-02-12', '2026-02-10',
  'Spedition', 'frei Haus', 30, 3.0, 10, 2.0, 20,
  12500.00, 2375.00, 14875.00,
  '2026-02-12 09:00:00+01', '00000000-0000-0000-0000-000000000001',
  '2026-02-12 08:30:00+01', '2026-02-12 09:00:00+01', '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO NOTHING;

-- --- Chain B: Schmidt & Partner — Projekt Berlin-Mitte (Teilzahlung, überfällig) ---

-- B1: Angebot AG-2
INSERT INTO billing_documents (id, tenant_id, number, type, status, address_id, contact_id, inquiry_id, order_date, document_date, delivery_date, delivery_type, payment_term_days, subtotal_net, total_vat, total_gross, printed_at, printed_by_id, created_at, updated_at, created_by_id)
VALUES (
  'b1000000-0000-4000-a000-000000000011', '10000000-0000-0000-0000-000000000001',
  'AG-2', 'OFFER', 'FORWARDED',
  'c1000000-0000-4000-a000-000000000002', 'c2000000-0000-4000-a000-000000000003',
  'c5000000-0000-4000-a000-000000000011',
  '2026-01-25', '2026-01-26', '2026-02-20',
  'Spedition', 14,
  8400.00, 1596.00, 9996.00,
  '2026-01-26 14:00:00+01', '00000000-0000-0000-0000-000000000001',
  '2026-01-26 13:00:00+01', '2026-01-26 14:00:00+01', '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO NOTHING;

-- B2: AB-2 (from AG-2)
INSERT INTO billing_documents (id, tenant_id, number, type, status, address_id, contact_id, inquiry_id, order_id, parent_document_id, order_date, document_date, delivery_date, delivery_type, payment_term_days, subtotal_net, total_vat, total_gross, printed_at, printed_by_id, created_at, updated_at, created_by_id)
VALUES (
  'b1000000-0000-4000-a000-000000000012', '10000000-0000-0000-0000-000000000001',
  'AB-2', 'ORDER_CONFIRMATION', 'FORWARDED',
  'c1000000-0000-4000-a000-000000000002', 'c2000000-0000-4000-a000-000000000003',
  'c5000000-0000-4000-a000-000000000011', '00000000-0000-0000-0000-000000000b11',
  'b1000000-0000-4000-a000-000000000011',
  '2026-01-28', '2026-01-30', '2026-02-20',
  'Spedition', 14,
  8400.00, 1596.00, 9996.00,
  '2026-01-30 09:00:00+01', '00000000-0000-0000-0000-000000000001',
  '2026-01-30 08:30:00+01', '2026-01-30 09:00:00+01', '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO NOTHING;

-- B3: LS-2 (from AB-2)
INSERT INTO billing_documents (id, tenant_id, number, type, status, address_id, contact_id, parent_document_id, order_date, document_date, delivery_date, delivery_type, payment_term_days, subtotal_net, total_vat, total_gross, printed_at, printed_by_id, created_at, updated_at, created_by_id)
VALUES (
  'b1000000-0000-4000-a000-000000000013', '10000000-0000-0000-0000-000000000001',
  'LS-2', 'DELIVERY_NOTE', 'FORWARDED',
  'c1000000-0000-4000-a000-000000000002', 'c2000000-0000-4000-a000-000000000003',
  'b1000000-0000-4000-a000-000000000012',
  '2026-01-28', '2026-02-18', '2026-02-18',
  'Spedition', 14,
  8400.00, 1596.00, 9996.00,
  '2026-02-18 08:00:00+01', '00000000-0000-0000-0000-000000000001',
  '2026-02-18 07:30:00+01', '2026-02-18 08:00:00+01', '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO NOTHING;

-- B4: RE-2 (from LS-2) — partially paid, overdue (14 days term, doc date Feb 20)
INSERT INTO billing_documents (id, tenant_id, number, type, status, address_id, contact_id, parent_document_id, order_date, document_date, delivery_date, delivery_type, payment_term_days, subtotal_net, total_vat, total_gross, printed_at, printed_by_id, created_at, updated_at, created_by_id)
VALUES (
  'b1000000-0000-4000-a000-000000000014', '10000000-0000-0000-0000-000000000001',
  'RE-2', 'INVOICE', 'PRINTED',
  'c1000000-0000-4000-a000-000000000002', 'c2000000-0000-4000-a000-000000000003',
  'b1000000-0000-4000-a000-000000000013',
  '2026-01-28', '2026-02-20', '2026-02-18',
  'Spedition', 14,
  8400.00, 1596.00, 9996.00,
  '2026-02-20 10:00:00+01', '00000000-0000-0000-0000-000000000001',
  '2026-02-20 09:30:00+01', '2026-02-20 10:00:00+01', '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO NOTHING;

-- --- Chain C: Weber Elektrotechnik — Schaltschrankzubehör (unbezahlt, noch nicht fällig) ---

-- C1: AG-3
INSERT INTO billing_documents (id, tenant_id, number, type, status, address_id, inquiry_id, order_date, document_date, delivery_date, delivery_type, payment_term_days, subtotal_net, total_vat, total_gross, printed_at, printed_by_id, created_at, updated_at, created_by_id)
VALUES (
  'b1000000-0000-4000-a000-000000000021', '10000000-0000-0000-0000-000000000001',
  'AG-3', 'OFFER', 'FORWARDED',
  'c1000000-0000-4000-a000-000000000003',
  'c5000000-0000-4000-a000-000000000021',
  '2026-02-18', '2026-02-20', '2026-03-15',
  'Paketdienst', 30,
  3200.00, 608.00, 3808.00,
  '2026-02-20 11:00:00+01', '00000000-0000-0000-0000-000000000001',
  '2026-02-20 10:30:00+01', '2026-02-20 11:00:00+01', '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO NOTHING;

-- C2: AB-3
INSERT INTO billing_documents (id, tenant_id, number, type, status, address_id, parent_document_id, order_date, document_date, delivery_date, delivery_type, payment_term_days, subtotal_net, total_vat, total_gross, printed_at, printed_by_id, created_at, updated_at, created_by_id)
VALUES (
  'b1000000-0000-4000-a000-000000000022', '10000000-0000-0000-0000-000000000001',
  'AB-3', 'ORDER_CONFIRMATION', 'FORWARDED',
  'c1000000-0000-4000-a000-000000000003',
  'b1000000-0000-4000-a000-000000000021',
  '2026-02-25', '2026-02-26', '2026-03-15',
  'Paketdienst', 30,
  3200.00, 608.00, 3808.00,
  '2026-02-26 09:00:00+01', '00000000-0000-0000-0000-000000000001',
  '2026-02-26 08:30:00+01', '2026-02-26 09:00:00+01', '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO NOTHING;

-- C3: LS-3
INSERT INTO billing_documents (id, tenant_id, number, type, status, address_id, parent_document_id, order_date, document_date, delivery_date, delivery_type, payment_term_days, subtotal_net, total_vat, total_gross, printed_at, printed_by_id, created_at, updated_at, created_by_id)
VALUES (
  'b1000000-0000-4000-a000-000000000023', '10000000-0000-0000-0000-000000000001',
  'LS-3', 'DELIVERY_NOTE', 'FORWARDED',
  'c1000000-0000-4000-a000-000000000003',
  'b1000000-0000-4000-a000-000000000022',
  '2026-02-25', '2026-03-10', '2026-03-10',
  'Paketdienst', 30,
  3200.00, 608.00, 3808.00,
  '2026-03-10 08:00:00+01', '00000000-0000-0000-0000-000000000001',
  '2026-03-10 07:30:00+01', '2026-03-10 08:00:00+01', '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO NOTHING;

-- C4: RE-3 (unpaid, due 2026-04-09 — not yet overdue)
INSERT INTO billing_documents (id, tenant_id, number, type, status, address_id, parent_document_id, order_date, document_date, delivery_date, delivery_type, payment_term_days, subtotal_net, total_vat, total_gross, printed_at, printed_by_id, created_at, updated_at, created_by_id)
VALUES (
  'b1000000-0000-4000-a000-000000000024', '10000000-0000-0000-0000-000000000001',
  'RE-3', 'INVOICE', 'PRINTED',
  'c1000000-0000-4000-a000-000000000003',
  'b1000000-0000-4000-a000-000000000023',
  '2026-02-25', '2026-03-10', '2026-03-10',
  'Paketdienst', 30,
  3200.00, 608.00, 3808.00,
  '2026-03-10 09:00:00+01', '00000000-0000-0000-0000-000000000001',
  '2026-03-10 08:30:00+01', '2026-03-10 09:00:00+01', '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO NOTHING;

-- --- Chain D: Bauer Logistik — Regalsysteme (with credit note + discount) ---

-- D1: AG-4
INSERT INTO billing_documents (id, tenant_id, number, type, status, address_id, inquiry_id, order_date, document_date, delivery_date, delivery_type, delivery_terms, payment_term_days, discount_percent, discount_days, discount_percent_2, discount_days_2, subtotal_net, total_vat, total_gross, printed_at, printed_by_id, created_at, updated_at, created_by_id)
VALUES (
  'b1000000-0000-4000-a000-000000000031', '10000000-0000-0000-0000-000000000001',
  'AG-4', 'OFFER', 'FORWARDED',
  'c1000000-0000-4000-a000-000000000004',
  'c5000000-0000-4000-a000-000000000031',
  '2026-02-01', '2026-02-12', '2026-03-10',
  'Spedition', 'frei Haus', 60, 3.0, 14, 2.0, 30,
  45000.00, 8550.00, 53550.00,
  '2026-02-12 14:30:00+01', '00000000-0000-0000-0000-000000000001',
  '2026-02-12 14:00:00+01', '2026-02-12 14:30:00+01', '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO NOTHING;

-- D2: AB-4
INSERT INTO billing_documents (id, tenant_id, number, type, status, address_id, parent_document_id, order_date, document_date, delivery_date, delivery_type, delivery_terms, payment_term_days, discount_percent, discount_days, discount_percent_2, discount_days_2, subtotal_net, total_vat, total_gross, printed_at, printed_by_id, created_at, updated_at, created_by_id)
VALUES (
  'b1000000-0000-4000-a000-000000000032', '10000000-0000-0000-0000-000000000001',
  'AB-4', 'ORDER_CONFIRMATION', 'FORWARDED',
  'c1000000-0000-4000-a000-000000000004',
  'b1000000-0000-4000-a000-000000000031',
  '2026-02-15', '2026-02-17', '2026-03-10',
  'Spedition', 'frei Haus', 60, 3.0, 14, 2.0, 30,
  45000.00, 8550.00, 53550.00,
  '2026-02-17 10:00:00+01', '00000000-0000-0000-0000-000000000001',
  '2026-02-17 09:30:00+01', '2026-02-17 10:00:00+01', '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO NOTHING;

-- D3: LS-4
INSERT INTO billing_documents (id, tenant_id, number, type, status, address_id, parent_document_id, order_date, document_date, delivery_date, delivery_type, delivery_terms, payment_term_days, discount_percent, discount_days, discount_percent_2, discount_days_2, subtotal_net, total_vat, total_gross, printed_at, printed_by_id, created_at, updated_at, created_by_id)
VALUES (
  'b1000000-0000-4000-a000-000000000033', '10000000-0000-0000-0000-000000000001',
  'LS-4', 'DELIVERY_NOTE', 'FORWARDED',
  'c1000000-0000-4000-a000-000000000004',
  'b1000000-0000-4000-a000-000000000032',
  '2026-02-15', '2026-03-05', '2026-03-05',
  'Spedition', 'frei Haus', 60, 3.0, 14, 2.0, 30,
  45000.00, 8550.00, 53550.00,
  '2026-03-05 08:00:00+01', '00000000-0000-0000-0000-000000000001',
  '2026-03-05 07:30:00+01', '2026-03-05 08:00:00+01', '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO NOTHING;

-- D4: RE-4 (from LS-4) — will have credit note + discount payment
INSERT INTO billing_documents (id, tenant_id, number, type, status, address_id, parent_document_id, order_date, document_date, delivery_date, delivery_type, delivery_terms, payment_term_days, discount_percent, discount_days, discount_percent_2, discount_days_2, subtotal_net, total_vat, total_gross, printed_at, printed_by_id, created_at, updated_at, created_by_id)
VALUES (
  'b1000000-0000-4000-a000-000000000034', '10000000-0000-0000-0000-000000000001',
  'RE-4', 'INVOICE', 'PRINTED',
  'c1000000-0000-4000-a000-000000000004',
  'b1000000-0000-4000-a000-000000000033',
  '2026-02-15', '2026-03-06', '2026-03-05',
  'Spedition', 'frei Haus', 60, 3.0, 14, 2.0, 30,
  45000.00, 8550.00, 53550.00,
  '2026-03-06 09:00:00+01', '00000000-0000-0000-0000-000000000001',
  '2026-03-06 08:30:00+01', '2026-03-06 09:00:00+01', '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO NOTHING;

-- D5: GS-1 Credit Note for RE-4 (damaged goods returned — 1 Regalgasse)
INSERT INTO billing_documents (id, tenant_id, number, type, status, address_id, parent_document_id, document_date, payment_term_days, subtotal_net, total_vat, total_gross, notes, printed_at, printed_by_id, created_at, updated_at, created_by_id)
VALUES (
  'b1000000-0000-4000-a000-000000000035', '10000000-0000-0000-0000-000000000001',
  'GS-1', 'CREDIT_NOTE', 'PRINTED',
  'c1000000-0000-4000-a000-000000000004',
  'b1000000-0000-4000-a000-000000000034',
  '2026-03-12', 60,
  5000.00, 950.00, 5950.00,
  'Gutschrift für beschädigte Regalgasse bei Lieferung',
  '2026-03-12 10:00:00+01', '00000000-0000-0000-0000-000000000001',
  '2026-03-12 09:30:00+01', '2026-03-12 10:00:00+01', '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO NOTHING;

-- --- Chain E: Hoffmann Werkzeuge — Direktrechnung Service (mit Skonto bezahlt) ---

-- E1: RE-5 (direct invoice for service work, paid with discount)
INSERT INTO billing_documents (id, tenant_id, number, type, status, address_id, contact_id, document_date, delivery_date, payment_term_days, discount_percent, discount_days, subtotal_net, total_vat, total_gross, notes, printed_at, printed_by_id, created_at, updated_at, created_by_id)
VALUES (
  'b1000000-0000-4000-a000-000000000041', '10000000-0000-0000-0000-000000000001',
  'RE-5', 'INVOICE', 'PRINTED',
  'c1000000-0000-4000-a000-000000000021', 'c2000000-0000-4000-a000-000000000006',
  '2026-02-05', '2026-02-04',
  30, 2.0, 10,
  1800.00, 342.00, 2142.00,
  'Werkzeugwartung und Nachschliff lt. Rahmenvertrag 2026',
  '2026-02-05 11:00:00+01', '00000000-0000-0000-0000-000000000001',
  '2026-02-05 10:30:00+01', '2026-02-05 11:00:00+01', '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO NOTHING;

-- --- Chain F: Müller Maschinenbau — zweite Rechnung (kürzlich, offen) ---

-- F1: RE-6 (recent invoice, unpaid but not yet overdue)
INSERT INTO billing_documents (id, tenant_id, number, type, status, address_id, contact_id, document_date, delivery_date, payment_term_days, discount_percent, discount_days, subtotal_net, total_vat, total_gross, notes, printed_at, printed_by_id, created_at, updated_at, created_by_id)
VALUES (
  'b1000000-0000-4000-a000-000000000051', '10000000-0000-0000-0000-000000000001',
  'RE-6', 'INVOICE', 'PRINTED',
  'c1000000-0000-4000-a000-000000000001', 'c2000000-0000-4000-a000-000000000001',
  '2026-03-14', '2026-03-12',
  30, 2.0, 10,
  6800.00, 1292.00, 8092.00,
  'Nachlieferung Ersatzteile Fräsmaschine',
  '2026-03-14 14:00:00+01', '00000000-0000-0000-0000-000000000001',
  '2026-03-14 13:30:00+01', '2026-03-14 14:00:00+01', '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO NOTHING;

-- --- Chain G: Schmidt & Partner — Kundendienst-Rechnung (offen) ---

-- G1: RE-7 (service case invoice, open)
INSERT INTO billing_documents (id, tenant_id, number, type, status, address_id, contact_id, document_date, delivery_date, payment_term_days, subtotal_net, total_vat, total_gross, notes, printed_at, printed_by_id, created_at, updated_at, created_by_id)
VALUES (
  'b1000000-0000-4000-a000-000000000061', '10000000-0000-0000-0000-000000000001',
  'RE-7', 'INVOICE', 'PRINTED',
  'c1000000-0000-4000-a000-000000000002', 'c2000000-0000-4000-a000-000000000003',
  '2026-03-05', '2026-03-04',
  14,
  950.00, 180.50, 1130.50,
  'Reparatur Steuerungsmodul vor Ort (Kundendienst)',
  '2026-03-05 11:00:00+01', '00000000-0000-0000-0000-000000000001',
  '2026-03-05 10:30:00+01', '2026-03-05 11:00:00+01', '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO NOTHING;

-- --- Draft: OFFER still in progress ---

-- H1: AG-5 (DRAFT — Stahl-Union Lieferwerk, not yet printed)
INSERT INTO billing_documents (id, tenant_id, number, type, status, address_id, document_date, payment_term_days, subtotal_net, total_vat, total_gross, notes, created_at, updated_at, created_by_id)
VALUES (
  'b1000000-0000-4000-a000-000000000071', '10000000-0000-0000-0000-000000000001',
  'AG-5', 'OFFER', 'DRAFT',
  'c1000000-0000-4000-a000-000000000011',
  '2026-03-17', 45,
  22000.00, 4180.00, 26180.00,
  'Rahmenvertrag Flachstahl 2026/2027 — Entwurf',
  '2026-03-17 09:00:00+01', '2026-03-17 09:00:00+01', '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- B2. Billing Document Positions
-- ═══════════════════════════════════════════════════════════════════════════════
-- Positions for all documents. Subsequent chain documents inherit parent positions.
-- We add positions for the leaf documents (invoices, credit note) and key offers.

-- RE-1 (Müller Frästeile) Positions
INSERT INTO billing_document_positions (id, document_id, sort_order, type, article_number, description, quantity, unit, unit_price, total_price, vat_rate, created_at, updated_at)
VALUES
  ('b2000000-0000-4000-a000-000000000001', 'b1000000-0000-4000-a000-000000000004', 1, 'ARTICLE', 'FT-100', 'Frästeile CNC Typ A — Aluminium 7075', 25, 'Stk', 320.00, 8000.00, 19.0, NOW(), NOW()),
  ('b2000000-0000-4000-a000-000000000002', 'b1000000-0000-4000-a000-000000000004', 2, 'ARTICLE', 'FT-200', 'Frästeile CNC Typ B — Stahl S235', 25, 'Stk', 180.00, 4500.00, 19.0, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Also add same positions to AG-1 (offer)
INSERT INTO billing_document_positions (id, document_id, sort_order, type, article_number, description, quantity, unit, unit_price, total_price, vat_rate, created_at, updated_at)
VALUES
  ('b2000000-0000-4000-a000-000000000003', 'b1000000-0000-4000-a000-000000000001', 1, 'ARTICLE', 'FT-100', 'Frästeile CNC Typ A — Aluminium 7075', 25, 'Stk', 320.00, 8000.00, 19.0, NOW(), NOW()),
  ('b2000000-0000-4000-a000-000000000004', 'b1000000-0000-4000-a000-000000000001', 2, 'ARTICLE', 'FT-200', 'Frästeile CNC Typ B — Stahl S235', 25, 'Stk', 180.00, 4500.00, 19.0, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- RE-2 (Schmidt Berlin-Mitte) Positions
INSERT INTO billing_document_positions (id, document_id, sort_order, type, article_number, description, quantity, unit, unit_price, total_price, vat_rate, created_at, updated_at)
VALUES
  ('b2000000-0000-4000-a000-000000000011', 'b1000000-0000-4000-a000-000000000014', 1, 'ARTICLE', 'SM-300', 'Spezialmontageset Berlin-Mitte', 12, 'Stk', 450.00, 5400.00, 19.0, NOW(), NOW()),
  ('b2000000-0000-4000-a000-000000000012', 'b1000000-0000-4000-a000-000000000014', 2, 'ARTICLE', 'SM-310', 'Montagezubehör Kleinteile', 1, 'Psch', 3000.00, 3000.00, 19.0, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- RE-3 (Weber Schaltschrankzubehör) Positions
INSERT INTO billing_document_positions (id, document_id, sort_order, type, article_number, description, quantity, unit, unit_price, total_price, vat_rate, created_at, updated_at)
VALUES
  ('b2000000-0000-4000-a000-000000000021', 'b1000000-0000-4000-a000-000000000024', 1, 'ARTICLE', 'SS-500', 'Schaltschrankgehäuse 800x600x300', 4, 'Stk', 480.00, 1920.00, 19.0, NOW(), NOW()),
  ('b2000000-0000-4000-a000-000000000022', 'b1000000-0000-4000-a000-000000000024', 2, 'ARTICLE', 'SS-510', 'Klemmleisten-Set DIN-Schiene', 8, 'Stk', 85.00, 680.00, 19.0, NOW(), NOW()),
  ('b2000000-0000-4000-a000-000000000023', 'b1000000-0000-4000-a000-000000000024', 3, 'FREE', NULL, 'Verdrahtungsmaterial und Kleinteile', 1, 'Psch', 600.00, 600.00, 19.0, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- RE-4 (Bauer Regalsysteme) Positions
INSERT INTO billing_document_positions (id, document_id, sort_order, type, article_number, description, quantity, unit, unit_price, total_price, vat_rate, created_at, updated_at)
VALUES
  ('b2000000-0000-4000-a000-000000000031', 'b1000000-0000-4000-a000-000000000034', 1, 'ARTICLE', 'RS-700', 'Schwerlast-Regalanlage 12m x 4m', 3, 'Stk', 12000.00, 36000.00, 19.0, NOW(), NOW()),
  ('b2000000-0000-4000-a000-000000000032', 'b1000000-0000-4000-a000-000000000034', 2, 'ARTICLE', 'RS-710', 'Fachböden Tragkraft 2t', 36, 'Stk', 250.00, 9000.00, 19.0, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- GS-1 (Gutschrift Bauer — beschädigte Regalgasse) Positions
INSERT INTO billing_document_positions (id, document_id, sort_order, type, article_number, description, quantity, unit, unit_price, total_price, vat_rate, created_at, updated_at)
VALUES
  ('b2000000-0000-4000-a000-000000000035', 'b1000000-0000-4000-a000-000000000035', 1, 'FREE', NULL, 'Gutschrift beschädigte Regalgasse Nr. 2 (Transportschaden)', 1, 'Psch', 5000.00, 5000.00, 19.0, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- RE-5 (Hoffmann Service) Positions
INSERT INTO billing_document_positions (id, document_id, sort_order, type, article_number, description, quantity, unit, unit_price, total_price, vat_rate, created_at, updated_at)
VALUES
  ('b2000000-0000-4000-a000-000000000041', 'b1000000-0000-4000-a000-000000000041', 1, 'ARTICLE', 'SV-100', 'Werkzeugwartung Fräser-Set', 3, 'Stk', 250.00, 750.00, 19.0, NOW(), NOW()),
  ('b2000000-0000-4000-a000-000000000042', 'b1000000-0000-4000-a000-000000000041', 2, 'ARTICLE', 'SV-110', 'Nachschliff Spiralbohrer HSS', 15, 'Stk', 35.00, 525.00, 19.0, NOW(), NOW()),
  ('b2000000-0000-4000-a000-000000000043', 'b1000000-0000-4000-a000-000000000041', 3, 'FREE', NULL, 'Anfahrt und Arbeitszeit', 3.5, 'Std', 150.00, 525.00, 19.0, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- RE-6 (Müller Ersatzteile) Positions
INSERT INTO billing_document_positions (id, document_id, sort_order, type, article_number, description, quantity, unit, unit_price, total_price, vat_rate, created_at, updated_at)
VALUES
  ('b2000000-0000-4000-a000-000000000051', 'b1000000-0000-4000-a000-000000000051', 1, 'ARTICLE', 'ET-400', 'Ersatzspindel für CNC-Fräse Typ 3', 1, 'Stk', 4200.00, 4200.00, 19.0, NOW(), NOW()),
  ('b2000000-0000-4000-a000-000000000052', 'b1000000-0000-4000-a000-000000000051', 2, 'ARTICLE', 'ET-410', 'Kugelgewindetriebe 20x5', 2, 'Stk', 850.00, 1700.00, 19.0, NOW(), NOW()),
  ('b2000000-0000-4000-a000-000000000053', 'b1000000-0000-4000-a000-000000000051', 3, 'FREE', NULL, 'Einbau und Kalibrierung vor Ort', 6, 'Std', 150.00, 900.00, 19.0, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- RE-7 (Schmidt Kundendienst) Positions
INSERT INTO billing_document_positions (id, document_id, sort_order, type, article_number, description, quantity, unit, unit_price, total_price, vat_rate, created_at, updated_at)
VALUES
  ('b2000000-0000-4000-a000-000000000061', 'b1000000-0000-4000-a000-000000000061', 1, 'FREE', NULL, 'Fehlerdiagnose Steuerungsmodul', 2, 'Std', 150.00, 300.00, 19.0, NOW(), NOW()),
  ('b2000000-0000-4000-a000-000000000062', 'b1000000-0000-4000-a000-000000000061', 2, 'ARTICLE', 'KD-200', 'Ersatz-Relais Siemens 3RT2', 2, 'Stk', 125.00, 250.00, 19.0, NOW(), NOW()),
  ('b2000000-0000-4000-a000-000000000063', 'b1000000-0000-4000-a000-000000000061', 3, 'FREE', NULL, 'Anfahrt Berlin-Mitte', 1, 'Psch', 400.00, 400.00, 19.0, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- AG-5 (Draft Stahl-Union) Positions
INSERT INTO billing_document_positions (id, document_id, sort_order, type, article_number, description, quantity, unit, unit_price, total_price, vat_rate, created_at, updated_at)
VALUES
  ('b2000000-0000-4000-a000-000000000071', 'b1000000-0000-4000-a000-000000000071', 1, 'ARTICLE', 'FS-800', 'Flachstahl S235JR 200x10mm', 15000, 'kg', 1.20, 18000.00, 19.0, NOW(), NOW()),
  ('b2000000-0000-4000-a000-000000000072', 'b1000000-0000-4000-a000-000000000071', 2, 'FREE', NULL, 'Anlieferung frei Werk (4 Chargen)', 1, 'Psch', 4000.00, 4000.00, 19.0, NOW(), NOW()),
  ('b2000000-0000-4000-a000-000000000073', 'b1000000-0000-4000-a000-000000000071', 3, 'TEXT', NULL, 'Preisbindung bis 30.09.2026. Lieferung in 4 Quartalschargen.', NULL, NULL, NULL, NULL, NULL, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- B3. Billing Service Cases (ORD_02 — Kundendienst)
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO billing_service_cases (id, tenant_id, number, title, address_id, contact_id, inquiry_id, status, reported_at, customer_notified_cost, assigned_to_id, description, closing_reason, closed_at, closed_by_id, order_id, invoice_document_id, created_at, updated_at, created_by_id)
VALUES
  -- KD-1: Müller Maschinenbau — CNC-Steuerung Störung (CLOSED, invoiced via RE-1)
  ('b3000000-0000-4000-a000-000000000001', '10000000-0000-0000-0000-000000000001',
   'KD-1', 'CNC-Steuerung Störung — Notfall-Reparatur',
   'c1000000-0000-4000-a000-000000000001', 'c2000000-0000-4000-a000-000000000002', NULL,
   'INVOICED', '2026-01-08 07:30:00+01', true,
   '00000000-0000-0000-0000-000000000014',
   'Kunde meldet Totalausfall CNC-Fräse Typ 3. Spindel defekt, Kugelgewindetriebe verschlissen. Notfall-Einsatz vor Ort erforderlich.',
   'Reparatur abgeschlossen. Spindel und Kugelgewindetriebe getauscht. Maschine kalibriert und abgenommen.',
   '2026-01-12 16:00:00+01', '00000000-0000-0000-0000-000000000001',
   NULL, NULL,
   '2026-01-08 08:00:00+01', '2026-01-12 16:00:00+01', '00000000-0000-0000-0000-000000000001'),

  -- KD-2: Schmidt & Partner — Steuerungsmodul Reparatur (INVOICED, linked to RE-7)
  ('b3000000-0000-4000-a000-000000000002', '10000000-0000-0000-0000-000000000001',
   'KD-2', 'Steuerungsmodul defekt — Reparatur vor Ort',
   'c1000000-0000-4000-a000-000000000002', 'c2000000-0000-4000-a000-000000000003', NULL,
   'INVOICED', '2026-03-01 10:00:00+01', true,
   '00000000-0000-0000-0000-000000000017',
   'Relais im Steuerungsmodul der Montageanlage Berlin-Mitte defekt. Sporadische Ausfälle seit 2 Tagen.',
   'Fehlerhafte Relais identifiziert und getauscht (2x Siemens 3RT2). Funktionstest bestanden.',
   '2026-03-04 15:00:00+01', '00000000-0000-0000-0000-000000000001',
   NULL, 'b1000000-0000-4000-a000-000000000061',
   '2026-03-01 10:30:00+01', '2026-03-05 11:00:00+01', '00000000-0000-0000-0000-000000000001'),

  -- KD-3: Weber Elektrotechnik — Schaltschrank-Prüfung (IN_PROGRESS)
  ('b3000000-0000-4000-a000-000000000003', '10000000-0000-0000-0000-000000000001',
   'KD-3', 'Schaltschrank-Inbetriebnahme und Prüfung',
   'c1000000-0000-4000-a000-000000000003', NULL,
   'c5000000-0000-4000-a000-000000000021',
   'IN_PROGRESS', '2026-03-12 09:00:00+01', false,
   '00000000-0000-0000-0000-000000000019',
   'Inbetriebnahme der gelieferten Schaltschrankkomponenten beim Kunden. Prüfprotokoll nach VDE erstellen.',
   NULL, NULL, NULL, NULL, NULL,
   '2026-03-12 09:30:00+01', '2026-03-15 14:00:00+01', '00000000-0000-0000-0000-000000000001'),

  -- KD-4: Bauer Logistik — Regal-Nachjustierung (OPEN)
  ('b3000000-0000-4000-a000-000000000004', '10000000-0000-0000-0000-000000000001',
   'KD-4', 'Regalsystem Nachjustierung nach Transportschaden',
   'c1000000-0000-4000-a000-000000000004', NULL,
   'c5000000-0000-4000-a000-000000000031',
   'OPEN', '2026-03-15 11:00:00+01', false,
   NULL,
   'Regalgasse Nr. 2 war beim Transport beschädigt. Gutschrift erstellt. Nachjustierung/Austausch vor Ort nötig.',
   NULL, NULL, NULL, NULL, NULL,
   '2026-03-15 11:30:00+01', '2026-03-15 11:30:00+01', '00000000-0000-0000-0000-000000000001'),

  -- KD-5: Hoffmann Werkzeuge — Fräser-Qualitätsprüfung (CLOSED, not yet invoiced)
  ('b3000000-0000-4000-a000-000000000005', '10000000-0000-0000-0000-000000000001',
   'KD-5', 'Qualitätsprüfung Fräser-Rückläufer',
   'c1000000-0000-4000-a000-000000000021', 'c2000000-0000-4000-a000-000000000005',
   'c5000000-0000-4000-a000-000000000051',
   'CLOSED', '2026-02-16 09:00:00+01', true,
   '00000000-0000-0000-0000-000000000017',
   '3 Fräser mit Ausbrüchen zurückerhalten. QS-Prüfung erforderlich. Prüfbericht für Reklamation an Hoffmann.',
   'Prüfbericht erstellt. Materialfehler bestätigt. Reklamation an Hoffmann gesendet. Kulanzgutschrift erwartet.',
   '2026-03-10 14:00:00+01', '00000000-0000-0000-0000-000000000001',
   NULL, NULL,
   '2026-02-16 09:30:00+01', '2026-03-10 14:00:00+01', '00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- B4. Billing Payments (ORD_03 — Offene Posten / Zahlungen)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Payment scenarios:
--   RE-1 (14.875,00€): PAID — single bank transfer within Skonto period
--   RE-2 ( 9.996,00€): PARTIAL — one payment of 5.000€, rest overdue
--   RE-3 ( 3.808,00€): UNPAID — no payments yet (not overdue)
--   RE-4 (53.550,00€): PARTIAL — credit note GS-1 reduces by 5.950€, bank payment pending
--   RE-5 ( 2.142,00€): PAID — paid with 2% Skonto within 10 days
--   RE-6 ( 8.092,00€): UNPAID — brand new invoice, no payments
--   RE-7 ( 1.130,50€): UNPAID — service invoice, overdue (14 day term, doc date Mar 5)

INSERT INTO billing_payments (id, tenant_id, document_id, date, amount, type, status, is_discount, notes, created_at, updated_at, created_by_id)
VALUES
  -- RE-1: Full payment via bank (14.875,00€) — paid on Feb 18 (within 10-day Skonto: 3%)
  -- Customer paid within Skonto-1 period: 14.875 * (1 - 0.03) = 14.428,75
  ('b4000000-0000-4000-a000-000000000001', '10000000-0000-0000-0000-000000000001',
   'b1000000-0000-4000-a000-000000000004', '2026-02-18 00:00:00+01',
   14428.75, 'BANK', 'ACTIVE', false,
   'Banküberweisung Müller Maschinenbau, Verwendungszweck: RE-1 Frästeile',
   '2026-02-19 08:00:00+01', '2026-02-19 08:00:00+01', '00000000-0000-0000-0000-000000000001'),

  -- RE-1: Skonto discount entry (3% = 446,25€)
  ('b4000000-0000-4000-a000-000000000002', '10000000-0000-0000-0000-000000000001',
   'b1000000-0000-4000-a000-000000000004', '2026-02-18 00:00:00+01',
   446.25, 'BANK', 'ACTIVE', true,
   'Skonto 3% (Zahlung innerhalb 10 Tagen)',
   '2026-02-19 08:00:00+01', '2026-02-19 08:00:00+01', '00000000-0000-0000-0000-000000000001'),

  -- RE-2: Partial payment (5.000€ of 9.996€ via bank)
  ('b4000000-0000-4000-a000-000000000003', '10000000-0000-0000-0000-000000000001',
   'b1000000-0000-4000-a000-000000000014', '2026-03-01 00:00:00+01',
   5000.00, 'BANK', 'ACTIVE', false,
   'Teilzahlung Schmidt & Partner, Restzahlung zugesagt für KW 12',
   '2026-03-02 09:00:00+01', '2026-03-02 09:00:00+01', '00000000-0000-0000-0000-000000000001'),

  -- RE-4: Partial payment (20.000€ of 53.550€ via bank)
  ('b4000000-0000-4000-a000-000000000004', '10000000-0000-0000-0000-000000000001',
   'b1000000-0000-4000-a000-000000000034', '2026-03-14 00:00:00+01',
   20000.00, 'BANK', 'ACTIVE', false,
   'Anzahlung Bauer Logistik — weitere Zahlung nach Mängelbeseitigung',
   '2026-03-14 10:00:00+01', '2026-03-14 10:00:00+01', '00000000-0000-0000-0000-000000000001'),

  -- RE-5: Full payment with Skonto (2% within 10 days)
  -- Hoffmann paid on Feb 12 (7 days after doc date Feb 5) → 2% Skonto applies
  -- 2.142 * (1 - 0.02) = 2.099,16
  ('b4000000-0000-4000-a000-000000000005', '10000000-0000-0000-0000-000000000001',
   'b1000000-0000-4000-a000-000000000041', '2026-02-12 00:00:00+01',
   2099.16, 'BANK', 'ACTIVE', false,
   'Zahlung Hoffmann Werkzeuge lt. Zahlungsavise',
   '2026-02-13 08:00:00+01', '2026-02-13 08:00:00+01', '00000000-0000-0000-0000-000000000001'),

  -- RE-5: Skonto discount entry (2% = 42,84€)
  ('b4000000-0000-4000-a000-000000000006', '10000000-0000-0000-0000-000000000001',
   'b1000000-0000-4000-a000-000000000041', '2026-02-12 00:00:00+01',
   42.84, 'BANK', 'ACTIVE', true,
   'Skonto 2% (Zahlung innerhalb 10 Tagen)',
   '2026-02-13 08:00:00+01', '2026-02-13 08:00:00+01', '00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- B5. Billing Recurring Invoices (ORD_05 — Wiederkehrende Rechnungen)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Three recurring templates across different customers and intervals:
--   WR-1: Müller Maschinenbau  — Monthly maintenance contract (active, auto-generate, already generated once)
--   WR-2: Weber Elektrotechnik — Quarterly inspection contract (active, manual)
--   WR-3: Bauer Logistik       — Annual service agreement (inactive, ended)

-- WR-1: Müller Maschinenbau — Monatliche Wartungspauschale CNC-Maschinen
-- Active, auto-generate, already generated Jan+Feb → next due 2026-04-01
INSERT INTO billing_recurring_invoices (
  id, tenant_id, name, address_id, contact_id, interval,
  start_date, end_date, next_due_date, last_generated_at,
  auto_generate, is_active,
  delivery_type, delivery_terms, payment_term_days, discount_percent, discount_days,
  notes, internal_notes,
  position_template,
  created_at, updated_at, created_by_id
) VALUES (
  'b5000000-0000-4000-a000-000000000001', '10000000-0000-0000-0000-000000000001',
  'Wartungsvertrag CNC-Maschinen (monatlich)',
  'c1000000-0000-4000-a000-000000000001', 'c2000000-0000-4000-a000-000000000002',
  'MONTHLY',
  '2026-01-01 00:00:00+01', NULL,
  '2026-04-01 00:00:00+02', '2026-03-01 04:00:00+01',
  true, true,
  'Spedition', 'frei Haus', 30, 3.0, 10,
  'Monatliche Wartung gemäß Servicevertrag SV-2026-001',
  'Vertragslaufzeit: unbefristet, 3 Monate Kündigungsfrist',
  '[
    {"type":"FREE","description":"Monatliche Wartungspauschale CNC-Fräse Typ 3","quantity":1,"unit":"Stk","unitPrice":1250.00,"vatRate":19},
    {"type":"FREE","description":"Verschleißteile-Pauschale (Spindellager, Filter)","quantity":1,"unit":"Stk","unitPrice":380.00,"vatRate":19},
    {"type":"FREE","description":"24/7 Notfall-Hotline","quantity":1,"unit":"Monat","unitPrice":120.00,"vatRate":19}
  ]'::jsonb,
  '2025-12-15 10:00:00+01', '2026-03-01 04:00:00+01', '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO NOTHING;

-- WR-2: Weber Elektrotechnik — Quartalsweise Schaltschrank-Inspektion
-- Active, manual generation, next due Q2 2026
INSERT INTO billing_recurring_invoices (
  id, tenant_id, name, address_id, interval,
  start_date, end_date, next_due_date, last_generated_at,
  auto_generate, is_active,
  payment_term_days,
  notes,
  position_template,
  created_at, updated_at, created_by_id
) VALUES (
  'b5000000-0000-4000-a000-000000000002', '10000000-0000-0000-0000-000000000001',
  'Schaltschrank-Inspektion (quartalsweise)',
  'c1000000-0000-4000-a000-000000000003',
  'QUARTERLY',
  '2026-01-01 00:00:00+01', '2027-12-31 00:00:00+01',
  '2026-04-01 00:00:00+02', '2026-01-15 09:00:00+01',
  false, true,
  30,
  'Inspektion nach VDE-Richtlinien, inkl. Prüfprotokoll',
  '[
    {"type":"FREE","description":"Schaltschrank-Inspektion (VDE 0100-600)","quantity":4,"unit":"Stk","unitPrice":285.00,"vatRate":19},
    {"type":"FREE","description":"Prüfprotokoll-Erstellung und Dokumentation","quantity":1,"unit":"Pausch.","unitPrice":150.00,"vatRate":19},
    {"type":"TEXT","description":"Prüfung umfasst: Sichtprüfung, Isolationsmessung, RCD-Test, Thermografie"}
  ]'::jsonb,
  '2025-12-20 14:00:00+01', '2026-01-15 09:00:00+01', '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO NOTHING;

-- WR-3: Bauer Logistik — Jährliche Regalprüfung (abgelaufen)
-- Inactive — end date reached, last generated was the final invoice
INSERT INTO billing_recurring_invoices (
  id, tenant_id, name, address_id, interval,
  start_date, end_date, next_due_date, last_generated_at,
  auto_generate, is_active,
  payment_term_days, discount_percent, discount_days,
  notes, internal_notes,
  position_template,
  created_at, updated_at, created_by_id
) VALUES (
  'b5000000-0000-4000-a000-000000000003', '10000000-0000-0000-0000-000000000001',
  'Jährliche Regalprüfung nach DIN EN 15635',
  'c1000000-0000-4000-a000-000000000004',
  'ANNUALLY',
  '2024-06-01 00:00:00+02', '2026-06-01 00:00:00+02',
  '2026-06-01 00:00:00+02', '2025-06-02 04:00:00+02',
  true, false,
  60, 2.0, 14,
  'Regalinspektion gemäß DIN EN 15635 durch zertifizierten Prüfer',
  'Vertrag ausgelaufen. Kunde hat Verlängerung abgelehnt (Haushaltssperre).',
  '[
    {"type":"FREE","description":"Regalinspektion DIN EN 15635 (Experte vor Ort)","quantity":1,"unit":"Tag","unitPrice":890.00,"vatRate":19},
    {"type":"FREE","description":"Prüfbericht mit Fotodokumentation","quantity":1,"unit":"Stk","unitPrice":250.00,"vatRate":19},
    {"type":"FREE","description":"Anfahrtspauschale Hamburg","quantity":1,"unit":"Pausch.","unitPrice":185.00,"vatRate":19}
  ]'::jsonb,
  '2024-05-10 11:00:00+02', '2025-06-02 04:00:00+02', '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- B6. Number sequences for billing documents
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO number_sequences (id, tenant_id, key, prefix, next_value, created_at, updated_at)
VALUES
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'offer', 'AG-', 6, NOW(), NOW()),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'order_confirmation', 'AB-', 5, NOW(), NOW()),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'delivery_note', 'LS-', 5, NOW(), NOW()),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'invoice', 'RE-', 8, NOW(), NOW()),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'credit_note', 'GS-', 2, NOW(), NOW()),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'service_case', 'KD-', 6, NOW(), NOW())
ON CONFLICT (tenant_id, key) DO UPDATE SET next_value = GREATEST(number_sequences.next_value, EXCLUDED.next_value);

-- ═══════════════════════════════════════════════════════════════════════════════
-- SCENARIO 3: 3-Schicht-Betrieb (Pro-Di Demo)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Adds: 3 day plans (FS/SS/NS), 3 week plans, 1 rolling tariff, 3 shifts,
--       4 employees (Instandhaltung), tariff assignments, employee day plans,
--       bookings + daily values for last 2 weeks + today

-- S3-1. Department: Instandhaltung (under Operations)
INSERT INTO departments (id, tenant_id, code, name, description, parent_id, manager_employee_id, is_active, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000808', '10000000-0000-0000-0000-000000000001', 'MAINT', 'Instandhaltung', 'Instandhaltung und Wartung', '00000000-0000-0000-0000-000000000805', NULL, true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- S3-2. Day Plans: FS (Frühschicht), SS (Spätschicht), NS (Nachtschicht)
-- Day plan IDs:
--   FS: 00000000-0000-0000-0000-000000000506
--   SS: 00000000-0000-0000-0000-000000000507
--   NS: 00000000-0000-0000-0000-000000000508
--
-- Times in minutes from midnight:
--   06:00 = 360, 14:00 = 840, 22:00 = 1320, 08:00 = 480

INSERT INTO day_plans (
  id, tenant_id, code, name, description, plan_type,
  come_from, come_to, go_from, go_to,
  regular_hours,
  tolerance_come_plus, tolerance_come_minus, tolerance_go_plus, tolerance_go_minus,
  holiday_credit_cat1, vacation_deduction, no_booking_behavior, day_change_behavior,
  is_active, created_at, updated_at
) VALUES
  ('00000000-0000-0000-0000-000000000506', '10000000-0000-0000-0000-000000000001',
   'FS', 'Fruehschicht', 'Fruehschicht 06:00-14:00', 'fixed',
   360, NULL, NULL, 840,
   480,
   5, 5, 5, 5,
   480, 1.00, 'error', 'none',
   true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000507', '10000000-0000-0000-0000-000000000001',
   'SS', 'Spaetschicht', 'Spaetschicht 14:00-22:00', 'fixed',
   840, NULL, NULL, 1320,
   480,
   5, 5, 5, 5,
   480, 1.00, 'error', 'none',
   true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000508', '10000000-0000-0000-0000-000000000001',
   'NS', 'Nachtschicht', 'Nachtschicht 22:00-06:00 (Tageswechsel bei Ankunft)', 'fixed',
   1320, NULL, NULL, 360,
   480,
   5, 5, 5, 5,
   480, 1.00, 'error', 'at_arrival',
   true, NOW(), NOW())
ON CONFLICT (tenant_id, code) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, plan_type = EXCLUDED.plan_type,
  come_from = EXCLUDED.come_from, come_to = EXCLUDED.come_to, go_from = EXCLUDED.go_from, go_to = EXCLUDED.go_to,
  regular_hours = EXCLUDED.regular_hours,
  tolerance_come_plus = EXCLUDED.tolerance_come_plus, tolerance_come_minus = EXCLUDED.tolerance_come_minus,
  tolerance_go_plus = EXCLUDED.tolerance_go_plus, tolerance_go_minus = EXCLUDED.tolerance_go_minus,
  holiday_credit_cat1 = EXCLUDED.holiday_credit_cat1, vacation_deduction = EXCLUDED.vacation_deduction,
  no_booking_behavior = EXCLUDED.no_booking_behavior, day_change_behavior = EXCLUDED.day_change_behavior,
  updated_at = NOW();

-- S3-2b. Breaks: 30 min auto-deduct after 360 min (6h) for all 3 shift plans
INSERT INTO day_plan_breaks (id, day_plan_id, break_type, start_time, end_time, duration, after_work_minutes, auto_deduct, is_paid, sort_order, created_at, updated_at)
VALUES
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000506', 'auto', NULL, NULL, 30, 360, true, false, 1, NOW(), NOW()),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000507', 'auto', NULL, NULL, 30, 360, true, false, 1, NOW(), NOW()),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000508', 'auto', NULL, NULL, 30, 360, true, false, 1, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- S3-3. Week Plans: WP-FS, WP-SS, WP-NS (Mon-Fri = shift day plan, Sat/Sun = NULL)
-- Week plan IDs:
--   WP-FS: 00000000-0000-0000-0000-000000000605
--   WP-SS: 00000000-0000-0000-0000-000000000606
--   WP-NS: 00000000-0000-0000-0000-000000000607

INSERT INTO week_plans (id, tenant_id, code, name, description,
  monday_day_plan_id, tuesday_day_plan_id, wednesday_day_plan_id, thursday_day_plan_id, friday_day_plan_id,
  saturday_day_plan_id, sunday_day_plan_id, is_active, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000605', '10000000-0000-0000-0000-000000000001',
   'WP-FS', 'Fruehschicht-Woche', 'Mo-Fr Fruehschicht, Sa/So frei',
   '00000000-0000-0000-0000-000000000506', '00000000-0000-0000-0000-000000000506',
   '00000000-0000-0000-0000-000000000506', '00000000-0000-0000-0000-000000000506',
   '00000000-0000-0000-0000-000000000506', NULL, NULL, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000606', '10000000-0000-0000-0000-000000000001',
   'WP-SS', 'Spaetschicht-Woche', 'Mo-Fr Spaetschicht, Sa/So frei',
   '00000000-0000-0000-0000-000000000507', '00000000-0000-0000-0000-000000000507',
   '00000000-0000-0000-0000-000000000507', '00000000-0000-0000-0000-000000000507',
   '00000000-0000-0000-0000-000000000507', NULL, NULL, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000607', '10000000-0000-0000-0000-000000000001',
   'WP-NS', 'Nachtschicht-Woche', 'Mo-Fr Nachtschicht, Sa/So frei',
   '00000000-0000-0000-0000-000000000508', '00000000-0000-0000-0000-000000000508',
   '00000000-0000-0000-0000-000000000508', '00000000-0000-0000-0000-000000000508',
   '00000000-0000-0000-0000-000000000508', NULL, NULL, true, NOW(), NOW())
ON CONFLICT (tenant_id, code) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description,
  monday_day_plan_id = EXCLUDED.monday_day_plan_id, tuesday_day_plan_id = EXCLUDED.tuesday_day_plan_id,
  wednesday_day_plan_id = EXCLUDED.wednesday_day_plan_id, thursday_day_plan_id = EXCLUDED.thursday_day_plan_id,
  friday_day_plan_id = EXCLUDED.friday_day_plan_id,
  saturday_day_plan_id = EXCLUDED.saturday_day_plan_id, sunday_day_plan_id = EXCLUDED.sunday_day_plan_id,
  updated_at = NOW();

-- S3-4. Tariff: SCHICHT-3R (3-Schicht-Rotation, rolling_weekly)
-- Tariff ID: 00000000-0000-0000-0000-000000000707

INSERT INTO tariffs (id, tenant_id, code, name, description, week_plan_id, is_active,
  annual_vacation_days, work_days_per_week, vacation_basis,
  daily_target_hours, weekly_target_hours, monthly_target_hours,
  credit_type, rhythm_type, rhythm_start_date,
  created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000707', '10000000-0000-0000-0000-000000000001',
   'SCHICHT-3R', '3-Schicht-Rotation', 'Rollierender 3-Schicht-Rhythmus (FS->SS->NS) fuer Instandhaltung',
   '00000000-0000-0000-0000-000000000605', true,
   30.00, 5, 'calendar_year', 8.00, 40.00, 173.33,
   'complete', 'rolling_weekly', '2026-01-05',
   NOW(), NOW())
ON CONFLICT (tenant_id, code) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description,
  week_plan_id = EXCLUDED.week_plan_id,
  annual_vacation_days = EXCLUDED.annual_vacation_days, work_days_per_week = EXCLUDED.work_days_per_week,
  daily_target_hours = EXCLUDED.daily_target_hours, weekly_target_hours = EXCLUDED.weekly_target_hours,
  monthly_target_hours = EXCLUDED.monthly_target_hours,
  credit_type = EXCLUDED.credit_type, rhythm_type = EXCLUDED.rhythm_type,
  rhythm_start_date = EXCLUDED.rhythm_start_date,
  updated_at = NOW();

-- S3-4b. Tariff Week Plans: 3-week rotation (FS -> SS -> NS)
-- Delete existing entries for this tariff first (idempotent)
DELETE FROM tariff_week_plans WHERE tariff_id = '00000000-0000-0000-0000-000000000707';

INSERT INTO tariff_week_plans (id, tariff_id, week_plan_id, sequence_order, created_at)
VALUES
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000707', '00000000-0000-0000-0000-000000000605', 1, NOW()),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000707', '00000000-0000-0000-0000-000000000606', 2, NOW()),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000707', '00000000-0000-0000-0000-000000000607', 3, NOW());

-- S3-5. Shifts: FS, SS, NS (linked to day plans)
-- Shift IDs:
--   FS: 00000000-0000-0000-0000-000000000a13
--   SS: 00000000-0000-0000-0000-000000000a14
--   NS: 00000000-0000-0000-0000-000000000a15

INSERT INTO shifts (id, tenant_id, code, name, description, day_plan_id, color, sort_order, is_active, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000a13', '10000000-0000-0000-0000-000000000001', 'FS', 'Fruehschicht', '06:00-14:00', '00000000-0000-0000-0000-000000000506', '#22C55E', 4, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000a14', '10000000-0000-0000-0000-000000000001', 'SS', 'Spaetschicht', '14:00-22:00', '00000000-0000-0000-0000-000000000507', '#F97316', 5, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000a15', '10000000-0000-0000-0000-000000000001', 'NS', 'Nachtschicht', '22:00-06:00', '00000000-0000-0000-0000-000000000508', '#3B82F6', 6, true, NOW(), NOW())
ON CONFLICT (tenant_id, code) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, day_plan_id = EXCLUDED.day_plan_id,
  color = EXCLUDED.color, sort_order = EXCLUDED.sort_order, updated_at = NOW();

-- S3-6. Employees: 4 shift workers for Instandhaltung
-- Employee IDs:
--   Klaus Weber:    00000000-0000-0000-0000-00000000001b
--   Andrea Mueller: 00000000-0000-0000-0000-00000000001c
--   Mehmet Yilmaz:  00000000-0000-0000-0000-00000000001d
--   Sandra Koch:    00000000-0000-0000-0000-00000000001e

INSERT INTO employees (id, tenant_id, personnel_number, pin, first_name, last_name, email, entry_date, weekly_hours, vacation_days_per_year, is_active,
  department_id, tariff_id, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000000001b', '10000000-0000-0000-0000-000000000001', 'EMP011', '1011', 'Klaus', 'Weber', 'klaus.weber@dev.local', '2023-04-01', 40.00, 30.00, true,
   '00000000-0000-0000-0000-000000000808', '00000000-0000-0000-0000-000000000707', NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000001c', '10000000-0000-0000-0000-000000000001', 'EMP012', '1012', 'Andrea', 'Mueller', 'andrea.mueller@dev.local', '2022-09-01', 40.00, 30.00, true,
   '00000000-0000-0000-0000-000000000808', '00000000-0000-0000-0000-000000000707', NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000001d', '10000000-0000-0000-0000-000000000001', 'EMP013', '1013', 'Mehmet', 'Yilmaz', 'mehmet.yilmaz@dev.local', '2024-02-15', 40.00, 30.00, true,
   '00000000-0000-0000-0000-000000000808', '00000000-0000-0000-0000-000000000707', NOW(), NOW()),
  ('00000000-0000-0000-0000-00000000001e', '10000000-0000-0000-0000-000000000001', 'EMP014', '1014', 'Sandra', 'Koch', 'sandra.koch@dev.local', '2021-11-01', 40.00, 30.00, true,
   '00000000-0000-0000-0000-000000000808', '00000000-0000-0000-0000-000000000707', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
  department_id = EXCLUDED.department_id, tariff_id = EXCLUDED.tariff_id,
  updated_at = NOW();

-- S3-6b. Employee enrichment (extended data)
DO $$
DECLARE
  t_id uuid := '10000000-0000-0000-0000-000000000001';
  et_vz uuid;
BEGIN
  SELECT id INTO et_vz FROM employment_types WHERE code = 'VZ' LIMIT 1;

  UPDATE employees SET cost_center_id = '00000000-0000-0000-0000-000000000c04', employment_type_id = et_vz,
    location_id = '00000000-0000-0000-0000-000000000d01',
    birth_date = '1978-05-12', gender = 'male', address_street = 'Dachauer Str. 45', address_zip = '80335', address_city = 'Muenchen'
    WHERE id = '00000000-0000-0000-0000-00000000001b' AND tenant_id = t_id;
  UPDATE employees SET cost_center_id = '00000000-0000-0000-0000-000000000c04', employment_type_id = et_vz,
    location_id = '00000000-0000-0000-0000-000000000d01',
    birth_date = '1985-09-23', gender = 'female', address_street = 'Landwehrstr. 18', address_zip = '80336', address_city = 'Muenchen'
    WHERE id = '00000000-0000-0000-0000-00000000001c' AND tenant_id = t_id;
  UPDATE employees SET cost_center_id = '00000000-0000-0000-0000-000000000c04', employment_type_id = et_vz,
    location_id = '00000000-0000-0000-0000-000000000d01',
    birth_date = '1990-03-07', gender = 'male', address_street = 'Schwanthalerstr. 22', address_zip = '80336', address_city = 'Muenchen'
    WHERE id = '00000000-0000-0000-0000-00000000001d' AND tenant_id = t_id;
  UPDATE employees SET cost_center_id = '00000000-0000-0000-0000-000000000c04', employment_type_id = et_vz,
    location_id = '00000000-0000-0000-0000-000000000d01',
    birth_date = '1982-11-30', gender = 'female', address_street = 'Nymphenburger Str. 8', address_zip = '80335', address_city = 'Muenchen'
    WHERE id = '00000000-0000-0000-0000-00000000001e' AND tenant_id = t_id;
END $$;

-- S3-7. Employee tariff assignments (deterministische IDs fuer Idempotenz)
INSERT INTO employee_tariff_assignments (id, tenant_id, employee_id, tariff_id, effective_from, effective_to, overwrite_behavior, is_active, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000001901b', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000001b', '00000000-0000-0000-0000-000000000707', '2026-01-01', NULL, 'preserve_manual', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000001901c', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000001c', '00000000-0000-0000-0000-000000000707', '2026-01-01', NULL, 'preserve_manual', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000001901d', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000001d', '00000000-0000-0000-0000-000000000707', '2026-01-01', NULL, 'preserve_manual', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000001901e', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000001e', '00000000-0000-0000-0000-000000000707', '2026-01-01', NULL, 'preserve_manual', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- S3-8. Employee day plans + shifts (rolling 3-week schedule from Jan 5 -> CURRENT_DATE + 90)
-- Rhythm: Week 1=FS, Week 2=SS, Week 3=NS, repeating
-- Rhythm start: 2026-01-05 (Monday KW2)
-- All 4 employees are in phase (same shift same week)
DO $$
DECLARE
  t_id uuid := '10000000-0000-0000-0000-000000000001';
  d date;
  dow int;
  week_num int;
  cycle_pos int; -- 0=FS, 1=SS, 2=NS
  dp_id uuid;
  sh_id uuid;
  emp_id uuid;
  rhythm_start date := '2026-01-05';
  is_holiday boolean;
BEGIN
  FOR emp_id IN
    SELECT unnest(ARRAY[
      '00000000-0000-0000-0000-00000000001b'::uuid,
      '00000000-0000-0000-0000-00000000001c'::uuid,
      '00000000-0000-0000-0000-00000000001d'::uuid,
      '00000000-0000-0000-0000-00000000001e'::uuid
    ])
  LOOP
    d := rhythm_start;
    WHILE d <= CURRENT_DATE + 90 LOOP
      dow := EXTRACT(ISODOW FROM d)::int;
      is_holiday := EXISTS (SELECT 1 FROM holidays WHERE holiday_date = d AND tenant_id = t_id);

      IF dow IN (6, 7) OR is_holiday THEN
        -- Weekend or holiday: no plan
        INSERT INTO employee_day_plans (id, tenant_id, employee_id, plan_date, day_plan_id, shift_id, source, created_at, updated_at)
        VALUES (gen_random_uuid(), t_id, emp_id, d, NULL, NULL,
          CASE WHEN is_holiday THEN 'holiday' ELSE 'tariff' END, NOW(), NOW())
        ON CONFLICT (employee_id, plan_date) DO UPDATE SET
          day_plan_id = EXCLUDED.day_plan_id, shift_id = EXCLUDED.shift_id,
          source = EXCLUDED.source, updated_at = NOW();
      ELSE
        -- Calculate which shift this week
        week_num := ((d - rhythm_start) / 7)::int;
        cycle_pos := week_num % 3;

        CASE cycle_pos
          WHEN 0 THEN dp_id := '00000000-0000-0000-0000-000000000506'; sh_id := '00000000-0000-0000-0000-000000000a13'; -- FS
          WHEN 1 THEN dp_id := '00000000-0000-0000-0000-000000000507'; sh_id := '00000000-0000-0000-0000-000000000a14'; -- SS
          WHEN 2 THEN dp_id := '00000000-0000-0000-0000-000000000508'; sh_id := '00000000-0000-0000-0000-000000000a15'; -- NS
        END CASE;

        INSERT INTO employee_day_plans (id, tenant_id, employee_id, plan_date, day_plan_id, shift_id, source, created_at, updated_at)
        VALUES (gen_random_uuid(), t_id, emp_id, d, dp_id, sh_id, 'tariff', NOW(), NOW())
        ON CONFLICT (employee_id, plan_date) DO UPDATE SET
          day_plan_id = EXCLUDED.day_plan_id, shift_id = EXCLUDED.shift_id,
          source = EXCLUDED.source, updated_at = NOW();
      END IF;

      d := d + 1;
    END LOOP;
  END LOOP;
END $$;

-- S3-9. Bookings + Daily Values for shift workers (Jan 5 -> yesterday)
-- Generates realistic bookings based on the rolling shift schedule.
-- Special cases:
--   - Klaus Weber: MISSING_GO error on last Thursday
--   - Mehmet Yilmaz: +30 min overtime on current week's Monday
DO $$
DECLARE
  bt_a1 uuid; bt_a2 uuid;
  t_id uuid := '10000000-0000-0000-0000-000000000001';
  d date;
  dow int;
  week_num int;
  cycle_pos int;
  emp record;
  come_time int;
  go_time int;
  target int := 480;
  break_dur int := 30;
  gross int;
  net int;
  pair_id uuid;
  h int;
  rhythm_start date := '2026-01-05';
  last_thu date;
  this_mon date;
  is_holiday boolean;
BEGIN
  SELECT id INTO bt_a1 FROM booking_types WHERE code = 'A1' LIMIT 1;
  SELECT id INTO bt_a2 FROM booking_types WHERE code = 'A2' LIMIT 1;

  -- Find last Thursday and this Monday for special cases
  last_thu := CURRENT_DATE - ((EXTRACT(ISODOW FROM CURRENT_DATE)::int + 3) % 7);
  this_mon := CURRENT_DATE - (EXTRACT(ISODOW FROM CURRENT_DATE)::int - 1);

  FOR emp IN
    SELECT * FROM (VALUES
      ('00000000-0000-0000-0000-00000000001b'::uuid, 'Klaus', 'terminal'),
      ('00000000-0000-0000-0000-00000000001c'::uuid, 'Andrea', 'terminal'),
      ('00000000-0000-0000-0000-00000000001d'::uuid, 'Mehmet', 'terminal'),
      ('00000000-0000-0000-0000-00000000001e'::uuid, 'Sandra', 'terminal')
    ) AS t(emp_id, emp_name, src)
  LOOP
    d := rhythm_start;
    WHILE d < CURRENT_DATE LOOP
      dow := EXTRACT(ISODOW FROM d)::int;
      IF dow IN (6, 7) THEN d := d + 1; CONTINUE; END IF;

      is_holiday := EXISTS (SELECT 1 FROM holidays WHERE holiday_date = d AND tenant_id = t_id);
      IF is_holiday THEN d := d + 1; CONTINUE; END IF;

      -- Skip if bookings already exist
      IF EXISTS (SELECT 1 FROM bookings WHERE employee_id = emp.emp_id AND booking_date = d) THEN d := d + 1; CONTINUE; END IF;

      week_num := ((d - rhythm_start) / 7)::int;
      cycle_pos := week_num % 3;

      -- Determine shift times
      CASE cycle_pos
        WHEN 0 THEN come_time := 360; -- FS: 06:00-14:00
        WHEN 1 THEN come_time := 840; -- SS: 14:00-22:00
        WHEN 2 THEN come_time := 1320; -- NS: 22:00-06:00
      END CASE;

      -- Add slight randomness (-5 to +5 min)
      h := (hashtext(emp.emp_id::text || d::text) % 11) - 5;
      come_time := come_time + h;

      pair_id := gen_random_uuid();

      -- KOMMEN booking
      INSERT INTO bookings (id, tenant_id, employee_id, booking_date, booking_type_id, original_time, edited_time, pair_id, source, created_at, updated_at)
      VALUES (gen_random_uuid(), t_id, emp.emp_id, d, bt_a1, come_time, come_time, pair_id, emp.src, NOW(), NOW());

      -- Special: Klaus has MISSING_GO on last Thursday
      IF emp.emp_name = 'Klaus' AND d = last_thu THEN
        INSERT INTO daily_values (id, tenant_id, employee_id, value_date, gross_time, net_time, target_time, overtime, undertime, break_time,
          has_error, error_codes, first_come, last_go, booking_count, status, created_at, updated_at)
        VALUES (gen_random_uuid(), t_id, emp.emp_id, d, 0, 0, target, 0, 0, 0, true, ARRAY['MISSING_GO'],
          come_time, NULL, 1, 'calculated', NOW(), NOW())
        ON CONFLICT (employee_id, value_date) DO NOTHING;
        d := d + 1; CONTINUE;
      END IF;

      -- Special: Mehmet has +30 min overtime on this Monday
      IF emp.emp_name = 'Mehmet' AND d = this_mon THEN
        go_time := come_time + target + break_dur + 30; -- 30 min extra
      ELSE
        go_time := come_time + target + break_dur + (abs(h) % 5); -- tiny variance
      END IF;

      -- GEHEN booking
      -- For night shift (cycle_pos=2), go_time wraps past midnight but we still store as minutes
      INSERT INTO bookings (id, tenant_id, employee_id, booking_date, booking_type_id, original_time, edited_time, pair_id, source, created_at, updated_at)
      VALUES (gen_random_uuid(), t_id, emp.emp_id, d, bt_a2, go_time, go_time, pair_id, emp.src, NOW(), NOW());

      -- Daily value
      gross := go_time - come_time;
      net := gross - break_dur;

      INSERT INTO daily_values (id, tenant_id, employee_id, value_date, gross_time, net_time, target_time, overtime, undertime, break_time,
        has_error, first_come, last_go, booking_count, status, created_at, updated_at)
      VALUES (gen_random_uuid(), t_id, emp.emp_id, d, gross, net, target,
        GREATEST(0, net - target), GREATEST(0, target - net),
        break_dur, false, come_time, go_time, 2, 'calculated', NOW(), NOW())
      ON CONFLICT (employee_id, value_date) DO NOTHING;

      d := d + 1;
    END LOOP;
  END LOOP;
END $$;

-- S3-10. Today's partial bookings for shift workers (only Kommen, no Gehen yet)
DO $$
DECLARE
  bt_a1 uuid;
  t_id uuid := '10000000-0000-0000-0000-000000000001';
  today date := CURRENT_DATE;
  dow int;
  week_num int;
  cycle_pos int;
  come_time int;
  pair_id uuid;
  emp_id uuid;
  rhythm_start date := '2026-01-05';
BEGIN
  dow := EXTRACT(ISODOW FROM today)::int;
  IF dow IN (6, 7) THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM holidays WHERE holiday_date = today AND tenant_id = t_id) THEN RETURN; END IF;

  SELECT id INTO bt_a1 FROM booking_types WHERE code = 'A1' LIMIT 1;

  week_num := ((today - rhythm_start) / 7)::int;
  cycle_pos := week_num % 3;

  CASE cycle_pos
    WHEN 0 THEN come_time := 360;  -- FS
    WHEN 1 THEN come_time := 840;  -- SS
    WHEN 2 THEN come_time := 1320; -- NS
  END CASE;

  FOR emp_id IN
    SELECT unnest(ARRAY[
      '00000000-0000-0000-0000-00000000001b'::uuid,
      '00000000-0000-0000-0000-00000000001c'::uuid,
      '00000000-0000-0000-0000-00000000001d'::uuid,
      '00000000-0000-0000-0000-00000000001e'::uuid
    ])
  LOOP
    IF NOT EXISTS (SELECT 1 FROM bookings WHERE employee_id = emp_id AND booking_date = today) THEN
      pair_id := gen_random_uuid();
      INSERT INTO bookings (id, tenant_id, employee_id, booking_date, booking_type_id, original_time, edited_time, pair_id, source, created_at, updated_at)
      VALUES (gen_random_uuid(), t_id, emp_id, today, bt_a1, come_time, come_time, pair_id, 'terminal', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING;
    END IF;
  END LOOP;
END $$;

-- S3-10b. Absence days for shift workers (Klaus/Andrea/Mehmet/Sandra)
-- Verschoben aus Sektion C2b, weil die Employees erst hier in S3 angelegt werden.
DO $$
DECLARE
  at_u  uuid;
  at_k  uuid;
  t_id  uuid := '10000000-0000-0000-0000-000000000001';
  approver_id uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  SELECT id INTO at_u FROM absence_types WHERE code = 'U' LIMIT 1;
  SELECT id INTO at_k FROM absence_types WHERE code = 'K' LIMIT 1;

  -- Klaus (01b): sick today (approved this morning)
  INSERT INTO absence_days (id, tenant_id, employee_id, absence_date, absence_type_id, duration, status, approved_by, approved_at, created_at, updated_at) VALUES
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-00000000001b', '2026-04-15', at_k, 1.00, 'approved', approver_id, '2026-04-15 07:15+00', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Andrea (01c): pending vacation Apr 20-22
  INSERT INTO absence_days (id, tenant_id, employee_id, absence_date, absence_type_id, duration, status, created_at, updated_at) VALUES
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-00000000001c', '2026-04-20', at_u, 1.00, 'pending', NOW(), NOW()),
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-00000000001c', '2026-04-21', at_u, 1.00, 'pending', NOW(), NOW()),
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-00000000001c', '2026-04-22', at_u, 1.00, 'pending', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Mehmet (01d): approved vacation Apr 27-30 (Mon-Thu)
  INSERT INTO absence_days (id, tenant_id, employee_id, absence_date, absence_type_id, duration, status, approved_by, approved_at, created_at, updated_at) VALUES
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-00000000001d', '2026-04-27', at_u, 1.00, 'approved', approver_id, '2026-04-10 10:00+00', NOW(), NOW()),
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-00000000001d', '2026-04-28', at_u, 1.00, 'approved', approver_id, '2026-04-10 10:00+00', NOW(), NOW()),
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-00000000001d', '2026-04-29', at_u, 1.00, 'approved', approver_id, '2026-04-10 10:00+00', NOW(), NOW()),
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-00000000001d', '2026-04-30', at_u, 1.00, 'approved', approver_id, '2026-04-10 10:00+00', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Sandra (01e): sick yesterday (approved, returned today)
  INSERT INTO absence_days (id, tenant_id, employee_id, absence_date, absence_type_id, duration, status, approved_by, approved_at, created_at, updated_at) VALUES
    (gen_random_uuid(), t_id, '00000000-0000-0000-0000-00000000001e', '2026-04-14', at_k, 1.00, 'approved', approver_id, '2026-04-14 08:00+00', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;
END $$;

-- S3-11. Vacation balances for shift workers (2026)
INSERT INTO vacation_balances (id, tenant_id, employee_id, year, entitlement, carryover, adjustments, taken, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000001600a', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000001b', 2026, 30.00, 4.00, 0.00, 0.00, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000001600b', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000001c', 2026, 30.00, 3.00, 0.00, 0.00, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000001600c', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000001d', 2026, 30.00, 2.00, 0.00, 4.00, NOW(), NOW()),
  ('00000000-0000-0000-0000-00000001600d', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000001e', 2026, 30.00, 5.00, 0.00, 0.00, NOW(), NOW())
ON CONFLICT (employee_id, year) DO NOTHING;

-- S3-12. Set department manager
UPDATE departments SET manager_employee_id = '00000000-0000-0000-0000-00000000001b' WHERE id = '00000000-0000-0000-0000-000000000808';

-- ═══════════════════════════════════════════════════════════════════════════════
-- B9. Billing Tenant Config (Briefpapier)
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO billing_tenant_configs (id, tenant_id, company_name, company_address, phone, email, website, bank_name, iban, bic, tax_id, commercial_register, managing_director, footer_html, created_at, updated_at)
VALUES (
  'b9000000-0000-4000-a000-000000000001', '10000000-0000-0000-0000-000000000001',
  'Müller & Söhne Metallverarbeitung GmbH',
  'Industriestraße 42' || E'\n' || '70565 Stuttgart',
  '+49 711 12345-0',
  'info@mueller-metall.de',
  'https://mueller-metall.de',
  'Sparkasse Stuttgart',
  'DE89 6005 0101 0012 3456 78',
  'SOLADEST600',
  'DE123456789',
  'HRB 750123 AG Stuttgart',
  'Hans Müller, Thomas Müller',
  NULL,
  NOW(), NOW()
) ON CONFLICT (tenant_id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- B10. Test-Angebot mit vielen Positionen (Seitenumbruch-Test)
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO billing_documents (id, tenant_id, number, type, status, address_id, contact_id, document_date, delivery_date, delivery_type, delivery_terms, payment_term_days, discount_percent, discount_days, subtotal_net, total_vat, total_gross, header_text, footer_text, notes, created_at, updated_at, created_by_id)
VALUES (
  'b1000000-0000-4000-a000-000000000099', '10000000-0000-0000-0000-000000000001',
  'AG-99', 'OFFER', 'DRAFT',
  'c1000000-0000-4000-a000-000000000001', 'c2000000-0000-4000-a000-000000000002',
  '2026-03-19', '2026-04-30',
  'Spedition', 'frei Haus', 30, 2.0, 10,
  89540.00, 17019.60, 106559.60,
  '<p>Sehr geehrte Damen und Herren,</p><p>vielen Dank für Ihre Anfrage. Gerne unterbreiten wir Ihnen folgendes Angebot für die <strong>Komplettausstattung Ihrer neuen Fertigungshalle</strong>:</p>',
  '<p>Dieses Angebot ist gültig bis zum <strong>30.04.2026</strong>. Bei Rückfragen steht Ihnen Herr Müller unter Tel. 0711/12345-100 gerne zur Verfügung.</p><p>Mit freundlichen Grüßen</p>',
  'Großprojekt Fertigungshalle — viele Positionen für Seitenumbruch-Test',
  '2026-03-19 10:00:00+01', '2026-03-19 10:00:00+01', '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO billing_document_positions (id, document_id, sort_order, type, article_number, description, quantity, unit, unit_price, total_price, vat_rate, created_at, updated_at)
VALUES
  -- Abschnitt 1: CNC-Maschinen
  ('b2000000-0000-4000-a000-000000000101', 'b1000000-0000-4000-a000-000000000099',  1, 'TEXT',    NULL,     'Abschnitt 1: CNC-Maschinen und Zubehör', NULL, NULL, NULL, NULL, NULL, NOW(), NOW()),
  ('b2000000-0000-4000-a000-000000000102', 'b1000000-0000-4000-a000-000000000099',  2, 'ARTICLE', 'CNC-01', 'CNC-Fräsmaschine 5-Achs Typ FX-5000 inkl. Steuerung', 2, 'Stk', 18500.00, 37000.00, 19.0, NOW(), NOW()),
  ('b2000000-0000-4000-a000-000000000103', 'b1000000-0000-4000-a000-000000000099',  3, 'ARTICLE', 'CNC-02', 'CNC-Drehmaschine Typ DL-3200 mit Gegenspindel', 1, 'Stk', 12800.00, 12800.00, 19.0, NOW(), NOW()),
  ('b2000000-0000-4000-a000-000000000104', 'b1000000-0000-4000-a000-000000000099',  4, 'ARTICLE', 'CNC-03', 'Werkzeugwechsler 24-fach für FX-5000', 2, 'Stk', 2400.00, 4800.00, 19.0, NOW(), NOW()),
  ('b2000000-0000-4000-a000-000000000105', 'b1000000-0000-4000-a000-000000000099',  5, 'ARTICLE', 'CNC-04', 'Kühlmittelsystem geschlossener Kreislauf', 3, 'Stk', 890.00, 2670.00, 19.0, NOW(), NOW()),
  ('b2000000-0000-4000-a000-000000000106', 'b1000000-0000-4000-a000-000000000099',  6, 'ARTICLE', 'CNC-05', 'Spannfutter-Set 3-Backen 160/200/250mm', 3, 'Set', 560.00, 1680.00, 19.0, NOW(), NOW()),

  -- Abschnitt 2: Werkzeuge
  ('b2000000-0000-4000-a000-000000000107', 'b1000000-0000-4000-a000-000000000099',  7, 'TEXT',    NULL,     'Abschnitt 2: Schneidwerkzeuge und Aufnahmen', NULL, NULL, NULL, NULL, NULL, NOW(), NOW()),
  ('b2000000-0000-4000-a000-000000000108', 'b1000000-0000-4000-a000-000000000099',  8, 'ARTICLE', 'WZ-10',  'VHM-Schaftfräser Set 6/8/10/12/16mm (je 5 Stk)', 1, 'Set', 1250.00, 1250.00, 19.0, NOW(), NOW()),
  ('b2000000-0000-4000-a000-000000000109', 'b1000000-0000-4000-a000-000000000099',  9, 'ARTICLE', 'WZ-11',  'HSS-Spiralbohrer Satz 1-13mm (0,5mm Stufen)', 5, 'Set', 185.00, 925.00, 19.0, NOW(), NOW()),
  ('b2000000-0000-4000-a000-000000000110', 'b1000000-0000-4000-a000-000000000099', 10, 'ARTICLE', 'WZ-12',  'Wendeschneidplatten CNMG 120408 (100er Pack)', 3, 'Pck', 320.00, 960.00, 19.0, NOW(), NOW()),
  ('b2000000-0000-4000-a000-000000000111', 'b1000000-0000-4000-a000-000000000099', 11, 'ARTICLE', 'WZ-13',  'Werkzeugaufnahme SK40 ER32 Spannzangenfutter', 10, 'Stk', 145.00, 1450.00, 19.0, NOW(), NOW()),
  ('b2000000-0000-4000-a000-000000000112', 'b1000000-0000-4000-a000-000000000099', 12, 'ARTICLE', 'WZ-14',  'Gewindebohrer-Set M3-M12 (HSS-E, Maschinengewindebohrer)', 2, 'Set', 420.00, 840.00, 19.0, NOW(), NOW()),

  -- Abschnitt 3: Messtechnik
  ('b2000000-0000-4000-a000-000000000113', 'b1000000-0000-4000-a000-000000000099', 13, 'TEXT',    NULL,     'Abschnitt 3: Messtechnik und Qualitätssicherung', NULL, NULL, NULL, NULL, NULL, NOW(), NOW()),
  ('b2000000-0000-4000-a000-000000000114', 'b1000000-0000-4000-a000-000000000099', 14, 'ARTICLE', 'MT-20',  '3D-Koordinatenmessmaschine Zeiss CONTURA 700x1000x600', 1, 'Stk', 8500.00, 8500.00, 19.0, NOW(), NOW()),
  ('b2000000-0000-4000-a000-000000000115', 'b1000000-0000-4000-a000-000000000099', 15, 'ARTICLE', 'MT-21',  'Digitaler Messschieber 0-300mm (Mitutoyo)', 10, 'Stk', 89.00, 890.00, 19.0, NOW(), NOW()),
  ('b2000000-0000-4000-a000-000000000116', 'b1000000-0000-4000-a000-000000000099', 16, 'ARTICLE', 'MT-22',  'Bügelmessschrauben-Set 0-150mm (6-teilig)', 5, 'Set', 340.00, 1700.00, 19.0, NOW(), NOW()),
  ('b2000000-0000-4000-a000-000000000117', 'b1000000-0000-4000-a000-000000000099', 17, 'ARTICLE', 'MT-23',  'Oberflächenrauheitsmessgerät SJ-210', 2, 'Stk', 1650.00, 3300.00, 19.0, NOW(), NOW()),

  -- Abschnitt 4: Betriebsausstattung
  ('b2000000-0000-4000-a000-000000000118', 'b1000000-0000-4000-a000-000000000099', 18, 'TEXT',    NULL,     'Abschnitt 4: Betriebsausstattung und Infrastruktur', NULL, NULL, NULL, NULL, NULL, NOW(), NOW()),
  ('b2000000-0000-4000-a000-000000000119', 'b1000000-0000-4000-a000-000000000099', 19, 'ARTICLE', 'BA-30',  'Schwerlast-Werkbank 2000x800mm mit Schraubstock', 6, 'Stk', 890.00, 5340.00, 19.0, NOW(), NOW()),
  ('b2000000-0000-4000-a000-000000000120', 'b1000000-0000-4000-a000-000000000099', 20, 'ARTICLE', 'BA-31',  'Werkzeugschrank mit Schubladeneinsätzen (7 Schubladen)', 6, 'Stk', 650.00, 3900.00, 19.0, NOW(), NOW()),
  ('b2000000-0000-4000-a000-000000000121', 'b1000000-0000-4000-a000-000000000099', 21, 'ARTICLE', 'BA-32',  'Hallenkran Einträger 5t Spannweite 12m', 1, 'Stk', 0.00, 0.00, 19.0, NOW(), NOW()),
  ('b2000000-0000-4000-a000-000000000122', 'b1000000-0000-4000-a000-000000000099', 22, 'FREE',   NULL,     'Montage Hallenkran inkl. Schienensystem und Abnahme', 1, 'Psch', 4500.00, 4500.00, 19.0, NOW(), NOW()),
  ('b2000000-0000-4000-a000-000000000123', 'b1000000-0000-4000-a000-000000000099', 23, 'ARTICLE', 'BA-33',  'Druckluftanlage Kompressor 7,5kW mit 500l Kessel', 1, 'Stk', 3200.00, 3200.00, 19.0, NOW(), NOW()),
  ('b2000000-0000-4000-a000-000000000124', 'b1000000-0000-4000-a000-000000000099', 24, 'ARTICLE', 'BA-34',  'Druckluft-Verteilernetz DN25 (ca. 80 lfm inkl. Anschlüsse)', 80, 'm', 45.00, 3600.00, 19.0, NOW(), NOW()),

  -- Abschnitt 5: Dienstleistungen
  ('b2000000-0000-4000-a000-000000000125', 'b1000000-0000-4000-a000-000000000099', 25, 'TEXT',    NULL,     'Abschnitt 5: Dienstleistungen', NULL, NULL, NULL, NULL, NULL, NOW(), NOW()),
  ('b2000000-0000-4000-a000-000000000126', 'b1000000-0000-4000-a000-000000000099', 26, 'FREE',   NULL,     'Transport und Anlieferung sämtlicher Maschinen frei Werk', 1, 'Psch', 3800.00, 3800.00, 19.0, NOW(), NOW()),
  ('b2000000-0000-4000-a000-000000000127', 'b1000000-0000-4000-a000-000000000099', 27, 'FREE',   NULL,     'Aufstellung, Nivellierung und Inbetriebnahme CNC-Maschinen', 5, 'Tag', 1200.00, 6000.00, 19.0, NOW(), NOW()),
  ('b2000000-0000-4000-a000-000000000128', 'b1000000-0000-4000-a000-000000000099', 28, 'FREE',   NULL,     'Schulung Bedienpersonal (2 Gruppen à 3 Tage)', 6, 'Tag', 950.00, 5700.00, 19.0, NOW(), NOW()),
  ('b2000000-0000-4000-a000-000000000129', 'b1000000-0000-4000-a000-000000000099', 29, 'FREE',   NULL,     'Erstinspektion und Kalibrierung Messtechnik', 2, 'Tag', 850.00, 1700.00, 19.0, NOW(), NOW()),
  ('b2000000-0000-4000-a000-000000000130', 'b1000000-0000-4000-a000-000000000099', 30, 'TEXT',   NULL,     'Alle Preise verstehen sich netto zzgl. gesetzlicher MwSt. Lieferzeit ca. 8-10 Wochen ab Auftragseingang.', NULL, NULL, NULL, NULL, NULL, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- =============================================================
-- W1. Warehouse: Article groups
-- =============================================================

INSERT INTO wh_article_groups (id, tenant_id, parent_id, name, sort_order, created_at, updated_at)
VALUES
  ('d1000000-0000-4000-a000-000000000001', '10000000-0000-0000-0000-000000000001', NULL, 'Befestigungsmaterial', 1, NOW(), NOW()),
  ('d1000000-0000-4000-a000-000000000002', '10000000-0000-0000-0000-000000000001', 'd1000000-0000-4000-a000-000000000001', 'Schrauben', 1, NOW(), NOW()),
  ('d1000000-0000-4000-a000-000000000003', '10000000-0000-0000-0000-000000000001', 'd1000000-0000-4000-a000-000000000001', 'Muttern & Scheiben', 2, NOW(), NOW()),
  ('d1000000-0000-4000-a000-000000000004', '10000000-0000-0000-0000-000000000001', NULL, 'Elektromaterial', 2, NOW(), NOW()),
  ('d1000000-0000-4000-a000-000000000005', '10000000-0000-0000-0000-000000000001', NULL, 'Werkzeuge', 3, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- =============================================================
-- W2. Warehouse: Articles (10 test articles)
-- =============================================================

INSERT INTO wh_articles (id, tenant_id, number, name, description, group_id, match_code, unit, vat_rate, sell_price, buy_price, stock_tracking, current_stock, min_stock, warehouse_location, is_active, created_at, updated_at)
VALUES
  -- Schrauben (group: Schrauben)
  ('d2000000-0000-4000-a000-000000000001', '10000000-0000-0000-0000-000000000001', 'ART-1', 'Sechskantschraube M8x40 DIN 933', 'Stahl verzinkt, Festigkeitsklasse 8.8', 'd1000000-0000-4000-a000-000000000002', 'SECHSKANT M8X40', 'Stk', 19.0, 0.35, 0.12, true, 2500, 500, 'Regal A1-01', true, NOW(), NOW()),
  ('d2000000-0000-4000-a000-000000000002', '10000000-0000-0000-0000-000000000001', 'ART-2', 'Zylinderschraube M6x30 DIN 912', 'Edelstahl A2-70, Innensechskant', 'd1000000-0000-4000-a000-000000000002', 'ZYLINDER M6X30', 'Stk', 19.0, 0.28, 0.09, true, 3200, 800, 'Regal A1-02', true, NOW(), NOW()),
  ('d2000000-0000-4000-a000-000000000003', '10000000-0000-0000-0000-000000000001', 'ART-3', 'Holzschraube 5x60 Senkkopf', 'Edelstahl, Torx T25', 'd1000000-0000-4000-a000-000000000002', 'HOLZSCHR 5X60', 'Stk', 19.0, 0.18, 0.06, true, 5000, 1000, 'Regal A1-03', true, NOW(), NOW()),

  -- Muttern & Scheiben (group: Muttern & Scheiben)
  ('d2000000-0000-4000-a000-000000000004', '10000000-0000-0000-0000-000000000001', 'ART-4', 'Sechskantmutter M8 DIN 934', 'Stahl verzinkt, Festigkeitsklasse 8', 'd1000000-0000-4000-a000-000000000003', 'MUTTER M8', 'Stk', 19.0, 0.08, 0.03, true, 4000, 1000, 'Regal A2-01', true, NOW(), NOW()),
  ('d2000000-0000-4000-a000-000000000005', '10000000-0000-0000-0000-000000000001', 'ART-5', 'Unterlegscheibe M8 DIN 125', 'Stahl verzinkt', 'd1000000-0000-4000-a000-000000000003', 'SCHEIBE M8', 'Stk', 19.0, 0.04, 0.01, true, 8000, 2000, 'Regal A2-02', true, NOW(), NOW()),

  -- Elektromaterial (group: Elektromaterial)
  ('d2000000-0000-4000-a000-000000000006', '10000000-0000-0000-0000-000000000001', 'ART-6', 'NYM-J 3x1.5mm² Kabel', 'Mantelleitung grau, 100m Ring', 'd1000000-0000-4000-a000-000000000004', 'NYM 3X1.5', 'm', 19.0, 1.20, 0.65, true, 450, 100, 'Regal B1-01', true, NOW(), NOW()),
  ('d2000000-0000-4000-a000-000000000007', '10000000-0000-0000-0000-000000000001', 'ART-7', 'Leitungsschutzschalter B16A 3-polig', 'ABB S203-B16, DIN-Schiene', 'd1000000-0000-4000-a000-000000000004', 'LSS B16 3P', 'Stk', 19.0, 18.50, 9.80, true, 45, 10, 'Regal B2-01', true, NOW(), NOW()),

  -- Werkzeuge (group: Werkzeuge)
  ('d2000000-0000-4000-a000-000000000008', '10000000-0000-0000-0000-000000000001', 'ART-8', 'Drehmomentschluessel 20-100 Nm', 'Umschaltknarre 1/2 Zoll', 'd1000000-0000-4000-a000-000000000005', 'DREHMOMENT 100', 'Stk', 19.0, 89.00, 42.00, false, 0, NULL, NULL, true, NOW(), NOW()),
  ('d2000000-0000-4000-a000-000000000009', '10000000-0000-0000-0000-000000000001', 'ART-9', 'Steckschluessel-Satz 1/4 + 1/2 Zoll', '94-teilig, Chrom-Vanadium', 'd1000000-0000-4000-a000-000000000005', 'STECKSCHL SATZ', 'Set', 19.0, 129.00, 62.00, false, 0, NULL, NULL, true, NOW(), NOW()),

  -- Dienstleistung (no group, service article)
  ('d2000000-0000-4000-a000-000000000010', '10000000-0000-0000-0000-000000000001', 'ART-10', 'Montage-Stunde Facharbeiter', 'Montageleistung pro Stunde, inkl. Werkzeug', NULL, 'MONTAGE STD', 'Std', 19.0, 65.00, NULL, false, 0, NULL, NULL, true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- =============================================================
-- W3. Warehouse: Article-supplier links
-- =============================================================

INSERT INTO wh_article_suppliers (id, article_id, supplier_id, supplier_article_number, is_primary, lead_time_days, buy_price, created_at, updated_at)
VALUES
  -- Stahl-Union liefert Schrauben und Muttern
  ('d3000000-0000-4000-a000-000000000001', 'd2000000-0000-4000-a000-000000000001', 'c1000000-0000-4000-a000-000000000011', 'SU-SK-M8X40', true, 5, 0.12, NOW(), NOW()),
  ('d3000000-0000-4000-a000-000000000002', 'd2000000-0000-4000-a000-000000000004', 'c1000000-0000-4000-a000-000000000011', 'SU-MU-M8', true, 5, 0.03, NOW(), NOW()),
  ('d3000000-0000-4000-a000-000000000003', 'd2000000-0000-4000-a000-000000000005', 'c1000000-0000-4000-a000-000000000011', 'SU-US-M8', true, 5, 0.01, NOW(), NOW()),

  -- Elektro-Großhandel Braun liefert Elektromaterial
  ('d3000000-0000-4000-a000-000000000004', 'd2000000-0000-4000-a000-000000000006', 'c1000000-0000-4000-a000-000000000013', 'EB-NYM-315', true, 3, 0.65, NOW(), NOW()),
  ('d3000000-0000-4000-a000-000000000005', 'd2000000-0000-4000-a000-000000000007', 'c1000000-0000-4000-a000-000000000013', 'EB-ABB-S203B16', true, 7, 9.80, NOW(), NOW()),

  -- Hoffmann Werkzeuge liefert Werkzeuge
  ('d3000000-0000-4000-a000-000000000006', 'd2000000-0000-4000-a000-000000000008', 'c1000000-0000-4000-a000-000000000021', 'HW-DMS-100', true, 10, 42.00, NOW(), NOW()),
  ('d3000000-0000-4000-a000-000000000007', 'd2000000-0000-4000-a000-000000000009', 'c1000000-0000-4000-a000-000000000021', 'HW-SSS-94', true, 10, 62.00, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- =============================================================
-- W4. Warehouse: Bill of Materials (Schrauben-Set = Schraube + Mutter + Scheibe)
-- =============================================================

INSERT INTO wh_bill_of_materials (id, parent_article_id, child_article_id, quantity, sort_order, notes, created_at)
VALUES
  -- ART-1 (Sechskantschraube M8) assembly = 1x Schraube + 1x Mutter + 2x Scheibe
  ('d4000000-0000-4000-a000-000000000001', 'd2000000-0000-4000-a000-000000000001', 'd2000000-0000-4000-a000-000000000004', 1, 1, 'Zugehoerige Mutter', NOW()),
  ('d4000000-0000-4000-a000-000000000002', 'd2000000-0000-4000-a000-000000000001', 'd2000000-0000-4000-a000-000000000005', 2, 2, 'Unterlegscheiben oben und unten', NOW())
ON CONFLICT (id) DO NOTHING;

-- =============================================================
-- W5. Warehouse: Number sequence for articles
-- =============================================================

INSERT INTO number_sequences (id, tenant_id, key, prefix, next_value, created_at, updated_at)
VALUES
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'article', 'ART-', 11, NOW(), NOW())
ON CONFLICT (tenant_id, key) DO UPDATE SET next_value = GREATEST(number_sequences.next_value, 11);

-- =============================================================
-- W6. Warehouse: Price Lists (3 lists with article entries)
-- =============================================================

INSERT INTO billing_price_lists (id, tenant_id, name, description, type, is_default, is_active, valid_from, valid_to, created_at, updated_at)
VALUES
  -- Sales price lists (type = 'sales')
  ('d5000000-0000-4000-a000-000000000001', '10000000-0000-0000-0000-000000000001', 'Standardpreise 2026', 'Allgemeine Verkaufspreise fuer Laufkundschaft', 'sales', true, true, '2026-01-01T00:00:00Z', '2026-12-31T23:59:59Z', NOW(), NOW()),
  ('d5000000-0000-4000-a000-000000000002', '10000000-0000-0000-0000-000000000001', 'Grosskunden -10%', 'Rabattierte Preise fuer Grosskunden mit Rahmenvertrag', 'sales', false, true, '2026-01-01T00:00:00Z', NULL, NOW(), NOW()),
  ('d5000000-0000-4000-a000-000000000003', '10000000-0000-0000-0000-000000000001', 'Messepreise Sommer 2026', 'Sonderpreise fuer Fachmesse Juni/Juli 2026', 'sales', false, true, '2026-06-01T00:00:00Z', '2026-07-31T23:59:59Z', NOW(), NOW()),
  -- Purchase price lists (type = 'purchase')
  ('d5000000-0000-4000-a000-000000000011', '10000000-0000-0000-0000-000000000001', 'Standard-Einkauf 2026', 'Regulaere Einkaufskonditionen aller Lieferanten', 'purchase', true, true, '2026-01-01T00:00:00Z', '2026-12-31T23:59:59Z', NOW(), NOW()),
  ('d5000000-0000-4000-a000-000000000012', '10000000-0000-0000-0000-000000000001', 'Stahl-Union Rahmenvertrag', 'Sonderkonditionen Stahl-Union lt. Rahmenvertrag 2026', 'purchase', false, true, '2026-01-01T00:00:00Z', NULL, NOW(), NOW()),
  ('d5000000-0000-4000-a000-000000000013', '10000000-0000-0000-0000-000000000001', 'Elektro Braun Konditionen', 'Vereinbarte Einkaufskonditionen Elektro-Grosshandel Braun', 'purchase', false, true, '2026-01-01T00:00:00Z', NULL, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Standardpreise: all 10 articles at their regular sell_price
INSERT INTO billing_price_list_entries (id, price_list_id, article_id, unit_price, min_quantity, unit, created_at, updated_at)
VALUES
  -- Befestigungsmaterial
  ('d6000000-0000-4000-a000-000000000001', 'd5000000-0000-4000-a000-000000000001', 'd2000000-0000-4000-a000-000000000001', 0.35, NULL, 'Stk', NOW(), NOW()),
  ('d6000000-0000-4000-a000-000000000002', 'd5000000-0000-4000-a000-000000000001', 'd2000000-0000-4000-a000-000000000002', 0.28, NULL, 'Stk', NOW(), NOW()),
  ('d6000000-0000-4000-a000-000000000003', 'd5000000-0000-4000-a000-000000000001', 'd2000000-0000-4000-a000-000000000003', 0.18, NULL, 'Stk', NOW(), NOW()),
  ('d6000000-0000-4000-a000-000000000004', 'd5000000-0000-4000-a000-000000000001', 'd2000000-0000-4000-a000-000000000004', 0.08, NULL, 'Stk', NOW(), NOW()),
  ('d6000000-0000-4000-a000-000000000005', 'd5000000-0000-4000-a000-000000000001', 'd2000000-0000-4000-a000-000000000005', 0.04, NULL, 'Stk', NOW(), NOW()),
  -- Schrauben Mengenstaffel (ab 1000 Stk guenstiger)
  ('d6000000-0000-4000-a000-000000000006', 'd5000000-0000-4000-a000-000000000001', 'd2000000-0000-4000-a000-000000000001', 0.28, 1000, 'Stk', NOW(), NOW()),
  ('d6000000-0000-4000-a000-000000000007', 'd5000000-0000-4000-a000-000000000001', 'd2000000-0000-4000-a000-000000000002', 0.22, 1000, 'Stk', NOW(), NOW()),
  ('d6000000-0000-4000-a000-000000000008', 'd5000000-0000-4000-a000-000000000001', 'd2000000-0000-4000-a000-000000000003', 0.14, 1000, 'Stk', NOW(), NOW()),
  -- Elektromaterial
  ('d6000000-0000-4000-a000-000000000009', 'd5000000-0000-4000-a000-000000000001', 'd2000000-0000-4000-a000-000000000006', 1.20, NULL, 'm', NOW(), NOW()),
  ('d6000000-0000-4000-a000-000000000010', 'd5000000-0000-4000-a000-000000000001', 'd2000000-0000-4000-a000-000000000007', 18.50, NULL, 'Stk', NOW(), NOW()),
  -- Kabel Mengenstaffel (ab 100m guenstiger)
  ('d6000000-0000-4000-a000-000000000011', 'd5000000-0000-4000-a000-000000000001', 'd2000000-0000-4000-a000-000000000006', 0.95, 100, 'm', NOW(), NOW()),
  -- Werkzeuge
  ('d6000000-0000-4000-a000-000000000012', 'd5000000-0000-4000-a000-000000000001', 'd2000000-0000-4000-a000-000000000008', 89.00, NULL, 'Stk', NOW(), NOW()),
  ('d6000000-0000-4000-a000-000000000013', 'd5000000-0000-4000-a000-000000000001', 'd2000000-0000-4000-a000-000000000009', 129.00, NULL, 'Set', NOW(), NOW()),
  -- Dienstleistung
  ('d6000000-0000-4000-a000-000000000014', 'd5000000-0000-4000-a000-000000000001', 'd2000000-0000-4000-a000-000000000010', 65.00, NULL, 'Std', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Grosskunden -10%: same articles, 10% discount on base prices
INSERT INTO billing_price_list_entries (id, price_list_id, article_id, unit_price, min_quantity, unit, created_at, updated_at)
VALUES
  ('d6000000-0000-4000-a000-000000000021', 'd5000000-0000-4000-a000-000000000002', 'd2000000-0000-4000-a000-000000000001', 0.32, NULL, 'Stk', NOW(), NOW()),
  ('d6000000-0000-4000-a000-000000000022', 'd5000000-0000-4000-a000-000000000002', 'd2000000-0000-4000-a000-000000000002', 0.25, NULL, 'Stk', NOW(), NOW()),
  ('d6000000-0000-4000-a000-000000000023', 'd5000000-0000-4000-a000-000000000002', 'd2000000-0000-4000-a000-000000000003', 0.16, NULL, 'Stk', NOW(), NOW()),
  ('d6000000-0000-4000-a000-000000000024', 'd5000000-0000-4000-a000-000000000002', 'd2000000-0000-4000-a000-000000000004', 0.07, NULL, 'Stk', NOW(), NOW()),
  ('d6000000-0000-4000-a000-000000000025', 'd5000000-0000-4000-a000-000000000002', 'd2000000-0000-4000-a000-000000000005', 0.04, NULL, 'Stk', NOW(), NOW()),
  ('d6000000-0000-4000-a000-000000000026', 'd5000000-0000-4000-a000-000000000002', 'd2000000-0000-4000-a000-000000000006', 1.08, NULL, 'm', NOW(), NOW()),
  ('d6000000-0000-4000-a000-000000000027', 'd5000000-0000-4000-a000-000000000002', 'd2000000-0000-4000-a000-000000000007', 16.65, NULL, 'Stk', NOW(), NOW()),
  ('d6000000-0000-4000-a000-000000000028', 'd5000000-0000-4000-a000-000000000002', 'd2000000-0000-4000-a000-000000000008', 80.10, NULL, 'Stk', NOW(), NOW()),
  ('d6000000-0000-4000-a000-000000000029', 'd5000000-0000-4000-a000-000000000002', 'd2000000-0000-4000-a000-000000000009', 116.10, NULL, 'Set', NOW(), NOW()),
  ('d6000000-0000-4000-a000-000000000030', 'd5000000-0000-4000-a000-000000000002', 'd2000000-0000-4000-a000-000000000010', 58.50, NULL, 'Std', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Messepreise Sommer 2026: aggressive discounts on Befestigungsmaterial + Elektro, no Werkzeuge/Dienstleistung
INSERT INTO billing_price_list_entries (id, price_list_id, article_id, unit_price, min_quantity, unit, created_at, updated_at)
VALUES
  ('d6000000-0000-4000-a000-000000000041', 'd5000000-0000-4000-a000-000000000003', 'd2000000-0000-4000-a000-000000000001', 0.25, NULL, 'Stk', NOW(), NOW()),
  ('d6000000-0000-4000-a000-000000000042', 'd5000000-0000-4000-a000-000000000003', 'd2000000-0000-4000-a000-000000000002', 0.20, NULL, 'Stk', NOW(), NOW()),
  ('d6000000-0000-4000-a000-000000000043', 'd5000000-0000-4000-a000-000000000003', 'd2000000-0000-4000-a000-000000000003', 0.12, NULL, 'Stk', NOW(), NOW()),
  ('d6000000-0000-4000-a000-000000000044', 'd5000000-0000-4000-a000-000000000003', 'd2000000-0000-4000-a000-000000000004', 0.06, NULL, 'Stk', NOW(), NOW()),
  ('d6000000-0000-4000-a000-000000000045', 'd5000000-0000-4000-a000-000000000003', 'd2000000-0000-4000-a000-000000000005', 0.03, NULL, 'Stk', NOW(), NOW()),
  ('d6000000-0000-4000-a000-000000000046', 'd5000000-0000-4000-a000-000000000003', 'd2000000-0000-4000-a000-000000000006', 0.89, NULL, 'm', NOW(), NOW()),
  ('d6000000-0000-4000-a000-000000000047', 'd5000000-0000-4000-a000-000000000003', 'd2000000-0000-4000-a000-000000000007', 14.90, NULL, 'Stk', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Standard-Einkauf 2026: buy prices from wh_article_suppliers (EK-Preise aller Lieferanten)
INSERT INTO billing_price_list_entries (id, price_list_id, article_id, unit_price, min_quantity, unit, created_at, updated_at)
VALUES
  -- Befestigungsmaterial (von Stahl-Union)
  ('d6000000-0000-4000-a000-000000000051', 'd5000000-0000-4000-a000-000000000011', 'd2000000-0000-4000-a000-000000000001', 0.12, NULL, 'Stk', NOW(), NOW()),
  ('d6000000-0000-4000-a000-000000000052', 'd5000000-0000-4000-a000-000000000011', 'd2000000-0000-4000-a000-000000000004', 0.03, NULL, 'Stk', NOW(), NOW()),
  ('d6000000-0000-4000-a000-000000000053', 'd5000000-0000-4000-a000-000000000011', 'd2000000-0000-4000-a000-000000000005', 0.01, NULL, 'Stk', NOW(), NOW()),
  -- Elektromaterial (von Elektro Braun)
  ('d6000000-0000-4000-a000-000000000054', 'd5000000-0000-4000-a000-000000000011', 'd2000000-0000-4000-a000-000000000006', 0.65, NULL, 'm', NOW(), NOW()),
  ('d6000000-0000-4000-a000-000000000055', 'd5000000-0000-4000-a000-000000000011', 'd2000000-0000-4000-a000-000000000007', 9.80, NULL, 'Stk', NOW(), NOW()),
  -- Werkzeuge (von Hoffmann)
  ('d6000000-0000-4000-a000-000000000056', 'd5000000-0000-4000-a000-000000000011', 'd2000000-0000-4000-a000-000000000008', 42.00, NULL, 'Stk', NOW(), NOW()),
  ('d6000000-0000-4000-a000-000000000057', 'd5000000-0000-4000-a000-000000000011', 'd2000000-0000-4000-a000-000000000009', 62.00, NULL, 'Set', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Stahl-Union Rahmenvertrag: Sonderkonditionen mit Mengenstaffel
INSERT INTO billing_price_list_entries (id, price_list_id, article_id, unit_price, min_quantity, unit, created_at, updated_at)
VALUES
  -- Schrauben
  ('d6000000-0000-4000-a000-000000000061', 'd5000000-0000-4000-a000-000000000012', 'd2000000-0000-4000-a000-000000000001', 0.10, NULL, 'Stk', NOW(), NOW()),
  ('d6000000-0000-4000-a000-000000000062', 'd5000000-0000-4000-a000-000000000012', 'd2000000-0000-4000-a000-000000000001', 0.08, 1000, 'Stk', NOW(), NOW()),
  ('d6000000-0000-4000-a000-000000000063', 'd5000000-0000-4000-a000-000000000012', 'd2000000-0000-4000-a000-000000000001', 0.06, 5000, 'Stk', NOW(), NOW()),
  -- Muttern
  ('d6000000-0000-4000-a000-000000000064', 'd5000000-0000-4000-a000-000000000012', 'd2000000-0000-4000-a000-000000000004', 0.025, NULL, 'Stk', NOW(), NOW()),
  ('d6000000-0000-4000-a000-000000000065', 'd5000000-0000-4000-a000-000000000012', 'd2000000-0000-4000-a000-000000000004', 0.02, 1000, 'Stk', NOW(), NOW()),
  -- Unterlegscheiben
  ('d6000000-0000-4000-a000-000000000066', 'd5000000-0000-4000-a000-000000000012', 'd2000000-0000-4000-a000-000000000005', 0.008, NULL, 'Stk', NOW(), NOW()),
  ('d6000000-0000-4000-a000-000000000067', 'd5000000-0000-4000-a000-000000000012', 'd2000000-0000-4000-a000-000000000005', 0.006, 2000, 'Stk', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Elektro Braun Konditionen: Einkaufspreise Elektromaterial
INSERT INTO billing_price_list_entries (id, price_list_id, article_id, unit_price, min_quantity, unit, created_at, updated_at)
VALUES
  -- NYM-Kabel
  ('d6000000-0000-4000-a000-000000000071', 'd5000000-0000-4000-a000-000000000013', 'd2000000-0000-4000-a000-000000000006', 0.60, NULL, 'm', NOW(), NOW()),
  ('d6000000-0000-4000-a000-000000000072', 'd5000000-0000-4000-a000-000000000013', 'd2000000-0000-4000-a000-000000000006', 0.52, 100, 'm', NOW(), NOW()),
  ('d6000000-0000-4000-a000-000000000073', 'd5000000-0000-4000-a000-000000000013', 'd2000000-0000-4000-a000-000000000006', 0.45, 500, 'm', NOW(), NOW()),
  -- Leitungsschutzschalter
  ('d6000000-0000-4000-a000-000000000074', 'd5000000-0000-4000-a000-000000000013', 'd2000000-0000-4000-a000-000000000007', 9.20, NULL, 'Stk', NOW(), NOW()),
  ('d6000000-0000-4000-a000-000000000075', 'd5000000-0000-4000-a000-000000000013', 'd2000000-0000-4000-a000-000000000007', 8.50, 20, 'Stk', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- =============================================================
-- W6b. Assign price lists to CRM addresses
-- =============================================================

-- Assign sales price lists to customers
UPDATE crm_addresses SET sales_price_list_id = 'd5000000-0000-4000-a000-000000000001'
  WHERE id = 'c1000000-0000-4000-a000-000000000001'; -- Mueller Maschinenbau → Standardpreise
UPDATE crm_addresses SET sales_price_list_id = 'd5000000-0000-4000-a000-000000000002'
  WHERE id = 'c1000000-0000-4000-a000-000000000002'; -- Schmidt & Partner → Grosskunden -10%
UPDATE crm_addresses SET sales_price_list_id = 'd5000000-0000-4000-a000-000000000001'
  WHERE id = 'c1000000-0000-4000-a000-000000000003'; -- Weber Elektrotechnik → Standardpreise

-- Assign purchase price lists to suppliers
UPDATE crm_addresses SET purchase_price_list_id = 'd5000000-0000-4000-a000-000000000012'
  WHERE id = 'c1000000-0000-4000-a000-000000000011'; -- Stahl-Union → Rahmenvertrag
UPDATE crm_addresses SET purchase_price_list_id = 'd5000000-0000-4000-a000-000000000013'
  WHERE id = 'c1000000-0000-4000-a000-000000000013'; -- Elektro Braun → Braun Konditionen

-- Hoffmann Werkzeuge (type=BOTH): both sales and purchase price list
UPDATE crm_addresses SET sales_price_list_id = 'd5000000-0000-4000-a000-000000000002',
                         purchase_price_list_id = 'd5000000-0000-4000-a000-000000000011'
  WHERE id = 'c1000000-0000-4000-a000-000000000021'; -- Hoffmann → Grosskunden VK + Standard EK

-- S4. Storage buckets for billing documents and tenant logos
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('documents', 'documents', false),
  ('tenant-logos', 'tenant-logos', true)
ON CONFLICT (id) DO NOTHING;

-- =============================================================
-- HR Personnel File: Default Categories
-- =============================================================
INSERT INTO hr_personnel_file_categories (tenant_id, name, code, description, color, sort_order, visible_to_roles) VALUES
('10000000-0000-0000-0000-000000000001', 'Verträge', 'CONTRACTS', 'Arbeitsverträge, Ergänzungen, Kündigungen', '#3B82F6', 1, ARRAY['admin', 'hr']),
('10000000-0000-0000-0000-000000000001', 'Zertifikate & Qualifikationen', 'CERTS', 'Schweißerscheine, Staplerschein, Ersthelfer', '#10B981', 2, ARRAY['admin', 'hr', 'supervisor']),
('10000000-0000-0000-0000-000000000001', 'Unterweisungen', 'SAFETY', 'Sicherheitsunterweisungen, Brandschutz', '#F59E0B', 3, ARRAY['admin', 'hr', 'supervisor']),
('10000000-0000-0000-0000-000000000001', 'Abmahnungen', 'WARNINGS', 'Abmahnungen, Verwarnungen', '#EF4444', 4, ARRAY['admin', 'hr']),
('10000000-0000-0000-0000-000000000001', 'Weiterbildung', 'TRAINING', 'Schulungen, Seminare', '#8B5CF6', 5, ARRAY['admin', 'hr', 'supervisor']),
('10000000-0000-0000-0000-000000000001', 'Arbeitsmedizin', 'MEDICAL', 'G-Untersuchungen, Eignungsnachweise', '#06B6D4', 6, ARRAY['admin', 'hr']),
('10000000-0000-0000-0000-000000000001', 'Sonstiges', 'OTHER', 'Alle übrigen Dokumente', '#6B7280', 7, ARRAY['admin', 'hr', 'supervisor'])
ON CONFLICT (tenant_id, code) DO NOTHING;

-- =============================================================
-- DSGVO Retention: Default Rules for Dev Tenant
-- =============================================================
INSERT INTO dsgvo_retention_rules (tenant_id, data_type, retention_months, action, is_active, description) VALUES
('10000000-0000-0000-0000-000000000001', 'BOOKINGS',            36,  'DELETE',    false, 'Stempelbuchungen (Kommen/Gehen)'),
('10000000-0000-0000-0000-000000000001', 'DAILY_VALUES',        36,  'DELETE',    false, 'Tageswerte (berechnete Zeiten)'),
('10000000-0000-0000-0000-000000000001', 'ABSENCES',            36,  'ANONYMIZE', false, 'Abwesenheiten (Urlaub, Krank etc.)'),
('10000000-0000-0000-0000-000000000001', 'MONTHLY_VALUES',      60,  'DELETE',    false, 'Monatswerte (Konten, Flexzeit)'),
('10000000-0000-0000-0000-000000000001', 'AUDIT_LOGS',          24,  'DELETE',    false, 'Audit-Protokoll'),
('10000000-0000-0000-0000-000000000001', 'TERMINAL_BOOKINGS',   12,  'DELETE',    false, 'Terminal-Rohdaten'),
('10000000-0000-0000-0000-000000000001', 'PERSONNEL_FILE',      120, 'DELETE',    false, 'Personalakten-Eintraege'),
('10000000-0000-0000-0000-000000000001', 'CORRECTION_MESSAGES', 12,  'DELETE',    false, 'Korrekturassistent-Meldungen'),
('10000000-0000-0000-0000-000000000001', 'STOCK_MOVEMENTS',     120, 'ANONYMIZE', false, 'Lagerbewegungen')
ON CONFLICT (tenant_id, data_type) DO NOTHING;

-- =============================================================
-- 28. Warehouse: Purchase orders + positions
-- =============================================================

-- PO-001: Ordered from Stahl-Union (Befestigungsmaterial), partially received
INSERT INTO wh_purchase_orders (id, tenant_id, number, supplier_id, status, order_date, requested_delivery, confirmed_delivery, order_method, notes, subtotal_net, total_vat, total_gross, created_at, updated_at, created_by_id)
VALUES
  ('d7000000-0000-4000-a000-000000000001', '10000000-0000-0000-0000-000000000001', 'PO-001', 'c1000000-0000-4000-a000-000000000011', 'PARTIALLY_RECEIVED', '2026-01-10 09:00:00+01', '2026-01-24 09:00:00+01', '2026-01-23 09:00:00+01', 'EMAIL', 'Nachbestellung Q1 Befestigungsmaterial', 785.00, 149.15, 934.15, NOW(), NOW(), '00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- PO-002: Draft order from Elektro Braun (Elektromaterial)
INSERT INTO wh_purchase_orders (id, tenant_id, number, supplier_id, status, order_date, requested_delivery, order_method, notes, subtotal_net, total_vat, total_gross, created_at, updated_at, created_by_id)
VALUES
  ('d7000000-0000-4000-a000-000000000002', '10000000-0000-0000-0000-000000000001', 'PO-002', 'c1000000-0000-4000-a000-000000000013', 'DRAFT', NULL, '2026-02-15 09:00:00+01', NULL, 'Kabelnachschub fuer Baustelle Mitte', 1240.00, 235.60, 1475.60, NOW(), NOW(), '00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- PO-003: Fully received from Hoffmann Werkzeuge
INSERT INTO wh_purchase_orders (id, tenant_id, number, supplier_id, status, order_date, requested_delivery, confirmed_delivery, order_method, notes, subtotal_net, total_vat, total_gross, created_at, updated_at, created_by_id)
VALUES
  ('d7000000-0000-4000-a000-000000000003', '10000000-0000-0000-0000-000000000001', 'PO-003', 'c1000000-0000-4000-a000-000000000021', 'RECEIVED', '2026-01-05 08:00:00+01', '2026-01-12 09:00:00+01', '2026-01-11 09:00:00+01', 'EMAIL', 'Werkzeug-Erstausstattung Lager', 462.50, 87.88, 550.38, NOW(), NOW(), '00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- PO-001 positions: Schrauben + Muttern (partially received)
INSERT INTO wh_purchase_order_positions (id, purchase_order_id, sort_order, position_type, article_id, description, quantity, received_quantity, unit, unit_price, total_price, vat_rate, created_at, updated_at)
VALUES
  ('d7100000-0000-4000-a000-000000000001', 'd7000000-0000-4000-a000-000000000001', 1, 'ARTICLE', 'd2000000-0000-4000-a000-000000000001', 'Sechskantschraube M8x40 DIN 933', 500, 300, 'Stk', 0.85, 425.00, 19.0, NOW(), NOW()),
  ('d7100000-0000-4000-a000-000000000002', 'd7000000-0000-4000-a000-000000000001', 2, 'ARTICLE', 'd2000000-0000-4000-a000-000000000004', 'Sechskantmutter M8 DIN 934', 500, 500, 'Stk', 0.32, 160.00, 19.0, NOW(), NOW()),
  ('d7100000-0000-4000-a000-000000000003', 'd7000000-0000-4000-a000-000000000001', 3, 'ARTICLE', 'd2000000-0000-4000-a000-000000000005', 'Unterlegscheibe M8 DIN 125', 1000, 1000, 'Stk', 0.12, 120.00, 19.0, NOW(), NOW()),
  ('d7100000-0000-4000-a000-000000000004', 'd7000000-0000-4000-a000-000000000001', 4, 'FREETEXT', NULL, 'Lieferung frei Haus ab 500 EUR', NULL, 0, NULL, NULL, NULL, 19.0, NOW(), NOW()),
  ('d7100000-0000-4000-a000-000000000005', 'd7000000-0000-4000-a000-000000000001', 5, 'ARTICLE', 'd2000000-0000-4000-a000-000000000002', 'Zylinderschraube M6x30 DIN 912', 200, 0, 'Stk', 0.40, 80.00, 19.0, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- PO-002 positions: Kabel + Sicherungsautomaten (draft, nothing received)
INSERT INTO wh_purchase_order_positions (id, purchase_order_id, sort_order, position_type, article_id, description, quantity, received_quantity, unit, unit_price, total_price, vat_rate, created_at, updated_at)
VALUES
  ('d7100000-0000-4000-a000-000000000011', 'd7000000-0000-4000-a000-000000000002', 1, 'ARTICLE', 'd2000000-0000-4000-a000-000000000006', 'NYM-J 3x1.5mm² 100m Ring', 5, 0, 'Ring', 148.00, 740.00, 19.0, NOW(), NOW()),
  ('d7100000-0000-4000-a000-000000000012', 'd7000000-0000-4000-a000-000000000002', 2, 'ARTICLE', 'd2000000-0000-4000-a000-000000000007', 'Leitungsschutzschalter B16A', 20, 0, 'Stk', 25.00, 500.00, 19.0, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- PO-003 positions: Werkzeuge (fully received)
INSERT INTO wh_purchase_order_positions (id, purchase_order_id, sort_order, position_type, article_id, description, quantity, received_quantity, unit, unit_price, total_price, vat_rate, created_at, updated_at)
VALUES
  ('d7100000-0000-4000-a000-000000000021', 'd7000000-0000-4000-a000-000000000003', 1, 'ARTICLE', 'd2000000-0000-4000-a000-000000000008', 'Drehmomentschluessel 20-200Nm', 2, 2, 'Stk', 156.25, 312.50, 19.0, NOW(), NOW()),
  ('d7100000-0000-4000-a000-000000000022', 'd7000000-0000-4000-a000-000000000003', 2, 'ARTICLE', 'd2000000-0000-4000-a000-000000000009', 'Steckschluessel-Satz 1/2" 10-32mm', 2, 2, 'Stk', 75.00, 150.00, 19.0, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Number sequence for PO
INSERT INTO number_sequences (id, tenant_id, key, prefix, next_value, created_at, updated_at)
VALUES (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'purchase_order', 'PO-', 4, NOW(), NOW())
ON CONFLICT (tenant_id, key) DO UPDATE SET next_value = GREATEST(number_sequences.next_value, 4);

-- =============================================================
-- 29. Warehouse: Stock movements (goods receipts + adjustments)
-- =============================================================

-- Goods receipt for PO-001 partial delivery (Muttern + Scheiben full, Schrauben 300/500)
INSERT INTO wh_stock_movements (id, tenant_id, article_id, type, quantity, previous_stock, new_stock, date, purchase_order_id, purchase_order_position_id, notes, created_by_id, created_at)
VALUES
  ('d8000000-0000-4000-a000-000000000001', '10000000-0000-0000-0000-000000000001', 'd2000000-0000-4000-a000-000000000001', 'GOODS_RECEIPT', 300, 200, 500, '2026-01-23 14:00:00+01', 'd7000000-0000-4000-a000-000000000001', 'd7100000-0000-4000-a000-000000000001', 'Teillieferung 1/2 PO-001', '00000000-0000-0000-0000-000000000001', '2026-01-23 14:00:00+01'),
  ('d8000000-0000-4000-a000-000000000002', '10000000-0000-0000-0000-000000000001', 'd2000000-0000-4000-a000-000000000004', 'GOODS_RECEIPT', 500, 300, 800, '2026-01-23 14:05:00+01', 'd7000000-0000-4000-a000-000000000001', 'd7100000-0000-4000-a000-000000000002', 'Volllieferung PO-001', '00000000-0000-0000-0000-000000000001', '2026-01-23 14:05:00+01'),
  ('d8000000-0000-4000-a000-000000000003', '10000000-0000-0000-0000-000000000001', 'd2000000-0000-4000-a000-000000000005', 'GOODS_RECEIPT', 1000, 500, 1500, '2026-01-23 14:10:00+01', 'd7000000-0000-4000-a000-000000000001', 'd7100000-0000-4000-a000-000000000003', 'Volllieferung PO-001', '00000000-0000-0000-0000-000000000001', '2026-01-23 14:10:00+01')
ON CONFLICT (id) DO NOTHING;

-- Goods receipt for PO-003 (Werkzeuge, fully received)
INSERT INTO wh_stock_movements (id, tenant_id, article_id, type, quantity, previous_stock, new_stock, date, purchase_order_id, purchase_order_position_id, notes, created_by_id, created_at)
VALUES
  ('d8000000-0000-4000-a000-000000000004', '10000000-0000-0000-0000-000000000001', 'd2000000-0000-4000-a000-000000000008', 'GOODS_RECEIPT', 2, 3, 5, '2026-01-11 10:00:00+01', 'd7000000-0000-4000-a000-000000000003', 'd7100000-0000-4000-a000-000000000021', 'Wareneingang PO-003', '00000000-0000-0000-0000-000000000001', '2026-01-11 10:00:00+01'),
  ('d8000000-0000-4000-a000-000000000005', '10000000-0000-0000-0000-000000000001', 'd2000000-0000-4000-a000-000000000009', 'GOODS_RECEIPT', 2, 5, 7, '2026-01-11 10:05:00+01', 'd7000000-0000-4000-a000-000000000003', 'd7100000-0000-4000-a000-000000000022', 'Wareneingang PO-003', '00000000-0000-0000-0000-000000000001', '2026-01-11 10:05:00+01')
ON CONFLICT (id) DO NOTHING;

-- Manual withdrawals (Entnahmen fuer Baustelle)
INSERT INTO wh_stock_movements (id, tenant_id, article_id, type, quantity, previous_stock, new_stock, date, notes, created_by_id, created_at)
VALUES
  ('d8000000-0000-4000-a000-000000000006', '10000000-0000-0000-0000-000000000001', 'd2000000-0000-4000-a000-000000000001', 'WITHDRAWAL', -50, 500, 450, '2026-01-27 07:30:00+01', 'Entnahme Baustelle Rosenheimer Str.', '00000000-0000-0000-0000-000000000001', '2026-01-27 07:30:00+01'),
  ('d8000000-0000-4000-a000-000000000007', '10000000-0000-0000-0000-000000000001', 'd2000000-0000-4000-a000-000000000004', 'WITHDRAWAL', -50, 800, 750, '2026-01-27 07:32:00+01', 'Entnahme Baustelle Rosenheimer Str.', '00000000-0000-0000-0000-000000000001', '2026-01-27 07:32:00+01'),
  ('d8000000-0000-4000-a000-000000000008', '10000000-0000-0000-0000-000000000001', 'd2000000-0000-4000-a000-000000000005', 'WITHDRAWAL', -100, 1500, 1400, '2026-01-27 07:34:00+01', 'Entnahme Baustelle Rosenheimer Str.', '00000000-0000-0000-0000-000000000001', '2026-01-27 07:34:00+01'),
  ('d8000000-0000-4000-a000-000000000009', '10000000-0000-0000-0000-000000000001', 'd2000000-0000-4000-a000-000000000006', 'WITHDRAWAL', -2, 10, 8, '2026-02-03 08:15:00+01', 'Kabelverlegung Buero EG', '00000000-0000-0000-0000-000000000001', '2026-02-03 08:15:00+01')
ON CONFLICT (id) DO NOTHING;

-- Inventory correction (Inventurdifferenz Scheiben)
INSERT INTO wh_stock_movements (id, tenant_id, article_id, type, quantity, previous_stock, new_stock, date, reason, notes, created_by_id, created_at)
VALUES
  ('d8000000-0000-4000-a000-000000000010', '10000000-0000-0000-0000-000000000001', 'd2000000-0000-4000-a000-000000000005', 'INVENTORY', -15, 1400, 1385, '2026-02-10 16:00:00+01', 'Inventurdifferenz', 'Jaehrliche Bestandsaufnahme Feb 2026', '00000000-0000-0000-0000-000000000001', '2026-02-10 16:00:00+01')
ON CONFLICT (id) DO NOTHING;

-- Return (Rueckgabe defekte Schrauben an Stahl-Union)
INSERT INTO wh_stock_movements (id, tenant_id, article_id, type, quantity, previous_stock, new_stock, date, purchase_order_id, reason, notes, created_by_id, created_at)
VALUES
  ('d8000000-0000-4000-a000-000000000011', '10000000-0000-0000-0000-000000000001', 'd2000000-0000-4000-a000-000000000001', 'RETURN', -20, 450, 430, '2026-02-05 11:00:00+01', 'd7000000-0000-4000-a000-000000000001', 'Reklamation', 'Reklamation: 20 Schrauben mit Gewindefehler', '00000000-0000-0000-0000-000000000001', '2026-02-05 11:00:00+01')
ON CONFLICT (id) DO NOTHING;

-- Update article current_stock to match final movement values
UPDATE wh_articles SET current_stock = 430  WHERE id = 'd2000000-0000-4000-a000-000000000001';
UPDATE wh_articles SET current_stock = 750  WHERE id = 'd2000000-0000-4000-a000-000000000004';
UPDATE wh_articles SET current_stock = 1385 WHERE id = 'd2000000-0000-4000-a000-000000000005';
UPDATE wh_articles SET current_stock = 5    WHERE id = 'd2000000-0000-4000-a000-000000000008';
UPDATE wh_articles SET current_stock = 7    WHERE id = 'd2000000-0000-4000-a000-000000000009';
UPDATE wh_articles SET current_stock = 8    WHERE id = 'd2000000-0000-4000-a000-000000000006';

-- =============================================================
-- 30. Warehouse: Supplier invoices + payments
-- =============================================================

-- Invoice from Stahl-Union for PO-001 partial delivery
INSERT INTO wh_supplier_invoices (id, tenant_id, number, supplier_id, purchase_order_id, status, invoice_date, received_date, total_net, total_vat, total_gross, payment_term_days, due_date, discount_percent, discount_days, notes, created_at, updated_at, created_by_id)
VALUES
  ('d9000000-0000-4000-a000-000000000001', '10000000-0000-0000-0000-000000000001', 'RE-2026-00412', 'c1000000-0000-4000-a000-000000000011', 'd7000000-0000-4000-a000-000000000001', 'PAID', '2026-01-24 00:00:00+01', '2026-01-27 09:00:00+01', 705.00, 133.95, 838.95, 30, '2026-02-23 00:00:00+01', 2.0, 10, 'Teillieferung Befestigungsmaterial', NOW(), NOW(), '00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- Invoice from Hoffmann Werkzeuge for PO-003
INSERT INTO wh_supplier_invoices (id, tenant_id, number, supplier_id, purchase_order_id, status, invoice_date, received_date, total_net, total_vat, total_gross, payment_term_days, due_date, discount_percent, discount_days, discount_percent_2, discount_days_2, notes, created_at, updated_at, created_by_id)
VALUES
  ('d9000000-0000-4000-a000-000000000002', '10000000-0000-0000-0000-000000000001', 'HW-R-2026-0087', 'c1000000-0000-4000-a000-000000000021', 'd7000000-0000-4000-a000-000000000003', 'PAID', '2026-01-12 00:00:00+01', '2026-01-14 09:00:00+01', 462.50, 87.88, 550.38, 45, '2026-02-25 00:00:00+01', 3.0, 10, 2.0, 20, 'Werkzeuglieferung komplett', NOW(), NOW(), '00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- Open invoice from Elektro Braun (old delivery, not from a PO)
INSERT INTO wh_supplier_invoices (id, tenant_id, number, supplier_id, purchase_order_id, status, invoice_date, received_date, total_net, total_vat, total_gross, payment_term_days, due_date, notes, created_at, updated_at, created_by_id)
VALUES
  ('d9000000-0000-4000-a000-000000000003', '10000000-0000-0000-0000-000000000001', 'EB-2026-1034', 'c1000000-0000-4000-a000-000000000013', NULL, 'OPEN', '2026-02-18 00:00:00+01', '2026-02-20 09:00:00+01', 296.00, 56.24, 352.24, 30, '2026-03-20 00:00:00+01', 'Kabelreste Nachlieferung Dez 2025', NOW(), NOW(), '00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- Payments: Stahl-Union invoice paid with Skonto
INSERT INTO wh_supplier_payments (id, tenant_id, invoice_id, date, amount, type, is_discount, notes, status, created_at, created_by_id)
VALUES
  ('da000000-0000-4000-a000-000000000001', '10000000-0000-0000-0000-000000000001', 'd9000000-0000-4000-a000-000000000001', '2026-02-03 00:00:00+01', 822.17, 'BANK', false, 'Ueberweisung Stahl-Union RE-2026-00412 abzgl. 2% Skonto', 'ACTIVE', '2026-02-03 10:00:00+01', '00000000-0000-0000-0000-000000000001'),
  ('da000000-0000-4000-a000-000000000002', '10000000-0000-0000-0000-000000000001', 'd9000000-0000-4000-a000-000000000001', '2026-02-03 00:00:00+01', 16.78, 'BANK', true, 'Skonto 2% auf 838.95', 'ACTIVE', '2026-02-03 10:00:00+01', '00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- Payments: Hoffmann invoice paid with tier-1 Skonto (3%)
INSERT INTO wh_supplier_payments (id, tenant_id, invoice_id, date, amount, type, is_discount, notes, status, created_at, created_by_id)
VALUES
  ('da000000-0000-4000-a000-000000000003', '10000000-0000-0000-0000-000000000001', 'd9000000-0000-4000-a000-000000000002', '2026-01-21 00:00:00+01', 533.87, 'BANK', false, 'Ueberweisung Hoffmann HW-R-2026-0087 abzgl. 3% Skonto', 'ACTIVE', '2026-01-21 10:00:00+01', '00000000-0000-0000-0000-000000000001'),
  ('da000000-0000-4000-a000-000000000004', '10000000-0000-0000-0000-000000000001', 'd9000000-0000-4000-a000-000000000002', '2026-01-21 00:00:00+01', 16.51, 'BANK', true, 'Skonto 3% auf 550.38', 'ACTIVE', '2026-01-21 10:00:00+01', '00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- =============================================================
-- 31. HR Personnel File: Entries + Attachments
-- =============================================================

-- Look up category IDs (auto-generated, so we use a DO block)
DO $$
DECLARE
  t_id     uuid := '10000000-0000-0000-0000-000000000001';
  cat_contracts uuid;
  cat_certs     uuid;
  cat_safety    uuid;
  cat_warnings  uuid;
  cat_training  uuid;
  cat_medical   uuid;

  -- Employee IDs
  emp_admin   uuid := '00000000-0000-0000-0000-000000000011'; -- Admin User
  emp_user    uuid := '00000000-0000-0000-0000-000000000012'; -- Regular User
  emp_maria   uuid := '00000000-0000-0000-0000-000000000013'; -- Maria Schmidt
  emp_thomas  uuid := '00000000-0000-0000-0000-000000000014'; -- Thomas Mueller
  emp_anna    uuid := '00000000-0000-0000-0000-000000000015'; -- Anna Weber
  emp_sabine  uuid := '00000000-0000-0000-0000-000000000016'; -- Sabine Fischer
  emp_markus  uuid := '00000000-0000-0000-0000-000000000017'; -- Markus Braun
  emp_julia   uuid := '00000000-0000-0000-0000-000000000018'; -- Julia Hoffmann
  emp_klaus   uuid := '00000000-0000-0000-0000-00000000001b'; -- Klaus Weber
  emp_andrea  uuid := '00000000-0000-0000-0000-00000000001c'; -- Andrea Mueller

  -- Entry IDs (deterministic for idempotency)
  e1  uuid := 'e1000000-0000-4000-a000-000000000001';
  e2  uuid := 'e1000000-0000-4000-a000-000000000002';
  e3  uuid := 'e1000000-0000-4000-a000-000000000003';
  e4  uuid := 'e1000000-0000-4000-a000-000000000004';
  e5  uuid := 'e1000000-0000-4000-a000-000000000005';
  e6  uuid := 'e1000000-0000-4000-a000-000000000006';
  e7  uuid := 'e1000000-0000-4000-a000-000000000007';
  e8  uuid := 'e1000000-0000-4000-a000-000000000008';
  e9  uuid := 'e1000000-0000-4000-a000-000000000009';
  e10 uuid := 'e1000000-0000-4000-a000-000000000010';
  e11 uuid := 'e1000000-0000-4000-a000-000000000011';
  e12 uuid := 'e1000000-0000-4000-a000-000000000012';
  e13 uuid := 'e1000000-0000-4000-a000-000000000013';
  e14 uuid := 'e1000000-0000-4000-a000-000000000014';
  e15 uuid := 'e1000000-0000-4000-a000-000000000015';
  e16 uuid := 'e1000000-0000-4000-a000-000000000016';
  e17 uuid := 'e1000000-0000-4000-a000-000000000017';
  e18 uuid := 'e1000000-0000-4000-a000-000000000018';
  -- Demo entries (2026-04-15 as "today"):
  --   e19-e23 = bereits abgelaufen (red "Abgelaufen"-Badge)
  --   e24-e27 = laeuft in den naechsten 30 Tagen ab (yellow "Laeuft bald ab")
  --   e28     = Reminder faellig innerhalb naechster 14 Tage
  --   e29-e30 = Abmahnungen (WARNINGS Kategorie, bisher leer)
  e19 uuid := 'e1000000-0000-4000-a000-000000000019';
  e20 uuid := 'e1000000-0000-4000-a000-00000000001a';
  e21 uuid := 'e1000000-0000-4000-a000-00000000001b';
  e22 uuid := 'e1000000-0000-4000-a000-00000000001c';
  e23 uuid := 'e1000000-0000-4000-a000-00000000001d';
  e24 uuid := 'e1000000-0000-4000-a000-00000000001e';
  e25 uuid := 'e1000000-0000-4000-a000-00000000001f';
  e26 uuid := 'e1000000-0000-4000-a000-000000000020';
  e27 uuid := 'e1000000-0000-4000-a000-000000000021';
  e28 uuid := 'e1000000-0000-4000-a000-000000000022';
  e29 uuid := 'e1000000-0000-4000-a000-000000000023';
  e30 uuid := 'e1000000-0000-4000-a000-000000000024';

  -- Attachment IDs
  a1  uuid := 'e2000000-0000-4000-a000-000000000001';
  a2  uuid := 'e2000000-0000-4000-a000-000000000002';
  a3  uuid := 'e2000000-0000-4000-a000-000000000003';
  a4  uuid := 'e2000000-0000-4000-a000-000000000004';
  a5  uuid := 'e2000000-0000-4000-a000-000000000005';
  a6  uuid := 'e2000000-0000-4000-a000-000000000006';
  a7  uuid := 'e2000000-0000-4000-a000-000000000007';
  a8  uuid := 'e2000000-0000-4000-a000-000000000008';
  a9  uuid := 'e2000000-0000-4000-a000-000000000009';
  a10 uuid := 'e2000000-0000-4000-a000-000000000010';
  a11 uuid := 'e2000000-0000-4000-a000-000000000011';
  a12 uuid := 'e2000000-0000-4000-a000-000000000012';
  a13 uuid := 'e2000000-0000-4000-a000-000000000013';
  a14 uuid := 'e2000000-0000-4000-a000-000000000014';
  a15 uuid := 'e2000000-0000-4000-a000-000000000015';
  a16 uuid := 'e2000000-0000-4000-a000-000000000016';

BEGIN
  SELECT id INTO cat_contracts FROM hr_personnel_file_categories WHERE tenant_id = t_id AND code = 'CONTRACTS';
  SELECT id INTO cat_certs     FROM hr_personnel_file_categories WHERE tenant_id = t_id AND code = 'CERTS';
  SELECT id INTO cat_safety    FROM hr_personnel_file_categories WHERE tenant_id = t_id AND code = 'SAFETY';
  SELECT id INTO cat_warnings  FROM hr_personnel_file_categories WHERE tenant_id = t_id AND code = 'WARNINGS';
  SELECT id INTO cat_training  FROM hr_personnel_file_categories WHERE tenant_id = t_id AND code = 'TRAINING';
  SELECT id INTO cat_medical   FROM hr_personnel_file_categories WHERE tenant_id = t_id AND code = 'MEDICAL';

  -- =========================================================
  -- Personnel file entries
  -- =========================================================

  -- Contracts (Vertraege)
  INSERT INTO hr_personnel_file_entries (id, tenant_id, employee_id, category_id, title, description, entry_date, is_confidential, created_by_id, created_at, updated_at)
  VALUES
    (e1,  t_id, emp_admin,  cat_contracts, 'Arbeitsvertrag unbefristet', 'Urspruenglicher Arbeitsvertrag seit Eintritt', '2020-01-01', true, '00000000-0000-0000-0000-000000000001', NOW(), NOW()),
    (e2,  t_id, emp_user,   cat_contracts, 'Arbeitsvertrag unbefristet', 'Arbeitsvertrag ab Eintritt', '2021-03-15', true, '00000000-0000-0000-0000-000000000001', NOW(), NOW()),
    (e3,  t_id, emp_maria,  cat_contracts, 'Arbeitsvertrag Teilzeit', 'Teilzeitvertrag 20h/Woche', '2022-06-01', true, '00000000-0000-0000-0000-000000000001', NOW(), NOW()),
    (e4,  t_id, emp_thomas, cat_contracts, 'Arbeitsvertrag Probezeit', 'Befristeter Vertrag, Probezeit 6 Monate', '2024-01-15', true, '00000000-0000-0000-0000-000000000001', NOW(), NOW()),
    (e5,  t_id, emp_thomas, cat_contracts, 'Vertrag Entfristung', 'Uebernahme in unbefristetes Verhaeltnis nach Probezeit', '2024-07-15', true, '00000000-0000-0000-0000-000000000001', NOW(), NOW()),
    (e6,  t_id, emp_klaus,  cat_contracts, 'Arbeitsvertrag unbefristet', 'Arbeitsvertrag Produktion', '2023-04-01', true, '00000000-0000-0000-0000-000000000001', NOW(), NOW()),
    (e7,  t_id, emp_andrea, cat_contracts, 'Arbeitsvertrag unbefristet', 'Arbeitsvertrag Produktion', '2022-09-01', true, '00000000-0000-0000-0000-000000000001', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Certificates & Qualifications (Zertifikate)
  INSERT INTO hr_personnel_file_entries (id, tenant_id, employee_id, category_id, title, description, entry_date, expires_at, reminder_date, reminder_note, is_confidential, created_by_id, created_at, updated_at)
  VALUES
    (e8,  t_id, emp_anna,   cat_certs, 'Staplerschein', 'Gabelstaplerführerschein nach DGUV G 308-001', '2018-05-20', '2028-05-20', '2028-02-20', 'Staplerschein Anna Weber verlaengern', false, '00000000-0000-0000-0000-000000000001', NOW(), NOW()),
    (e9,  t_id, emp_markus, cat_certs, 'Schweisserschein EN ISO 9606-1', 'WIG-Schweissen Stahl, Pruefung bestanden', '2025-03-10', '2027-03-10', '2027-01-10', 'Schweisserpruefung Markus erneuern', false, '00000000-0000-0000-0000-000000000001', NOW(), NOW()),
    (e10, t_id, emp_klaus,  cat_certs, 'Ersthelfer-Ausbildung', 'Betrieblicher Ersthelfer gemaess DGUV Vorschrift 1', '2025-11-15', '2027-11-15', '2027-09-15', 'Ersthelfer-Auffrischung Klaus', false, '00000000-0000-0000-0000-000000000001', NOW(), NOW()),
    (e11, t_id, emp_andrea, cat_certs, 'Kranfuehrerschein', 'Befaehigungsnachweis Brueckenkran bis 10t', '2023-01-20', '2028-01-20', '2027-10-20', 'Kranschein Andrea pruefen', false, '00000000-0000-0000-0000-000000000001', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Safety trainings (Unterweisungen)
  INSERT INTO hr_personnel_file_entries (id, tenant_id, employee_id, category_id, title, description, entry_date, expires_at, reminder_date, is_confidential, created_by_id, created_at, updated_at)
  VALUES
    (e12, t_id, emp_klaus,  cat_safety, 'Sicherheitsunterweisung 2026', 'Jaehrliche Unterweisung Arbeitssicherheit Produktion', '2026-01-15', '2027-01-15', '2026-12-15', false, '00000000-0000-0000-0000-000000000001', NOW(), NOW()),
    (e13, t_id, emp_andrea, cat_safety, 'Sicherheitsunterweisung 2026', 'Jaehrliche Unterweisung Arbeitssicherheit Produktion', '2026-01-15', '2027-01-15', '2026-12-15', false, '00000000-0000-0000-0000-000000000001', NOW(), NOW()),
    (e14, t_id, emp_markus, cat_safety, 'Brandschutzunterweisung 2025', 'Brandschutzhelfer-Schulung gemaess ASR A2.2', '2025-10-08', '2026-10-08', '2026-08-08', false, '00000000-0000-0000-0000-000000000001', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Training (Weiterbildung)
  INSERT INTO hr_personnel_file_entries (id, tenant_id, employee_id, category_id, title, description, entry_date, is_confidential, created_by_id, created_at, updated_at)
  VALUES
    (e15, t_id, emp_sabine, cat_training, 'Excel Advanced Kurs', 'Zweitaegiger Excel-Kurs fuer Fortgeschrittene, IHK Muenchen', '2025-09-22', false, '00000000-0000-0000-0000-000000000001', NOW(), NOW()),
    (e16, t_id, emp_julia,  cat_training, 'Projektmanagement-Zertifikat', 'IPMA Level D Zertifizierung', '2025-06-15', false, '00000000-0000-0000-0000-000000000001', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Medical (Arbeitsmedizin)
  INSERT INTO hr_personnel_file_entries (id, tenant_id, employee_id, category_id, title, description, entry_date, expires_at, reminder_date, reminder_note, is_confidential, created_by_id, created_at, updated_at)
  VALUES
    (e17, t_id, emp_klaus,  cat_medical, 'G25 Untersuchung', 'Eignungsuntersuchung Fahr-, Steuer- und Ueberwachungstaetigkeiten', '2025-06-10', '2028-06-10', '2028-03-10', 'G25 Klaus Weber faellig', true, '00000000-0000-0000-0000-000000000001', NOW(), NOW()),
    (e18, t_id, emp_andrea, cat_medical, 'G20 Untersuchung', 'Vorsorge Laerm gemaess ArbMedVV', '2025-09-05', '2028-09-05', '2028-06-05', 'G20 Andrea Mueller faellig', true, '00000000-0000-0000-0000-000000000001', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- =========================================================
  -- Personnel file attachments (simulated file references)
  -- =========================================================

  INSERT INTO hr_personnel_file_attachments (id, entry_id, tenant_id, filename, storage_path, mime_type, size_bytes, created_by_id, created_at)
  VALUES
    -- Contracts
    (a1,  e1,  t_id, 'Arbeitsvertrag_AdminUser_2020.pdf',      'hr/personnel/' || emp_admin  || '/contracts/Arbeitsvertrag_AdminUser_2020.pdf',      'application/pdf', 245760,  '00000000-0000-0000-0000-000000000001', NOW()),
    (a2,  e2,  t_id, 'Arbeitsvertrag_RegularUser_2021.pdf',    'hr/personnel/' || emp_user   || '/contracts/Arbeitsvertrag_RegularUser_2021.pdf',    'application/pdf', 198400,  '00000000-0000-0000-0000-000000000001', NOW()),
    (a3,  e3,  t_id, 'Teilzeitvertrag_Schmidt_2022.pdf',       'hr/personnel/' || emp_maria  || '/contracts/Teilzeitvertrag_Schmidt_2022.pdf',       'application/pdf', 215040,  '00000000-0000-0000-0000-000000000001', NOW()),
    (a4,  e4,  t_id, 'Arbeitsvertrag_Mueller_Probezeit.pdf',   'hr/personnel/' || emp_thomas || '/contracts/Arbeitsvertrag_Mueller_Probezeit.pdf',   'application/pdf', 230400,  '00000000-0000-0000-0000-000000000001', NOW()),
    (a5,  e5,  t_id, 'Entfristung_Mueller_2024.pdf',           'hr/personnel/' || emp_thomas || '/contracts/Entfristung_Mueller_2024.pdf',           'application/pdf', 102400,  '00000000-0000-0000-0000-000000000001', NOW()),
    (a6,  e6,  t_id, 'Arbeitsvertrag_KlausWeber_2023.pdf',     'hr/personnel/' || emp_klaus  || '/contracts/Arbeitsvertrag_KlausWeber_2023.pdf',     'application/pdf', 241664,  '00000000-0000-0000-0000-000000000001', NOW()),
    (a7,  e7,  t_id, 'Arbeitsvertrag_AndreaMueller_2022.pdf',  'hr/personnel/' || emp_andrea || '/contracts/Arbeitsvertrag_AndreaMueller_2022.pdf',  'application/pdf', 235520,  '00000000-0000-0000-0000-000000000001', NOW()),

    -- Certificates
    (a8,  e8,  t_id, 'Staplerschein_Weber_2018.pdf',           'hr/personnel/' || emp_anna   || '/certs/Staplerschein_Weber_2018.pdf',               'application/pdf', 524288,  '00000000-0000-0000-0000-000000000001', NOW()),
    (a9,  e9,  t_id, 'Schweisserschein_Braun_2025.pdf',        'hr/personnel/' || emp_markus || '/certs/Schweisserschein_Braun_2025.pdf',            'application/pdf', 614400,  '00000000-0000-0000-0000-000000000001', NOW()),
    (a10, e10, t_id, 'Ersthelfer_KlausWeber_2025.pdf',         'hr/personnel/' || emp_klaus  || '/certs/Ersthelfer_KlausWeber_2025.pdf',             'application/pdf', 389120,  '00000000-0000-0000-0000-000000000001', NOW()),
    (a11, e11, t_id, 'Kranschein_AndreaMueller_2023.pdf',      'hr/personnel/' || emp_andrea || '/certs/Kranschein_AndreaMueller_2023.pdf',          'application/pdf', 450560,  '00000000-0000-0000-0000-000000000001', NOW()),

    -- Safety
    (a12, e12, t_id, 'Unterweisung_KlausWeber_2026.pdf',       'hr/personnel/' || emp_klaus  || '/safety/Unterweisung_KlausWeber_2026.pdf',         'application/pdf', 156672,  '00000000-0000-0000-0000-000000000001', NOW()),
    (a13, e13, t_id, 'Unterweisung_AndreaMueller_2026.pdf',    'hr/personnel/' || emp_andrea || '/safety/Unterweisung_AndreaMueller_2026.pdf',      'application/pdf', 156672,  '00000000-0000-0000-0000-000000000001', NOW()),

    -- Training
    (a14, e15, t_id, 'Excel_Zertifikat_Fischer_2025.pdf',      'hr/personnel/' || emp_sabine || '/training/Excel_Zertifikat_Fischer_2025.pdf',      'application/pdf', 184320,  '00000000-0000-0000-0000-000000000001', NOW()),
    (a15, e16, t_id, 'IPMA_LevelD_Hoffmann_2025.pdf',          'hr/personnel/' || emp_julia  || '/training/IPMA_LevelD_Hoffmann_2025.pdf',          'application/pdf', 409600,  '00000000-0000-0000-0000-000000000001', NOW()),

    -- Medical
    (a16, e17, t_id, 'G25_KlausWeber_2025.pdf',                'hr/personnel/' || emp_klaus  || '/medical/G25_KlausWeber_2025.pdf',                 'application/pdf', 98304,   '00000000-0000-0000-0000-000000000001', NOW())
  ON CONFLICT (id) DO NOTHING;

  -- =========================================================
  -- DEMO: Ablaufende / abgelaufene Eintraege (Stichtag 2026-04-15)
  -- Zeigt in der HR-Ansicht rote "Abgelaufen"- und gelbe
  -- "Laeuft bald ab"-Badges sowie faellige Reminders.
  -- =========================================================

  -- Bereits abgelaufen (expires_at < 2026-04-15)
  INSERT INTO hr_personnel_file_entries (id, tenant_id, employee_id, category_id, title, description, entry_date, expires_at, reminder_date, reminder_note, is_confidential, created_by_id, created_at, updated_at)
  VALUES
    (e19, t_id, emp_markus, cat_certs,  'Schweisserschein EN ISO 9606-1 (alt)',  'Vorherige Schweisserpruefung, abgelaufen — muss erneuert werden', '2023-01-05', '2025-12-31', '2025-11-01', 'ABGELAUFEN: Markus dringend zur Wiederholungspruefung anmelden', false, '00000000-0000-0000-0000-000000000001', NOW(), NOW()),
    (e20, t_id, emp_maria,  cat_certs,  'Ersthelfer-Ausbildung',                 'Erste-Hilfe-Grundkurs nach DGUV Vorschrift 1',                    '2023-02-15', '2026-02-15', '2025-12-15', 'ABGELAUFEN: Auffrischung Maria Schmidt faellig',                     false, '00000000-0000-0000-0000-000000000001', NOW(), NOW()),
    (e21, t_id, emp_thomas, cat_safety, 'Sicherheitsunterweisung 2025',          'Jaehrliche Unterweisung — neue Unterweisung fuer 2026 faellig',   '2025-03-20', '2026-03-31', '2026-03-01', 'ABGELAUFEN: Unterweisung Thomas Mueller neu ansetzen',               false, '00000000-0000-0000-0000-000000000001', NOW(), NOW()),
    (e22, t_id, emp_anna,   cat_safety, 'Brandschutzunterweisung 2025',          'Brandschutzhelfer-Schulung ASR A2.2 — abgelaufen',                '2024-12-10', '2026-01-10', '2025-11-10', 'ABGELAUFEN: Brandschutzunterweisung Anna Weber nachholen',           false, '00000000-0000-0000-0000-000000000001', NOW(), NOW()),
    (e23, t_id, emp_klaus,  cat_medical,'G37 Bildschirmarbeit',                  'Eignungsuntersuchung G37 fuer Bildschirmarbeit — Nachuntersuchung faellig', '2023-04-10', '2026-04-10', '2026-02-10', 'ABGELAUFEN: G37 Klaus Weber neu veranlassen',                        true,  '00000000-0000-0000-0000-000000000001', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Laeuft in den naechsten 30 Tagen ab (2026-04-15 .. 2026-05-15)
  INSERT INTO hr_personnel_file_entries (id, tenant_id, employee_id, category_id, title, description, entry_date, expires_at, reminder_date, reminder_note, is_confidential, created_by_id, created_at, updated_at)
  VALUES
    (e24, t_id, emp_julia,  cat_safety, 'Datenschutzunterweisung 2025',          'DSGVO-Unterweisung gemaess Art. 32 DSGVO',                        '2025-04-22', '2026-04-22', '2026-04-20', 'Datenschutzunterweisung Julia Hoffmann verlaengern',                  false, '00000000-0000-0000-0000-000000000001', NOW(), NOW()),
    (e25, t_id, emp_sabine, cat_certs,  'Ersthelfer-Ausbildung',                 'Erste-Hilfe-Grundkurs nach DGUV Vorschrift 1',                    '2024-05-10', '2026-05-10', '2026-04-25', 'Ersthelfer Sabine Fischer auffrischen',                               false, '00000000-0000-0000-0000-000000000001', NOW(), NOW()),
    (e26, t_id, emp_admin,  cat_medical,'G37 Bildschirmarbeit',                  'Eignungsuntersuchung G37 Bildschirmarbeit',                       '2023-04-28', '2026-04-28', '2026-04-18', 'G37 Admin User faellig — Termin vereinbaren',                         true,  '00000000-0000-0000-0000-000000000001', NOW(), NOW()),
    (e27, t_id, emp_andrea, cat_safety, 'Sicherheitsunterweisung Produktion 2025','Jaehrliche Unterweisung Arbeitssicherheit Produktion',           '2025-05-12', '2026-05-12', '2026-04-28', 'Sicherheitsunterweisung Andrea Mueller verlaengern',                  false, '00000000-0000-0000-0000-000000000001', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Zusaetzlicher Eintrag mit Reminder innerhalb 14 Tage (faellig, expires_at spaeter)
  INSERT INTO hr_personnel_file_entries (id, tenant_id, employee_id, category_id, title, description, entry_date, expires_at, reminder_date, reminder_note, is_confidential, created_by_id, created_at, updated_at)
  VALUES
    (e28, t_id, emp_thomas, cat_certs,  'Gabelstaplerschein',                    'Gabelstaplerfuehrerschein nach DGUV G 308-001',                   '2024-07-01', '2029-07-01', '2026-04-25', 'Stichprobenkontrolle Staplerschein Thomas Mueller',                   false, '00000000-0000-0000-0000-000000000001', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Abmahnungen (bisher keine Eintraege in WARNINGS-Kategorie)
  INSERT INTO hr_personnel_file_entries (id, tenant_id, employee_id, category_id, title, description, entry_date, is_confidential, created_by_id, created_at, updated_at)
  VALUES
    (e29, t_id, emp_markus, cat_warnings, 'Abmahnung — Verspaetung',              'Wiederholte unentschuldigte Verspaetung (14./18.02.2026)',         '2026-02-20', true, '00000000-0000-0000-0000-000000000001', NOW(), NOW()),
    (e30, t_id, emp_user,   cat_warnings, 'Ermahnung — Arbeitsschutzverstoss',    'Nichttragen der PSA im Produktionsbereich am 05.03.2026',          '2026-03-06', true, '00000000-0000-0000-0000-000000000001', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 32. Inbound Invoices (Eingangsrechnungen) — Seed Data
-- ═══════════════════════════════════════════════════════════════════════════

-- Enable inbound_invoices module
INSERT INTO tenant_modules (tenant_id, module, enabled_at)
VALUES ('10000000-0000-0000-0000-000000000001', 'inbound_invoices', NOW())
ON CONFLICT DO NOTHING;

-- Number sequence for inbound invoices
INSERT INTO number_sequences (tenant_id, key, prefix, next_value)
VALUES ('10000000-0000-0000-0000-000000000001', 'inbound_invoice', 'ER-', 7)
ON CONFLICT (tenant_id, key) DO UPDATE SET next_value = GREATEST(number_sequences.next_value, 7);

-- IMAP config (GreenMail for local dev — adjust for staging)
INSERT INTO tenant_imap_configs (id, tenant_id, host, port, username, password, encryption, mailbox, is_verified, is_active)
VALUES (
  'd1000000-0000-4000-a000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '127.0.0.1', 3143, 'test', 'test', 'NONE', 'INBOX', true, true
) ON CONFLICT (tenant_id) DO NOTHING;

-- Approval policy: Dev User approves invoices > 500 EUR
INSERT INTO inbound_invoice_approval_policies (id, tenant_id, amount_min, amount_max, step_order, approver_user_id, is_active)
VALUES
  ('d2000000-0000-4000-a000-000000000001', '10000000-0000-0000-0000-000000000001', 500, NULL, 1, '00000000-0000-0000-0000-000000000002', true)
ON CONFLICT (id) DO NOTHING;

-- Inbound invoices in various statuses
INSERT INTO inbound_invoices (
  id, tenant_id, number, source, supplier_id, supplier_status,
  invoice_number, invoice_date, due_date,
  total_net, total_vat, total_gross, currency, payment_term_days,
  seller_name, seller_vat_id,
  status, created_by, submitted_by, submitted_at,
  datev_exported_at, datev_exported_by,
  created_at, updated_at
) VALUES
  -- ER-1: DRAFT — Stahl-Union, manual upload
  ('d3000000-0000-4000-a000-000000000001', '10000000-0000-0000-0000-000000000001',
   'ER-1', 'manual', 'c1000000-0000-4000-a000-000000000011', 'matched',
   'SU-2026-0442', '2026-03-15', '2026-04-14',
   1250.00, 237.50, 1487.50, 'EUR', 30,
   'Stahl-Union Lieferwerk GmbH', 'DE811234567',
   'DRAFT', '00000000-0000-0000-0000-000000000001', NULL, NULL, NULL, NULL,
   NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days'),

  -- ER-2: PENDING_APPROVAL — Kunststoff Meier, ZUGFeRD
  ('d3000000-0000-4000-a000-000000000002', '10000000-0000-0000-0000-000000000001',
   'ER-2', 'zugferd', 'c1000000-0000-4000-a000-000000000012', 'matched',
   'KM-R-2026-089', '2026-03-20', '2026-04-19',
   850.00, 161.50, 1011.50, 'EUR', 30,
   'Kunststoff Meier OHG', 'DE912345678',
   'PENDING_APPROVAL', '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000001', NOW() - INTERVAL '1 day', NULL, NULL,
   NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day'),

  -- ER-3: APPROVED — Elektro-Braun, ready for DATEV export
  ('d3000000-0000-4000-a000-000000000003', '10000000-0000-0000-0000-000000000001',
   'ER-3', 'zugferd', 'c1000000-0000-4000-a000-000000000013', 'matched',
   'EB-2026-1133', '2026-03-10', '2026-04-09',
   420.00, 79.80, 499.80, 'EUR', 30,
   'Elektro-Großhandel Braun KG', 'DE813456789',
   'APPROVED', '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000001', NOW() - INTERVAL '5 days', NULL, NULL,
   NOW() - INTERVAL '7 days', NOW() - INTERVAL '3 days'),

  -- ER-4: EXPORTED — Stahl-Union, already sent to DATEV
  ('d3000000-0000-4000-a000-000000000004', '10000000-0000-0000-0000-000000000001',
   'ER-4', 'imap', 'c1000000-0000-4000-a000-000000000011', 'matched',
   'SU-2026-0398', '2026-02-28', '2026-03-30',
   2100.00, 399.00, 2499.00, 'EUR', 30,
   'Stahl-Union Lieferwerk GmbH', 'DE811234567',
   'EXPORTED', '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000001', NOW() - INTERVAL '14 days',
   NOW() - INTERVAL '7 days', '00000000-0000-0000-0000-000000000001',
   NOW() - INTERVAL '14 days', NOW() - INTERVAL '7 days'),

  -- ER-5: REJECTED — Kunststoff Meier
  ('d3000000-0000-4000-a000-000000000005', '10000000-0000-0000-0000-000000000001',
   'ER-5', 'manual', 'c1000000-0000-4000-a000-000000000012', 'matched',
   'KM-R-2026-077', '2026-03-05', '2026-04-04',
   375.00, 71.25, 446.25, 'EUR', 30,
   'Kunststoff Meier OHG', 'DE912345678',
   'REJECTED', '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000001', NOW() - INTERVAL '10 days', NULL, NULL,
   NOW() - INTERVAL '12 days', NOW() - INTERVAL '8 days'),

  -- ER-6: DRAFT — unknown supplier, needs assignment
  ('d3000000-0000-4000-a000-000000000006', '10000000-0000-0000-0000-000000000001',
   'ER-6', 'imap', NULL, 'unknown',
   'INV-2026-XY', '2026-04-01', '2026-05-01',
   180.00, 34.20, 214.20, 'EUR', 30,
   'Neue Lieferfirma GmbH', NULL,
   'DRAFT', '00000000-0000-0000-0000-000000000001', NULL, NULL, NULL, NULL,
   NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day')
ON CONFLICT (id) DO NOTHING;

-- Line items for ER-2 (ZUGFeRD)
INSERT INTO inbound_invoice_line_items (id, invoice_id, position, description, quantity, unit, unit_price_net, total_net, vat_rate, vat_amount, sort_order)
VALUES
  ('d4000000-0000-4000-a000-000000000001', 'd3000000-0000-4000-a000-000000000002', 1, 'PE-Granulat 500kg', 500, 'kg', 1.20, 600.00, 19, 114.00, 1),
  ('d4000000-0000-4000-a000-000000000002', 'd3000000-0000-4000-a000-000000000002', 2, 'PP-Folie 200m Rolle', 4, 'Stk', 62.50, 250.00, 19, 47.50, 2)
ON CONFLICT (id) DO NOTHING;

-- Line items for ER-3
INSERT INTO inbound_invoice_line_items (id, invoice_id, position, description, quantity, unit, unit_price_net, total_net, vat_rate, vat_amount, sort_order)
VALUES
  ('d4000000-0000-4000-a000-000000000003', 'd3000000-0000-4000-a000-000000000003', 1, 'Kabelkanal 2m (10 Stk)', 10, 'Stk', 12.00, 120.00, 19, 22.80, 1),
  ('d4000000-0000-4000-a000-000000000004', 'd3000000-0000-4000-a000-000000000003', 2, 'Sicherungsautomat B16', 20, 'Stk', 8.50, 170.00, 19, 32.30, 2),
  ('d4000000-0000-4000-a000-000000000005', 'd3000000-0000-4000-a000-000000000003', 3, 'Leitungsschutzschalter 3-polig', 5, 'Stk', 26.00, 130.00, 19, 24.70, 3)
ON CONFLICT (id) DO NOTHING;

-- Approval step for ER-2 (pending — Dev User must approve)
INSERT INTO inbound_invoice_approvals (id, invoice_id, tenant_id, step_order, approval_version, approver_user_id, status, due_at)
VALUES (
  'd5000000-0000-4000-a000-000000000001',
  'd3000000-0000-4000-a000-000000000002',
  '10000000-0000-0000-0000-000000000001',
  1, 1, '00000000-0000-0000-0000-000000000002', 'PENDING',
  NOW() + INTERVAL '23 hours'
) ON CONFLICT (id) DO NOTHING;

-- Approval step for ER-3 (approved by Dev User)
INSERT INTO inbound_invoice_approvals (id, invoice_id, tenant_id, step_order, approval_version, approver_user_id, status, decided_by, decided_at)
VALUES (
  'd5000000-0000-4000-a000-000000000002',
  'd3000000-0000-4000-a000-000000000003',
  '10000000-0000-0000-0000-000000000001',
  1, 1, '00000000-0000-0000-0000-000000000002', 'APPROVED',
  '00000000-0000-0000-0000-000000000002', NOW() - INTERVAL '3 days'
) ON CONFLICT (id) DO NOTHING;

-- Approval step for ER-5 (rejected by Dev User)
INSERT INTO inbound_invoice_approvals (id, invoice_id, tenant_id, step_order, approval_version, approver_user_id, status, decided_by, decided_at, rejection_reason)
VALUES (
  'd5000000-0000-4000-a000-000000000003',
  'd3000000-0000-4000-a000-000000000005',
  '10000000-0000-0000-0000-000000000001',
  1, 1, '00000000-0000-0000-0000-000000000002', 'REJECTED',
  '00000000-0000-0000-0000-000000000002', NOW() - INTERVAL '8 days',
  'Rechnungsbetrag weicht von Bestellung ab — bitte prüfen'
) ON CONFLICT (id) DO NOTHING;

-- Email log entries
INSERT INTO inbound_email_log (id, tenant_id, message_id, from_email, subject, status, attachment_count, invoice_id, processed_at)
VALUES
  ('d6000000-0000-4000-a000-000000000001', '10000000-0000-0000-0000-000000000001',
   '<inv-442@stahl-union.de>', 'einkauf@stahl-union.de', 'Rechnung SU-2026-0398',
   'processed', 1, 'd3000000-0000-4000-a000-000000000004', NOW() - INTERVAL '14 days'),
  ('d6000000-0000-4000-a000-000000000002', '10000000-0000-0000-0000-000000000001',
   '<newsletter@spam.com>', 'newsletter@spam.com', 'Weekly Deals!',
   'skipped_no_pdf', 0, NULL, NOW() - INTERVAL '10 days'),
  ('d6000000-0000-4000-a000-000000000003', '10000000-0000-0000-0000-000000000001',
   '<inv-xy@neue-firma.de>', 'rechnung@neue-firma.de', 'Rechnung INV-2026-XY',
   'processed', 1, 'd3000000-0000-4000-a000-000000000006', NOW() - INTERVAL '1 day'),
  ('d6000000-0000-4000-a000-000000000004', '10000000-0000-0000-0000-000000000001',
   '<broken@example.com>', 'admin@example.com', 'Corrupted attachment',
   'failed', 1, NULL, NOW() - INTERVAL '5 days')
ON CONFLICT (id) DO NOTHING;

-- =============================================================
-- Payroll Master Data: Lookup Tables
-- =============================================================

-- Personengruppenschlüssel (DEÜV Anlage 2)
INSERT INTO personnel_group_codes (code, description) VALUES
  ('101', 'Sozialversicherungspflichtig Beschäftigte ohne besondere Merkmale'),
  ('102', 'Auszubildende'),
  ('103', 'Beschäftigte in Altersteilzeit'),
  ('104', 'Hausgewerbetreibende'),
  ('105', 'Praktikanten'),
  ('106', 'Werkstudenten'),
  ('107', 'Behinderte in anerkannten Werkstätten'),
  ('108', 'Bezieher von Vorruhestandsgeld'),
  ('109', 'Geringfügig entlohnte Beschäftigte (Minijob)'),
  ('110', 'Kurzfristig Beschäftigte'),
  ('111', 'Personen in Einrichtungen der Jugendhilfe'),
  ('112', 'Mitarbeitende Familienangehörige in der Landwirtschaft'),
  ('113', 'Nebenerwerbslandwirte'),
  ('114', 'Nebenerwerbslandwirte — saisonal'),
  ('116', 'Ausländische Grenzgänger'),
  ('117', 'Beschäftigte ohne Anspruch auf Krankengeld'),
  ('118', 'Seelotsen'),
  ('119', 'Versicherungsfreie Altersvollrentner und Versorgungsbezieher'),
  ('120', 'Beschäftigte mit Anspruch auf Alters-/Erwerbsminderungsrente'),
  ('190', 'Beschäftigte ohne Zuordnung zu einem anderen PGR')
ON CONFLICT (code) DO NOTHING;

-- Berufsgenossenschaften
INSERT INTO bg_institutions (name, abbreviation) VALUES
  ('Berufsgenossenschaft Rohstoffe und chemische Industrie', 'BG RCI'),
  ('Berufsgenossenschaft Holz und Metall', 'BGHM'),
  ('Berufsgenossenschaft Energie Textil Elektro Medienerzeugnisse', 'BG ETEM'),
  ('Berufsgenossenschaft Nahrungsmittel und Gastgewerbe', 'BGN'),
  ('Berufsgenossenschaft der Bauwirtschaft', 'BG BAU'),
  ('Berufsgenossenschaft Handel und Warenlogistik', 'BGHW'),
  ('Verwaltungs-Berufsgenossenschaft', 'VBG'),
  ('Berufsgenossenschaft Verkehrswirtschaft Post-Logistik Telekommunikation', 'BG Verkehr'),
  ('Berufsgenossenschaft für Gesundheitsdienst und Wohlfahrtspflege', 'BGW')
ON CONFLICT DO NOTHING;

-- Krankenkassen (GKV-Spitzenverband, Stand April 2026)
INSERT INTO health_insurance_providers (name, institution_code) VALUES
  ('AOK Baden-Württemberg', '108018007'),
  ('AOK Bayern', '108310400'),
  ('AOK Bremen/Bremerhaven', '108519529'),
  ('AOK Hessen', '105830524'),
  ('AOK Niedersachsen', '102114819'),
  ('AOK Nordost', '100696024'),
  ('AOK NordWest', '103411401'),
  ('AOK PLUS', '107299005'),
  ('AOK Rheinland/Hamburg', '104212505'),
  ('AOK Rheinland-Pfalz/Saarland', '106613483'),
  ('AOK Sachsen-Anhalt', '101097008'),
  ('BARMER', '104940005'),
  ('Techniker Krankenkasse', '101575519'),
  ('DAK-Gesundheit', '105862407'),
  ('KKH Kaufmännische Krankenkasse', '102111517'),
  ('HEK - Hanseatische Krankenkasse', '101521408'),
  ('hkk Krankenkasse', '102131418'),
  ('IKK Brandenburg und Berlin', '100587401'),
  ('IKK classic', '107202130'),
  ('IKK gesund plus', '101021409'),
  ('IKK Südwest', '106613439'),
  ('BIG direkt gesund', '103515806'),
  ('Audi BKK', '108310104'),
  ('BAHN-BKK', '106313107'),
  ('BKK Achenbach Buschhütten', '105529519'),
  ('BKK Diakonie', '103515816'),
  ('BKK firmus', '102130104'),
  ('BKK Freudenberg', '105529500'),
  ('BKK Gildemeister Seidensticker', '103417706'),
  ('BKK Herkules', '106310134'),
  ('BKK Linde', '108713116'),
  ('BKK Melitta HMR', '103515208'),
  ('BKK Mobil Oil', '102012707'),
  ('BKK Pfalz', '106613483'),
  ('BKK ProVita', '108310188'),
  ('BKK Public', '105913802'),
  ('BKK Rieker Ricosta Weisser', '108712711'),
  ('BKK Scheufelen', '108712711'),
  ('BKK Schwarzwald-Baar-Heuberg', '108712715'),
  ('BKK Technoform', '102012706'),
  ('BKK VBU', '100500621'),
  ('BKK VerbundPlus', '108712719'),
  ('BKK Werra-Meissner', '106310131'),
  ('BKK Wirtschaft & Finanzen', '108310122'),
  ('BKK ZF & Partner', '108814504'),
  ('Bosch BKK', '108714316'),
  ('Continentale BKK', '103515802'),
  ('Daimler BKK', '108714305'),
  ('Debeka BKK', '106613474'),
  ('energie-BKK', '102012707'),
  ('Ernst & Young BKK', '105913815'),
  ('Heimat Krankenkasse', '103413903'),
  ('Mercedes-Benz BKK', '108714318'),
  ('Merck BKK', '106310116'),
  ('mhplus BKK', '108012901'),
  ('Novitas BKK', '104315706'),
  ('Pronova BKK', '104212533'),
  ('R+V BKK', '105913803'),
  ('Salus BKK', '100500618'),
  ('SBK Siemens-Betriebskrankenkasse', '108310149'),
  ('SKD BKK', '108714319'),
  ('Südzucker BKK', '108714313'),
  ('TUI BKK', '102012715'),
  ('Viactiv Krankenkasse', '103515813'),
  ('vivida bkk', '108012902'),
  ('WMF BKK', '108714320'),
  ('Knappschaft', '980000006'),
  ('SVLFG (Landwirtschaftliche Krankenkasse)', '099700001'),
  ('Minijob-Zentrale', '980000009')
ON CONFLICT (institution_code) DO NOTHING;

-- KldB 2010 Tätigkeitsschlüssel (häufigste 5-Steller, repräsentative Auswahl)
INSERT INTO activity_codes_kldb (code, name, category) VALUES
  ('11102', 'Berufe in der Gartenbau — Fachkraft', 'Land-, Forst- und Tierwirtschaft'),
  ('24212', 'Berufe in der Metalloberflächenbehandlung — Fachkraft', 'Rohstoffgewinnung, Produktion und Fertigung'),
  ('24402', 'Berufe in der Metallbearbeitung — Fachkraft', 'Rohstoffgewinnung, Produktion und Fertigung'),
  ('25102', 'Berufe in der Maschinenbau- u. Betriebstechnik — Fachkraft', 'Rohstoffgewinnung, Produktion und Fertigung'),
  ('25212', 'Berufe in der Kraftfahrzeugtechnik — Fachkraft', 'Rohstoffgewinnung, Produktion und Fertigung'),
  ('26112', 'Berufe in der Elektrotechnik — Fachkraft', 'Rohstoffgewinnung, Produktion und Fertigung'),
  ('26212', 'Berufe in der Elektronik — Fachkraft', 'Rohstoffgewinnung, Produktion und Fertigung'),
  ('26302', 'Berufe in der Elektroinstallation — Fachkraft', 'Rohstoffgewinnung, Produktion und Fertigung'),
  ('27102', 'Berufe in der technischen Forschung u. Entwicklung — Fachkraft', 'Rohstoffgewinnung, Produktion und Fertigung'),
  ('28202', 'Berufe in der Textilverarbeitung — Fachkraft', 'Rohstoffgewinnung, Produktion und Fertigung'),
  ('29202', 'Berufe in der Lebensmittelherstellung — Fachkraft', 'Rohstoffgewinnung, Produktion und Fertigung'),
  ('29302', 'Berufe im Fleischerhandwerk — Fachkraft', 'Rohstoffgewinnung, Produktion und Fertigung'),
  ('29402', 'Berufe im Bäckereihandwerk — Fachkraft', 'Rohstoffgewinnung, Produktion und Fertigung'),
  ('31104', 'Berufe in der Bauplanung u. -überwachung — Spezialist', 'Bau, Architektur, Vermessung und Gebäudetechnik'),
  ('32102', 'Berufe im Hochbau — Fachkraft', 'Bau, Architektur, Vermessung und Gebäudetechnik'),
  ('33102', 'Berufe in der Bodenverlegung — Fachkraft', 'Bau, Architektur, Vermessung und Gebäudetechnik'),
  ('34212', 'Berufe in der Gebäudetechnik — Fachkraft', 'Bau, Architektur, Vermessung und Gebäudetechnik'),
  ('34302', 'Berufe in der Klempnerei — Fachkraft', 'Bau, Architektur, Vermessung und Gebäudetechnik'),
  ('41102', 'Berufe in der Mathematik — Fachkraft', 'Naturwissenschaft, Geografie und Informatik'),
  ('43102', 'Berufe in der Informatik — Fachkraft', 'Naturwissenschaft, Geografie und Informatik'),
  ('43114', 'Berufe in der Informatik — Spezialist', 'Naturwissenschaft, Geografie und Informatik'),
  ('43124', 'Berufe in der Softwareentwicklung — Spezialist', 'Naturwissenschaft, Geografie und Informatik'),
  ('43413', 'Berufe in der IT-Systemadministration — Komplexe Spezialistentätigkeiten', 'Naturwissenschaft, Geografie und Informatik'),
  ('51102', 'Berufe im Verkauf — Fachkraft', 'Verkehr, Logistik, Schutz und Sicherheit'),
  ('51312', 'Berufe im Vertrieb — Fachkraft', 'Verkehr, Logistik, Schutz und Sicherheit'),
  ('51402', 'Berufe im Handel — Fachkraft', 'Verkehr, Logistik, Schutz und Sicherheit'),
  ('51622', 'Berufe im Einkauf — Fachkraft', 'Verkehr, Logistik, Schutz und Sicherheit'),
  ('52122', 'Berufskraftfahrer/innen (Güterverkehr) — Fachkraft', 'Verkehr, Logistik, Schutz und Sicherheit'),
  ('53112', 'Berufe in der Lagerwirtschaft — Fachkraft', 'Verkehr, Logistik, Schutz und Sicherheit'),
  ('61104', 'Berufe in der Buchhaltung — Spezialist', 'Kaufmännische Dienstleistungen, Warenhandel, Vertrieb, Hotel und Tourismus'),
  ('61204', 'Berufe im Controlling — Spezialist', 'Kaufmännische Dienstleistungen, Warenhandel, Vertrieb, Hotel und Tourismus'),
  ('61302', 'Berufe in der Personaldienstleistung — Fachkraft', 'Kaufmännische Dienstleistungen, Warenhandel, Vertrieb, Hotel und Tourismus'),
  ('61314', 'Berufe im Personalwesen — Spezialist', 'Kaufmännische Dienstleistungen, Warenhandel, Vertrieb, Hotel und Tourismus'),
  ('62102', 'Kaufmännische Berufe im Einzelhandel — Fachkraft', 'Kaufmännische Dienstleistungen, Warenhandel, Vertrieb, Hotel und Tourismus'),
  ('63302', 'Berufe im Gastronomieservice — Fachkraft', 'Kaufmännische Dienstleistungen, Warenhandel, Vertrieb, Hotel und Tourismus'),
  ('71302', 'Berufe in der Unternehmensorganisation — Fachkraft', 'Unternehmensorganisation, Buchhaltung, Recht und Verwaltung'),
  ('71402', 'Berufe in der Büro- u. Sekretariatsarbeit — Fachkraft', 'Unternehmensorganisation, Buchhaltung, Recht und Verwaltung'),
  ('73104', 'Berufe in Recht u. Verwaltung — Spezialist', 'Unternehmensorganisation, Buchhaltung, Recht und Verwaltung'),
  ('81102', 'Berufe in der Arzt- u. Praxishilfe — Fachkraft', 'Gesundheit, Soziales, Lehre und Erziehung'),
  ('81302', 'Berufe in der Gesundheits- und Krankenpflege — Fachkraft', 'Gesundheit, Soziales, Lehre und Erziehung'),
  ('81312', 'Berufe in der Altenpflege — Fachkraft', 'Gesundheit, Soziales, Lehre und Erziehung'),
  ('82102', 'Berufe in der Erziehung — Fachkraft', 'Gesundheit, Soziales, Lehre und Erziehung'),
  ('83112', 'Berufe in der Sozialarbeit — Fachkraft', 'Gesundheit, Soziales, Lehre und Erziehung'),
  ('84304', 'Berufe im Lehramt — Spezialist', 'Gesundheit, Soziales, Lehre und Erziehung'),
  ('91302', 'Berufe in der Reinigung — Fachkraft', 'Sprach-, Literatur-, Geistes-, Gesellschafts- u. Wirtschaftswiss.'),
  ('94102', 'Berufe im Friseurgewerbe — Fachkraft', 'Werbung, Marketing, kaufm. u. redaktionelle Medienberufe')
ON CONFLICT (code) DO NOTHING;

-- Personalakte-Kategorien (Ergänzung für Lohn-Stammdaten)
INSERT INTO hr_personnel_file_categories (tenant_id, name, code, color, sort_order, visible_to_roles) VALUES
  ('10000000-0000-0000-0000-000000000001', 'Sozialversicherungsausweis', 'SV_AUSWEIS', '#0891B2', 8, ARRAY['admin', 'hr']),
  ('10000000-0000-0000-0000-000000000001', 'Mitgliedsbescheinigung KK', 'KK_BESCHEINIGUNG', '#0D9488', 9, ARRAY['admin', 'hr']),
  ('10000000-0000-0000-0000-000000000001', 'Lohnsteuerbescheinigung Vorjahr', 'LOHNSTEUER_VORJAHR', '#4F46E5', 10, ARRAY['admin', 'hr']),
  ('10000000-0000-0000-0000-000000000001', 'Personalausweis', 'PERSONALAUSWEIS', '#7C3AED', 11, ARRAY['admin', 'hr']),
  ('10000000-0000-0000-0000-000000000001', 'Aufenthaltstitel', 'AUFENTHALT', '#DB2777', 12, ARRAY['admin', 'hr']),
  ('10000000-0000-0000-0000-000000000001', 'Schwerbehindertenausweis', 'SB_AUSWEIS', '#E11D48', 13, ARRAY['admin', 'hr']),
  ('10000000-0000-0000-0000-000000000001', 'Pfändungsbeschluss', 'PFAENDUNG', '#DC2626', 14, ARRAY['admin', 'hr']),
  ('10000000-0000-0000-0000-000000000001', 'bAV-Vertrag', 'BAV_VERTRAG', '#EA580C', 15, ARRAY['admin', 'hr']),
  ('10000000-0000-0000-0000-000000000001', 'Arbeitsvertrag', 'ARBEITSVERTRAG', '#CA8A04', 16, ARRAY['admin', 'hr']),
  ('10000000-0000-0000-0000-000000000001', 'Nachweisgesetz-Dokument', 'NACHWEIS', '#65A30D', 17, ARRAY['admin', 'hr']),
  ('10000000-0000-0000-0000-000000000001', 'A1-Bescheinigung', 'A1_BESCHEINIGUNG', '#059669', 18, ARRAY['admin', 'hr']),
  ('10000000-0000-0000-0000-000000000001', 'BG-Bescheinigung', 'BG_BESCHEINIGUNG', '#2563EB', 19, ARRAY['admin', 'hr']),
  ('10000000-0000-0000-0000-000000000001', 'Elternzeit-Antrag', 'ELTERNZEIT_ANTRAG', '#7C3AED', 20, ARRAY['admin', 'hr']),
  ('10000000-0000-0000-0000-000000000001', 'Mutterschutz-Bescheinigung', 'MUTTERSCHUTZ_BESCHEINIGUNG', '#DB2777', 21, ARRAY['admin', 'hr'])
ON CONFLICT (tenant_id, code) DO NOTHING;

-- =============================================================
-- Personalakte-Beispieleintraege fuer Lohn-Stammdaten-Kategorien
-- (Stichtag 2026-04-15) — fuellt die neuen Kategorien mit einem
-- realistischen Muster, damit die HR-Abteilung die komplette
-- Lohn-Stammdaten-Workflow demonstrieren kann.
-- =============================================================
DO $$
DECLARE
  t_id uuid := '10000000-0000-0000-0000-000000000001';

  -- Kategorien
  cat_sv       uuid;
  cat_kk       uuid;
  cat_lohn     uuid;
  cat_ausweis  uuid;
  cat_aufent   uuid;
  cat_sb       uuid;
  cat_pfaend   uuid;
  cat_bav      uuid;
  cat_arbv     uuid;
  cat_nachweis uuid;
  cat_a1       uuid;
  cat_bg       uuid;
  cat_elternz  uuid;
  cat_muschu   uuid;

  -- Mitarbeiter
  emp_admin  uuid := '00000000-0000-0000-0000-000000000011';
  emp_user   uuid := '00000000-0000-0000-0000-000000000012';
  emp_maria  uuid := '00000000-0000-0000-0000-000000000013';
  emp_thomas uuid := '00000000-0000-0000-0000-000000000014';
  emp_anna   uuid := '00000000-0000-0000-0000-000000000015';
  emp_sabine uuid := '00000000-0000-0000-0000-000000000016';
  emp_markus uuid := '00000000-0000-0000-0000-000000000017';
  emp_julia  uuid := '00000000-0000-0000-0000-000000000018';
  emp_stefan uuid := '00000000-0000-0000-0000-000000000019';
  emp_petra  uuid := '00000000-0000-0000-0000-00000000001a';
  emp_klaus  uuid := '00000000-0000-0000-0000-00000000001b';
  emp_andrea uuid := '00000000-0000-0000-0000-00000000001c';
  emp_mehmet uuid := '00000000-0000-0000-0000-00000000001d';

  -- Entry-IDs (deterministisch)
  e31 uuid := 'e1000000-0000-4000-a000-000000000031';
  e32 uuid := 'e1000000-0000-4000-a000-000000000032';
  e33 uuid := 'e1000000-0000-4000-a000-000000000033';
  e34 uuid := 'e1000000-0000-4000-a000-000000000034';
  e35 uuid := 'e1000000-0000-4000-a000-000000000035';
  e36 uuid := 'e1000000-0000-4000-a000-000000000036';
  e37 uuid := 'e1000000-0000-4000-a000-000000000037';
  e38 uuid := 'e1000000-0000-4000-a000-000000000038';
  e39 uuid := 'e1000000-0000-4000-a000-000000000039';
  e40 uuid := 'e1000000-0000-4000-a000-000000000040';
  e41 uuid := 'e1000000-0000-4000-a000-000000000041';
  e42 uuid := 'e1000000-0000-4000-a000-000000000042';
  e43 uuid := 'e1000000-0000-4000-a000-000000000043';
  e44 uuid := 'e1000000-0000-4000-a000-000000000044';
  e45 uuid := 'e1000000-0000-4000-a000-000000000045';
BEGIN
  SELECT id INTO cat_sv       FROM hr_personnel_file_categories WHERE tenant_id = t_id AND code = 'SV_AUSWEIS';
  SELECT id INTO cat_kk       FROM hr_personnel_file_categories WHERE tenant_id = t_id AND code = 'KK_BESCHEINIGUNG';
  SELECT id INTO cat_lohn     FROM hr_personnel_file_categories WHERE tenant_id = t_id AND code = 'LOHNSTEUER_VORJAHR';
  SELECT id INTO cat_ausweis  FROM hr_personnel_file_categories WHERE tenant_id = t_id AND code = 'PERSONALAUSWEIS';
  SELECT id INTO cat_aufent   FROM hr_personnel_file_categories WHERE tenant_id = t_id AND code = 'AUFENTHALT';
  SELECT id INTO cat_sb       FROM hr_personnel_file_categories WHERE tenant_id = t_id AND code = 'SB_AUSWEIS';
  SELECT id INTO cat_pfaend   FROM hr_personnel_file_categories WHERE tenant_id = t_id AND code = 'PFAENDUNG';
  SELECT id INTO cat_bav      FROM hr_personnel_file_categories WHERE tenant_id = t_id AND code = 'BAV_VERTRAG';
  SELECT id INTO cat_arbv     FROM hr_personnel_file_categories WHERE tenant_id = t_id AND code = 'ARBEITSVERTRAG';
  SELECT id INTO cat_nachweis FROM hr_personnel_file_categories WHERE tenant_id = t_id AND code = 'NACHWEIS';
  SELECT id INTO cat_a1       FROM hr_personnel_file_categories WHERE tenant_id = t_id AND code = 'A1_BESCHEINIGUNG';
  SELECT id INTO cat_bg       FROM hr_personnel_file_categories WHERE tenant_id = t_id AND code = 'BG_BESCHEINIGUNG';
  SELECT id INTO cat_elternz  FROM hr_personnel_file_categories WHERE tenant_id = t_id AND code = 'ELTERNZEIT_ANTRAG';
  SELECT id INTO cat_muschu   FROM hr_personnel_file_categories WHERE tenant_id = t_id AND code = 'MUTTERSCHUTZ_BESCHEINIGUNG';

  -- Eintraege ohne Ablaufdatum
  INSERT INTO hr_personnel_file_entries (id, tenant_id, employee_id, category_id, title, description, entry_date, is_confidential, created_by_id, created_at, updated_at)
  VALUES
    (e31, t_id, emp_admin,  cat_sv,       'Sozialversicherungsausweis',           'SV-Nummer bei Eintritt eingereicht',                                       '2020-01-05', true,  '00000000-0000-0000-0000-000000000001', NOW(), NOW()),
    (e32, t_id, emp_user,   cat_kk,       'Mitgliedsbescheinigung AOK Bayern',    'Bestaetigung der Mitgliedschaft fuer Krankenversicherung',                 '2021-03-18', false, '00000000-0000-0000-0000-000000000001', NOW(), NOW()),
    (e33, t_id, emp_maria,  cat_lohn,     'Lohnsteuerbescheinigung 2025',         'Elektronische Lohnsteuerbescheinigung Vorjahr',                            '2026-02-28', true,  '00000000-0000-0000-0000-000000000001', NOW(), NOW()),
    (e34, t_id, emp_sabine, cat_lohn,     'Lohnsteuerbescheinigung 2025',         'Elektronische Lohnsteuerbescheinigung Vorjahr',                            '2026-02-28', true,  '00000000-0000-0000-0000-000000000001', NOW(), NOW()),
    (e38, t_id, emp_markus, cat_pfaend,   'Pfaendungs- und Ueberweisungsbeschluss','AG Muenchen — Az. 123 M 456/26, monatliche Pfaendung',                     '2026-01-15', true,  '00000000-0000-0000-0000-000000000001', NOW(), NOW()),
    (e39, t_id, emp_anna,   cat_bav,      'bAV-Direktversicherung Allianz',       'Betriebliche Altersvorsorge, Entgeltumwandlung EUR 150/Monat',             '2023-06-01', true,  '00000000-0000-0000-0000-000000000001', NOW(), NOW()),
    (e40, t_id, emp_petra,  cat_arbv,     'Arbeitsvertrag Teilzeit (NachwG-konform)', 'Neuer NachwG-konformer Arbeitsvertrag seit 01.02.2025',                 '2025-02-01', true,  '00000000-0000-0000-0000-000000000001', NOW(), NOW()),
    (e41, t_id, emp_stefan, cat_nachweis, 'Nachweisgesetz-Dokument',              'Wesentliche Arbeitsbedingungen gemaess Nachweisgesetz (NachwG 2022)',      '2024-09-01', true,  '00000000-0000-0000-0000-000000000001', NOW(), NOW()),
    (e43, t_id, emp_andrea, cat_bg,       'BG-Mitgliedsbescheinigung BGHM',       'Mitgliedschaft Berufsgenossenschaft Holz und Metall',                      '2022-09-15', false, '00000000-0000-0000-0000-000000000001', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Eintraege mit Ablaufdatum / Reminder (Personalausweis, Aufenthaltstitel,
  -- SB-Ausweis, A1, Elternzeit, Mutterschutz)
  INSERT INTO hr_personnel_file_entries (id, tenant_id, employee_id, category_id, title, description, entry_date, expires_at, reminder_date, reminder_note, is_confidential, created_by_id, created_at, updated_at)
  VALUES
    (e35, t_id, emp_thomas, cat_ausweis, 'Personalausweis',                        'Kopie Personalausweis, DE-Staatsangehoerigkeit',                          '2024-01-15', '2034-01-15', '2033-10-15', 'Personalausweis Thomas Mueller bald abgelaufen',                false, '00000000-0000-0000-0000-000000000001', NOW(), NOW()),
    (e36, t_id, emp_mehmet, cat_aufent,  'Aufenthaltstitel § 18a AufenthG',       'Aufenthaltstitel fuer Fachkraefte mit Berufsausbildung',                  '2024-02-15', '2027-02-15', '2026-11-15', 'Aufenthaltstitel Mehmet Yilmaz verlaengern',                    true,  '00000000-0000-0000-0000-000000000001', NOW(), NOW()),
    (e37, t_id, emp_klaus,  cat_sb,      'Schwerbehindertenausweis GdB 50',        'Anerkennung nach SGB IX, Merkzeichen G',                                 '2023-08-10', '2028-08-10', '2028-05-10', 'SB-Ausweis Klaus Weber Verlaengerung',                          true,  '00000000-0000-0000-0000-000000000001', NOW(), NOW()),
    (e42, t_id, emp_thomas, cat_a1,      'A1-Bescheinigung Frankreich',           'Entsendung zu Kundentermin Lyon 18.-22.05.2026',                         '2026-04-10', '2026-05-22', '2026-04-25', 'A1-Bescheinigung bis zum Reiseantritt ins Personalportal laden', false, '00000000-0000-0000-0000-000000000001', NOW(), NOW()),
    (e44, t_id, emp_sabine, cat_elternz, 'Elternzeit-Antrag',                     'Elternzeit 01.09.2026 bis 31.08.2027 (12 Monate)',                        '2026-03-15', '2027-08-31', '2027-06-15', 'Rueckkehr aus Elternzeit Sabine Fischer vorbereiten',           true,  '00000000-0000-0000-0000-000000000001', NOW(), NOW()),
    (e45, t_id, emp_julia,  cat_muschu,  'Mutterschutz-Bescheinigung',            'Mutterschutzfrist voraussichtlich 20.05.2026 bis 12.08.2026',             '2026-04-02', '2026-08-12', '2026-07-20', 'Rueckkehr aus Mutterschutz Julia Hoffmann planen',              true,  '00000000-0000-0000-0000-000000000001', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;
END $$;

-- =============================================================
-- Payroll Master Data: Seed employee payroll fields
-- Encrypted fields use AES-256-GCM (FIELD_ENCRYPTION_KEY_V1)
-- =============================================================

-- Admin User (EMP001) — Vollzeit, Steuerklasse 1, TK
UPDATE employees SET
  tax_id = 'v1:UV96lAGhckDOkGQU:3swBd+66aEPad9w/QLLZ3Q==:8uorPozUkBcirIA=',
  tax_class = 1, denomination = 'ev', is_primary_employer = true,
  social_security_number = 'v1:ea3uCWLLfOSZ41+y:ZxXPd+reEXAYXyj/pr4UWw==:+4lseRDngpStys+8',
  health_insurance_provider_id = (SELECT id FROM health_insurance_providers WHERE institution_code = '101575519'),
  health_insurance_status = 'mandatory', personnel_group_code = '101',
  contribution_group_code = '1111', activity_code = '713024311',
  umlage_u1 = true, umlage_u2 = true,
  iban = 'v1:Iw+PcAxCoOq5aCxv:xTTcrNnUHeny/1DQG23FWQ==:ALYM/Q6YzvynW13wc0edEmQbpIjjNA==',
  bic = 'PBNKDEFFXXX', account_holder = 'Admin User',
  gross_salary = 5500.00, payment_type = 'monthly_salary',
  contract_type = 'permanent', probation_months = 6,
  notice_period_employee = '4 Wochen zum Monatsende', notice_period_employer = '3 Monate zum Quartalsende'
WHERE id = '00000000-0000-0000-0000-000000000011';

-- Regular User (EMP002) — Teilzeit, Steuerklasse 3, AOK Bayern
UPDATE employees SET
  tax_id = 'v1:sgjZ+PnjQ3K7fhNW:b3TThB2wjKLuhWjuqOBlZA==:p1xZvveQ9rmspyA=',
  tax_class = 3, child_tax_allowance = 1.0, denomination = 'rk', is_primary_employer = true,
  social_security_number = 'v1:EeLdsu3LTWjiSRi5:+wSnW3vdBSrAFoHwRdngRQ==:8O56wKbVcuwAZmBZ',
  health_insurance_provider_id = (SELECT id FROM health_insurance_providers WHERE institution_code = '108310400'),
  health_insurance_status = 'mandatory', personnel_group_code = '101',
  contribution_group_code = '1111', activity_code = '251024311',
  umlage_u1 = true, umlage_u2 = true,
  iban = 'v1:+wMCuk1RxiyFd+j2:xy3bBVmWqCq/NQA7zlaVFA==:nVr3z7VgWxJq/BV+QVmS0TQxI18Xrg==',
  bic = 'COBADEFFXXX', account_holder = 'Regular User',
  gross_salary = 3200.00, payment_type = 'monthly_salary',
  contract_type = 'permanent', notice_period_employee = '4 Wochen', notice_period_employer = '3 Monate'
WHERE id = '00000000-0000-0000-0000-000000000012';

-- Maria Schmidt (EMP003) — Steuerklasse 4/IV mit Faktor, BARMER, mit Kindern
UPDATE employees SET
  tax_id = 'v1:waHKYnCBZmBc32Bh:94GkcZnfhlIwo6yiUwZEkw==:VdeI9u0Wf8WyonA=',
  tax_class = 4, tax_factor = 0.9450, child_tax_allowance = 1.5,
  denomination = 'ev', spouse_denomination = 'rk', is_primary_employer = true,
  birth_name = 'Müller',
  social_security_number = 'v1:UHnn2xRFRRnIUglz:lBt+25zL4TgQh0mqKGo01A==:Jyjj4kgQHB+mnvoF',
  health_insurance_provider_id = (SELECT id FROM health_insurance_providers WHERE institution_code = '104940005'),
  health_insurance_status = 'mandatory', personnel_group_code = '101',
  contribution_group_code = '1111', activity_code = '613144311',
  umlage_u1 = true, umlage_u2 = true,
  iban = 'v1:qZGDORVJ2BF+2QlP:x3iK7tkBvCklbTt/WffQ0g==:d4qp+yktIZ7UB2w5NDicTea7+B4Dmg==',
  bic = 'BARMDE2HXXX', account_holder = 'Maria Schmidt',
  gross_salary = 4200.00, payment_type = 'monthly_salary', salary_group = 'E11',
  contract_type = 'permanent', probation_months = 6,
  notice_period_employee = '4 Wochen', notice_period_employer = '7 Monate',
  bg_institution = 'VBG', bg_membership_number = '12345678', bg_hazard_tariff = '01'
WHERE id = '00000000-0000-0000-0000-000000000013';

-- Thomas Mueller (EMP004) — Stundenlöhner, Steuerklasse 1, PKV
UPDATE employees SET
  tax_id = 'v1:zlU2M5bx8OdNNsL9:uFF7kwoHwTmO0tJrcxNBaA==:murjz7aWg7JZ6XA=',
  tax_class = 1, denomination = 'ev', is_primary_employer = true,
  social_security_number = 'v1:+FC80s9uxNEu9jrZ:U7wTUEy63APiDbdP7gx85g==:LcT4mNi8phXlW+Ud',
  health_insurance_status = 'private', private_health_insurance_contribution = 380.00,
  personnel_group_code = '101', contribution_group_code = '0111',
  activity_code = '252124311', umlage_u1 = true, umlage_u2 = true,
  iban = 'v1:5YF4FdKBMIzuJ/t9:E2uTZZtJZ2ljn0pOqrCBtg==:2fg1EZAV937ALIawnxVrQ6z5hJDyJQ==',
  bic = 'DAAEDEDDXXX', account_holder = 'Thomas Mueller',
  hourly_rate = 28.50, payment_type = 'hourly_wage',
  contract_type = 'permanent', notice_period_employee = '2 Wochen', notice_period_employer = '1 Monat'
WHERE id = '00000000-0000-0000-0000-000000000014';

-- Anna Weber (EMP005) — Werkstudentin, Steuerklasse 1, TK, Minijob-Flag
UPDATE employees SET
  tax_id = 'v1:nUgYIdK46Aky9LAp:DYTtjVhcq4it98K5NghcRg==:6nZ3Sx3kELG0iuo=',
  tax_class = 1, denomination = 'ev', is_primary_employer = true,
  social_security_number = 'v1:bJR0v1K7OMbU3JQ6:hM5KdU8s3FK2jEcVt9q+0A==:IpUXFcW2CSA4vLys',
  health_insurance_provider_id = (SELECT id FROM health_insurance_providers WHERE institution_code = '101575519'),
  health_insurance_status = 'mandatory', personnel_group_code = '106',
  contribution_group_code = '0100', activity_code = '431244311',
  umlage_u1 = false, umlage_u2 = true,
  iban = 'v1:EPNEHFWmTq07qOrF:/rpfZjMU+vvQN+uxPdztuw==:bI1U8JJzYs+H69uI+pHR+m6z9u47Kw==',
  bic = 'PBNKDEFFXXX', account_holder = 'Anna Weber',
  gross_salary = 1200.00, payment_type = 'monthly_salary',
  contract_type = 'fixed_term_no_reason',
  university = 'TU München', student_id = 'M-12345', field_of_study = 'Informatik'
WHERE id = '00000000-0000-0000-0000-000000000015';

-- Maria Schmidt: 2 Kinder
INSERT INTO employee_children (tenant_id, employee_id, first_name, last_name, birth_date, tax_allowance_share, lives_in_household) VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000013', 'Max', 'Schmidt', '2018-03-15', 0.5, true),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000013', 'Sophie', 'Schmidt', '2021-07-22', 1.0, true)
ON CONFLICT DO NOTHING;

-- Thomas Mueller: Dienstwagen
INSERT INTO employee_company_cars (tenant_id, employee_id, list_price, propulsion_type, distance_to_work_km, usage_type, license_plate, make_model, start_date) VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000014', 42000.00, 'hybrid', 18.5, 'private_use', 'M-TM 1234', 'BMW 320e', '2025-06-01')
ON CONFLICT DO NOTHING;

-- Admin User: bAV (Direktversicherung)
INSERT INTO employee_pensions (tenant_id, employee_id, execution_type, provider_name, contract_number, employee_contribution, employer_contribution, mandatory_employer_subsidy, start_date) VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'direct_insurance', 'Allianz Lebensversicherung', 'AV-2024-001', 200.00, 200.00, 30.00, '2024-01-01')
ON CONFLICT DO NOTHING;

-- Regular User: VL (Bausparen)
INSERT INTO employee_savings (tenant_id, employee_id, investment_type, recipient, contract_number, monthly_amount, employer_share, employee_share, start_date) VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', 'building_savings', 'LBS Bayern', 'BS-2025-002', 40.00, 26.59, 13.41, '2025-01-01')
ON CONFLICT DO NOTHING;

-- Sabine Fischer (EMP006) — Steuerklasse 5, DAK, Minijob
UPDATE employees SET
  tax_id = 'v1:AC/id944tR0ZhjST:RrOO6f6sno4APdoc+rzteA==:CojGgMLct0mIi8g=',
  tax_class = 5, denomination = 'rk', is_primary_employer = false,
  social_security_number = 'v1:VDlxkrcRzADGM1hp:hpd8IFCN+8MpK4f4oZVZOg==:9aP71rcHZHMWVU7Z',
  health_insurance_provider_id = (SELECT id FROM health_insurance_providers WHERE institution_code = '105862407'),
  health_insurance_status = 'mandatory', personnel_group_code = '109',
  contribution_group_code = '6500', activity_code = '633044311', midijob_flag = 0,
  umlage_u1 = true, umlage_u2 = true,
  iban = 'v1:NWH9QTNd0Z20dUy+:v+5m3fc5gqI3VtssefomTA==:Pn+zEG4SuYvu+Cr0E7ZFOfgJO8pu1Q==',
  bic = 'DAAEDEDDXXX', account_holder = 'Sabine Fischer',
  gross_salary = 520.00, payment_type = 'monthly_salary',
  contract_type = 'permanent', notice_period_employee = '4 Wochen', notice_period_employer = '4 Wochen'
WHERE id = '00000000-0000-0000-0000-000000000016';

-- Markus Braun (EMP007) — Steuerklasse 3, IKK classic, Gleitzone
UPDATE employees SET
  tax_id = 'v1:JP5taaPIfvEREZL4:CR7RsBpJcKA2vw4UBwbsxQ==:dj3QCLjS+oR/4eU=',
  tax_class = 3, child_tax_allowance = 2.0, denomination = 'ev', is_primary_employer = true,
  social_security_number = 'v1:h/Z13Ymp2elYJzt0:5G+/fGovyC+HCT3iApAQkg==:1WiDu68PLRz90sjV',
  health_insurance_provider_id = (SELECT id FROM health_insurance_providers WHERE institution_code = '107202130'),
  health_insurance_status = 'mandatory', personnel_group_code = '101',
  contribution_group_code = '1111', activity_code = '261124311', midijob_flag = 1,
  umlage_u1 = true, umlage_u2 = true,
  iban = 'v1:CTOPQlm4wnVI3ylm:dm49OAfjZ4eLOj/cwrjZ1Q==:LomFMs3i2P2ukQ7pUb4O3XvLI/O3dA==',
  bic = 'IKKFDE99XXX', account_holder = 'Markus Braun',
  gross_salary = 1800.00, payment_type = 'monthly_salary', salary_group = 'E8',
  contract_type = 'permanent', probation_months = 3,
  notice_period_employee = '4 Wochen', notice_period_employer = '2 Monate'
WHERE id = '00000000-0000-0000-0000-000000000017';

-- Julia Hoffmann (EMP008) — Steuerklasse 2 (alleinerziehend), hkk, 1 Kind
UPDATE employees SET
  tax_id = 'v1:Bq9bulS8olEioQ1g:DP3ujFbw5TfRt/CGcccj3A==:yiNET+R+8leQ2Eo=',
  tax_class = 2, child_tax_allowance = 1.0, denomination = 'rk', is_primary_employer = true,
  birth_name = 'Schulz',
  social_security_number = 'v1:5+ubt2BpUQPAJC96:zBR7k4yPeJQcqQFid8EGbg==:BusQcYvF/yopeL80',
  health_insurance_provider_id = (SELECT id FROM health_insurance_providers WHERE institution_code = '102131418'),
  health_insurance_status = 'mandatory', personnel_group_code = '101',
  contribution_group_code = '1111', activity_code = '714024311',
  umlage_u1 = true, umlage_u2 = true,
  iban = 'v1:WjjZuhCeHMjk7fhD:oRP4X5EK7DsvJfhCuWxNIw==:2tTOYm4rGLYgicMf7OSQF1ihVUUaJA==',
  bic = 'HKKRDE80XXX', account_holder = 'Julia Hoffmann',
  gross_salary = 3600.00, payment_type = 'monthly_salary', salary_group = 'E9',
  contract_type = 'permanent', notice_period_employee = '4 Wochen', notice_period_employer = '3 Monate'
WHERE id = '00000000-0000-0000-0000-000000000018';

-- Stefan Lang (EMP009) — Auszubildender, PGR 102
UPDATE employees SET
  tax_id = 'v1:nbRZ5rDB8MTZRbLx:geaoOKdV3AUJFI+wYSHZyQ==:il5eXApblFq9cuQ=',
  tax_class = 1, denomination = 'ev', is_primary_employer = true,
  social_security_number = 'v1:HDivy7qpDbcT0EIk:hPfj19Gx1bD3dd33BgOKBw==:ECVBjqoJwuFwoCpi',
  health_insurance_provider_id = (SELECT id FROM health_insurance_providers WHERE institution_code = '101575519'),
  health_insurance_status = 'mandatory', personnel_group_code = '102',
  contribution_group_code = '1111', activity_code = '251024311',
  umlage_u1 = true, umlage_u2 = true,
  iban = 'v1:UNVI4SCUH7gDcsm4:47G0HoZooqBBUFuetnUwEQ==:EJYvjjXdjidrCXGDzkY26cdS1h9LrQ==',
  bic = 'PBNKDEFFXXX', account_holder = 'Stefan Lang',
  gross_salary = 1100.00, payment_type = 'monthly_salary',
  contract_type = 'fixed_term_with_reason', probation_months = 4,
  apprenticeship_occupation = 'Industriemechaniker',
  vocational_school = 'Berufsschule Mitte'
WHERE id = '00000000-0000-0000-0000-000000000019';

-- Petra Neumann (EMP010) — Steuerklasse 4, Schwerbehinderung
UPDATE employees SET
  tax_id = 'v1:LFW2hPFCltE7MVBt:LOSdg92KNdVF6zBVgsHcCQ==:+IcCQIdMeu2v2pw=',
  tax_class = 4, denomination = 'rk', is_primary_employer = true,
  social_security_number = 'v1:qQJFHwSmIvHYDNr6:yhGCiBCdKE3wazafGf6eSQ==:ZUHEySb5mmo052P6',
  health_insurance_provider_id = (SELECT id FROM health_insurance_providers WHERE institution_code = '108310400'),
  health_insurance_status = 'mandatory', personnel_group_code = '101',
  contribution_group_code = '1111', activity_code = '813024311',
  umlage_u1 = true, umlage_u2 = true,
  iban = 'v1:J8PFl5O2c+F8K1Ea:g4D+SVFc9zam9acbz6f2zw==:xYGD5lMMfh9pY6JhbJht58GQN89jxA==',
  bic = 'BYLADEM1001', account_holder = 'Petra Neumann',
  gross_salary = 3400.00, payment_type = 'monthly_salary', salary_group = 'E9',
  contract_type = 'permanent',
  disability_flag = true, disability_degree = 50, disability_markers = 'G',
  disability_id_valid_until = '2028-06-30'
WHERE id = '00000000-0000-0000-0000-00000000001a';

-- Klaus Weber (EMP011) — Altersteilzeit, Steuerklasse 3
UPDATE employees SET
  tax_id = 'v1:NAEzpbepxXBhnFB+:OGU+++CYkQBTHNZxqpAsKg==:xpHZf8qd+bodER8=',
  tax_class = 3, denomination = 'ev', is_primary_employer = true,
  social_security_number = 'v1:Ot0rOCrZ/7QWH8nG:LYp1dubP2x1FF3C1lQmqOg==:om7CndHPx/mUvLSx',
  health_insurance_provider_id = (SELECT id FROM health_insurance_providers WHERE institution_code = '104940005'),
  health_insurance_status = 'mandatory', personnel_group_code = '103',
  contribution_group_code = '1111', activity_code = '251124311',
  umlage_u1 = true, umlage_u2 = true,
  iban = 'v1:pzql8X1/kL0CJpRN:Sm7/ju9Q4DBdyHuj0JT2Aw==:EMKkvarIVsMmLT9BY38OGh0BO+hhnA==',
  bic = 'BARMDE2HXXX', account_holder = 'Klaus Weber',
  gross_salary = 2800.00, payment_type = 'monthly_salary',
  contract_type = 'permanent'
WHERE id = '00000000-0000-0000-0000-00000000001b';

-- Andrea Mueller (EMP012) — Mutterschutz-Kandidatin, Steuerklasse 4
UPDATE employees SET
  tax_id = 'v1:EsIg4NXxvz7cVeRC:uQBlOifGIuf4Fq/hSWA27w==:px8UhR1iWOD3jLo=',
  tax_class = 4, denomination = 'rk', is_primary_employer = true,
  social_security_number = 'v1:AeMdy+BFNoVPP0CY:laJ8g3yISVgDdZ0cFkZCqA==:lfY6uQZ9tzRTj8E3',
  health_insurance_provider_id = (SELECT id FROM health_insurance_providers WHERE institution_code = '102131418'),
  health_insurance_status = 'mandatory', personnel_group_code = '101',
  contribution_group_code = '1111', activity_code = '811024311',
  umlage_u1 = true, umlage_u2 = true,
  iban = 'v1:8j6gfr0/kbAB7XiI:2+lGbZedgfsBW35VRDr/TA==:lOligfS6XShuWUFefVT6oHZv365OmQ==',
  bic = 'HKKRDE80XXX', account_holder = 'Andrea Mueller',
  gross_salary = 3800.00, payment_type = 'monthly_salary', salary_group = 'E10',
  contract_type = 'permanent'
WHERE id = '00000000-0000-0000-0000-00000000001c';

-- Mehmet Yilmaz (EMP013) — Ausländische Nationalität, Steuerklasse 1
UPDATE employees SET
  tax_id = 'v1:y2KQo1dDEl5atCwA:mNSP20tXojVG4zJEQXP4Wg==:h/ns5oLSUAK26A4=',
  tax_class = 1, denomination = 'ib', is_primary_employer = true,
  social_security_number = 'v1:qnk7qCaBzISTMpK3:wGJwzKzk3uf9AkVWubteZQ==:VqMFxJBNCXYS8y9S',
  health_insurance_provider_id = (SELECT id FROM health_insurance_providers WHERE institution_code = '101575519'),
  health_insurance_status = 'mandatory', personnel_group_code = '101',
  contribution_group_code = '1111', activity_code = '532134311',
  umlage_u1 = true, umlage_u2 = true,
  iban = 'v1:x+qzU1VwL/lA8wmK:2xvUBezZqQJR3oYh1E3/fw==:3zIw95ANcxT6r5f+Kolugshxp960OA==',
  bic = 'PBNKDEFFXXX', account_holder = 'Mehmet Yilmaz',
  gross_salary = 2900.00, payment_type = 'monthly_salary',
  contract_type = 'permanent'
WHERE id = '00000000-0000-0000-0000-00000000001d';

-- Sandra Koch (EMP014) — Werkstudentin, PGR 106, Teilzeit
UPDATE employees SET
  tax_id = 'v1:RmBlVTLgJZ/cLejc:0sXb+GNoE70GzO9NhM1wJA==:Ryt/MdAVKsbm16w=',
  tax_class = 1, denomination = 'ev', is_primary_employer = true,
  social_security_number = 'v1:OZTuhTEzORTtNvxy:EOpubCxKtbNVij0ziedsQg==:LDgvG1we9IL+0Wav',
  health_insurance_provider_id = (SELECT id FROM health_insurance_providers WHERE institution_code = '101575519'),
  health_insurance_status = 'mandatory', personnel_group_code = '106',
  contribution_group_code = '0100', activity_code = '431144311',
  umlage_u1 = false, umlage_u2 = true,
  iban = 'v1:sXfT2x+Y5x7/85Nm:ndyJlsbJDbvPIxlVRPM61g==:tw8ybBwl0vZfRxI3zaeWzAT8vyjIvA==',
  bic = 'PBNKDEFFXXX', account_holder = 'Sandra Koch',
  gross_salary = 1000.00, payment_type = 'monthly_salary',
  contract_type = 'fixed_term_no_reason',
  university = 'Hochschule München', student_id = 'HM-98765', field_of_study = 'Wirtschaftsinformatik'
WHERE id = '00000000-0000-0000-0000-00000000001e';

-- Julia Hoffmann: 1 Kind
INSERT INTO employee_children (tenant_id, employee_id, first_name, last_name, birth_date, tax_allowance_share, lives_in_household) VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000018', 'Lina', 'Hoffmann', '2019-09-12', 1.0, true)
ON CONFLICT DO NOTHING;

-- Markus Braun: 2 Kinder
INSERT INTO employee_children (tenant_id, employee_id, first_name, last_name, birth_date, tax_allowance_share, lives_in_household) VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000017', 'Tim', 'Braun', '2016-04-08', 0.5, true),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000017', 'Emma', 'Braun', '2019-11-25', 0.5, true)
ON CONFLICT DO NOTHING;

-- Julia Hoffmann: Elternzeit (abgeschlossen)
INSERT INTO employee_parental_leaves (tenant_id, employee_id, start_date, end_date, is_partner_months) VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000018', '2019-09-12', '2021-09-11', false)
ON CONFLICT DO NOTHING;

-- Maria Schmidt: Jobrad
INSERT INTO employee_job_bikes (tenant_id, employee_id, list_price, usage_type, start_date) VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000013', 3200.00, 'salary_conversion', '2025-04-01')
ON CONFLICT DO NOTHING;

-- Admin User: Essenszuschuss
INSERT INTO employee_meal_allowances (tenant_id, employee_id, daily_amount, work_days_per_month, start_date) VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 6.50, 20.0, '2024-01-01')
ON CONFLICT DO NOTHING;

-- Markus Braun: Jobticket
INSERT INTO employee_job_tickets (tenant_id, employee_id, monthly_amount, provider, is_additional, start_date) VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000017', 49.00, 'BVG', true, '2025-01-01')
ON CONFLICT DO NOTHING;

-- Klaus Weber: bAV (Pensionskasse)
INSERT INTO employee_pensions (tenant_id, employee_id, execution_type, provider_name, contract_number, employee_contribution, employer_contribution, mandatory_employer_subsidy, start_date) VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000001b', 'pension_fund', 'R+V Pensionskasse', 'PK-2020-011', 150.00, 150.00, 22.50, '2020-01-01')
ON CONFLICT DO NOTHING;

-- Petra Neumann: Pfändung (Unterhalt)
INSERT INTO employee_garnishments (tenant_id, employee_id, creditor_name, creditor_address, file_reference, garnishment_amount, calculation_method, dependents_count, rank, is_p_account, maintenance_obligation, start_date) VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000001a',
   'v1:Czm46x0MbM+NQksn:L6KmOcA+znkwsm3RdKpXyA==:1G4bNQI2AqhwJZQD6s6azPGBqTKDYrQ=',
   'Musterstr. 12, 80333 München', NULL, 450.00, 'table_based', 1, 1, true, true, '2025-03-01')
ON CONFLICT DO NOTHING;

-- Mehmet Yilmaz: Auslandstätigkeit (Istanbul)
INSERT INTO employee_foreign_assignments (tenant_id, employee_id, country_code, country_name, start_date, end_date, a1_certificate_number, a1_valid_from, a1_valid_until, foreign_activity_exemption) VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000001d', 'TR', 'Türkei', '2025-06-01', '2025-09-30', 'A1-2025-TR-042', '2025-06-01', '2025-09-30', false)
ON CONFLICT DO NOTHING;

-- =============================================================
-- Phase 10a: Platform Subscription Billing seed
-- =============================================================
-- Creates a second tenant "Test Customer GmbH" and wires up a sample
-- subscription billed by the dev tenant (which acts as the operator
-- tenant when PLATFORM_OPERATOR_TENANT_ID=10000000-0000-0000-0000-000000000001).

-- 1. Second tenant — the first "paying customer"
INSERT INTO tenants (id, name, slug, is_active, address_street, address_zip, address_city, address_country, email, created_at, updated_at)
VALUES (
  '20000000-0000-0000-0000-000000000001',
  'Test Customer GmbH', 'test-customer', true,
  'Kundenstraße 42', '12345', 'Berlin', 'Deutschland',
  'buchhaltung@test-customer.local',
  NOW(), NOW()
) ON CONFLICT (id) DO NOTHING;

-- 2. CrmAddress for Test Customer inside the Dev Company (operator) tenant
INSERT INTO crm_addresses (
  id, tenant_id, number, type, company, street, zip, city, country, email,
  match_code, is_active, created_at, updated_at
)
VALUES (
  '30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'K-999',
  'CUSTOMER',
  'Test Customer GmbH',
  'Kundenstraße 42',
  '12345',
  'Berlin',
  'DE',
  'buchhaltung@test-customer.local',
  'TEST CUSTOMER GMBH',
  true,
  NOW(), NOW()
) ON CONFLICT (id) DO NOTHING;

-- 3. platform_subscriptions rows — two subscriptions (core + crm) for
--    Test Customer. Under the shared-invoice model, BOTH subscriptions
--    end up pointing at the SAME recurring invoice in step 5.
INSERT INTO platform_subscriptions (
  id, tenant_id, module, status, billing_cycle, unit_price, currency,
  start_date, operator_crm_address_id, billing_recurring_invoice_id,
  created_at, created_by_platform_user_id
)
VALUES
  (
    '50000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'core',
    'active',
    'MONTHLY',
    8,
    'EUR',
    date_trunc('month', NOW()),
    '30000000-0000-0000-0000-000000000001',
    NULL,
    NOW(),
    '00000000-0000-0000-0000-000000000001'
  ),
  (
    '50000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    'crm',
    'active',
    'MONTHLY',
    4,
    'EUR',
    date_trunc('month', NOW()),
    '30000000-0000-0000-0000-000000000001',
    NULL,
    NOW(),
    '00000000-0000-0000-0000-000000000001'
  )
ON CONFLICT (id) DO NOTHING;

-- 4. ONE BillingRecurringInvoice in the operator tenant covering BOTH
--    subscriptions — shared-invoice model. next_due_date = NOW() so the
--    first cron run generates the DRAFT immediately.
--
--    created_by_id MUST be a valid UUID — billing-recurring-invoice-service
--    .generateDue() uses `template.createdById || "system"` as the
--    createdById of the generated BillingDocument, and the string literal
--    "system" is not a valid UUID, so NULL here makes the cron choke.
--    PLATFORM_SYSTEM_USER_ID is the canonical sentinel for platform-
--    initiated writes (see src/trpc/init.ts).
INSERT INTO billing_recurring_invoices (
  id, tenant_id, name, address_id, interval, start_date, next_due_date,
  auto_generate, is_active, payment_term_days, internal_notes,
  position_template, created_at, updated_at, created_by_id
)
VALUES (
  '40000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'Abo monthly — Test Customer GmbH',
  '30000000-0000-0000-0000-000000000001',
  'MONTHLY',
  date_trunc('month', NOW()),
  NOW(),
  true,
  true,
  14,
  '[platform_subscription:50000000-0000-0000-0000-000000000001] [platform_subscription:50000000-0000-0000-0000-000000000002]',
  '[
    {"type":"FREE","description":"Terp Core — Benutzer, Mitarbeiter, Stammdaten","quantity":1,"unit":"Monat","unitPrice":8,"vatRate":19},
    {"type":"FREE","description":"Terp CRM — Adressen, Kontakte, Korrespondenz, Anfragen","quantity":1,"unit":"Monat","unitPrice":4,"vatRate":19}
  ]'::jsonb,
  NOW(), NOW(), '00000000-0000-0000-0000-00000000beef'
) ON CONFLICT (id) DO NOTHING;

-- 5. Link BOTH subscriptions to the SAME recurring invoice.
UPDATE platform_subscriptions
  SET billing_recurring_invoice_id = '40000000-0000-0000-0000-000000000001'
  WHERE id IN (
    '50000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000002'
  )
  AND billing_recurring_invoice_id IS NULL;

-- 6. Pre-enable the core + crm tenant_modules on Test Customer so the
--    feature gate matches the subscription state on first login.
INSERT INTO tenant_modules (tenant_id, module, enabled_at, enabled_by_platform_user_id)
VALUES
  ('20000000-0000-0000-0000-000000000001', 'core', NOW(), '00000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000001', 'crm',  NOW(), '00000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;
