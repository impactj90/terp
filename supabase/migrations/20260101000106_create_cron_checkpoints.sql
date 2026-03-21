-- Migration: 000106
-- Description: Create cron_checkpoints table for checkpoint/resume of cron jobs.
-- When a cron run times out, re-triggering skips already-completed tenants.

CREATE TABLE cron_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cron_name VARCHAR(100) NOT NULL,
  run_key VARCHAR(255) NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'completed',
  duration_ms INT,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  UNIQUE(cron_name, run_key, tenant_id)
);

CREATE INDEX idx_cron_checkpoints_lookup ON cron_checkpoints(cron_name, run_key);
