-- Plan: 2026-04-22-serviceobjekte-wartungsintervalle.md
-- Phase A: dual-purpose migration adding both T-1 service_objects.* and
-- T-3 service_schedules.* permissions to default system user groups.
-- The T-1 assignments were missed in the original T-1 plan migrations
-- and are back-filled here alongside the T-3 ones.
--
-- Pattern: additive jsonb_agg(DISTINCT val) UPDATE — idempotent, safe to
-- re-run (existing permissions deduped, new ones added).
--
-- Permission UUIDs (UUIDv5 with namespace f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1):
--   service_objects.view              = 7fc132e2-bfb3-52ca-b44d-9e8d8070ac97
--   service_objects.manage            = 24697619-5834-5b79-a029-3af139bf3e0d
--   service_objects.delete            = 7a25a60c-31e8-5e72-9d9c-89e7a833f2b8
--   service_schedules.view            = 085b1694-1faf-5455-8723-b4671c797365
--   service_schedules.manage          = 15377062-13ef-540b-8645-bf2bb3b07995
--   service_schedules.delete          = 07aea3f4-0f6a-511f-861d-42be0a8271b2
--   service_schedules.generate_order  = cb3cd064-7b1f-50bf-82fd-835f97eb961f
--
-- Assignment matrix:
--
-- | Permission                          | PERSONAL | VERTRIEB | VORGESETZTER | MITARBEITER |
-- | service_objects.view                |    X     |    X     |      X       |      X      |
-- | service_objects.manage              |    X     |    X     |              |             |
-- | service_objects.delete              |    X     |          |              |             |
-- | service_schedules.view              |    X     |    X     |      X       |      X      |
-- | service_schedules.manage            |    X     |    X     |              |             |
-- | service_schedules.delete            |    X     |          |              |             |
-- | service_schedules.generate_order    |    X     |    X     |              |             |

-- PERSONAL: all 7 permissions (view/manage/delete on both resources + generate_order)
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"7fc132e2-bfb3-52ca-b44d-9e8d8070ac97"'::jsonb  -- service_objects.view
    UNION ALL SELECT '"24697619-5834-5b79-a029-3af139bf3e0d"'::jsonb  -- service_objects.manage
    UNION ALL SELECT '"7a25a60c-31e8-5e72-9d9c-89e7a833f2b8"'::jsonb  -- service_objects.delete
    UNION ALL SELECT '"085b1694-1faf-5455-8723-b4671c797365"'::jsonb  -- service_schedules.view
    UNION ALL SELECT '"15377062-13ef-540b-8645-bf2bb3b07995"'::jsonb  -- service_schedules.manage
    UNION ALL SELECT '"07aea3f4-0f6a-511f-861d-42be0a8271b2"'::jsonb  -- service_schedules.delete
    UNION ALL SELECT '"cb3cd064-7b1f-50bf-82fd-835f97eb961f"'::jsonb  -- service_schedules.generate_order
  ) sub
) WHERE code = 'PERSONAL' AND tenant_id IS NULL;

-- VERTRIEB: view + manage + generate_order (no delete)
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"7fc132e2-bfb3-52ca-b44d-9e8d8070ac97"'::jsonb  -- service_objects.view
    UNION ALL SELECT '"24697619-5834-5b79-a029-3af139bf3e0d"'::jsonb  -- service_objects.manage
    UNION ALL SELECT '"085b1694-1faf-5455-8723-b4671c797365"'::jsonb  -- service_schedules.view
    UNION ALL SELECT '"15377062-13ef-540b-8645-bf2bb3b07995"'::jsonb  -- service_schedules.manage
    UNION ALL SELECT '"cb3cd064-7b1f-50bf-82fd-835f97eb961f"'::jsonb  -- service_schedules.generate_order
  ) sub
) WHERE code = 'VERTRIEB' AND tenant_id IS NULL;

-- VORGESETZTER: view only
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"7fc132e2-bfb3-52ca-b44d-9e8d8070ac97"'::jsonb  -- service_objects.view
    UNION ALL SELECT '"085b1694-1faf-5455-8723-b4671c797365"'::jsonb  -- service_schedules.view
  ) sub
) WHERE code = 'VORGESETZTER' AND tenant_id IS NULL;

-- MITARBEITER: view only
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"7fc132e2-bfb3-52ca-b44d-9e8d8070ac97"'::jsonb  -- service_objects.view
    UNION ALL SELECT '"085b1694-1faf-5455-8723-b4671c797365"'::jsonb  -- service_schedules.view
  ) sub
) WHERE code = 'MITARBEITER' AND tenant_id IS NULL;
