-- CRM_06: Add "our customer number at supplier" field
ALTER TABLE crm_addresses
ADD COLUMN our_customer_number VARCHAR(50);
