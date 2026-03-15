-- Add location_id to employees table
ALTER TABLE employees
  ADD COLUMN location_id UUID REFERENCES locations(id) ON DELETE SET NULL;

-- Index for filtering employees by location
CREATE INDEX idx_employees_location ON employees (location_id);
