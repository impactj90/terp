-- Seed default system absence types (idempotent).
-- These are visible to all tenants via tenant_id IS NULL.
-- Uses ON CONFLICT to skip existing entries.

INSERT INTO absence_types (tenant_id, code, name, description, category, portion, deducts_vacation, is_system, is_active, color, sort_order)
VALUES
    -- Vacation types (U prefix)
    (NULL, 'U',  'Urlaub',                'Regulärer Urlaubstag',                        'vacation', 1, true,  true, true, '#22c55e', 1),
    (NULL, 'UH', 'Urlaub (halber Tag)',    'Halber Urlaubstag',                           'vacation', 2, true,  true, true, '#4ade80', 2),

    -- Illness types (K prefix)
    (NULL, 'K',  'Krankheit',              'Krankheitstag',                               'illness',  1, false, true, true, '#ef4444', 10),
    (NULL, 'KH', 'Krankheit (halber Tag)', 'Halber Krankheitstag',                        'illness',  2, false, true, true, '#f87171', 11),
    (NULL, 'KK', 'Krankheit Kind',         'Krankheitstag wegen krankem Kind',            'illness',  1, false, true, true, '#fb923c', 12),

    -- Special leave types (S prefix)
    (NULL, 'SU', 'Sonderurlaub',           'Sonderurlaub (Hochzeit, Geburt, Trauerfall)', 'special',  1, false, true, true, '#8b5cf6', 20),
    (NULL, 'SB', 'Berufsschule',           'Berufsschultag',                              'special',  1, false, true, true, '#3b82f6', 21),
    (NULL, 'FT', 'Fortbildung',            'Fort- und Weiterbildung',                     'special',  1, false, true, true, '#06b6d4', 22),
    (NULL, 'DG', 'Dienstgang',             'Dienstgang / Geschäftsreise',                 'special',  1, false, true, true, '#14b8a6', 23),

    -- Unpaid leave
    (NULL, 'UU', 'Unbezahlter Urlaub',     'Unbezahlter Urlaub (keine Zeitgutschrift)',   'unpaid',   0, false, true, true, '#6b7280', 30)
ON CONFLICT (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'), code)
DO UPDATE SET
    name        = EXCLUDED.name,
    description = EXCLUDED.description,
    color       = EXCLUDED.color,
    sort_order  = EXCLUDED.sort_order,
    is_active   = true;
