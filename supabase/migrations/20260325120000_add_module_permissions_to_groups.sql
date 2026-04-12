-- Add all module permissions to system user groups.
-- Updates PERSONAL, VORGESETZTER, MITARBEITER with missing permissions.
-- Creates new groups: LAGER, BUCHHALTUNG, VERTRIEB.
--
-- Permission UUIDs are deterministic (UUIDv5 with namespace f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1).
-- Pattern: INSERT ... ON CONFLICT ... DO UPDATE SET (idempotent).

INSERT INTO user_groups (tenant_id, code, name, description, permissions, is_admin, is_system, is_active)
VALUES
    -- ═══════════════════════════════════════════════════════════════════
    -- ADMIN — unchanged (is_admin bypasses all permission checks)
    -- ═══════════════════════════════════════════════════════════════════
    (NULL, 'ADMIN', 'Administrator', 'Vollzugriff auf alle Funktionen', '[]', true, true, true),

    -- ═══════════════════════════════════════════════════════════════════
    -- PERSONAL — 91 permissions (all except tenants.manage)
    -- ═══════════════════════════════════════════════════════════════════
    (NULL, 'PERSONAL', 'Personalleitung', 'Vollzugriff auf alle Module ausser Mandantenverwaltung', (
        SELECT jsonb_agg(id) FROM (VALUES
            -- Core HR: Employees
            ('f7f2bb60-ebd2-5275-8e0e-2ff52afc16f7'), -- employees.view
            ('8d8d8aa6-d5d6-587f-add0-e45e76ef3576'), -- employees.create
            ('dfb222df-6946-5ce7-8929-b7351f9d7e9a'), -- employees.edit
            ('f258e374-739c-5ecd-a586-6658ab06d5a8'), -- employees.delete
            -- Core HR: Time Tracking
            ('aa510099-b211-5101-91c1-a67ac6a5f7b1'), -- time_tracking.view_own
            ('c061a0e4-2cc1-5237-a488-68b4463f3244'), -- time_tracking.view_all
            ('dcc7b0b7-16c2-520a-b0cf-de26b51f38bd'), -- time_tracking.edit
            ('f0809664-6220-5133-9393-20fa233f3a3d'), -- time_tracking.approve
            -- Core HR: Booking Overview
            ('847c43ff-8a19-5b89-87f6-9011ca19a18c'), -- booking_overview.change_day_plan
            ('7e124818-cb11-5881-9a08-b57440c2a3df'), -- booking_overview.calculate_day
            ('68a43315-90f3-57e2-9b53-76db332c2e72'), -- booking_overview.calculate_month
            ('32520f08-a254-5a9a-9f20-b74f290dbd8c'), -- booking_overview.delete_bookings
            -- Core HR: Absences
            ('7af8bd1b-5b27-52d4-8e2f-5f73393a9da6'), -- absences.request
            ('364c06e9-8b38-511a-b88b-c3df362a35a3'), -- absences.approve
            ('397aa7eb-bee7-5e1c-beb0-df4fb297b943'), -- absences.manage
            -- Configuration
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
            ('714a2564-ee4b-5bd6-8221-5d9e38112da2'), -- time_plans.manage
            ('3317914f-89aa-597a-846d-67973762554f'), -- locations.manage
            -- Reports & System (excluding tenants.manage)
            ('e407cd65-ddc7-5833-ac1e-a3a9f1fef095'), -- reports.view
            ('90ec25a4-d3d5-52ae-baf9-6c42c89e66e7'), -- reports.manage
            ('b4dddcd5-500b-556a-9967-54ced92f5c58'), -- users.manage
            ('967318de-cf59-5c19-ac4c-98c10191848e'), -- settings.manage
            -- Advanced Configuration
            ('2f642b52-9deb-52b0-9f2c-553e3c38f6f9'), -- contact_management.manage
            ('21655e33-4a8c-50a2-b1a1-99e256318c24'), -- corrections.manage
            ('6e22f16d-176e-5bec-a87d-93bcca292751'), -- monthly_evaluations.manage
            ('63220463-58ea-5c4b-a611-f3ce95fc4106'), -- shift_planning.manage
            ('aa8f1fc4-a28f-56ee-9bcf-2d5cbeabb843'), -- schedules.manage
            ('07e88813-0846-583f-99ce-5e8bd2dba12a'), -- terminal_bookings.manage
            ('55aeee70-212c-5ca7-91ba-8c847af1543b'), -- access_control.manage
            ('18c97cca-b03a-5838-a373-e4638024ad4a'), -- vehicle_data.manage
            ('025e40da-fca3-503f-ab4f-5d1cb23009d1'), -- travel_allowance.manage
            ('0c74c311-c5bb-583b-9973-5f92566c4c80'), -- macros.manage
            ('920c0073-145e-5e50-966a-5ed62bf0037f'), -- cost_centers.manage
            ('0d1feb9a-f6e0-5212-a431-10f52fab78ac'), -- employment_types.manage
            ('71b919f1-b9d6-5f14-894e-693f981a34b7'), -- vacation_config.manage
            -- Orders
            ('7571fdc8-6c82-5457-ab5a-9eaf17241bf1'), -- activities.manage
            ('2c40e2f8-d02c-5aeb-974f-219302940c51'), -- orders.manage
            ('f0b0022f-99e4-566c-914d-7e8b95cda9f6'), -- order_assignments.manage
            ('13298858-0c8c-51a2-a671-2af480fe12aa'), -- order_bookings.manage
            ('d6ff673e-e455-5480-9d37-ab8884c5d4b9'), -- order_bookings.view
            -- Payroll
            ('5bae7a94-4921-5059-9d39-f550a8e4cc9f'), -- payroll.manage
            ('5c6b5ecc-dd05-5c79-9629-7f2cf9dcd487'), -- payroll.view
            -- CRM
            ('cadf9c9b-b461-5d5e-ae7c-1227a8286bc9'), -- crm_addresses.view
            ('8fa5fe5d-0523-5157-a406-e0b5b87e6e3e'), -- crm_addresses.create
            ('a614e43a-6593-51a0-9c90-0130f6518713'), -- crm_addresses.edit
            ('32dc97d6-2cbf-5b31-b3f9-b798e0cb7ae6'), -- crm_addresses.delete
            ('1d9e347f-e799-53b3-b24d-d322add54267'), -- crm_correspondence.view
            ('e4de6098-0ce4-5c16-be33-f9ba50be1349'), -- crm_correspondence.create
            ('7575c484-6914-5c4f-b847-8c080ccfe4b6'), -- crm_correspondence.edit
            ('08157b67-7eb0-55d9-acf7-fcb4dc1d3054'), -- crm_correspondence.delete
            ('d9075a91-9d70-5f5b-ae9e-fbba62e0bb48'), -- crm_inquiries.view
            ('7eba5662-0f8d-5397-b0a9-f9b5251361c7'), -- crm_inquiries.create
            ('c425abe1-5a27-5938-a708-1b3547d8e604'), -- crm_inquiries.edit
            ('5d015d59-e857-5f8d-a519-65680f834976'), -- crm_inquiries.delete
            ('e0bc8a3c-4501-5dab-b3f8-112f6a2b1faa'), -- crm_tasks.view
            ('836cd2b0-4d6d-5c20-9e14-71a0feffd13f'), -- crm_tasks.create
            ('b0a1b406-ebd7-5e81-8030-2bfd0278e709'), -- crm_tasks.edit
            ('cbdea8d3-091a-50e0-88d8-7c7f5e9e83d8'), -- crm_tasks.delete
            -- Billing
            ('9d6171fc-6755-5d60-9493-79d058d1bc49'), -- billing_documents.view
            ('66ac472c-b131-54ac-8bc4-70a6cf886331'), -- billing_documents.create
            ('a5d1be84-6a41-565f-af1c-8a0761f15aae'), -- billing_documents.edit
            ('5f8f1d8b-ad88-5ce9-9feb-e6c6d1bdbd9c'), -- billing_documents.delete
            ('0d1ee7f2-efeb-50eb-9863-d1ae8e692b75'), -- billing_documents.finalize
            ('2ad8d015-80a4-550f-b3e0-f593f2a2b3f7'), -- billing_service_cases.view
            ('7582255c-30b7-59b1-a61e-b0666b18ba83'), -- billing_service_cases.create
            ('7ab1b71b-5486-5275-bd40-2a832c8ea9ab'), -- billing_service_cases.edit
            ('d11adebe-9f0a-5c4b-bc90-188ef8b5ab36'), -- billing_service_cases.delete
            ('5dce98ab-a525-5513-846b-0a1fea820a90'), -- billing_payments.view
            ('6fdcb6d3-5c13-539e-9465-d5b46af2b09c'), -- billing_payments.create
            ('994873e8-3666-5d5d-9da8-62e725a885a3'), -- billing_payments.cancel
            ('b9f04407-4f24-5610-a612-187041b7e2a5'), -- billing_price_lists.view
            ('a65ee99a-50dd-52b1-8b14-e06a54205461'), -- billing_price_lists.manage
            ('9063458f-8782-5bf6-b677-e14bb9f58e1b'), -- billing_recurring.view
            ('8a085ed7-96e0-5111-b9e9-c633867be071'), -- billing_recurring.manage
            ('b7581e4d-50d8-5b31-a2fd-a0d2abf63302'), -- billing_recurring.generate
            -- Warehouse
            ('d3326b68-0880-5b12-9ea0-c708e48a328e'), -- wh_articles.view
            ('3de5bc55-67cb-50eb-b0c2-ee02f5519ce3'), -- wh_articles.create
            ('a406116a-8ed0-513a-83ad-46c86fdc3af9'), -- wh_articles.edit
            ('fb11ad35-54d9-55ef-bc4b-e660840a7983'), -- wh_articles.delete
            ('55d49c20-01f4-5eaf-8152-9c0aaac1f2e0'), -- wh_article_groups.manage
            ('a95a56b4-78a0-58ba-9032-b41dcdf5d79f'), -- wh_purchase_orders.view
            ('dc9b2db3-b1e2-5780-8db7-e2195484e2a2'), -- wh_purchase_orders.create
            ('48665d73-5404-56f6-b62c-7a6ef364b597'), -- wh_purchase_orders.edit
            ('61c44707-e34c-5e90-a994-038a27fa2250'), -- wh_purchase_orders.delete
            ('fc5c7a6c-d971-503b-bf08-b4bed92f5412'), -- wh_purchase_orders.order
            ('47ebdf22-fdd7-5e7f-9106-23acb3366dbf'), -- wh_stock.view
            ('7860ad0b-7936-56e9-b0d0-87017abcdf94')  -- wh_stock.manage
        ) AS t(id)
    ), false, true, true),

    -- ═══════════════════════════════════════════════════════════════════
    -- VORGESETZTER — 26 permissions (existing 12 + 14 module view)
    -- ═══════════════════════════════════════════════════════════════════
    (NULL, 'VORGESETZTER', 'Vorgesetzter', 'Teamuebersicht, Zeiterfassung, Genehmigungen, Modul-Lesezugriff', (
        SELECT jsonb_agg(id) FROM (VALUES
            -- Existing Core HR
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
            ('e407cd65-ddc7-5833-ac1e-a3a9f1fef095'), -- reports.view
            -- NEW: Module view permissions
            ('d6ff673e-e455-5480-9d37-ab8884c5d4b9'), -- order_bookings.view
            ('5c6b5ecc-dd05-5c79-9629-7f2cf9dcd487'), -- payroll.view
            ('cadf9c9b-b461-5d5e-ae7c-1227a8286bc9'), -- crm_addresses.view
            ('1d9e347f-e799-53b3-b24d-d322add54267'), -- crm_correspondence.view
            ('d9075a91-9d70-5f5b-ae9e-fbba62e0bb48'), -- crm_inquiries.view
            ('e0bc8a3c-4501-5dab-b3f8-112f6a2b1faa'), -- crm_tasks.view
            ('9d6171fc-6755-5d60-9493-79d058d1bc49'), -- billing_documents.view
            ('2ad8d015-80a4-550f-b3e0-f593f2a2b3f7'), -- billing_service_cases.view
            ('5dce98ab-a525-5513-846b-0a1fea820a90'), -- billing_payments.view
            ('b9f04407-4f24-5610-a612-187041b7e2a5'), -- billing_price_lists.view
            ('9063458f-8782-5bf6-b677-e14bb9f58e1b'), -- billing_recurring.view
            ('d3326b68-0880-5b12-9ea0-c708e48a328e'), -- wh_articles.view
            ('a95a56b4-78a0-58ba-9032-b41dcdf5d79f'), -- wh_purchase_orders.view
            ('47ebdf22-fdd7-5e7f-9106-23acb3366dbf')  -- wh_stock.view
        ) AS t(id)
    ), false, true, true),

    -- ═══════════════════════════════════════════════════════════════════
    -- MITARBEITER — 4 permissions (existing 2 + 2 self-service)
    -- ═══════════════════════════════════════════════════════════════════
    (NULL, 'MITARBEITER', 'Mitarbeiter', 'Eigene Zeiterfassung, Abwesenheitsantraege, Basis-Lesezugriff', (
        SELECT jsonb_agg(id) FROM (VALUES
            ('aa510099-b211-5101-91c1-a67ac6a5f7b1'), -- time_tracking.view_own
            ('7af8bd1b-5b27-52d4-8e2f-5f73393a9da6'), -- absences.request
            -- NEW: Self-service
            ('d6ff673e-e455-5480-9d37-ab8884c5d4b9'), -- order_bookings.view
            ('cadf9c9b-b461-5d5e-ae7c-1227a8286bc9')  -- crm_addresses.view
        ) AS t(id)
    ), false, true, true),

    -- ═══════════════════════════════════════════════════════════════════
    -- LAGER (Warehouse Manager) — NEW, 14 permissions
    -- ═══════════════════════════════════════════════════════════════════
    (NULL, 'LAGER', 'Lagerverwaltung', 'Artikelstamm, Bestellungen, Wareneingang, Lagerbewegungen', (
        SELECT jsonb_agg(id) FROM (VALUES
            -- Warehouse full access
            ('d3326b68-0880-5b12-9ea0-c708e48a328e'), -- wh_articles.view
            ('3de5bc55-67cb-50eb-b0c2-ee02f5519ce3'), -- wh_articles.create
            ('a406116a-8ed0-513a-83ad-46c86fdc3af9'), -- wh_articles.edit
            ('fb11ad35-54d9-55ef-bc4b-e660840a7983'), -- wh_articles.delete
            ('55d49c20-01f4-5eaf-8152-9c0aaac1f2e0'), -- wh_article_groups.manage
            ('a95a56b4-78a0-58ba-9032-b41dcdf5d79f'), -- wh_purchase_orders.view
            ('dc9b2db3-b1e2-5780-8db7-e2195484e2a2'), -- wh_purchase_orders.create
            ('48665d73-5404-56f6-b62c-7a6ef364b597'), -- wh_purchase_orders.edit
            ('61c44707-e34c-5e90-a994-038a27fa2250'), -- wh_purchase_orders.delete
            ('fc5c7a6c-d971-503b-bf08-b4bed92f5412'), -- wh_purchase_orders.order
            ('47ebdf22-fdd7-5e7f-9106-23acb3366dbf'), -- wh_stock.view
            ('7860ad0b-7936-56e9-b0d0-87017abcdf94'), -- wh_stock.manage
            -- Reference access
            ('cadf9c9b-b461-5d5e-ae7c-1227a8286bc9'), -- crm_addresses.view (supplier lookup)
            ('b9f04407-4f24-5610-a612-187041b7e2a5')  -- billing_price_lists.view (price reference)
        ) AS t(id)
    ), false, true, true),

    -- ═══════════════════════════════════════════════════════════════════
    -- BUCHHALTUNG (Accounting) — NEW, 24 permissions
    -- ═══════════════════════════════════════════════════════════════════
    (NULL, 'BUCHHALTUNG', 'Buchhaltung', 'Abrechnung, Zahlungen, Lohnexport, Berichte, Kostenstellen', (
        SELECT jsonb_agg(id) FROM (VALUES
            -- Billing full access
            ('9d6171fc-6755-5d60-9493-79d058d1bc49'), -- billing_documents.view
            ('66ac472c-b131-54ac-8bc4-70a6cf886331'), -- billing_documents.create
            ('a5d1be84-6a41-565f-af1c-8a0761f15aae'), -- billing_documents.edit
            ('5f8f1d8b-ad88-5ce9-9feb-e6c6d1bdbd9c'), -- billing_documents.delete
            ('0d1ee7f2-efeb-50eb-9863-d1ae8e692b75'), -- billing_documents.finalize
            ('2ad8d015-80a4-550f-b3e0-f593f2a2b3f7'), -- billing_service_cases.view
            ('7582255c-30b7-59b1-a61e-b0666b18ba83'), -- billing_service_cases.create
            ('7ab1b71b-5486-5275-bd40-2a832c8ea9ab'), -- billing_service_cases.edit
            ('d11adebe-9f0a-5c4b-bc90-188ef8b5ab36'), -- billing_service_cases.delete
            ('5dce98ab-a525-5513-846b-0a1fea820a90'), -- billing_payments.view
            ('6fdcb6d3-5c13-539e-9465-d5b46af2b09c'), -- billing_payments.create
            ('994873e8-3666-5d5d-9da8-62e725a885a3'), -- billing_payments.cancel
            ('b9f04407-4f24-5610-a612-187041b7e2a5'), -- billing_price_lists.view
            ('a65ee99a-50dd-52b1-8b14-e06a54205461'), -- billing_price_lists.manage
            ('9063458f-8782-5bf6-b677-e14bb9f58e1b'), -- billing_recurring.view
            ('8a085ed7-96e0-5111-b9e9-c633867be071'), -- billing_recurring.manage
            ('b7581e4d-50d8-5b31-a2fd-a0d2abf63302'), -- billing_recurring.generate
            -- Reference access
            ('cadf9c9b-b461-5d5e-ae7c-1227a8286bc9'), -- crm_addresses.view (customer lookup)
            ('1d9e347f-e799-53b3-b24d-d322add54267'), -- crm_correspondence.view (invoice correspondence)
            -- Payroll
            ('5bae7a94-4921-5059-9d39-f550a8e4cc9f'), -- payroll.manage
            ('5c6b5ecc-dd05-5c79-9629-7f2cf9dcd487'), -- payroll.view
            -- Reports
            ('e407cd65-ddc7-5833-ac1e-a3a9f1fef095'), -- reports.view
            ('90ec25a4-d3d5-52ae-baf9-6c42c89e66e7'), -- reports.manage
            -- Cost centers
            ('920c0073-145e-5e50-966a-5ed62bf0037f')  -- cost_centers.manage
        ) AS t(id)
    ), false, true, true),

    -- ═══════════════════════════════════════════════════════════════════
    -- VERTRIEB (Sales/CRM) — NEW, 22 permissions
    -- ═══════════════════════════════════════════════════════════════════
    (NULL, 'VERTRIEB', 'Vertrieb', 'CRM, Adressen, Korrespondenz, Anfragen, Aufgaben, Auftraege', (
        SELECT jsonb_agg(id) FROM (VALUES
            -- CRM full access
            ('cadf9c9b-b461-5d5e-ae7c-1227a8286bc9'), -- crm_addresses.view
            ('8fa5fe5d-0523-5157-a406-e0b5b87e6e3e'), -- crm_addresses.create
            ('a614e43a-6593-51a0-9c90-0130f6518713'), -- crm_addresses.edit
            ('32dc97d6-2cbf-5b31-b3f9-b798e0cb7ae6'), -- crm_addresses.delete
            ('1d9e347f-e799-53b3-b24d-d322add54267'), -- crm_correspondence.view
            ('e4de6098-0ce4-5c16-be33-f9ba50be1349'), -- crm_correspondence.create
            ('7575c484-6914-5c4f-b847-8c080ccfe4b6'), -- crm_correspondence.edit
            ('08157b67-7eb0-55d9-acf7-fcb4dc1d3054'), -- crm_correspondence.delete
            ('d9075a91-9d70-5f5b-ae9e-fbba62e0bb48'), -- crm_inquiries.view
            ('7eba5662-0f8d-5397-b0a9-f9b5251361c7'), -- crm_inquiries.create
            ('c425abe1-5a27-5938-a708-1b3547d8e604'), -- crm_inquiries.edit
            ('5d015d59-e857-5f8d-a519-65680f834976'), -- crm_inquiries.delete
            ('e0bc8a3c-4501-5dab-b3f8-112f6a2b1faa'), -- crm_tasks.view
            ('836cd2b0-4d6d-5c20-9e14-71a0feffd13f'), -- crm_tasks.create
            ('b0a1b406-ebd7-5e81-8030-2bfd0278e709'), -- crm_tasks.edit
            ('cbdea8d3-091a-50e0-88d8-7c7f5e9e83d8'), -- crm_tasks.delete
            -- Billing reference (view quotes/invoices)
            ('9d6171fc-6755-5d60-9493-79d058d1bc49'), -- billing_documents.view
            ('2ad8d015-80a4-550f-b3e0-f593f2a2b3f7'), -- billing_service_cases.view
            ('b9f04407-4f24-5610-a612-187041b7e2a5'), -- billing_price_lists.view
            -- Orders
            ('2c40e2f8-d02c-5aeb-974f-219302940c51'), -- orders.manage
            ('7571fdc8-6c82-5457-ab5a-9eaf17241bf1'), -- activities.manage
            ('f0b0022f-99e4-566c-914d-7e8b95cda9f6')  -- order_assignments.manage
        ) AS t(id)
    ), false, true, true)

ON CONFLICT (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'), code)
DO UPDATE SET
    name        = EXCLUDED.name,
    description = EXCLUDED.description,
    permissions = EXCLUDED.permissions,
    is_admin    = EXCLUDED.is_admin,
    is_active   = true;
