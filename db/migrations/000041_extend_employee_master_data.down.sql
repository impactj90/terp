ALTER TABLE employees
    DROP CONSTRAINT IF EXISTS chk_employee_gender,
    DROP CONSTRAINT IF EXISTS chk_employee_marital_status;

ALTER TABLE employees
    DROP COLUMN IF EXISTS exit_reason,
    DROP COLUMN IF EXISTS notes,
    DROP COLUMN IF EXISTS address_street,
    DROP COLUMN IF EXISTS address_zip,
    DROP COLUMN IF EXISTS address_city,
    DROP COLUMN IF EXISTS address_country,
    DROP COLUMN IF EXISTS birth_date,
    DROP COLUMN IF EXISTS gender,
    DROP COLUMN IF EXISTS nationality,
    DROP COLUMN IF EXISTS religion,
    DROP COLUMN IF EXISTS marital_status,
    DROP COLUMN IF EXISTS birth_place,
    DROP COLUMN IF EXISTS birth_country,
    DROP COLUMN IF EXISTS room_number,
    DROP COLUMN IF EXISTS photo_url,
    DROP COLUMN IF EXISTS employee_group_id,
    DROP COLUMN IF EXISTS workflow_group_id,
    DROP COLUMN IF EXISTS activity_group_id,
    DROP COLUMN IF EXISTS part_time_percent,
    DROP COLUMN IF EXISTS disability_flag,
    DROP COLUMN IF EXISTS daily_target_hours,
    DROP COLUMN IF EXISTS weekly_target_hours,
    DROP COLUMN IF EXISTS monthly_target_hours,
    DROP COLUMN IF EXISTS annual_target_hours,
    DROP COLUMN IF EXISTS work_days_per_week,
    DROP COLUMN IF EXISTS calculation_start_date;

DROP TABLE IF EXISTS activity_groups;
DROP TABLE IF EXISTS workflow_groups;
DROP TABLE IF EXISTS employee_groups;
