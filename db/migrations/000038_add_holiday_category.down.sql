-- Re-add legacy half-day flag
ALTER TABLE holidays
    ADD COLUMN is_half_day BOOLEAN DEFAULT false;

-- Restore half-day values from category 2
UPDATE holidays
SET is_half_day = (holiday_category = 2);

ALTER TABLE holidays
    DROP CONSTRAINT IF EXISTS holidays_category_check;

ALTER TABLE holidays
    DROP COLUMN holiday_category;
