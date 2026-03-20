-- E-Invoice (ZUGFeRD / XRechnung) fields
-- Ticket: ORD_ERECHNUNG

-- BillingTenantConfig: E-Invoice settings + structured seller address
ALTER TABLE billing_tenant_configs ADD COLUMN tax_number VARCHAR(50);
ALTER TABLE billing_tenant_configs ADD COLUMN leitweg_id VARCHAR(50);
ALTER TABLE billing_tenant_configs ADD COLUMN e_invoice_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE billing_tenant_configs ADD COLUMN company_street VARCHAR(255);
ALTER TABLE billing_tenant_configs ADD COLUMN company_zip VARCHAR(20);
ALTER TABLE billing_tenant_configs ADD COLUMN company_city VARCHAR(100);
ALTER TABLE billing_tenant_configs ADD COLUMN company_country VARCHAR(10) DEFAULT 'DE';

-- BillingDocument: XML storage path
ALTER TABLE billing_documents ADD COLUMN e_invoice_xml_url TEXT;

-- CrmAddress: Leitweg-ID for B2G recipients
ALTER TABLE crm_addresses ADD COLUMN leitweg_id VARCHAR(50);
