-- H-015: Add deduplication columns to macro_assignments
-- Prevents macros from executing multiple times per day when cron runs every 15 minutes.

ALTER TABLE macro_assignments
  ADD COLUMN last_executed_at TIMESTAMPTZ,
  ADD COLUMN last_executed_date DATE;

CREATE INDEX idx_macro_assignments_last_executed_date
  ON macro_assignments (last_executed_date);
