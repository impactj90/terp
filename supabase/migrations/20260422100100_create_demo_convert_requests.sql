-- =============================================================
-- Demo convert-request inbox for the platform-admin UI.
--
-- Materializes the self-service "Request Convert" action from the
-- /demo-expired page. Platform operators see these in
-- /platform/tenants/convert-requests and resolve or dismiss each one.
--
-- resolve/dismiss are pure status flips — no coupled side effects.
-- Operator performs the actual convert/extend/outreach manually via
-- /platform/tenants/demo (deep-linked from the inbox row).
-- =============================================================

CREATE TABLE public.demo_convert_requests (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                    UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  requested_by_user_id         UUID NOT NULL,
  requested_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  status                       VARCHAR(20) NOT NULL DEFAULT 'pending',
  resolved_by_platform_user_id UUID NULL REFERENCES public.platform_users(id) ON DELETE SET NULL,
  resolved_at                  TIMESTAMPTZ NULL,
  resolution_note              TEXT NULL,
  CONSTRAINT demo_convert_requests_status_check
    CHECK (status IN ('pending', 'resolved', 'dismissed'))
);

CREATE INDEX idx_demo_convert_requests_status
  ON public.demo_convert_requests(status, requested_at DESC);
CREATE INDEX idx_demo_convert_requests_tenant
  ON public.demo_convert_requests(tenant_id);

COMMENT ON TABLE public.demo_convert_requests IS
  'Platform-admin inbox for self-service demo-convert requests from expired-demo admin users.';
COMMENT ON COLUMN public.demo_convert_requests.requested_by_user_id IS
  'UUID of public.users row that clicked Request Convert. NOT an FK — users may be deleted.';
