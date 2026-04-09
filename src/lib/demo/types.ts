import type { Prisma } from "@/generated/prisma/client"

/** Subset of PrismaClient methods available inside a transaction. */
export type DemoTx = Prisma.TransactionClient

export interface DemoTemplateContext {
  tenantId: string
  /** The admin user created alongside this demo tenant (for audit/ownership fields). */
  adminUserId: string
  /** Shared tx handle — all writes happen inside the outer tenant-create transaction. */
  tx: DemoTx
}

export interface DemoTemplate {
  /** Stable key stored in `tenants.demo_template`. */
  key: string
  /** Human label for admin UI. */
  label: string
  /** Short description surfaced in the create-demo sheet. */
  description: string
  /**
   * Applies this template's data to the given tenant.
   * All writes must happen inside ctx.tx (no other external side effects).
   */
  apply: (ctx: DemoTemplateContext) => Promise<void>
}
