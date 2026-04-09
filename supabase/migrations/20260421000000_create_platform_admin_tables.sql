-- =============================================================
-- Platform Admin Domain: platform_users, support_sessions,
--   platform_audit_logs, platform_login_attempts
--
-- Separate security/identity domain above the tenant world. See plan
-- thoughts/shared/plans/2026-04-09-platform-admin-system.md (Phase 1).
-- =============================================================

CREATE TABLE platform_users (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email            VARCHAR(255) NOT NULL UNIQUE,
  password_hash    TEXT NOT NULL,
  display_name     VARCHAR(255) NOT NULL,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  mfa_secret       TEXT,
  mfa_enrolled_at  TIMESTAMPTZ,
  recovery_codes   JSONB,
  last_login_at    TIMESTAMPTZ,
  last_login_ip    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID REFERENCES platform_users(id) ON DELETE SET NULL
);

CREATE TABLE support_sessions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  platform_user_id     UUID REFERENCES platform_users(id) ON DELETE SET NULL,
  requested_by_user_id UUID NOT NULL,
  reason               TEXT NOT NULL,
  consent_reference    VARCHAR(255),
  status               VARCHAR(20) NOT NULL,
  expires_at           TIMESTAMPTZ NOT NULL,
  activated_at         TIMESTAMPTZ,
  revoked_at           TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT support_sessions_status_check
    CHECK (status IN ('pending', 'active', 'expired', 'revoked'))
);
CREATE INDEX idx_support_sessions_tenant_status ON support_sessions(tenant_id, status);
CREATE INDEX idx_support_sessions_platform_user_status ON support_sessions(platform_user_id, status);
CREATE INDEX idx_support_sessions_status_expires ON support_sessions(status, expires_at);

CREATE TABLE platform_audit_logs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_user_id    UUID REFERENCES platform_users(id) ON DELETE SET NULL,
  action              VARCHAR(50) NOT NULL,
  entity_type         VARCHAR(100),
  entity_id           UUID,
  target_tenant_id    UUID REFERENCES tenants(id) ON DELETE SET NULL,
  support_session_id  UUID REFERENCES support_sessions(id) ON DELETE SET NULL,
  changes             JSONB,
  metadata            JSONB,
  ip_address          TEXT,
  user_agent          TEXT,
  performed_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_platform_audit_logs_user_performed   ON platform_audit_logs(platform_user_id, performed_at DESC);
CREATE INDEX idx_platform_audit_logs_tenant_performed ON platform_audit_logs(target_tenant_id, performed_at DESC);
CREATE INDEX idx_platform_audit_logs_action_performed ON platform_audit_logs(action, performed_at DESC);

CREATE TABLE platform_login_attempts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) NOT NULL,
  ip_address    TEXT NOT NULL,
  success       BOOLEAN NOT NULL,
  fail_reason   VARCHAR(50),
  attempted_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_platform_login_attempts_email ON platform_login_attempts(email, attempted_at DESC);
CREATE INDEX idx_platform_login_attempts_ip    ON platform_login_attempts(ip_address, attempted_at DESC);
