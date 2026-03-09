/**
 * Employee Cards Service
 *
 * Business logic for employee card operations.
 * Delegates data access to the repository layer.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./employee-cards-repository"

// --- Error Classes ---

export class EmployeeNotFoundError extends Error {
  constructor() {
    super("Employee not found")
    this.name = "EmployeeNotFoundError"
  }
}

export class CardNotFoundError extends Error {
  constructor() {
    super("Card not found")
    this.name = "CardNotFoundError"
  }
}

export class CardValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CardValidationError"
  }
}

export class CardConflictError extends Error {
  constructor() {
    super("Card number already exists")
    this.name = "CardConflictError"
  }
}

// --- Helpers ---

function mapCardToOutput(card: {
  id: string
  tenantId: string
  employeeId: string
  cardNumber: string
  cardType: string
  validFrom: Date
  validTo: Date | null
  isActive: boolean
  deactivatedAt: Date | null
  deactivationReason: string | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: card.id,
    tenantId: card.tenantId,
    employeeId: card.employeeId,
    cardNumber: card.cardNumber,
    cardType: card.cardType,
    validFrom: card.validFrom,
    validTo: card.validTo,
    isActive: card.isActive,
    deactivatedAt: card.deactivatedAt,
    deactivationReason: card.deactivationReason,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
  }
}

// --- Service Functions ---

/**
 * Lists cards for an employee.
 * Verifies employee belongs to tenant.
 */
export async function listCards(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string
) {
  const employee = await repo.findEmployeeForTenant(prisma, tenantId, employeeId)
  if (!employee) {
    throw new EmployeeNotFoundError()
  }

  const cards = await repo.listCardsByEmployee(prisma, employeeId)
  return { data: cards.map(mapCardToOutput) }
}

/**
 * Creates a new card for an employee.
 * Validates cardNumber non-empty after trimming.
 * Checks card number uniqueness per tenant.
 * Defaults cardType to "rfid" if not provided.
 * Verifies employee belongs to tenant.
 */
export async function createCard(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    employeeId: string
    cardNumber: string
    cardType?: string
    validFrom?: Date
    validTo?: Date
  }
) {
  const employee = await repo.findEmployeeForTenant(prisma, tenantId, input.employeeId)
  if (!employee) {
    throw new EmployeeNotFoundError()
  }

  const cardNumber = input.cardNumber.trim()
  if (cardNumber.length === 0) {
    throw new CardValidationError("Card number is required")
  }

  const existingCard = await repo.findCardByNumber(prisma, tenantId, cardNumber)
  if (existingCard) {
    throw new CardConflictError()
  }

  const card = await repo.createCard(prisma, {
    tenantId,
    employeeId: input.employeeId,
    cardNumber,
    cardType: input.cardType?.trim() || "rfid",
    validFrom: input.validFrom ?? new Date(),
    validTo: input.validTo ?? null,
    isActive: true,
  })

  return mapCardToOutput(card)
}

/**
 * Deactivates a card.
 * Sets isActive=false, deactivatedAt=now, and optional deactivationReason.
 * Fetches card to verify tenant matches.
 */
export async function deactivateCard(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    reason?: string
  }
) {
  const existing = await repo.findCardByIdAndTenant(prisma, tenantId, input.id)
  if (!existing) {
    throw new CardNotFoundError()
  }

  const card = await repo.updateCard(prisma, input.id, {
    isActive: false,
    deactivatedAt: new Date(),
    deactivationReason: input.reason?.trim() ?? null,
  })

  return mapCardToOutput(card)
}
