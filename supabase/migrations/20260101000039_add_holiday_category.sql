-- Add holiday category to support ZMI categories 1/2/3
ALTER TABLE holidays
    ADD COLUMN holiday_category INT NOT NULL DEFAULT 1;

-- Backfill from legacy is_half_day flag
UPDATE holidays
SET holiday_category = CASE WHEN is_half_day THEN 2 ELSE 1 END;

ALTER TABLE holidays
    ADD CONSTRAINT holidays_category_check CHECK (holiday_category IN (1, 2, 3));

COMMENT ON COLUMN holidays.holiday_category IS 'Holiday credit category (1=full, 2=half, 3=custom)';

-- Remove legacy half-day flag
ALTER TABLE holidays
    DROP COLUMN is_half_day;
