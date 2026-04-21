-- Plan: 2026-04-21-serviceobjekte-stammdaten.md (follow-up: kind-specific fields)
-- Adds SITE-specific + BUILDING-specific columns so the form can render a
-- proper field set per ServiceObjectKind. Validation happens at the
-- service layer; all columns are nullable.

CREATE TYPE building_usage AS ENUM (
    'OFFICE',
    'WAREHOUSE',
    'PRODUCTION',
    'RETAIL',
    'RESIDENTIAL',
    'MIXED',
    'OTHER'
);

ALTER TABLE service_objects
    ADD COLUMN site_street     VARCHAR(255),
    ADD COLUMN site_zip        VARCHAR(20),
    ADD COLUMN site_city       VARCHAR(100),
    ADD COLUMN site_country    VARCHAR(10),
    ADD COLUMN site_area_sqm   INT,
    ADD COLUMN floor_count     INT,
    ADD COLUMN floor_area_sqm  INT,
    ADD COLUMN building_usage  building_usage;
