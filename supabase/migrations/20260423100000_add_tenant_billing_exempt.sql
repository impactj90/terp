-- Platform Billing-Exempt Tenants: allow marking customers (sales
-- partners, free accounts) as not-automatically-invoiced. Orthogonal
-- to PLATFORM_OPERATOR_TENANT_ID (the operator is always implicitly
-- exempt via the self-bill guard).
ALTER TABLE public.tenants
  ADD COLUMN billing_exempt BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tenants.billing_exempt IS
  'True if this tenant is exempt from automatic platform subscription '
  'billing. Module bookings still create tenant_modules rows and a '
  'CrmAddress in the operator tenant, but no platform_subscriptions '
  'or billing_recurring_invoices are generated. Toggle via '
  'platform admin UI; changes are logged to platform_audit_logs '
  'with action "tenant.billing_exempt_changed".';
