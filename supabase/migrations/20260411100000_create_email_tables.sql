-- EMAIL_01: Create email infrastructure tables
--
-- Four new tables for per-tenant email sending:
--   - tenant_smtp_configs: Per-tenant SMTP server configuration
--   - email_templates: Per-tenant, per-document-type email templates
--   - email_default_attachments: Default attachments (e.g., AGB) per document type
--   - email_send_log: Full audit trail for all sent emails

-- tenant_smtp_configs: Per-tenant SMTP server configuration (one row per tenant)
CREATE TABLE tenant_smtp_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  host VARCHAR(255) NOT NULL,
  port INTEGER NOT NULL DEFAULT 587,
  username VARCHAR(255) NOT NULL,
  password VARCHAR(500) NOT NULL,
  encryption VARCHAR(10) NOT NULL DEFAULT 'STARTTLS' CHECK (encryption IN ('STARTTLS', 'SSL', 'NONE')),
  from_email VARCHAR(255) NOT NULL,
  from_name VARCHAR(255),
  reply_to_email VARCHAR(255),
  is_verified BOOLEAN NOT NULL DEFAULT false,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id)
);

-- email_templates: Per-tenant, per-document-type email templates
CREATE TABLE email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_type VARCHAR(30) NOT NULL,
  name VARCHAR(255) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  body_html TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_templates_tenant_type ON email_templates(tenant_id, document_type);
-- Ensure only one default template per tenant+type
CREATE UNIQUE INDEX idx_email_templates_default ON email_templates(tenant_id, document_type) WHERE is_default = true;

-- email_default_attachments: Configurable default attachments (e.g., AGB) per document type
CREATE TABLE email_default_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_type VARCHAR(30),
  file_name VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  storage_bucket VARCHAR(100) NOT NULL DEFAULT 'documents',
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_default_attachments_tenant ON email_default_attachments(tenant_id);

-- email_send_log: Full audit trail for all sent emails
CREATE TABLE email_send_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_id UUID,
  document_type VARCHAR(30),
  to_email VARCHAR(255) NOT NULL,
  cc_emails TEXT[],
  subject VARCHAR(500) NOT NULL,
  body_html TEXT NOT NULL,
  template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'retrying')),
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  sent_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_send_log_tenant ON email_send_log(tenant_id);
CREATE INDEX idx_email_send_log_document ON email_send_log(tenant_id, document_id);
CREATE INDEX idx_email_send_log_status ON email_send_log(status, next_retry_at) WHERE status IN ('pending', 'retrying');
