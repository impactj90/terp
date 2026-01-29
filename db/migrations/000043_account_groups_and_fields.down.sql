-- Revert account_type enum values: day -> tracking, month -> balance
UPDATE accounts SET account_type = 'tracking' WHERE account_type = 'day';
UPDATE accounts SET account_type = 'balance' WHERE account_type = 'month';

-- Remove new columns from accounts
ALTER TABLE accounts
    DROP COLUMN IF EXISTS bonus_factor,
    DROP COLUMN IF EXISTS display_format,
    DROP COLUMN IF EXISTS account_group_id;

-- Drop account groups table
DROP TABLE IF EXISTS account_groups;
