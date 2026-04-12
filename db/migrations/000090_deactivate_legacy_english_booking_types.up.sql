-- Deactivate legacy English booking types seeded in migration 000021.
-- These are duplicates of the German system types (A1/A2/P1/P2/D1/D2)
-- seeded in migration 000086 and should no longer appear in dropdowns.

UPDATE booking_types
SET is_active = false,
    updated_at = NOW()
WHERE code IN ('COME', 'GO', 'BREAK_START', 'BREAK_END')
  AND tenant_id IS NULL
  AND is_system = true;
