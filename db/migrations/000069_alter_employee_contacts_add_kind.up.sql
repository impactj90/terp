-- Add contact_kind_id column (nullable initially for backward compatibility)
ALTER TABLE employee_contacts
    ADD COLUMN contact_kind_id UUID REFERENCES contact_kinds(id) ON DELETE SET NULL;

CREATE INDEX idx_employee_contacts_kind ON employee_contacts(contact_kind_id);

COMMENT ON COLUMN employee_contacts.contact_kind_id IS 'Reference to configurable contact kind. Replaces legacy contact_type column.';
