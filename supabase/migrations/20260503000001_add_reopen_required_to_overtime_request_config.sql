-- ═══════════════════════════════════════════════════
-- Migration: add reopen_required toggle
-- Follow-up to 20260503000000_create_overtime_requests
-- Plan: thoughts/shared/plans/2026-04-20-soll-05-reopen-required-toggle.md
-- ═══════════════════════════════════════════════════

ALTER TABLE overtime_request_config
  ADD COLUMN reopen_required BOOLEAN NOT NULL DEFAULT true;
