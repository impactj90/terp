-- Remove system-level default booking types seeded by this migration.
DELETE FROM booking_types
WHERE tenant_id IS NULL
  AND code IN ('A1', 'A2', 'P1', 'P2', 'D1', 'D2');
