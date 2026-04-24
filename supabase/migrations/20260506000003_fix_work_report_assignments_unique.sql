-- Fix duplicate-employee bug on work_report_assignments.
--
-- Original constraint (from 20260506000000_create_work_reports.sql):
--   UNIQUE (work_report_id, employee_id, role)
-- plus partial index:
--   UNIQUE (work_report_id, employee_id) WHERE role IS NULL
--
-- Problem: Postgres treats NULL as distinct inside UNIQUE, so
--   (wr, emp, "Monteur") and (wr, emp, NULL) are two different rows.
-- The partial NULL-only index only caught the NULL+NULL case, leaving
-- NULL+non-NULL and non-NULL_A+non-NULL_B combinations silently allowed.
-- In the UI this surfaced as the same employee appearing twice on one
-- report — confusing and with no real domain meaning for a
-- service-visit form.
--
-- Decision: each employee may appear at most once per WorkReport. The
-- role is optional metadata and is mutated in place (or via
-- remove+re-add with the desired role) rather than by creating a
-- second row.
--
-- This migration is idempotent: if the old constraint/index is already
-- gone (e.g., because a pre-migration in-place edit of the original
-- file already shipped the new state to a given environment), the
-- DROPs and ADD become no-ops so the migration can still run to
-- completion and be recorded as applied.

BEGIN;

-- 1. Dedupe existing rows. Keep one row per (work_report_id,
--    employee_id), preferring the one with a non-NULL role, then the
--    oldest by created_at. Idempotent on clean databases.
WITH ranked AS (
    SELECT id,
        ROW_NUMBER() OVER (
            PARTITION BY work_report_id, employee_id
            ORDER BY
                CASE WHEN role IS NOT NULL THEN 0 ELSE 1 END,
                created_at ASC
        ) AS rn
    FROM work_report_assignments
)
DELETE FROM work_report_assignments
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 2. Drop old 3-column UNIQUE constraint (if still present).
ALTER TABLE work_report_assignments
    DROP CONSTRAINT IF EXISTS work_report_assignments_work_report_id_employee_id_role_key;

-- 3. Drop partial NULL-only unique index (if still present). It was
--    the workaround that masked the real bug and is redundant under
--    the new 2-col unique.
DROP INDEX IF EXISTS idx_work_report_assignments_unique_null_role;

-- 4. Add new 2-column UNIQUE constraint (one employee per report) —
--    only if it isn't already present. Postgres has no
--    `ADD CONSTRAINT IF NOT EXISTS`, so we guard via pg_constraint.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'work_report_assignments_work_report_id_employee_id_key'
          AND conrelid = 'public.work_report_assignments'::regclass
    ) THEN
        ALTER TABLE work_report_assignments
            ADD CONSTRAINT work_report_assignments_work_report_id_employee_id_key
            UNIQUE (work_report_id, employee_id);
    END IF;
END $$;

COMMIT;
