-- =============================================================
-- Add payroll master data permissions
-- =============================================================

-- Permission UUIDs (UUIDv5 with namespace f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1):
--   personnel.payroll_data.view       = 02001d49-ce18-578f-81de-46102573d01e
--   personnel.payroll_data.edit       = a64bbd95-5063-5424-ade6-f7f4a05f2130
--   personnel.garnishment.view        = 9efb2f38-c032-513e-b085-8e78f4ea2e2b
--   personnel.garnishment.edit        = 901a8a66-4350-586b-9a99-c0379c610fc3
--   personnel.foreign_assignment.view = 43ad50c8-8806-5a13-8bfa-a8dc5290fe27
--   personnel.foreign_assignment.edit = 0f709d79-b278-51fd-be37-b5f2e605648c

-- ADMIN: all 6 payroll permissions
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"02001d49-ce18-578f-81de-46102573d01e"'::jsonb  -- personnel.payroll_data.view
    UNION ALL SELECT '"a64bbd95-5063-5424-ade6-f7f4a05f2130"'::jsonb  -- personnel.payroll_data.edit
    UNION ALL SELECT '"9efb2f38-c032-513e-b085-8e78f4ea2e2b"'::jsonb  -- personnel.garnishment.view
    UNION ALL SELECT '"901a8a66-4350-586b-9a99-c0379c610fc3"'::jsonb  -- personnel.garnishment.edit
    UNION ALL SELECT '"43ad50c8-8806-5a13-8bfa-a8dc5290fe27"'::jsonb  -- personnel.foreign_assignment.view
    UNION ALL SELECT '"0f709d79-b278-51fd-be37-b5f2e605648c"'::jsonb  -- personnel.foreign_assignment.edit
  ) sub
) WHERE code = 'ADMIN' AND tenant_id IS NULL;

-- HR: payroll_data view + edit only (no garnishment, no foreign assignment)
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"02001d49-ce18-578f-81de-46102573d01e"'::jsonb  -- personnel.payroll_data.view
    UNION ALL SELECT '"a64bbd95-5063-5424-ade6-f7f4a05f2130"'::jsonb  -- personnel.payroll_data.edit
  ) sub
) WHERE code = 'HR' AND tenant_id IS NULL;
