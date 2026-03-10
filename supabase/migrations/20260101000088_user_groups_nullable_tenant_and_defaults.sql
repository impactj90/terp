-- Make user_groups.tenant_id nullable to support system-wide default groups.
-- System groups (tenant_id IS NULL) are visible to all tenants.

-- 1. Drop existing unique constraints that assume tenant_id NOT NULL
ALTER TABLE user_groups DROP CONSTRAINT IF EXISTS user_groups_tenant_id_name_key;
DROP INDEX IF EXISTS idx_user_groups_tenant_code;

-- 2. Make tenant_id nullable
ALTER TABLE user_groups ALTER COLUMN tenant_id DROP NOT NULL;

-- 3. Recreate unique constraints with COALESCE pattern (same as absence_types/booking_types)
CREATE UNIQUE INDEX idx_user_groups_tenant_code
    ON user_groups(COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'), code);
CREATE UNIQUE INDEX idx_user_groups_tenant_name
    ON user_groups(COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'), name);

-- 4. Seed default system user groups
INSERT INTO user_groups (tenant_id, code, name, description, permissions, is_admin, is_system, is_active)
VALUES
    -- Administrator: full access via is_admin flag
    (NULL, 'ADMIN', 'Administrator', 'Vollzugriff auf alle Funktionen', '[]', true, true, true),

    -- HR Manager: employee & configuration management
    (NULL, 'PERSONAL', 'Personalleitung', 'Mitarbeiterverwaltung, Zeitwirtschaft, Konfiguration', (
        SELECT jsonb_agg(id) FROM (VALUES
            ('f7f2bb60-ebd2-5275-8e0e-2ff52afc16f7'), -- employees.view
            ('8d8d8aa6-d5d6-587f-add0-e45e76ef3576'), -- employees.create
            ('dfb222df-6946-5ce7-8929-b7351f9d7e9a'), -- employees.edit
            ('f258e374-739c-5ecd-a586-6658ab06d5a8'), -- employees.delete
            ('aa510099-b211-5101-91c1-a67ac6a5f7b1'), -- time_tracking.view_own
            ('c061a0e4-2cc1-5237-a488-68b4463f3244'), -- time_tracking.view_all
            ('dcc7b0b7-16c2-520a-b0cf-de26b51f38bd'), -- time_tracking.edit
            ('f0809664-6220-5133-9393-20fa233f3a3d'), -- time_tracking.approve
            ('847c43ff-8a19-5b89-87f6-9011ca19a18c'), -- booking_overview.change_day_plan
            ('7e124818-cb11-5881-9a08-b57440c2a3df'), -- booking_overview.calculate_day
            ('68a43315-90f3-57e2-9b53-76db332c2e72'), -- booking_overview.calculate_month
            ('32520f08-a254-5a9a-9f20-b74f290dbd8c'), -- booking_overview.delete_bookings
            ('7af8bd1b-5b27-52d4-8e2f-5f73393a9da6'), -- absences.request
            ('364c06e9-8b38-511a-b88b-c3df362a35a3'), -- absences.approve
            ('397aa7eb-bee7-5e1c-beb0-df4fb297b943'), -- absences.manage
            ('a22574cd-30ea-589c-bbb2-9ec64f282a27'), -- day_plans.manage
            ('b9b05d63-da11-5604-a2e4-2c0152f511c1'), -- week_plans.manage
            ('39f562fe-2056-52f9-b9b5-131b3363e4e2'), -- tariffs.manage
            ('e88d326a-0baa-55d2-a7df-b1a42acfc382'), -- departments.manage
            ('9256e96e-b126-5633-960f-a020138ef325'), -- teams.manage
            ('d73df85e-bf06-5811-8a49-b58a902d146b'), -- booking_types.manage
            ('9d3d00b8-4585-53a4-b56e-037b72e47d2d'), -- absence_types.manage
            ('aa6aa764-ec60-5936-9fda-ca1b64b310f9'), -- holidays.manage
            ('363d8e53-c8f8-522d-93fb-faa8594cb784'), -- accounts.manage
            ('ed25435a-f934-5f37-82bd-e067e00ae7b0'), -- notifications.manage
            ('4dbbcd5e-40ae-5937-a35e-ce7f292d3e31'), -- groups.manage
            ('e407cd65-ddc7-5833-ac1e-a3a9f1fef095'), -- reports.view
            ('90ec25a4-d3d5-52ae-baf9-6c42c89e66e7'), -- reports.manage
            ('b4dddcd5-500b-556a-9967-54ced92f5c58'), -- users.manage
            ('967318de-cf59-5c19-ac4c-98c10191848e'), -- settings.manage
            ('714a2564-ee4b-5bd6-8221-5d9e38112da2'), -- time_plans.manage
            ('2f642b52-9deb-52b0-9f2c-553e3c38f6f9'), -- contact_management.manage
            ('21655e33-4a8c-50a2-b1a1-99e256318c24'), -- corrections.manage
            ('6e22f16d-176e-5bec-a87d-93bcca292751'), -- monthly_evaluations.manage
            ('3317914f-89aa-597a-846d-67973762554f'), -- locations.manage
            ('63220463-58ea-5c4b-a611-f3ce95fc4106')  -- shift_planning.manage
        ) AS t(id)
    ), false, true, true),

    -- Supervisor: team oversight, time tracking, approvals
    (NULL, 'VORGESETZTER', 'Vorgesetzter', 'Teamübersicht, Zeiterfassung, Genehmigungen', (
        SELECT jsonb_agg(id) FROM (VALUES
            ('f7f2bb60-ebd2-5275-8e0e-2ff52afc16f7'), -- employees.view
            ('aa510099-b211-5101-91c1-a67ac6a5f7b1'), -- time_tracking.view_own
            ('c061a0e4-2cc1-5237-a488-68b4463f3244'), -- time_tracking.view_all
            ('dcc7b0b7-16c2-520a-b0cf-de26b51f38bd'), -- time_tracking.edit
            ('f0809664-6220-5133-9393-20fa233f3a3d'), -- time_tracking.approve
            ('847c43ff-8a19-5b89-87f6-9011ca19a18c'), -- booking_overview.change_day_plan
            ('7e124818-cb11-5881-9a08-b57440c2a3df'), -- booking_overview.calculate_day
            ('68a43315-90f3-57e2-9b53-76db332c2e72'), -- booking_overview.calculate_month
            ('32520f08-a254-5a9a-9f20-b74f290dbd8c'), -- booking_overview.delete_bookings
            ('7af8bd1b-5b27-52d4-8e2f-5f73393a9da6'), -- absences.request
            ('364c06e9-8b38-511a-b88b-c3df362a35a3'), -- absences.approve
            ('e407cd65-ddc7-5833-ac1e-a3a9f1fef095')  -- reports.view
        ) AS t(id)
    ), false, true, true),

    -- Employee: basic self-service
    (NULL, 'MITARBEITER', 'Mitarbeiter', 'Eigene Zeiterfassung und Abwesenheitsanträge', (
        SELECT jsonb_agg(id) FROM (VALUES
            ('aa510099-b211-5101-91c1-a67ac6a5f7b1'), -- time_tracking.view_own
            ('7af8bd1b-5b27-52d4-8e2f-5f73393a9da6')  -- absences.request
        ) AS t(id)
    ), false, true, true)
ON CONFLICT (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'), code)
DO UPDATE SET
    name        = EXCLUDED.name,
    description = EXCLUDED.description,
    permissions = EXCLUDED.permissions,
    is_admin    = EXCLUDED.is_admin,
    is_active   = true;
