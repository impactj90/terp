-- Drop join table first (depends on groups and booking_types)
DROP TABLE IF EXISTS booking_type_group_members;

-- Drop booking type groups
DROP TABLE IF EXISTS booking_type_groups;

-- Drop booking reasons
DROP TABLE IF EXISTS booking_reasons;

-- Remove new columns from booking_types
ALTER TABLE booking_types
    DROP COLUMN IF EXISTS requires_reason,
    DROP COLUMN IF EXISTS account_id,
    DROP COLUMN IF EXISTS category;
