-- Remove system-level default absence types seeded by this migration.
-- Only deletes types where tenant_id IS NULL (system types).
DELETE FROM absence_types
WHERE tenant_id IS NULL
  AND code IN ('U', 'UH', 'K', 'KH', 'KK', 'SU', 'SB', 'FT', 'DG', 'UU');
