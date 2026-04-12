-- Re-activate legacy English booking types
UPDATE booking_types
SET is_active = true,
    updated_at = NOW()
WHERE code IN ('COME', 'GO', 'BREAK_START', 'BREAK_END')
  AND tenant_id IS NULL
  AND is_system = true;
