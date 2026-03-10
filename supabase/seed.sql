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
  email_confirmed_at, raw_user_meta_data,
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
  NOW(), NOW(),
  '', '', '', '', ''
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
  email_confirmed_at, raw_user_meta_data,
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
  NOW(), NOW(),
  '', '', '', '', ''
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
  '["time_tracking.view_own", "time_tracking.book_own", "absences.view_own", "absences.request_own"]'::jsonb,
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

INSERT INTO employees (id, tenant_id, personnel_number, pin, first_name, last_name, email, entry_date, weekly_hours, vacation_days_per_year, is_active, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001', 'EMP001', '1001', 'Admin', 'User', 'admin@dev.local', '2020-01-01', 40.00, 30.00, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000001', 'EMP002', '1002', 'Regular', 'User', 'user@dev.local', '2021-03-15', 40.00, 28.00, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000001', 'EMP003', '1003', 'Maria', 'Schmidt', 'maria.schmidt@dev.local', '2022-06-01', 20.00, 15.00, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-000000000001', 'EMP004', '1004', 'Thomas', 'Mueller', 'thomas.mueller@dev.local', '2024-01-15', 40.00, 30.00, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000015', '10000000-0000-0000-0000-000000000001', 'EMP005', '1005', 'Anna', 'Weber', 'anna.weber@dev.local', '2015-09-01', 35.00, 32.00, true, NOW(), NOW())
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

INSERT INTO employee_tariff_assignments (id, tenant_id, employee_id, tariff_id, effective_from, effective_to, overwrite_behavior, is_active, created_at, updated_at)
VALUES
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000701', '2020-01-01', NULL, 'preserve_manual', true, NOW(), NOW()),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000703', '2021-03-15', NULL, 'preserve_manual', true, NOW(), NOW()),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000704', '2022-06-01', NULL, 'preserve_manual', true, NOW(), NOW()),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000701', '2024-01-15', NULL, 'preserve_manual', true, NOW(), NOW()),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-000000000702', '2015-09-01', NULL, 'preserve_manual', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Also set tariff_id on the employees directly
UPDATE employees SET tariff_id = '00000000-0000-0000-0000-000000000701' WHERE id = '00000000-0000-0000-0000-000000000011';
UPDATE employees SET tariff_id = '00000000-0000-0000-0000-000000000703' WHERE id = '00000000-0000-0000-0000-000000000012';
UPDATE employees SET tariff_id = '00000000-0000-0000-0000-000000000704' WHERE id = '00000000-0000-0000-0000-000000000013';
UPDATE employees SET tariff_id = '00000000-0000-0000-0000-000000000701' WHERE id = '00000000-0000-0000-0000-000000000014';
UPDATE employees SET tariff_id = '00000000-0000-0000-0000-000000000702' WHERE id = '00000000-0000-0000-0000-000000000015';

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
  ('00000000-0000-0000-0000-000000000905', '10000000-0000-0000-0000-000000000001', 'Accounting Team', 'Financial accounting and reporting', '00000000-0000-0000-0000-000000000804', NULL, true, NOW(), NOW())
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
  -- DevOps Team
  ('00000000-0000-0000-0000-000000000903', '00000000-0000-0000-0000-000000000014', 'member', NOW()),
  -- HR Core Team
  ('00000000-0000-0000-0000-000000000904', '00000000-0000-0000-0000-000000000013', 'deputy', NOW()),
  -- Accounting Team
  ('00000000-0000-0000-0000-000000000905', '00000000-0000-0000-0000-000000000015', 'member', NOW())
ON CONFLICT (team_id, employee_id) DO NOTHING;

-- =============================================================
-- 15. Accounts (tenant-specific, system accounts exist from migration)
-- =============================================================

