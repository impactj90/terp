CREATE TABLE employee_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    card_number VARCHAR(100) NOT NULL,
    card_type VARCHAR(50) DEFAULT 'rfid', -- 'rfid', 'barcode', 'qr'
    valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_to DATE,
    is_active BOOLEAN DEFAULT true,
    deactivated_at TIMESTAMPTZ,
    deactivation_reason VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, card_number)
);

CREATE INDEX idx_employee_cards_employee ON employee_cards(employee_id);
CREATE INDEX idx_employee_cards_card ON employee_cards(tenant_id, card_number);
CREATE INDEX idx_employee_cards_active ON employee_cards(tenant_id, is_active);
