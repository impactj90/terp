-- =============================================================
-- Create employee_messages and employee_message_recipients tables
-- ZMI-TICKET-026: Employee Messages and Notifications
-- =============================================================

CREATE TABLE employee_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_employee_messages_tenant ON employee_messages(tenant_id);
CREATE INDEX idx_employee_messages_sender ON employee_messages(sender_id);
CREATE INDEX idx_employee_messages_tenant_created ON employee_messages(tenant_id, created_at DESC);

CREATE TRIGGER update_employee_messages_updated_at
    BEFORE UPDATE ON employee_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE employee_messages IS 'Messages created by users to be sent to employees (ZMI-TICKET-026).';

CREATE TABLE employee_message_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES employee_messages(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    sent_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_emr_message ON employee_message_recipients(message_id);
CREATE INDEX idx_emr_employee ON employee_message_recipients(employee_id);
CREATE INDEX idx_emr_status ON employee_message_recipients(status);
CREATE INDEX idx_emr_pending ON employee_message_recipients(status) WHERE status = 'pending';

CREATE TRIGGER update_employee_message_recipients_updated_at
    BEFORE UPDATE ON employee_message_recipients
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE employee_message_recipients IS 'Per-recipient delivery status for employee messages.';
COMMENT ON COLUMN employee_message_recipients.status IS 'Delivery status: pending, sent, or failed.';
