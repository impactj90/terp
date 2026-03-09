/**
 * Shared Vacation Balance Output Utilities
 *
 * Provides the output schema, decimal helper, employee select, and mapping
 * function used by both the vacationBalances (CRUD) and vacation (business
 * logic) routers.
 *
 * Extracted to avoid duplication between routers.
 */
import { z } from "zod"
import type { Prisma } from "@/generated/prisma/client"

// --- Output Schema ---

export const vacationBalanceOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  employeeId: z.string().uuid(),
  year: z.number(),
  entitlement: z.number(),
  carryover: z.number(),
  adjustments: z.number(),
  taken: z.number(),
  total: z.number(),
  available: z.number(),
  carryoverExpiresAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  employee: z
    .object({
      id: z.string().uuid(),
      firstName: z.string(),
      lastName: z.string(),
      personnelNumber: z.string(),
      isActive: z.boolean(),
      departmentId: z.string().uuid().nullable(),
    })
    .nullable()
    .optional(),
})

export type VacationBalanceOutput = z.infer<typeof vacationBalanceOutputSchema>

// --- Helpers ---

export function decimalToNumber(
  val: Prisma.Decimal | null | undefined
): number {
  if (val === null || val === undefined) return 0
  return Number(val)
}

export const employeeSelect = {
  id: true,
  firstName: true,
  lastName: true,
  personnelNumber: true,
  isActive: true,
  departmentId: true,
} as const

export function mapBalanceToOutput(
  record: {
    id: string
    tenantId: string
    employeeId: string
    year: number
    entitlement: Prisma.Decimal
    carryover: Prisma.Decimal
    adjustments: Prisma.Decimal
    taken: Prisma.Decimal
    carryoverExpiresAt: Date | null
    createdAt: Date
    updatedAt: Date
    employee?: {
      id: string
      firstName: string
      lastName: string
      personnelNumber: string
      isActive: boolean
      departmentId: string | null
    } | null
  }
): VacationBalanceOutput {
  const entitlement = decimalToNumber(record.entitlement)
  const carryover = decimalToNumber(record.carryover)
  const adjustments = decimalToNumber(record.adjustments)
  const taken = decimalToNumber(record.taken)
  const total = entitlement + carryover + adjustments
  const available = total - taken

  return {
    id: record.id,
    tenantId: record.tenantId,
    employeeId: record.employeeId,
    year: record.year,
    entitlement,
    carryover,
    adjustments,
    taken,
    total,
    available,
    carryoverExpiresAt: record.carryoverExpiresAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    employee: record.employee
      ? {
          id: record.employee.id,
          firstName: record.employee.firstName,
          lastName: record.employee.lastName,
          personnelNumber: record.employee.personnelNumber,
          isActive: record.employee.isActive,
          departmentId: record.employee.departmentId,
        }
      : null,
  }
}
