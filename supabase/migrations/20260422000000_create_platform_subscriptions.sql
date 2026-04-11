-- Phase 10a: platform subscription lifecycle table.
-- See thoughts/shared/plans/2026-04-10-platform-subscription-billing.md.
--
-- One row per contract instance. Multiple rows per (tenant_id, module) are
-- expected — one per contract instance, supporting history. The bridge to
-- the operator tenant's billing domain lives in the three nullable FK
-- columns. None cascade-delete.

CREATE TABLE public.platform_subscriptions (
  id                             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                      UUID         NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  module                         VARCHAR(50)  NOT NULL,
  status                         VARCHAR(20)  NOT NULL,
  billing_cycle                  VARCHAR(20)  NOT NULL,
  unit_price                     DOUBLE PRECISION NOT NULL,
  currency                       VARCHAR(3)   NOT NULL DEFAULT 'EUR',
  start_date                     TIMESTAMPTZ  NOT NULL,
  end_date                       TIMESTAMPTZ,
  actual_end_date                TIMESTAMPTZ,
  operator_crm_address_id        UUID         REFERENCES public.crm_addresses(id) ON DELETE SET NULL,
  billing_recurring_invoice_id   UUID         REFERENCES public.billing_recurring_invoices(id) ON DELETE SET NULL,
  last_generated_invoice_id      UUID         REFERENCES public.billing_documents(id) ON DELETE SET NULL,
  created_at                     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_by_platform_user_id    UUID         NOT NULL,
  cancelled_at                   TIMESTAMPTZ,
  cancelled_by_platform_user_id  UUID,
  cancellation_reason            VARCHAR(500),

  CONSTRAINT platform_subscriptions_status_check
    CHECK (status IN ('active', 'cancelled', 'ended')),
  CONSTRAINT platform_subscriptions_billing_cycle_check
    CHECK (billing_cycle IN ('MONTHLY', 'ANNUALLY')),
  CONSTRAINT platform_subscriptions_module_check
    CHECK (module IN ('core', 'crm', 'billing', 'warehouse', 'inbound_invoices')),
  CONSTRAINT platform_subscriptions_cancelled_fields_consistency
    CHECK (
      (status = 'cancelled' AND cancelled_at IS NOT NULL AND end_date IS NOT NULL)
      OR status <> 'cancelled'
    ),
  CONSTRAINT platform_subscriptions_ended_fields_consistency
    CHECK (
      (status = 'ended' AND actual_end_date IS NOT NULL)
      OR status <> 'ended'
    )
);

CREATE INDEX idx_platform_subscriptions_tenant_status
  ON public.platform_subscriptions(tenant_id, status);

CREATE INDEX idx_platform_subscriptions_status_end_date
  ON public.platform_subscriptions(status, end_date);

CREATE INDEX idx_platform_subscriptions_billing_ri
  ON public.platform_subscriptions(billing_recurring_invoice_id)
  WHERE billing_recurring_invoice_id IS NOT NULL;

CREATE INDEX idx_platform_subscriptions_operator_crm_address
  ON public.platform_subscriptions(operator_crm_address_id)
  WHERE operator_crm_address_id IS NOT NULL;

COMMENT ON TABLE  public.platform_subscriptions IS 'Platform subscription lifecycle records. One row per contract; multiple rows per (tenant_id, module) expected for history.';
COMMENT ON COLUMN public.platform_subscriptions.operator_crm_address_id    IS 'FK to a CrmAddress inside the operator tenant representing this customer. Set once on first subscription; reused for subsequent subscriptions of the same customer.';
COMMENT ON COLUMN public.platform_subscriptions.billing_recurring_invoice_id IS 'FK to BillingRecurringInvoice inside the operator tenant. When subscription is cancelled, endDate is set on the linked recurring template.';
COMMENT ON COLUMN public.platform_subscriptions.last_generated_invoice_id IS 'Updated by the auto-finalize cron step after each successful finalization. Used by the platform UI to show "last invoice" link-out.';