INSERT INTO accounts (id, tenant_id, code, name, account_type, unit, is_system, is_active, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000001101', '10000000-0000-0000-0000-000000000001', 'NIGHT', 'Night Shift Bonus', 'bonus', 'minutes', false, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000001102', '10000000-0000-0000-0000-000000000001', 'SAT', 'Saturday Bonus', 'bonus', 'minutes', false, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000001103', '10000000-0000-0000-0000-000000000001', 'SUN', 'Sunday/Holiday Bonus', 'bonus', 'minutes', false, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000001104', '10000000-0000-0000-0000-000000000001', 'ONCALL', 'On-Call Duty', 'day', 'minutes', false, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000001105', '10000000-0000-0000-0000-000000000001', 'TRAVEL', 'Travel Time', 'day', 'minutes', false, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000001106', '10000000-0000-0000-0000-000000000001', 'SICK', 'Sick Leave Balance', 'month', 'days', false, true, NOW(), NOW())
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
  ('00000000-0000-0000-0000-000000003013', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '2026-01-21', 540, 540, 480, 60, 0, 0, true, '{"MISSING_BREAK"}', NULL, 480, 1020, 2, 'calculated', NOW(), NOW()),
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
  ('00000000-0000-0000-0000-000000004007', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', '2026-01-13', 0, 0, 480, 0, 0, 0, true, '{"MISSING_CLOCK_OUT"}', NULL, 540, NULL, 1, 'calculated', NOW(), NOW()),
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

INSERT INTO vacation_balances (id, tenant_id, employee_id, year, entitlement, carryover, adjustments, taken, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000016000', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 2026, 30.00, 3.00, 0.00, 3.00, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000016001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', 2026, 28.00, 5.00, 0.00, 0.00, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000016002', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000013', 2026, 15.00, 2.00, 0.00, 0.00, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000016003', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000014', 2026, 30.00, 0.00, 0.00, 0.00, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000016004', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000015', 2026, 32.00, 4.00, 0.00, 0.50, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

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
-- 22. Employee day plans (January 2026 only)
-- =============================================================
-- Employee -> WeekPlan mapping:
--   Admin:  WEEK-40H  -> Mon-Fri: STD-8H (502),  Sat-Sun: NULL
--   User:   WEEK-FLEX -> Mon-Fri: FLEX-8H (504), Sat-Sun: NULL
--   Maria:  WEEK-20H  -> Mon-Fri: PART-4H (503), Sat-Sun: NULL
--   Thomas: WEEK-40H  -> Mon-Fri: STD-8H (502),  Sat-Sun: NULL
--   Anna:   WEEK-38H  -> Mon-Thu: STD-8H (502),  Fri: FRI-6H (505), Sat-Sun: NULL

-- Generate employee day plans for January 2026 using a DO block
DO $$
DECLARE
  t_id uuid := '10000000-0000-0000-0000-000000000001';
  d date;
  dow int;
  emp record;
BEGIN
  FOR emp IN
    SELECT * FROM (VALUES
      ('00000000-0000-0000-0000-000000000011'::uuid, '00000000-0000-0000-0000-000000000502'::uuid, '00000000-0000-0000-0000-000000000502'::uuid),
      ('00000000-0000-0000-0000-000000000012'::uuid, '00000000-0000-0000-0000-000000000504'::uuid, '00000000-0000-0000-0000-000000000504'::uuid),
      ('00000000-0000-0000-0000-000000000013'::uuid, '00000000-0000-0000-0000-000000000503'::uuid, '00000000-0000-0000-0000-000000000503'::uuid),
      ('00000000-0000-0000-0000-000000000014'::uuid, '00000000-0000-0000-0000-000000000502'::uuid, '00000000-0000-0000-0000-000000000502'::uuid),
      ('00000000-0000-0000-0000-000000000015'::uuid, '00000000-0000-0000-0000-000000000502'::uuid, '00000000-0000-0000-0000-000000000505'::uuid)
    ) AS t(employee_id, mon_thu_plan, fri_plan)
  LOOP
    d := '2026-01-01';
    WHILE d <= '2026-01-31' LOOP
      dow := EXTRACT(ISODOW FROM d)::int; -- 1=Mon, 7=Sun
      INSERT INTO employee_day_plans (id, tenant_id, employee_id, plan_date, day_plan_id, source, created_at, updated_at)
      VALUES (
        gen_random_uuid(), t_id, emp.employee_id, d,
        CASE
          -- Holidays: Jan 1 (Neujahr), Jan 6 (Heilige Drei Koenige)
          WHEN d IN ('2026-01-01', '2026-01-06') THEN NULL
          WHEN dow IN (6, 7) THEN NULL  -- Weekend
          WHEN dow = 5 THEN emp.fri_plan  -- Friday
          ELSE emp.mon_thu_plan           -- Mon-Thu
        END,
        CASE
          WHEN d IN ('2026-01-01', '2026-01-06') THEN 'holiday'
          ELSE 'tariff'
        END,
        NOW(), NOW()
      ) ON CONFLICT (employee_id, plan_date) DO NOTHING;
      d := d + 1;
    END LOOP;
  END LOOP;
END $$;
