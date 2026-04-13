import type { PrismaClient } from "@/generated/prisma/client"

// --- Error Classes ---

export class ReminderSettingsValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ReminderSettingsValidationError"
  }
}

// --- Types ---

export type ReminderSettingsInput = {
  enabled?: boolean
  maxLevel?: number
  gracePeriodDays?: number[]
  feeAmounts?: number[]
  interestEnabled?: boolean
  interestRatePercent?: number
  feesEnabled?: boolean
}

// --- Service Functions ---

/**
 * Returns the tenant's reminder settings, lazily creating the row with
 * defaults on first access. The UI never has to handle the "no settings
 * yet" state.
 */
export async function getSettings(prisma: PrismaClient, tenantId: string) {
  const existing = await prisma.reminderSettings.findUnique({
    where: { tenantId },
  })
  if (existing) return existing
  return await prisma.reminderSettings.create({ data: { tenantId } })
}

/**
 * Updates the tenant's reminder settings. Validates array lengths against
 * `maxLevel` so that gracePeriodDays / feeAmounts always agree with the
 * configured number of stages.
 */
export async function updateSettings(
  prisma: PrismaClient,
  tenantId: string,
  input: ReminderSettingsInput
) {
  validateInput(input)
  await getSettings(prisma, tenantId) // ensure row exists
  return await prisma.reminderSettings.update({
    where: { tenantId },
    data: input,
  })
}

function validateInput(input: ReminderSettingsInput) {
  if (input.maxLevel !== undefined) {
    if (input.maxLevel < 1 || input.maxLevel > 4) {
      throw new ReminderSettingsValidationError(
        "maxLevel muss zwischen 1 und 4 liegen"
      )
    }
  }
  if (
    input.interestRatePercent !== undefined &&
    input.interestRatePercent < 0
  ) {
    throw new ReminderSettingsValidationError(
      "interestRatePercent darf nicht negativ sein"
    )
  }
  if (
    input.gracePeriodDays !== undefined &&
    input.maxLevel !== undefined &&
    input.gracePeriodDays.length !== input.maxLevel
  ) {
    throw new ReminderSettingsValidationError(
      `gracePeriodDays muss genau ${input.maxLevel} Werte enthalten`
    )
  }
  if (
    input.feeAmounts !== undefined &&
    input.maxLevel !== undefined &&
    input.feeAmounts.length !== input.maxLevel
  ) {
    throw new ReminderSettingsValidationError(
      `feeAmounts muss genau ${input.maxLevel} Werte enthalten`
    )
  }
}
