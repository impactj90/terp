-- Remove approval status from daily values

DROP INDEX IF EXISTS idx_daily_values_status;
ALTER TABLE daily_values DROP COLUMN IF EXISTS status;
