import type { PrismaClient } from "@/generated/prisma/client"

// --- Error Classes ---

export class NumberSequenceNotFoundError extends Error {
  constructor(key: string) {
    super(`Number sequence "${key}" not found`)
    this.name = "NumberSequenceNotFoundError"
  }
}

export class NumberSequenceValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "NumberSequenceValidationError"
  }
}

// --- Service Functions ---

/**
 * Atomically gets the next number for a sequence key,
 * incrementing the counter in a single query (prevents race conditions).
 * Auto-creates the sequence if it doesn't exist (via upsert).
 *
 * Returns the formatted number string: prefix + value (e.g. "K-1", "L-42").
 */
// Default prefixes for auto-created sequences
const DEFAULT_PREFIXES: Record<string, string> = {
  customer: "K-",
  supplier: "L-",
  inquiry: "V-",
  // Billing document types
  offer: "A-",
  order_confirmation: "AB-",
  delivery_note: "LS-",
  service_note: "LN-",
  return_delivery: "R-",
  invoice: "RE-",
  credit_note: "G-",
  // Billing service cases
  service_case: "KD-",
}

export async function getNextNumber(
  prisma: PrismaClient,
  tenantId: string,
  key: string
): Promise<string> {
  const defaultPrefix = DEFAULT_PREFIXES[key] ?? ""
  const seq = await prisma.numberSequence.upsert({
    where: { tenantId_key: { tenantId, key } },
    update: { nextValue: { increment: 1 } },
    create: { tenantId, key, prefix: defaultPrefix, nextValue: 2 },
  })
  const value = seq.nextValue - 1
  return `${seq.prefix}${value}`
}

/**
 * Lists all number sequences for a tenant.
 */
export async function list(prisma: PrismaClient, tenantId: string) {
  return prisma.numberSequence.findMany({
    where: { tenantId },
    orderBy: { key: "asc" },
  })
}

/**
 * Updates prefix and/or nextValue for a sequence.
 */
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  key: string,
  input: { prefix?: string; nextValue?: number }
) {
  const existing = await prisma.numberSequence.findUnique({
    where: { tenantId_key: { tenantId, key } },
  })
  if (!existing) {
    throw new NumberSequenceNotFoundError(key)
  }

  if (input.nextValue !== undefined && input.nextValue < 1) {
    throw new NumberSequenceValidationError("Next value must be at least 1")
  }

  const data: Record<string, unknown> = {}
  if (input.prefix !== undefined) data.prefix = input.prefix
  if (input.nextValue !== undefined) data.nextValue = input.nextValue

  return prisma.numberSequence.update({
    where: { tenantId_key: { tenantId, key } },
    data,
  })
}
