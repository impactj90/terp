-- =============================================================
-- Add audit_log.export permission (admin-only)
-- =============================================================

-- Permission UUID (UUIDv5 with namespace f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1):
--   audit_log.export = 1c7329b0-4d4a-5569-8ffb-651a1ca829ab

-- ADMIN: add audit_log.export permission
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"1c7329b0-4d4a-5569-8ffb-651a1ca829ab"'::jsonb  -- audit_log.export
  ) sub
) WHERE code = 'ADMIN' AND tenant_id IS NULL;
