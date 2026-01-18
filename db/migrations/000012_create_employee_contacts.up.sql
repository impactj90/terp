CREATE TABLE employee_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    contact_type VARCHAR(50) NOT NULL, -- 'email', 'phone', 'mobile', 'emergency'
    value VARCHAR(255) NOT NULL,
    label VARCHAR(100), -- 'work', 'personal', 'emergency contact name'
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_employee_contacts_employee ON employee_contacts(employee_id);
CREATE INDEX idx_employee_contacts_type ON employee_contacts(employee_id, contact_type);
