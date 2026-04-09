-- =============================================================
-- Assign payroll permissions to existing user groups
-- =============================================================
--
-- Fixes two gaps discovered after Phase 1 and Phase 2:
--
-- 1) Phase 1 gap: migration 20260416100001 assigned the payroll master
--    data permissions to a group with code 'HR'. That group does not
--    exist in the system seed — the real system group is 'PERSONAL'
--    (Personalleitung). Result: Personalleitung cannot access the
--    Lohn-Stammdaten tabs despite being the role responsible for
--    maintaining them per TERP_HANDBUCH section 20e.
--
-- 2) Phase 2 gap: migration 20260417100001 only assigned the new
--    export_template permissions to 'ADMIN'. Per TERP_HANDBUCH
--    section 20f.5 the monthly template-based export lauf is executed
--    by the Buchhaltung role — they need view + execute to see active
--    templates in the GenerateExportDialog dropdown and run them.
--
-- Permission UUIDs (UUIDv5, namespace f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1):
--
--   personnel.payroll_data.view       = 02001d49-ce18-578f-81de-46102573d01e
--   personnel.payroll_data.edit       = a64bbd95-5063-5424-ade6-f7f4a05f2130
--   personnel.foreign_assignment.view = 43ad50c8-8806-5a13-8bfa-a8dc5290fe27
--   personnel.foreign_assignment.edit = 0f709d79-b278-51fd-be37-b5f2e605648c
--   export_template.view              = 7fd17379-9269-54a9-b1f6-c4688833b192
--   export_template.execute           = 735054c3-78fb-501a-9579-70fe2a74a03a

-- ─────────────────────────────────────────────────────────────
-- PERSONAL (Personalleitung) — Phase 1 backfill
-- ─────────────────────────────────────────────────────────────
-- Assigns payroll master data (view + edit) and foreign assignment
-- (view + edit). Garnishment permissions stay admin-only because
-- pfändungen are more sensitive and only HR leadership + admin
-- should see them.
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"02001d49-ce18-578f-81de-46102573d01e"'::jsonb  -- personnel.payroll_data.view
    UNION ALL SELECT '"a64bbd95-5063-5424-ade6-f7f4a05f2130"'::jsonb  -- personnel.payroll_data.edit
    UNION ALL SELECT '"43ad50c8-8806-5a13-8bfa-a8dc5290fe27"'::jsonb  -- personnel.foreign_assignment.view
    UNION ALL SELECT '"0f709d79-b278-51fd-be37-b5f2e605648c"'::jsonb  -- personnel.foreign_assignment.edit
  ) sub
) WHERE code = 'PERSONAL' AND tenant_id IS NULL;

-- ─────────────────────────────────────────────────────────────
-- BUCHHALTUNG — Phase 2 backfill
-- ─────────────────────────────────────────────────────────────
-- Assigns only view + execute. Buchhaltung must NOT create/edit/delete
-- templates — those are maintained by the administrator or the
-- implementation partner.
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"7fd17379-9269-54a9-b1f6-c4688833b192"'::jsonb  -- export_template.view
    UNION ALL SELECT '"735054c3-78fb-501a-9579-70fe2a74a03a"'::jsonb  -- export_template.execute
  ) sub
) WHERE code = 'BUCHHALTUNG' AND tenant_id IS NULL;
