-- =============================================================
-- Add platform.support_access.grant permission to ADMIN groups
-- =============================================================
--
-- Permission UUID (UUIDv5 with namespace f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1):
--   platform.support_access.grant = 0c0883b0-2d42-54c0-813c-f28062e605c9
--
-- Note: admin access is granted via is_admin=true bypass in TypeScript
-- (src/lib/auth/permissions.ts:73-93), so this JSONB entry is not required
-- for functionality — it's maintained for parity with other permissions.

UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"0c0883b0-2d42-54c0-813c-f28062e605c9"'::jsonb  -- platform.support_access.grant
  ) sub
) WHERE is_admin = TRUE;
