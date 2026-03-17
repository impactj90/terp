-- CRM_04: Tasks & Messages (Aufgaben & Nachrichten)

CREATE TYPE crm_task_type AS ENUM ('TASK', 'MESSAGE');
CREATE TYPE crm_task_status AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

CREATE TABLE crm_tasks (
    id               UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID              NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    type             crm_task_type     NOT NULL DEFAULT 'TASK',
    subject          VARCHAR(255)      NOT NULL,
    description      TEXT,
    address_id       UUID              REFERENCES crm_addresses(id) ON DELETE SET NULL,
    contact_id       UUID              REFERENCES crm_contacts(id) ON DELETE SET NULL,
    inquiry_id       UUID              REFERENCES crm_inquiries(id) ON DELETE SET NULL,
    status           crm_task_status   NOT NULL DEFAULT 'OPEN',
    due_at           TIMESTAMPTZ,
    due_time         VARCHAR(5),
    duration_min     INTEGER,
    attachments      JSONB,
    completed_at     TIMESTAMPTZ,
    completed_by_id  UUID,
    created_at       TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    created_by_id    UUID
);

CREATE INDEX idx_crm_tasks_tenant_status ON crm_tasks(tenant_id, status);
CREATE INDEX idx_crm_tasks_tenant_due ON crm_tasks(tenant_id, due_at);
CREATE INDEX idx_crm_tasks_tenant_address ON crm_tasks(tenant_id, address_id);
CREATE INDEX idx_crm_tasks_tenant_inquiry ON crm_tasks(tenant_id, inquiry_id);

CREATE TABLE crm_task_assignees (
    id               UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id          UUID              NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
    employee_id      UUID              REFERENCES employees(id) ON DELETE CASCADE,
    team_id          UUID              REFERENCES teams(id) ON DELETE CASCADE,
    read_at          TIMESTAMPTZ,
    created_at       TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_crm_task_assignees_task_employee UNIQUE (task_id, employee_id),
    CONSTRAINT uq_crm_task_assignees_task_team UNIQUE (task_id, team_id)
);

CREATE INDEX idx_crm_task_assignees_employee ON crm_task_assignees(employee_id);
CREATE INDEX idx_crm_task_assignees_team ON crm_task_assignees(team_id);

-- Trigger for updated_at
CREATE TRIGGER set_crm_tasks_updated_at
  BEFORE UPDATE ON crm_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
