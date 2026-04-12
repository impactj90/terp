-- HR_01: Create personnel file tables (Personalakte)
-- Categories, entries, and attachments for employee personnel files

-- =============================================================
-- 1. hr_personnel_file_categories
-- =============================================================
CREATE TABLE hr_personnel_file_categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            VARCHAR(100) NOT NULL,
  code            VARCHAR(50) NOT NULL,
  description     TEXT,
  color           VARCHAR(7),
  sort_order      INTEGER NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  visible_to_roles TEXT[] NOT NULL DEFAULT ARRAY['admin'],
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT hr_personnel_file_categories_tenant_code_unique UNIQUE (tenant_id, code)
);

CREATE INDEX idx_hr_personnel_file_categories_tenant ON hr_personnel_file_categories (tenant_id);

-- Auto-update updated_at
CREATE TRIGGER update_hr_personnel_file_categories_updated_at
  BEFORE UPDATE ON hr_personnel_file_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================
-- 2. hr_personnel_file_entries
-- =============================================================
CREATE TABLE hr_personnel_file_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  category_id     UUID NOT NULL REFERENCES hr_personnel_file_categories(id),
  title           VARCHAR(255) NOT NULL,
  description     TEXT,
  entry_date      DATE NOT NULL,
  expires_at      DATE,
  reminder_date   DATE,
  reminder_note   TEXT,
  is_confidential BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id   UUID

);

CREATE INDEX idx_hr_personnel_file_entries_tenant_employee ON hr_personnel_file_entries (tenant_id, employee_id);
CREATE INDEX idx_hr_personnel_file_entries_tenant_category ON hr_personnel_file_entries (tenant_id, category_id);
CREATE INDEX idx_hr_personnel_file_entries_tenant_reminder ON hr_personnel_file_entries (tenant_id, reminder_date);
CREATE INDEX idx_hr_personnel_file_entries_tenant_expires ON hr_personnel_file_entries (tenant_id, expires_at);

-- Auto-update updated_at
CREATE TRIGGER update_hr_personnel_file_entries_updated_at
  BEFORE UPDATE ON hr_personnel_file_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================
-- 3. hr_personnel_file_attachments
-- =============================================================
CREATE TABLE hr_personnel_file_attachments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id        UUID NOT NULL REFERENCES hr_personnel_file_entries(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  filename        VARCHAR(255) NOT NULL,
  storage_path    TEXT NOT NULL,
  mime_type       VARCHAR(100) NOT NULL,
  size_bytes      INTEGER NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id   UUID
);

CREATE INDEX idx_hr_personnel_file_attachments_entry ON hr_personnel_file_attachments (entry_id);
CREATE INDEX idx_hr_personnel_file_attachments_tenant ON hr_personnel_file_attachments (tenant_id);
