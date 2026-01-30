DROP INDEX IF EXISTS idx_employee_contacts_kind;
ALTER TABLE employee_contacts DROP COLUMN IF EXISTS contact_kind_id;
