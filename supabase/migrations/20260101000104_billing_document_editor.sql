-- Migration 000104: Billing Document Editor
-- Adds headerText/footerText/pdfUrl to billing_documents,
-- creates billing_document_templates and billing_tenant_configs tables.

-- 1. Add free-text fields to billing_documents
ALTER TABLE billing_documents ADD COLUMN header_text TEXT;
ALTER TABLE billing_documents ADD COLUMN footer_text TEXT;
ALTER TABLE billing_documents ADD COLUMN pdf_url TEXT;

-- 2. Document text templates (reusable header/footer per type)
CREATE TABLE billing_document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  document_type billing_document_type,
  header_text TEXT,
  footer_text TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_billing_doc_templates_tenant
  ON billing_document_templates(tenant_id);
CREATE INDEX idx_billing_doc_templates_tenant_type
  ON billing_document_templates(tenant_id, document_type);
CREATE UNIQUE INDEX idx_billing_doc_templates_default
  ON billing_document_templates(tenant_id, document_type)
  WHERE is_default = true;

-- 3. Tenant billing/letterhead configuration (Briefpapier)
CREATE TABLE billing_tenant_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  company_name VARCHAR(255),
  company_address TEXT,
  logo_url TEXT,
  bank_name VARCHAR(255),
  iban VARCHAR(34),
  bic VARCHAR(11),
  tax_id VARCHAR(50),
  commercial_register VARCHAR(255),
  managing_director VARCHAR(255),
  footer_html TEXT,
  phone VARCHAR(50),
  email VARCHAR(255),
  website VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
