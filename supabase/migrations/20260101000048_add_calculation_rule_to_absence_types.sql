-- Add calculation rule FK to absence_types
ALTER TABLE absence_types
    ADD COLUMN calculation_rule_id UUID REFERENCES calculation_rules(id) ON DELETE SET NULL;

CREATE INDEX idx_absence_types_calculation_rule ON absence_types(calculation_rule_id);

COMMENT ON COLUMN absence_types.calculation_rule_id IS 'Optional calculation rule that determines account value when this absence type is applied';
