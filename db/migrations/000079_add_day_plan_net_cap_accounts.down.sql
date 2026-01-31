DROP TABLE IF EXISTS daily_account_values;
ALTER TABLE day_plans
    DROP COLUMN IF EXISTS net_account_id,
    DROP COLUMN IF EXISTS cap_account_id;
