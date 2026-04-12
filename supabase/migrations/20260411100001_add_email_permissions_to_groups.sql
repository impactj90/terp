-- EMAIL_01: Add email permissions to system groups
--
-- Permission UUIDs (UUIDv5 with namespace f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1):
--   documents.send        = d458c12b-a4ac-5c22-80dd-fd5642b79307
--   email_templates.view  = d985d275-3d4d-5801-9f3b-04d421a9ad1d
--   email_templates.manage = 0fa32e88-1f56-5123-b73a-13b3a280c313
--   email_smtp.view       = 08c76061-aaee-52df-ae37-32c36ac660b0
--   email_smtp.manage     = 11c9fcd5-46ac-5bf3-93ab-0e60f50420db

-- ADMIN: all 5 email permissions
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"d458c12b-a4ac-5c22-80dd-fd5642b79307"'::jsonb  -- documents.send
    UNION ALL SELECT '"d985d275-3d4d-5801-9f3b-04d421a9ad1d"'::jsonb  -- email_templates.view
    UNION ALL SELECT '"0fa32e88-1f56-5123-b73a-13b3a280c313"'::jsonb  -- email_templates.manage
    UNION ALL SELECT '"08c76061-aaee-52df-ae37-32c36ac660b0"'::jsonb  -- email_smtp.view
    UNION ALL SELECT '"11c9fcd5-46ac-5bf3-93ab-0e60f50420db"'::jsonb  -- email_smtp.manage
  ) sub
) WHERE code = 'ADMIN' AND tenant_id IS NULL;

-- PERSONAL: all 5 email permissions
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"d458c12b-a4ac-5c22-80dd-fd5642b79307"'::jsonb  -- documents.send
    UNION ALL SELECT '"d985d275-3d4d-5801-9f3b-04d421a9ad1d"'::jsonb  -- email_templates.view
    UNION ALL SELECT '"0fa32e88-1f56-5123-b73a-13b3a280c313"'::jsonb  -- email_templates.manage
    UNION ALL SELECT '"08c76061-aaee-52df-ae37-32c36ac660b0"'::jsonb  -- email_smtp.view
    UNION ALL SELECT '"11c9fcd5-46ac-5bf3-93ab-0e60f50420db"'::jsonb  -- email_smtp.manage
  ) sub
) WHERE code = 'PERSONAL' AND tenant_id IS NULL;

-- BUCHHALTUNG: documents.send + template view
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"d458c12b-a4ac-5c22-80dd-fd5642b79307"'::jsonb  -- documents.send
    UNION ALL SELECT '"d985d275-3d4d-5801-9f3b-04d421a9ad1d"'::jsonb  -- email_templates.view
  ) sub
) WHERE code = 'BUCHHALTUNG' AND tenant_id IS NULL;

-- VORGESETZTER: documents.send + template view
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"d458c12b-a4ac-5c22-80dd-fd5642b79307"'::jsonb  -- documents.send
    UNION ALL SELECT '"d985d275-3d4d-5801-9f3b-04d421a9ad1d"'::jsonb  -- email_templates.view
  ) sub
) WHERE code = 'VORGESETZTER' AND tenant_id IS NULL;
