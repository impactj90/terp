-- =============================================================
-- Create inbound invoice tables for Eingangsrechnungen module
-- Tables: tenant_imap_configs, inbound_email_log, inbound_invoices,
--         inbound_invoice_line_items, inbound_invoice_approval_policies,
--         inbound_invoice_approvals
-- =============================================================

-- tenant_imap_configs: Per-tenant IMAP server configuration
CREATE TABLE tenant_imap_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  host VARCHAR(255) NOT NULL,
  port INTEGER NOT NULL DEFAULT 993,
  username VARCHAR(255) NOT NULL,
  password VARCHAR(500) NOT NULL,
  encryption VARCHAR(10) NOT NULL DEFAULT 'SSL' CHECK (encryption IN ('SSL', 'STARTTLS', 'NONE')),
  mailbox VARCHAR(255) NOT NULL DEFAULT 'INBOX',
  is_verified BOOLEAN NOT NULL DEFAULT false,
  verified_at TIMESTAMPTZ,
  -- IMAP polling state
  uid_validity BIGINT,
  uid_next INTEGER,
  last_poll_at TIMESTAMPTZ,
  last_poll_error TEXT,
  last_poll_error_at TIMESTAMPTZ,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id)
);

-- inbound_email_log: Log of all processed inbound emails
CREATE TABLE inbound_email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  message_id VARCHAR(500),
  from_email VARCHAR(255),
  subject VARCHAR(500),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  uid INTEGER,
  status VARCHAR(30) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processed', 'failed', 'skipped_no_attachment', 'skipped_no_pdf', 'skipped_duplicate')),
  error_message TEXT,
  attachment_count INTEGER NOT NULL DEFAULT 0,
  invoice_id UUID,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inbound_email_log_tenant ON inbound_email_log(tenant_id, created_at DESC);
CREATE INDEX idx_inbound_email_log_status ON inbound_email_log(status) WHERE status IN ('pending', 'failed');
CREATE UNIQUE INDEX idx_inbound_email_log_message_id ON inbound_email_log(tenant_id, message_id) WHERE message_id IS NOT NULL;

-- inbound_invoices: Main inbound invoice table
CREATE TABLE inbound_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  number VARCHAR(50) NOT NULL,
  -- Source tracking
  source VARCHAR(20) NOT NULL DEFAULT 'manual' CHECK (source IN ('imap', 'manual', 'zugferd')),
  source_email_log_id UUID REFERENCES inbound_email_log(id) ON DELETE SET NULL,
  source_message_id VARCHAR(500),
  -- Supplier
  supplier_id UUID REFERENCES crm_addresses(id) ON DELETE SET NULL,
  supplier_status VARCHAR(20) NOT NULL DEFAULT 'matched'
    CHECK (supplier_status IN ('matched', 'unknown', 'pending_review')),
  -- Invoice data
  invoice_number VARCHAR(100),
  invoice_date DATE,
  due_date DATE,
  total_net NUMERIC(12,2),
  total_vat NUMERIC(12,2),
  total_gross NUMERIC(12,2),
  currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
  payment_term_days INTEGER,
  -- Seller info from ZUGFeRD (may not match CrmAddress yet)
  seller_name VARCHAR(255),
  seller_vat_id VARCHAR(50),
  seller_tax_number VARCHAR(50),
  seller_street VARCHAR(255),
  seller_zip VARCHAR(20),
  seller_city VARCHAR(100),
  seller_country VARCHAR(5),
  seller_iban VARCHAR(34),
  seller_bic VARCHAR(11),
  -- Buyer info from ZUGFeRD
  buyer_name VARCHAR(255),
  buyer_vat_id VARCHAR(50),
  buyer_reference VARCHAR(100),
  -- ZUGFeRD
  zugferd_profile VARCHAR(30),
  zugferd_raw_xml TEXT,
  -- PDF storage
  pdf_storage_path TEXT,
  pdf_original_filename VARCHAR(255),
  -- Workflow
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'EXPORTED', 'CANCELLED')),
  approval_version INTEGER NOT NULL DEFAULT 1,
  submitted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ,
  -- DATEV
  datev_exported_at TIMESTAMPTZ,
  datev_exported_by UUID REFERENCES users(id) ON DELETE SET NULL,
  -- Notes
  notes TEXT,
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_inbound_invoices_tenant_status ON inbound_invoices(tenant_id, status);
CREATE INDEX idx_inbound_invoices_tenant_supplier ON inbound_invoices(tenant_id, supplier_id);
CREATE INDEX idx_inbound_invoices_tenant_date ON inbound_invoices(tenant_id, invoice_date DESC);
CREATE UNIQUE INDEX idx_inbound_invoices_dedup_supplier ON inbound_invoices(tenant_id, supplier_id, invoice_number)
  WHERE supplier_id IS NOT NULL AND invoice_number IS NOT NULL;
CREATE UNIQUE INDEX idx_inbound_invoices_dedup_message ON inbound_invoices(tenant_id, source_message_id)
  WHERE source_message_id IS NOT NULL;

-- inbound_invoice_line_items: Line items per invoice
CREATE TABLE inbound_invoice_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES inbound_invoices(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  article_number VARCHAR(100),
  description TEXT,
  quantity NUMERIC(12,4),
  unit VARCHAR(20),
  unit_price_net NUMERIC(12,4),
  total_net NUMERIC(12,2),
  vat_rate NUMERIC(5,2),
  vat_amount NUMERIC(12,2),
  total_gross NUMERIC(12,2),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inbound_invoice_line_items_invoice ON inbound_invoice_line_items(invoice_id);

-- inbound_invoice_approval_policies: Configurable approval threshold rules
CREATE TABLE inbound_invoice_approval_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  amount_min NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount_max NUMERIC(12,2),
  step_order INTEGER NOT NULL DEFAULT 1,
  approver_group_id UUID REFERENCES user_groups(id) ON DELETE SET NULL,
  approver_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (approver_group_id IS NOT NULL OR approver_user_id IS NOT NULL)
);

CREATE INDEX idx_approval_policies_tenant ON inbound_invoice_approval_policies(tenant_id, is_active, amount_min, amount_max);

-- inbound_invoice_approvals: Individual approval step records
CREATE TABLE inbound_invoice_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES inbound_invoices(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  approval_version INTEGER NOT NULL,
  -- Who should approve
  approver_group_id UUID REFERENCES user_groups(id) ON DELETE SET NULL,
  approver_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  -- Decision
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'INVALIDATED')),
  decided_by UUID REFERENCES users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  rejection_reason TEXT,
  -- Escalation
  due_at TIMESTAMPTZ,
  last_reminder_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_approvals_invoice ON inbound_invoice_approvals(invoice_id, approval_version, step_order);
CREATE INDEX idx_approvals_pending ON inbound_invoice_approvals(tenant_id, status, due_at)
  WHERE status = 'PENDING';
CREATE INDEX idx_approvals_approver ON inbound_invoice_approvals(approver_user_id, status)
  WHERE status = 'PENDING';
