import type { Prisma } from "@/generated/prisma/client"
import type { ModuleId } from "@/lib/modules/constants"

/** Subset of PrismaClient methods available inside a transaction. */
export type TenantTemplateTx = Prisma.TransactionClient

export interface TenantTemplateContext {
  tenantId: string
  /** The admin user created alongside this tenant (for audit/ownership fields). */
  adminUserId: string
  /** Shared tx handle — all writes happen inside the outer tenant-create transaction. */
  tx: TenantTemplateTx
}

/**
 * IDs of seeded configuration entities, returned by `applyConfig` so that
 * `applySeedData` (showcase-only) can reference them when creating
 * employees, day-plans, billing documents, etc.
 *
 * Only the fields actually consumed by today's seedEmployees /
 * seedEmployeeDayPlans / seedBillingDocuments are listed. Adding more
 * fields is additive and non-breaking.
 */
export interface TenantTemplateConfigResult {
  departments: Array<{ id: string; code: string }>
  tariffs: Array<{ id: string; code: string }>
  dayPlans: Array<{ id: string; shiftKey: string }>
  weekPlans: Array<{ id: string; shiftKey: string }>
  accountGroups: Array<{ id: string }>
  accounts: Array<{ id: string; code: string }>
  bookingTypes: Array<{ id: string; code: string }>
  absenceTypes: Array<{ id: string; code: string }>
  whArticleGroups: Array<{ id: string; code: string }>
}

export interface TenantTemplate {
  /** Stable key stored in `tenants.demo_template`. */
  key: string
  /** Human label for admin UI. */
  label: string
  /** Short description surfaced in the create-demo sheet. */
  description: string

  /** Grouping key for UI dropdown (e.g. "industriedienstleister"). */
  industry: string

  /** "showcase" → demo path, "starter" → createFromTemplate path. */
  kind: "showcase" | "starter"

  /**
   * Seeds master data (departments, tariffs, ...). Called for both showcase
   * and starter templates. Returns the created IDs so that `applySeedData`
   * can build on top of them.
   *
   * All writes must happen inside ctx.tx (no other external side effects).
   */
  applyConfig: (
    ctx: TenantTemplateContext,
  ) => Promise<TenantTemplateConfigResult>

  /**
   * Showcase-only: seeds employees, employee day plans, CRM addresses,
   * billing documents, warehouse articles. Left undefined for starter
   * templates, which ship without any movement/person data.
   */
  applySeedData?: (
    ctx: TenantTemplateContext,
    config: TenantTemplateConfigResult,
  ) => Promise<void>

  /**
   * NK-1 (Decision 32): Modules to auto-enable for this template
   * after `applyConfig` / `applySeedData`. Avoids the demo tenant
   * landing without `nachkalkulation` — operators can disable
   * post-create if they want the bare module set.
   */
  modulesToEnable?: ModuleId[]
}
