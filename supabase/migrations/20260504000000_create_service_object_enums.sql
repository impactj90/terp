-- Plan: 2026-04-21-serviceobjekte-stammdaten.md
-- Phase A: Enum types for ServiceObject kind + status.

CREATE TYPE service_object_kind AS ENUM (
  'SITE',
  'BUILDING',
  'SYSTEM',
  'EQUIPMENT',
  'COMPONENT'
);

CREATE TYPE service_object_status AS ENUM (
  'OPERATIONAL',
  'DEGRADED',
  'IN_MAINTENANCE',
  'OUT_OF_SERVICE',
  'DECOMMISSIONED'
);
