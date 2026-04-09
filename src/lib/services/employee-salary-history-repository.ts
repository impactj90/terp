/**
 * Employee Salary History Repository (Phase 3.5)
 *
 * Pure data access for `employee_salary_history`.
 */
import type { PrismaClient, Prisma } from "@/generated/prisma/client"

export async function listForEmployee(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
) {
  return prisma.employeeSalaryHistory.findMany({
    where: { tenantId, employeeId },
    orderBy: [{ validFrom: "desc" }],
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
) {
  return prisma.employeeSalaryHistory.findFirst({ where: { id, tenantId } })
}

export async function findOpenEntry(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
) {
  return prisma.employeeSalaryHistory.findFirst({
    where: { tenantId, employeeId, validTo: null },
    orderBy: { validFrom: "desc" },
  })
}

export async function create(
  prisma: Prisma.TransactionClient | PrismaClient,
  data: Prisma.EmployeeSalaryHistoryUncheckedCreateInput,
) {
  return prisma.employeeSalaryHistory.create({ data })
}

export async function update(
  prisma: Prisma.TransactionClient | PrismaClient,
  tenantId: string,
  id: string,
  data: Prisma.EmployeeSalaryHistoryUpdateInput,
) {
  const { count } = await prisma.employeeSalaryHistory.updateMany({
    where: { id, tenantId },
    data,
  })
  if (count === 0) return null
  return prisma.employeeSalaryHistory.findUnique({ where: { id } })
}

export async function remove(
  prisma: Prisma.TransactionClient | PrismaClient,
  tenantId: string,
  id: string,
) {
  const { count } = await prisma.employeeSalaryHistory.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}
