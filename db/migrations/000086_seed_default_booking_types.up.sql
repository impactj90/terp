-- Seed default system booking types (idempotent).
-- These are visible to all tenants via tenant_id IS NULL.

INSERT INTO booking_types (tenant_id, code, name, description, direction, category, is_system, is_active)
VALUES
    -- Work: Clock In / Out
    (NULL, 'A1', 'Kommen',            'Arbeitsbeginn',       'in',  'work',          true, true),
    (NULL, 'A2', 'Gehen',             'Arbeitsende',         'out', 'work',          true, true),

    -- Break: Start / End
    (NULL, 'P1', 'Pause Beginn',      'Pausenbeginn',        'out', 'break',         true, true),
    (NULL, 'P2', 'Pause Ende',        'Pausenende',          'in',  'break',         true, true),

    -- Business trip: Start / End
    (NULL, 'D1', 'Dienstgang Beginn', 'Dienstgang Start',    'out', 'business_trip', true, true),
    (NULL, 'D2', 'Dienstgang Ende',   'Dienstgang Ende',     'in',  'business_trip', true, true)
ON CONFLICT (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'), code)
DO UPDATE SET
    name        = EXCLUDED.name,
    description = EXCLUDED.description,
    direction   = EXCLUDED.direction,
    category    = EXCLUDED.category,
    is_active   = true;
