/**
 * NK Threshold Config Service (NK-1, Phase 7, Decision 9)
 *
 * Resolves the effective Marge / Productivity thresholds for a given
 * tenant + optional orderType. Lookup order:
 *   1. Override row (tenantId, orderTypeId = X)
 *   2. Default row (tenantId, orderTypeId IS NULL)
 *   3. Auto-init with DEFAULT_THRESHOLDS, then step 2.
 *
 * Auto-init uses INSERT-ON-CONFLICT semantics via a try/catch
 * around the unique constraint to remain race-safe (Decision 9).
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./nk-threshold-config-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

export class NkThresholdConfigNotFoundError extends Error {
  constructor(message = "NkThresholdConfig not found") {
    super(message)
    this.name = "NkThresholdConfigNotFoundError"
  }
}

export class NkThresholdConfigValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "NkThresholdConfigValidationError"
  }
}

export interface ThresholdSet {
  marginAmberFromPercent: number
  marginRedFromPercent: number
  productivityAmberFromPercent: number
  productivityRedFromPercent: number
}

export const DEFAULT_THRESHOLDS: ThresholdSet = {
  marginAmberFromPercent: 5,
  marginRedFromPercent: 0,
  productivityAmberFromPercent: 70,
  productivityRedFromPercent: 50,
}

function validateThresholdSet(input: ThresholdSet) {
  if (input.marginAmberFromPercent <= input.marginRedFromPercent) {
    throw new NkThresholdConfigValidationError(
      "marginAmberFromPercent must be greater than marginRedFromPercent",
    )
  }
  if (
    input.productivityAmberFromPercent <= input.productivityRedFromPercent
  ) {
    throw new NkThresholdConfigValidationError(
      "productivityAmberFromPercent must be greater than productivityRedFromPercent",
    )
  }
}

/**
 * Returns the *effective* thresholds for a (tenant, orderType) pair.
 * Auto-initialises the default row if missing.
 */
export async function getEffectiveThresholds(
  prisma: PrismaClient,
  tenantId: string,
  orderTypeId: string | null,
): Promise<ThresholdSet> {
  if (orderTypeId) {
    const override = await repo.findOverride(prisma, tenantId, orderTypeId)
    if (override) {
      return {
        marginAmberFromPercent: Number(override.marginAmberFromPercent),
        marginRedFromPercent: Number(override.marginRedFromPercent),
        productivityAmberFromPercent: Number(
          override.productivityAmberFromPercent,
        ),
        productivityRedFromPercent: Number(
          override.productivityRedFromPercent,
        ),
      }
    }
  }
  const def = await repo.findDefault(prisma, tenantId)
  if (def) {
    return {
      marginAmberFromPercent: Number(def.marginAmberFromPercent),
      marginRedFromPercent: Number(def.marginRedFromPercent),
      productivityAmberFromPercent: Number(def.productivityAmberFromPercent),
      productivityRedFromPercent: Number(def.productivityRedFromPercent),
    }
  }

  // Auto-init: create the default row, ignoring conflicts from a
  // parallel caller racing on the same insert.
  try {
    await repo.create(prisma, {
      tenantId,
      orderTypeId: null,
      ...DEFAULT_THRESHOLDS,
    })
  } catch (err) {
    if (
      err instanceof Error &&
      "code" in err &&
      (err as { code?: string }).code === "P2002"
    ) {
      // race-safe: another process created the row
    } else {
      throw err
    }
  }

  return { ...DEFAULT_THRESHOLDS }
}

export async function listConfigs(
  prisma: PrismaClient,
  tenantId: string,
) {
  return repo.findAll(prisma, tenantId)
}

export async function upsertDefault(
  prisma: PrismaClient,
  tenantId: string,
  input: ThresholdSet,
  audit?: AuditContext,
) {
  validateThresholdSet(input)
  const existing = await repo.findDefault(prisma, tenantId)
  let result
  if (existing) {
    result = await repo.updateById(prisma, existing.id, input)
  } else {
    result = await repo.create(prisma, {
      tenantId,
      orderTypeId: null,
      ...input,
    })
  }
  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: existing ? "update" : "create",
        entityType: "nk_threshold_config",
        entityId: result.id,
        entityName: "default",
        changes: existing
          ? auditLog.computeChanges(
              existing as unknown as Record<string, unknown>,
              input as unknown as Record<string, unknown>,
              [
                "marginAmberFromPercent",
                "marginRedFromPercent",
                "productivityAmberFromPercent",
                "productivityRedFromPercent",
              ],
            )
          : null,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }
  return result
}

export async function upsertOverride(
  prisma: PrismaClient,
  tenantId: string,
  orderTypeId: string,
  input: ThresholdSet,
  audit?: AuditContext,
) {
  validateThresholdSet(input)
  // Validate orderType belongs to tenant
  const ot = await prisma.orderType.findFirst({
    where: { id: orderTypeId, tenantId },
  })
  if (!ot) {
    throw new NkThresholdConfigValidationError(
      "Order type not found in tenant",
    )
  }

  const existing = await repo.findOverride(prisma, tenantId, orderTypeId)
  let result
  if (existing) {
    result = await repo.updateById(prisma, existing.id, input)
  } else {
    result = await repo.create(prisma, {
      tenantId,
      orderTypeId,
      ...input,
    })
  }
  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: existing ? "update" : "create",
        entityType: "nk_threshold_config",
        entityId: result.id,
        entityName: `override:${ot.code}`,
        changes: null,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }
  return result
}

export async function removeOverride(
  prisma: PrismaClient,
  tenantId: string,
  orderTypeId: string,
  audit?: AuditContext,
) {
  const removed = await repo.deleteOverride(prisma, tenantId, orderTypeId)
  if (!removed) {
    throw new NkThresholdConfigNotFoundError("Override not found")
  }
  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "delete",
        entityType: "nk_threshold_config",
        entityId: orderTypeId,
        entityName: `override:${orderTypeId}`,
        changes: null,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }
}

export function classifyMargin(
  marginPercent: number,
  thresholds: ThresholdSet,
): "red" | "amber" | "green" {
  if (marginPercent < thresholds.marginRedFromPercent) return "red"
  if (marginPercent < thresholds.marginAmberFromPercent) return "amber"
  return "green"
}

export function classifyProductivity(
  productivityPercent: number,
  thresholds: ThresholdSet,
): "red" | "amber" | "green" {
  if (productivityPercent < thresholds.productivityRedFromPercent) return "red"
  if (productivityPercent < thresholds.productivityAmberFromPercent)
    return "amber"
  return "green"
}
