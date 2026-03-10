-- Add approval status to daily values

ALTER TABLE daily_values
ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'calculated';

-- Backfill status based on existing error state
UPDATE daily_values
SET status = CASE
    WHEN has_error = true THEN 'error'
    ELSE 'calculated'
END;

-- Index for status filtering
CREATE INDEX idx_daily_values_status ON daily_values(status);
