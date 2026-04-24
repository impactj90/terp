-- Plan: 2026-04-22-workreport-arbeitsschein-m1.md
-- Phase 1, Migration C: add work_reports.* permissions to default system
-- user groups. Pattern: additive jsonb_agg(DISTINCT val) UPDATE — idempotent,
-- safe to re-run (existing permissions deduped, new ones added).
--
-- Permission UUIDs (UUIDv5 with namespace f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1):
--   work_reports.view   = 3900e091-b05b-588c-a33c-b0dbbcc9390e
--   work_reports.manage = 765828bb-fc82-54bc-bccd-090a9b1ceee7
--   work_reports.sign   = 8adc32f0-34d6-511c-98ea-047b33b4fe0e
--   work_reports.void   = 5b0caa91-6571-5b04-a5bb-ecd382f042b3
--
-- Assignment matrix:
--
-- | Permission          | ADMIN | PERSONAL | VERTRIEB | VORGESETZTER | MITARBEITER |
-- | work_reports.view   |   X   |    X     |    X     |              |      X      |
-- | work_reports.manage |   X   |    X     |    X     |              |      X      |
-- | work_reports.sign   |   X   |    X     |    X     |              |      X      |
-- | work_reports.void   |   X   |          |          |              |             |
--
-- VORGESETZTER is explicitly NOT granted any work_reports permission (it is a
-- shift-planning supervisor role, not a field-service / office role).
-- `void` is ADMIN-only: only admins may cancel a signed Arbeitsschein.

-- ADMIN: all 4 (view + manage + sign + void)
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"3900e091-b05b-588c-a33c-b0dbbcc9390e"'::jsonb  -- work_reports.view
    UNION ALL SELECT '"765828bb-fc82-54bc-bccd-090a9b1ceee7"'::jsonb  -- work_reports.manage
    UNION ALL SELECT '"8adc32f0-34d6-511c-98ea-047b33b4fe0e"'::jsonb  -- work_reports.sign
    UNION ALL SELECT '"5b0caa91-6571-5b04-a5bb-ecd382f042b3"'::jsonb  -- work_reports.void
  ) sub
) WHERE code = 'ADMIN' AND tenant_id IS NULL;

-- PERSONAL, VERTRIEB, MITARBEITER: view + manage + sign (no void)
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"3900e091-b05b-588c-a33c-b0dbbcc9390e"'::jsonb  -- work_reports.view
    UNION ALL SELECT '"765828bb-fc82-54bc-bccd-090a9b1ceee7"'::jsonb  -- work_reports.manage
    UNION ALL SELECT '"8adc32f0-34d6-511c-98ea-047b33b4fe0e"'::jsonb  -- work_reports.sign
  ) sub
) WHERE code IN ('PERSONAL', 'VERTRIEB', 'MITARBEITER') AND tenant_id IS NULL;
