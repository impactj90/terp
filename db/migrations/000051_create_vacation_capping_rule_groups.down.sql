ALTER TABLE tariffs DROP COLUMN IF EXISTS vacation_capping_rule_group_id;
DROP TABLE IF EXISTS vacation_capping_rule_group_rules;
DROP TABLE IF EXISTS vacation_capping_rule_groups;
