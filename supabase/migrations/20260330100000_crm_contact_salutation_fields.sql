-- CRM_08: Add salutation, title, and letter_salutation to crm_contacts
ALTER TABLE crm_contacts
  ADD COLUMN salutation VARCHAR(20),
  ADD COLUMN title VARCHAR(50),
  ADD COLUMN letter_salutation VARCHAR(255);
