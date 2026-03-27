-- HR_01: Add personnel file permissions to default user groups
--
-- Permission UUIDs (UUIDv5 with namespace f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1):
--   hr_personnel_file.view              = de018506-94a3-5363-b6d9-3390beb5798f
--   hr_personnel_file.create            = caa57531-3455-5572-b989-b2198c820223
--   hr_personnel_file.edit              = c4e01128-e4d5-573e-906e-90f062a76a95
--   hr_personnel_file.delete            = b21862c1-07c2-509f-bf08-dd9a6fc2c127
--   hr_personnel_file.view_confidential = 3d811050-5f43-5d01-adba-c7b91a2f069a
--   hr_personnel_file_categories.manage = d558fe70-8e26-5cc5-a7b6-1f58024cde37

-- PERSONAL: all 6 permissions (view, create, edit, delete, view_confidential, categories.manage)
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"de018506-94a3-5363-b6d9-3390beb5798f"'::jsonb  -- view
    UNION ALL SELECT '"caa57531-3455-5572-b989-b2198c820223"'::jsonb  -- create
    UNION ALL SELECT '"c4e01128-e4d5-573e-906e-90f062a76a95"'::jsonb  -- edit
    UNION ALL SELECT '"b21862c1-07c2-509f-bf08-dd9a6fc2c127"'::jsonb  -- delete
    UNION ALL SELECT '"3d811050-5f43-5d01-adba-c7b91a2f069a"'::jsonb  -- view_confidential
    UNION ALL SELECT '"d558fe70-8e26-5cc5-a7b6-1f58024cde37"'::jsonb  -- categories.manage
  ) sub
) WHERE code = 'PERSONAL' AND tenant_id IS NULL;

-- VORGESETZTER: view + create + edit (no delete, no view_confidential, no category manage)
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"de018506-94a3-5363-b6d9-3390beb5798f"'::jsonb  -- view
    UNION ALL SELECT '"caa57531-3455-5572-b989-b2198c820223"'::jsonb  -- create
    UNION ALL SELECT '"c4e01128-e4d5-573e-906e-90f062a76a95"'::jsonb  -- edit
  ) sub
) WHERE code = 'VORGESETZTER' AND tenant_id IS NULL;

-- ADMIN: all 6 permissions
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"de018506-94a3-5363-b6d9-3390beb5798f"'::jsonb  -- view
    UNION ALL SELECT '"caa57531-3455-5572-b989-b2198c820223"'::jsonb  -- create
    UNION ALL SELECT '"c4e01128-e4d5-573e-906e-90f062a76a95"'::jsonb  -- edit
    UNION ALL SELECT '"b21862c1-07c2-509f-bf08-dd9a6fc2c127"'::jsonb  -- delete
    UNION ALL SELECT '"3d811050-5f43-5d01-adba-c7b91a2f069a"'::jsonb  -- view_confidential
    UNION ALL SELECT '"d558fe70-8e26-5cc5-a7b6-1f58024cde37"'::jsonb  -- categories.manage
  ) sub
) WHERE code = 'ADMIN' AND tenant_id IS NULL;
