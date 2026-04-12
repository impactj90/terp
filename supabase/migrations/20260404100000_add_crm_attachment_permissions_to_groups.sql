-- Add crm_correspondence.upload permission to user groups
-- Permission UUID (UUIDv5 with namespace f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1):
--   crm_correspondence.upload = 0eb338bb-b22d-5675-9de3-6fa6a8924dfa

-- PERSONAL: full access to everything, add upload
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"0eb338bb-b22d-5675-9de3-6fa6a8924dfa"'::jsonb
  ) sub
) WHERE code = 'PERSONAL' AND tenant_id IS NULL;

-- VERTRIEB: CRM full access group, add upload
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"0eb338bb-b22d-5675-9de3-6fa6a8924dfa"'::jsonb
  ) sub
) WHERE code = 'VERTRIEB' AND tenant_id IS NULL;
