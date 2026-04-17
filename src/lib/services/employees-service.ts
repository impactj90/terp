/**
 * Employees Service
 *
 * Business logic for employee operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import { Prisma } from "@/generated/prisma/client"
import type { DataScope } from "@/lib/auth/middleware"
import {
  buildEmployeeDataScopeWhere,
  isEmployeeWithinDataScope,
} from "@/lib/auth/data-scope"
import { DailyCalcService } from "@/lib/services/daily-calc"
import { MonthlyCalcService } from "@/lib/services/monthly-calc"
import {
  DEFAULT_PROBATION_MONTHS,
  getProbationSnapshot,
  type ProbationFilter,
  type ProbationSnapshot,
} from "./probation-service"
import * as repo from "./employees-repository"
import * as probationRepo from "./probation-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"
import { encryptField } from "./field-encryption"
import {
  validateIban,
  validateTaxId,
  validateSocialSecurityNumber,
  validateContributionGroupCode,
  validateActivityCode,
  validateTaxClass,
} from "./payroll-validators"

// --- Error Classes ---

export class EmployeeNotFoundError extends Error {
  constructor(message = "Employee not found") {
    super(message);
    this.name = "EmployeeNotFoundError";
  }
}

export class EmployeeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmployeeValidationError";
  }
}

export class EmployeeConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmployeeConflictError";
  }
}

export class EmployeeForbiddenError extends Error {
  constructor(message = "Employee not within data scope") {
    super(message)
    this.name = "EmployeeForbiddenError"
  }
}

// --- Data Scope Helpers ---

function checkDataScope(
  dataScope: DataScope,
  employee: { id: string; departmentId: string | null }
): void {
  if (!isEmployeeWithinDataScope(dataScope, employee)) {
    throw new EmployeeForbiddenError()
  }
}

function buildDataScopeWhere(
  dataScope: DataScope
): Record<string, unknown> | null {
  return buildEmployeeDataScopeWhere(dataScope)
}

function getEmployeeProbationMonths(
  employee: Record<string, unknown>
): number | null | undefined {
  return employee.probationMonths as number | null | undefined
}

function withProbationSnapshot<T extends { entryDate: Date; exitDate: Date | null }>(
  employee: T,
  tenantProbationDefaultMonths: number,
  today: Date = new Date()
): T & { probation: ProbationSnapshot } {
  return {
    ...employee,
    probation: getProbationSnapshot({
      entryDate: employee.entryDate,
      exitDate: employee.exitDate,
      employeeProbationMonths: getEmployeeProbationMonths(
        employee as unknown as Record<string, unknown>
      ),
      tenantDefaultMonths: tenantProbationDefaultMonths,
      today,
    }),
  }
}

function reorderByIds<T extends { id: string }>(items: T[], ids: string[]): T[] {
  const byId = new Map(items.map((item) => [item.id, item]))
  return ids
    .map((id) => byId.get(id))
    .filter((item): item is T => item !== undefined)
}

function coerceDate(value: Date | string | null | undefined): Date | null {
  if (!value) {
    return null
  }

  return value instanceof Date ? value : new Date(value)
}

async function getTenantProbationDefaultMonths(
  prisma: PrismaClient,
  tenantId: string
): Promise<number> {
  const settings = await prisma.systemSetting?.findUnique?.({
    where: { tenantId },
    select: { probationDefaultMonths: true },
  })

  return settings?.probationDefaultMonths ?? DEFAULT_PROBATION_MONTHS
}

// --- Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  dataScope: DataScope,
  input?: {
    page?: number;
    pageSize?: number;
    search?: string;
    departmentId?: string;
    costCenterId?: string;
    employmentTypeId?: string;
    locationId?: string;
    isActive?: boolean;
    hasExitDate?: boolean;
    probationStatus?: ProbationFilter;
  }
) {
  const page = input?.page ?? 1
  const pageSize = input?.pageSize ?? 20
  const today = new Date()
  const tenantProbationDefaultMonths = await getTenantProbationDefaultMonths(
    prisma,
    tenantId
  )
  const probationStatus = input?.probationStatus ?? "ALL"

  if (probationStatus !== "ALL") {
    const { ids, total } = await probationRepo.findEmployeeIdsByProbationFilter(
      prisma,
      {
        tenantId,
        tenantProbationDefaultMonths,
        dataScope,
        today,
        probationFilter: probationStatus,
        search: input?.search,
        departmentId: input?.departmentId,
        costCenterId: input?.costCenterId,
        employmentTypeId: input?.employmentTypeId,
        locationId: input?.locationId,
        isActive: input?.isActive,
        hasExitDate: input?.hasExitDate,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }
    )

    const employees = reorderByIds(
      await repo.findManyByIds(prisma, tenantId, ids),
      ids
    ).map((employee) =>
      withProbationSnapshot(employee, tenantProbationDefaultMonths, today)
    )

    return { employees, total }
  }

  const where: Record<string, unknown> = {
    tenantId,
    deletedAt: null,
  }

  // Optional filters
  if (input?.isActive !== undefined) {
    where.isActive = input.isActive;
  }
  if (input?.departmentId !== undefined) {
    where.departmentId = input.departmentId;
  }
  if (input?.costCenterId !== undefined) {
    where.costCenterId = input.costCenterId;
  }
  if (input?.employmentTypeId !== undefined) {
    where.employmentTypeId = input.employmentTypeId;
  }
  if (input?.locationId !== undefined) {
    where.locationId = input.locationId;
  }
  if (input?.hasExitDate !== undefined) {
    where.exitDate = input.hasExitDate ? { not: null } : null;
  }

  // Search
  if (input?.search) {
    where.OR = [
      { firstName: { contains: input.search, mode: "insensitive" } },
      { lastName: { contains: input.search, mode: "insensitive" } },
      {
        personnelNumber: {
          contains: input.search,
          mode: "insensitive",
        },
      },
      { email: { contains: input.search, mode: "insensitive" } },
    ];
  }

  // Data scope
  const scopeWhere = buildDataScopeWhere(dataScope);
  if (scopeWhere) {
    Object.assign(where, scopeWhere)
  }

  const { employees, total } = await repo.findMany(prisma, tenantId, {
    where,
    skip: (page - 1) * pageSize,
    take: pageSize,
  })

  return {
    employees: employees.map((employee) =>
      withProbationSnapshot(employee, tenantProbationDefaultMonths, today)
    ),
    total,
  }
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  dataScope: DataScope,
  id: string,
) {
  const employee = await repo.findByIdWithRelations(prisma, tenantId, id)
  if (!employee) {
    throw new EmployeeNotFoundError()
  }

  // Check data scope
  checkDataScope(dataScope, employee)

  const tenantProbationDefaultMonths = await getTenantProbationDefaultMonths(
    prisma,
    tenantId
  )

  return withProbationSnapshot(employee, tenantProbationDefaultMonths)
}

export async function getProbationDashboard(
  prisma: PrismaClient,
  tenantId: string,
  dataScope: DataScope,
  options?: { limit?: number }
) {
  const today = new Date()
  const tenantProbationDefaultMonths = await getTenantProbationDefaultMonths(
    prisma,
    tenantId
  )
  const { total, items } = await probationRepo.findProbationDashboardRows(
    prisma,
    {
      tenantId,
      tenantProbationDefaultMonths,
      dataScope,
      today,
      limit: options?.limit ?? 5,
    }
  )

  return {
    total,
    items: items
      .map((item) => {
        const snapshot = getProbationSnapshot({
          entryDate: coerceDate(item.entryDate),
          exitDate: coerceDate(item.exitDate),
          employeeProbationMonths: item.probationMonths,
          tenantDefaultMonths: tenantProbationDefaultMonths,
          today,
        })

        if (!snapshot.endDate || snapshot.daysRemaining === null) {
          return null
        }

        return {
          id: item.id,
          firstName: item.firstName,
          lastName: item.lastName,
          departmentName: item.departmentName,
          endDate: snapshot.endDate,
          daysRemaining: snapshot.daysRemaining,
        }
      })
      .filter(
        (
          item
        ): item is {
          id: string
          firstName: string
          lastName: string
          departmentName: string | null
          endDate: Date
          daysRemaining: number
        } => item !== null
      ),
  }
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    personnelNumber?: string;
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    entryDate: Date;
    exitDate?: Date;
    departmentId?: string;
    costCenterId?: string;
    employmentTypeId?: string;
    locationId?: string;
    tariffId?: string;
    weeklyHours?: number;
    vacationDaysPerYear?: number;
    isActive?: boolean;
    disabilityFlag?: boolean;
    exitReason?: string;
    notes?: string;
    addressStreet?: string;
    addressZip?: string;
    addressCity?: string;
    addressCountry?: string;
    birthDate?: Date;
    gender?: string;
    nationality?: string;
    religion?: string;
    maritalStatus?: string;
    birthPlace?: string;
    birthCountry?: string;
    roomNumber?: string;
    photoUrl?: string;
    employeeGroupId?: string;
    workflowGroupId?: string;
    activityGroupId?: string;
    defaultOrderId?: string;
    defaultActivityId?: string;
    partTimePercent?: number;
    dailyTargetHours?: number;
    weeklyTargetHours?: number;
    monthlyTargetHours?: number;
    annualTargetHours?: number;
    workDaysPerWeek?: number;
    calculationStartDate?: Date;
  },
  audit: AuditContext,
) {
  // Auto-generate personnel number if not provided
  let personnelNumber = input.personnelNumber?.trim() || "";
  if (personnelNumber.length === 0) {
    personnelNumber = await repo.getNextPersonnelNumber(prisma, tenantId);
  }

  const firstName = input.firstName.trim();
  if (firstName.length === 0) {
    throw new EmployeeValidationError("First name is required");
  }

  const lastName = input.lastName.trim();
  if (lastName.length === 0) {
    throw new EmployeeValidationError("Last name is required");
  }

  // Validate entry date not more than 6 months in future
  const sixMonthsFromNow = new Date();
  sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);
  if (input.entryDate > sixMonthsFromNow) {
    throw new EmployeeValidationError(
      "Entry date cannot be more than 6 months in the future",
    );
  }

  // Validate exit date >= entry date
  if (input.exitDate && input.exitDate < input.entryDate) {
    throw new EmployeeValidationError("Exit date cannot be before entry date");
  }

  // Always auto-assign PIN
  const pin = await repo.getNextPin(prisma, tenantId);

  // Rely on DB unique constraints for personnel number / PIN uniqueness.
  // P2002 catch below maps constraint violations to domain errors.
  try {
    const created = await repo.create(prisma, {
      tenantId,
      personnelNumber,
      pin,
      firstName,
      lastName,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      entryDate: input.entryDate,
      exitDate: input.exitDate ?? null,
      departmentId: input.departmentId ?? null,
      costCenterId: input.costCenterId ?? null,
      employmentTypeId: input.employmentTypeId ?? null,
      locationId: input.locationId ?? null,
      tariffId: input.tariffId ?? null,
      weeklyHours:
        input.weeklyHours !== undefined
          ? new Prisma.Decimal(input.weeklyHours)
          : new Prisma.Decimal(40.0),
      vacationDaysPerYear:
        input.vacationDaysPerYear !== undefined
          ? new Prisma.Decimal(input.vacationDaysPerYear)
          : new Prisma.Decimal(30.0),
      isActive: input.isActive ?? true,
      disabilityFlag: input.disabilityFlag ?? false,
      exitReason: input.exitReason?.trim() || null,
      notes: input.notes?.trim() || null,
      addressStreet: input.addressStreet?.trim() || null,
      addressZip: input.addressZip?.trim() || null,
      addressCity: input.addressCity?.trim() || null,
      addressCountry: input.addressCountry?.trim() || null,
      birthDate: input.birthDate ?? null,
      gender: input.gender?.trim() || null,
      nationality: input.nationality?.trim() || null,
      religion: input.religion?.trim() || null,
      maritalStatus: input.maritalStatus?.trim() || null,
      birthPlace: input.birthPlace?.trim() || null,
      birthCountry: input.birthCountry?.trim() || null,
      roomNumber: input.roomNumber?.trim() || null,
      photoUrl: input.photoUrl?.trim() || null,
      employeeGroupId: input.employeeGroupId ?? null,
      workflowGroupId: input.workflowGroupId ?? null,
      activityGroupId: input.activityGroupId ?? null,
      defaultOrderId: input.defaultOrderId ?? null,
      defaultActivityId: input.defaultActivityId ?? null,
      partTimePercent:
        input.partTimePercent !== undefined
          ? new Prisma.Decimal(input.partTimePercent)
          : null,
      dailyTargetHours:
        input.dailyTargetHours !== undefined
          ? new Prisma.Decimal(input.dailyTargetHours)
          : null,
      weeklyTargetHours:
        input.weeklyTargetHours !== undefined
          ? new Prisma.Decimal(input.weeklyTargetHours)
          : null,
      monthlyTargetHours:
        input.monthlyTargetHours !== undefined
          ? new Prisma.Decimal(input.monthlyTargetHours)
          : null,
      annualTargetHours:
        input.annualTargetHours !== undefined
          ? new Prisma.Decimal(input.annualTargetHours)
          : null,
      workDaysPerWeek:
        input.workDaysPerWeek !== undefined
          ? new Prisma.Decimal(input.workDaysPerWeek)
          : null,
      calculationStartDate: input.calculationStartDate ?? null,
    });

    // Never throws — audit failures must not block the actual operation
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "create",
      entityType: "employee",
      entityId: created.id,
      entityName: `${created.firstName} ${created.lastName} (${created.personnelNumber})`,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err));

    return created;
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const target = (err.meta?.target as string[]) ?? [];
      if (target.includes("personnel_number")) {
        throw new EmployeeConflictError("Personnel number already exists");
      }
      if (target.includes("pin")) {
        throw new EmployeeConflictError("PIN already exists");
      }
      throw new EmployeeConflictError(
        "Employee with these unique fields already exists",
      );
    }
    throw err;
  }
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  dataScope: DataScope,
  input: {
    id: string;
    personnelNumber?: string;
    firstName?: string;
    lastName?: string;
    pin?: string;
    email?: string | null;
    phone?: string | null;
    entryDate?: Date;
    exitDate?: Date | null;
    departmentId?: string;
    costCenterId?: string;
    employmentTypeId?: string;
    locationId?: string;
    tariffId?: string;
    weeklyHours?: number;
    vacationDaysPerYear?: number;
    isActive?: boolean;
    disabilityFlag?: boolean;
    exitReason?: string | null;
    notes?: string | null;
    addressStreet?: string | null;
    addressZip?: string | null;
    addressCity?: string | null;
    addressCountry?: string | null;
    birthDate?: Date | null;
    gender?: string | null;
    nationality?: string | null;
    religion?: string | null;
    maritalStatus?: string | null;
    birthPlace?: string | null;
    birthCountry?: string | null;
    roomNumber?: string | null;
    photoUrl?: string | null;
    employeeGroupId?: string;
    workflowGroupId?: string;
    activityGroupId?: string;
    defaultOrderId?: string;
    defaultActivityId?: string;
    partTimePercent?: number | null;
    dailyTargetHours?: number | null;
    weeklyTargetHours?: number | null;
    monthlyTargetHours?: number | null;
    annualTargetHours?: number | null;
    workDaysPerWeek?: number | null;
    calculationStartDate?: Date | null;
    // --- Payroll master data ---
    taxId?: string | null;
    taxClass?: number | null;
    taxFactor?: number | null;
    childTaxAllowance?: number | null;
    denomination?: string | null;
    spouseDenomination?: string | null;
    payrollTaxAllowance?: number | null;
    payrollTaxAddition?: number | null;
    isPrimaryEmployer?: boolean | null;
    socialSecurityNumber?: string | null;
    healthInsuranceProviderId?: string | null;
    healthInsuranceStatus?: string | null;
    privateHealthInsuranceContribution?: number | null;
    personnelGroupCode?: string | null;
    contributionGroupCode?: string | null;
    activityCode?: string | null;
    midijobFlag?: number | null;
    umlageU1?: boolean | null;
    umlageU2?: boolean | null;
    iban?: string | null;
    bic?: string | null;
    accountHolder?: string | null;
    birthName?: string | null;
    houseNumber?: string | null;
    grossSalary?: number | null;
    hourlyRate?: number | null;
    paymentType?: string | null;
    salaryGroup?: string | null;
    contractType?: string | null;
    probationMonths?: number | null;
    noticePeriodEmployee?: string | null;
    noticePeriodEmployer?: string | null;
    disabilityDegree?: number | null;
    disabilityEqualStatus?: boolean | null;
    disabilityMarkers?: string | null;
    disabilityIdValidUntil?: Date | null;
    bgInstitution?: string | null;
    bgMembershipNumber?: string | null;
    bgHazardTariff?: string | null;
    university?: string | null;
    studentId?: string | null;
    fieldOfStudy?: string | null;
    apprenticeshipOccupation?: string | null;
    apprenticeshipExternalCompany?: string | null;
    vocationalSchool?: string | null;
    receivesOldAgePension?: boolean | null;
    receivesDisabilityPension?: boolean | null;
    receivesSurvivorPension?: boolean | null;
    pensionStartDate?: Date | null;
    dateOfDeath?: Date | null;
    heirName?: string | null;
    heirIban?: string | null;
    receivesParentalAllowance?: boolean | null;
    parentalAllowanceUntil?: Date | null;
    // Clear flags for nullable FKs
    clearDepartmentId?: boolean;
    clearCostCenterId?: boolean;
    clearEmploymentTypeId?: boolean;
    clearLocationId?: boolean;
    clearTariffId?: boolean;
    clearEmployeeGroupId?: boolean;
    clearWorkflowGroupId?: boolean;
    clearActivityGroupId?: boolean;
    clearDefaultOrderId?: boolean;
    clearDefaultActivityId?: boolean;
    clearHealthInsuranceProviderId?: boolean;
  },
  audit: AuditContext,
) {
  // Verify employee exists (tenant-scoped, not deleted)
  const existing = await repo.findById(prisma, tenantId, input.id);
  if (!existing) {
    throw new EmployeeNotFoundError();
  }

  // Check data scope
  checkDataScope(dataScope, existing);

  // Build partial update data
  const data: Record<string, unknown> = {};

  // Handle personnelNumber update
  if (input.personnelNumber !== undefined) {
    const personnelNumber = input.personnelNumber.trim();
    if (personnelNumber.length === 0) {
      throw new EmployeeValidationError("Personnel number is required");
    }
    if (personnelNumber !== existing.personnelNumber) {
      const existingByPN = await repo.findByPersonnelNumber(
        prisma,
        tenantId,
        personnelNumber,
        input.id,
      );
      if (existingByPN) {
        throw new EmployeeConflictError("Personnel number already exists");
      }
    }
    data.personnelNumber = personnelNumber;
  }

  // Handle PIN update
  if (input.pin !== undefined) {
    const pin = input.pin.trim();
    if (pin.length === 0) {
      throw new EmployeeValidationError("PIN is required");
    }
    if (pin !== existing.pin) {
      const existingByPIN = await repo.findByPin(
        prisma,
        tenantId,
        pin,
        input.id,
      );
      if (existingByPIN) {
        throw new EmployeeConflictError("PIN already exists");
      }
    }
    data.pin = pin;
  }

  // Handle firstName update
  if (input.firstName !== undefined) {
    const firstName = input.firstName.trim();
    if (firstName.length === 0) {
      throw new EmployeeValidationError("First name is required");
    }
    data.firstName = firstName;
  }

  // Handle lastName update
  if (input.lastName !== undefined) {
    const lastName = input.lastName.trim();
    if (lastName.length === 0) {
      throw new EmployeeValidationError("Last name is required");
    }
    data.lastName = lastName;
  }

  // Simple string/nullable fields
  if (input.email !== undefined) {
    data.email = input.email === null ? null : input.email.trim() || null;
  }
  if (input.phone !== undefined) {
    data.phone = input.phone === null ? null : input.phone.trim() || null;
  }

  // Date fields with validation
  if (input.entryDate !== undefined) {
    data.entryDate = input.entryDate;
  }
  if (input.exitDate !== undefined) {
    data.exitDate = input.exitDate;
  }

  // Validate entry/exit date constraints
  const effectiveEntryDate =
    (data.entryDate as Date | undefined) ?? existing.entryDate;
  const effectiveExitDate =
    data.exitDate !== undefined
      ? (data.exitDate as Date | null)
      : existing.exitDate;
  if (effectiveExitDate && effectiveExitDate < effectiveEntryDate) {
    throw new EmployeeValidationError("Exit date cannot be before entry date");
  }

  // Nullable FK fields with clear pattern
  if (input.clearDepartmentId) {
    data.departmentId = null;
  } else if (input.departmentId !== undefined) {
    data.departmentId = input.departmentId;
  }

  if (input.clearCostCenterId) {
    data.costCenterId = null;
  } else if (input.costCenterId !== undefined) {
    data.costCenterId = input.costCenterId;
  }

  if (input.clearEmploymentTypeId) {
    data.employmentTypeId = null;
  } else if (input.employmentTypeId !== undefined) {
    data.employmentTypeId = input.employmentTypeId;
  }

  if (input.clearLocationId) {
    data.locationId = null;
  } else if (input.locationId !== undefined) {
    data.locationId = input.locationId;
  }

  if (input.clearTariffId) {
    data.tariffId = null;
  } else if (input.tariffId !== undefined) {
    data.tariffId = input.tariffId;
  }

  if (input.clearEmployeeGroupId) {
    data.employeeGroupId = null;
  } else if (input.employeeGroupId !== undefined) {
    data.employeeGroupId = input.employeeGroupId;
  }

  if (input.clearWorkflowGroupId) {
    data.workflowGroupId = null;
  } else if (input.workflowGroupId !== undefined) {
    data.workflowGroupId = input.workflowGroupId;
  }

  if (input.clearActivityGroupId) {
    data.activityGroupId = null;
  } else if (input.activityGroupId !== undefined) {
    data.activityGroupId = input.activityGroupId;
  }

  if (input.clearDefaultOrderId) {
    data.defaultOrderId = null;
  } else if (input.defaultOrderId !== undefined) {
    data.defaultOrderId = input.defaultOrderId;
  }

  if (input.clearDefaultActivityId) {
    data.defaultActivityId = null;
  } else if (input.defaultActivityId !== undefined) {
    data.defaultActivityId = input.defaultActivityId;
  }

  // Boolean fields
  if (input.isActive !== undefined) {
    data.isActive = input.isActive;
  }
  if (input.disabilityFlag !== undefined) {
    data.disabilityFlag = input.disabilityFlag;
  }

  // Decimal fields
  if (input.weeklyHours !== undefined) {
    data.weeklyHours = new Prisma.Decimal(input.weeklyHours);
  }
  if (input.vacationDaysPerYear !== undefined) {
    data.vacationDaysPerYear = new Prisma.Decimal(input.vacationDaysPerYear);
  }
  if (input.partTimePercent !== undefined) {
    data.partTimePercent =
      input.partTimePercent === null
        ? null
        : new Prisma.Decimal(input.partTimePercent);
  }
  if (input.dailyTargetHours !== undefined) {
    data.dailyTargetHours =
      input.dailyTargetHours === null
        ? null
        : new Prisma.Decimal(input.dailyTargetHours);
  }
  if (input.weeklyTargetHours !== undefined) {
    data.weeklyTargetHours =
      input.weeklyTargetHours === null
        ? null
        : new Prisma.Decimal(input.weeklyTargetHours);
  }
  if (input.monthlyTargetHours !== undefined) {
    data.monthlyTargetHours =
      input.monthlyTargetHours === null
        ? null
        : new Prisma.Decimal(input.monthlyTargetHours);
  }
  if (input.annualTargetHours !== undefined) {
    data.annualTargetHours =
      input.annualTargetHours === null
        ? null
        : new Prisma.Decimal(input.annualTargetHours);
  }
  if (input.workDaysPerWeek !== undefined) {
    data.workDaysPerWeek =
      input.workDaysPerWeek === null
        ? null
        : new Prisma.Decimal(input.workDaysPerWeek);
  }

  // Extended string fields
  if (input.exitReason !== undefined) {
    data.exitReason =
      input.exitReason === null ? null : input.exitReason.trim() || null;
  }
  if (input.notes !== undefined) {
    data.notes = input.notes === null ? null : input.notes.trim() || null;
  }
  if (input.addressStreet !== undefined) {
    data.addressStreet =
      input.addressStreet === null ? null : input.addressStreet.trim() || null;
  }
  if (input.addressZip !== undefined) {
    data.addressZip =
      input.addressZip === null ? null : input.addressZip.trim() || null;
  }
  if (input.addressCity !== undefined) {
    data.addressCity =
      input.addressCity === null ? null : input.addressCity.trim() || null;
  }
  if (input.addressCountry !== undefined) {
    data.addressCountry =
      input.addressCountry === null
        ? null
        : input.addressCountry.trim() || null;
  }
  if (input.birthDate !== undefined) {
    data.birthDate = input.birthDate;
  }
  if (input.gender !== undefined) {
    data.gender = input.gender === null ? null : input.gender.trim() || null;
  }
  if (input.nationality !== undefined) {
    data.nationality =
      input.nationality === null ? null : input.nationality.trim() || null;
  }
  if (input.religion !== undefined) {
    data.religion =
      input.religion === null ? null : input.religion.trim() || null;
  }
  if (input.maritalStatus !== undefined) {
    data.maritalStatus =
      input.maritalStatus === null ? null : input.maritalStatus.trim() || null;
  }
  if (input.birthPlace !== undefined) {
    data.birthPlace =
      input.birthPlace === null ? null : input.birthPlace.trim() || null;
  }
  if (input.birthCountry !== undefined) {
    data.birthCountry =
      input.birthCountry === null ? null : input.birthCountry.trim() || null;
  }
  if (input.roomNumber !== undefined) {
    data.roomNumber =
      input.roomNumber === null ? null : input.roomNumber.trim() || null;
  }
  if (input.photoUrl !== undefined) {
    data.photoUrl =
      input.photoUrl === null ? null : input.photoUrl.trim() || null;
  }
  if (input.calculationStartDate !== undefined) {
    data.calculationStartDate = input.calculationStartDate;
  }

  // --- Payroll master data ---

  // Encrypted fields: taxId, socialSecurityNumber, iban, heirIban
  if (input.taxId !== undefined) {
    if (input.taxId === null) {
      data.taxId = null;
    } else {
      const v = validateTaxId(input.taxId.trim());
      if (!v.valid) throw new EmployeeValidationError(v.error!);
      data.taxId = encryptField(input.taxId.trim());
    }
  }
  if (input.socialSecurityNumber !== undefined) {
    if (input.socialSecurityNumber === null) {
      data.socialSecurityNumber = null;
    } else {
      const v = validateSocialSecurityNumber(input.socialSecurityNumber.trim());
      if (!v.valid) throw new EmployeeValidationError(v.error!);
      data.socialSecurityNumber = encryptField(input.socialSecurityNumber.trim());
    }
  }
  if (input.iban !== undefined) {
    if (input.iban === null) {
      data.iban = null;
    } else {
      const v = validateIban(input.iban.trim());
      if (!v.valid) throw new EmployeeValidationError(v.error!);
      data.iban = encryptField(input.iban.trim());
    }
  }
  if (input.heirIban !== undefined) {
    if (input.heirIban === null) {
      data.heirIban = null;
    } else {
      const v = validateIban(input.heirIban.trim());
      if (!v.valid) throw new EmployeeValidationError(v.error!);
      data.heirIban = encryptField(input.heirIban.trim());
    }
  }

  // Validated fields
  if (input.taxClass !== undefined) {
    if (input.taxClass !== null) {
      const v = validateTaxClass(input.taxClass);
      if (!v.valid) throw new EmployeeValidationError(v.error!);
    }
    data.taxClass = input.taxClass;
  }
  if (input.contributionGroupCode !== undefined) {
    if (input.contributionGroupCode !== null) {
      const v = validateContributionGroupCode(input.contributionGroupCode);
      if (!v.valid) throw new EmployeeValidationError(v.error!);
    }
    data.contributionGroupCode = input.contributionGroupCode;
  }
  if (input.activityCode !== undefined) {
    if (input.activityCode !== null) {
      const v = validateActivityCode(input.activityCode);
      if (!v.valid) throw new EmployeeValidationError(v.error!);
    }
    data.activityCode = input.activityCode;
  }

  // Decimal fields
  if (input.taxFactor !== undefined) data.taxFactor = input.taxFactor === null ? null : new Prisma.Decimal(input.taxFactor);
  if (input.childTaxAllowance !== undefined) data.childTaxAllowance = input.childTaxAllowance === null ? null : new Prisma.Decimal(input.childTaxAllowance);
  if (input.payrollTaxAllowance !== undefined) data.payrollTaxAllowance = input.payrollTaxAllowance === null ? null : new Prisma.Decimal(input.payrollTaxAllowance);
  if (input.payrollTaxAddition !== undefined) data.payrollTaxAddition = input.payrollTaxAddition === null ? null : new Prisma.Decimal(input.payrollTaxAddition);
  if (input.privateHealthInsuranceContribution !== undefined) data.privateHealthInsuranceContribution = input.privateHealthInsuranceContribution === null ? null : new Prisma.Decimal(input.privateHealthInsuranceContribution);
  if (input.grossSalary !== undefined) data.grossSalary = input.grossSalary === null ? null : new Prisma.Decimal(input.grossSalary);
  if (input.hourlyRate !== undefined) data.hourlyRate = input.hourlyRate === null ? null : new Prisma.Decimal(input.hourlyRate);

  // Simple nullable string fields
  if (input.denomination !== undefined) data.denomination = input.denomination;
  if (input.spouseDenomination !== undefined) data.spouseDenomination = input.spouseDenomination;
  if (input.healthInsuranceStatus !== undefined) data.healthInsuranceStatus = input.healthInsuranceStatus;
  if (input.personnelGroupCode !== undefined) data.personnelGroupCode = input.personnelGroupCode;
  if (input.bic !== undefined) data.bic = input.bic;
  if (input.accountHolder !== undefined) data.accountHolder = input.accountHolder;
  if (input.birthName !== undefined) data.birthName = input.birthName;
  if (input.houseNumber !== undefined) data.houseNumber = input.houseNumber;
  if (input.paymentType !== undefined) data.paymentType = input.paymentType;
  if (input.salaryGroup !== undefined) data.salaryGroup = input.salaryGroup;
  if (input.contractType !== undefined) data.contractType = input.contractType;
  if (input.noticePeriodEmployee !== undefined) data.noticePeriodEmployee = input.noticePeriodEmployee;
  if (input.noticePeriodEmployer !== undefined) data.noticePeriodEmployer = input.noticePeriodEmployer;
  if (input.disabilityMarkers !== undefined) data.disabilityMarkers = input.disabilityMarkers;
  if (input.bgInstitution !== undefined) data.bgInstitution = input.bgInstitution;
  if (input.bgMembershipNumber !== undefined) data.bgMembershipNumber = input.bgMembershipNumber;
  if (input.bgHazardTariff !== undefined) data.bgHazardTariff = input.bgHazardTariff;
  if (input.university !== undefined) data.university = input.university;
  if (input.studentId !== undefined) data.studentId = input.studentId;
  if (input.fieldOfStudy !== undefined) data.fieldOfStudy = input.fieldOfStudy;
  if (input.apprenticeshipOccupation !== undefined) data.apprenticeshipOccupation = input.apprenticeshipOccupation;
  if (input.apprenticeshipExternalCompany !== undefined) data.apprenticeshipExternalCompany = input.apprenticeshipExternalCompany;
  if (input.vocationalSchool !== undefined) data.vocationalSchool = input.vocationalSchool;
  if (input.heirName !== undefined) data.heirName = input.heirName;

  // Nullable boolean fields
  if (input.isPrimaryEmployer !== undefined) data.isPrimaryEmployer = input.isPrimaryEmployer;
  if (input.umlageU1 !== undefined) data.umlageU1 = input.umlageU1;
  if (input.umlageU2 !== undefined) data.umlageU2 = input.umlageU2;
  if (input.disabilityEqualStatus !== undefined) data.disabilityEqualStatus = input.disabilityEqualStatus;
  if (input.receivesOldAgePension !== undefined) data.receivesOldAgePension = input.receivesOldAgePension;
  if (input.receivesDisabilityPension !== undefined) data.receivesDisabilityPension = input.receivesDisabilityPension;
  if (input.receivesSurvivorPension !== undefined) data.receivesSurvivorPension = input.receivesSurvivorPension;
  if (input.receivesParentalAllowance !== undefined) data.receivesParentalAllowance = input.receivesParentalAllowance;

  // Nullable int fields
  if (input.midijobFlag !== undefined) data.midijobFlag = input.midijobFlag;
  if (input.probationMonths !== undefined) data.probationMonths = input.probationMonths;
  if (input.disabilityDegree !== undefined) data.disabilityDegree = input.disabilityDegree;

  // Nullable date fields
  if (input.disabilityIdValidUntil !== undefined) data.disabilityIdValidUntil = input.disabilityIdValidUntil;
  if (input.pensionStartDate !== undefined) data.pensionStartDate = input.pensionStartDate;
  if (input.dateOfDeath !== undefined) data.dateOfDeath = input.dateOfDeath;
  if (input.parentalAllowanceUntil !== undefined) data.parentalAllowanceUntil = input.parentalAllowanceUntil;

  // FK with clear pattern
  if (input.clearHealthInsuranceProviderId) {
    data.healthInsuranceProviderId = null;
  } else if (input.healthInsuranceProviderId !== undefined) {
    data.healthInsuranceProviderId = input.healthInsuranceProviderId;
  }

  const updated = (await repo.update(prisma, tenantId, input.id, data))!;

  // Never throws — audit failures must not block the actual operation
  const TRACKED_FIELDS = [
    "firstName", "lastName", "personnelNumber", "email", "phone",
    "entryDate", "exitDate", "departmentId", "costCenterId",
    "employmentTypeId", "locationId", "tariffId", "weeklyHours",
    "vacationDaysPerYear", "isActive", "pin",
    // Payroll fields (non-encrypted)
    "taxClass", "taxFactor", "childTaxAllowance", "denomination", "spouseDenomination",
    "payrollTaxAllowance", "payrollTaxAddition", "isPrimaryEmployer",
    "healthInsuranceProviderId", "healthInsuranceStatus", "privateHealthInsuranceContribution",
    "personnelGroupCode", "contributionGroupCode", "activityCode", "midijobFlag",
    "umlageU1", "umlageU2", "bic", "accountHolder", "birthName", "houseNumber",
    "grossSalary", "hourlyRate", "paymentType", "salaryGroup",
    "contractType", "probationMonths", "noticePeriodEmployee", "noticePeriodEmployer",
    "disabilityDegree", "disabilityEqualStatus", "disabilityMarkers", "disabilityIdValidUntil",
    "bgInstitution", "bgMembershipNumber", "bgHazardTariff",
    "receivesOldAgePension", "receivesDisabilityPension", "receivesSurvivorPension", "pensionStartDate",
    "dateOfDeath", "heirName", "receivesParentalAllowance", "parentalAllowanceUntil",
  ];
  const changes = auditLog.computeChanges(
    existing as unknown as Record<string, unknown>,
    updated as unknown as Record<string, unknown>,
    TRACKED_FIELDS,
  );
  await auditLog.log(prisma, {
    tenantId,
    userId: audit.userId,
    action: "update",
    entityType: "employee",
    entityId: updated.id,
    entityName: `${updated.firstName} ${updated.lastName} (${updated.personnelNumber})`,
    changes,
    ipAddress: audit.ipAddress,
    userAgent: audit.userAgent,
  }).catch(err => console.error('[AuditLog] Failed:', err));

  return updated;
}

export async function deactivate(
  prisma: PrismaClient,
  tenantId: string,
  dataScope: DataScope,
  id: string,
  audit: AuditContext,
) {
  // Verify employee exists (tenant-scoped, not deleted)
  const existing = await repo.findById(prisma, tenantId, id);
  if (!existing) {
    throw new EmployeeNotFoundError();
  }

  // Check data scope
  checkDataScope(dataScope, existing);

  // Deactivate (not hard-delete) -- mirrors Go service.Deactivate()
  await repo.update(prisma, tenantId, id, {
    isActive: false,
    exitDate: existing.exitDate ?? new Date(),
  });

  // Never throws — audit failures must not block the actual operation
  await auditLog.log(prisma, {
    tenantId,
    userId: audit.userId,
    action: "update",
    entityType: "employee",
    entityId: id,
    entityName: `${existing.firstName} ${existing.lastName} (${existing.personnelNumber})`,
    changes: null,
    metadata: { deactivated: true },
    ipAddress: audit.ipAddress,
    userAgent: audit.userAgent,
  }).catch(err => console.error('[AuditLog] Failed:', err));
}

export async function searchEmployees(
  prisma: PrismaClient,
  tenantId: string,
  query: string,
  dataScope?: DataScope,
) {
  return repo.search(
    prisma,
    tenantId,
    query,
    dataScope ? buildDataScopeWhere(dataScope) : null,
  );
}

export async function bulkAssignTariff(
  prisma: PrismaClient,
  tenantId: string,
  dataScope: DataScope,
  input: {
    employeeIds: string[];
    tariffId: string | null;
    clearTariff?: boolean;
  },
  audit: AuditContext,
) {
  // Batch-fetch all employees to avoid N+1
  const employees = await prisma.employee.findMany({
    where: { id: { in: input.employeeIds }, tenantId, deletedAt: null },
  });
  const empMap = new Map(employees.map((e) => [e.id, e]));

  const validIds: string[] = [];
  let skipped = 0;

  for (const employeeId of input.employeeIds) {
    const employee = empMap.get(employeeId);
    if (!employee) {
      skipped++;
      continue;
    }
    try {
      checkDataScope(dataScope, employee);
      validIds.push(employeeId);
    } catch {
      skipped++;
    }
  }

  const tariffValue = input.clearTariff ? null : input.tariffId;

  // Batch update in a transaction
  let updated = 0;
  if (validIds.length > 0) {
    const result = await prisma.employee.updateMany({
      where: { id: { in: validIds }, tenantId },
      data: { tariffId: tariffValue },
    });
    updated = result.count;

    // Never throws — audit failures must not block the actual operation
    await auditLog.logBulk(prisma, validIds.map(employeeId => {
      const emp = empMap.get(employeeId)!;
      return {
        tenantId,
        userId: audit.userId,
        action: "update",
        entityType: "employee",
        entityId: employeeId,
        entityName: `${emp.firstName} ${emp.lastName} (${emp.personnelNumber})`,
        changes: null,
        metadata: { bulk: true, tariffId: tariffValue },
        ipAddress: audit.ipAddress ?? null,
        userAgent: audit.userAgent ?? null,
      };
    }));
  }

  return { updated, skipped };
}

export async function getDayView(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  date: Date,
) {
  // Load all day data in parallel (all queries are independent)
  const [bookings, dailyValue, empDayPlan, holiday] = await Promise.all([
    repo.findBookingsForDay(prisma, tenantId, employeeId, date),
    repo.findDailyValue(prisma, tenantId, employeeId, date),
    repo.findEmployeeDayPlan(prisma, tenantId, employeeId, date),
    repo.findHoliday(prisma, tenantId, date),
  ]);
  const isHoliday = holiday !== null;

  const errors = dailyValue
    ? mapErrorCodesToErrors(dailyValue.errorCodes, dailyValue.warnings)
    : [];

  return {
    bookings,
    dailyValue,
    empDayPlan,
    holiday,
    isHoliday,
    errors,
  };
}

export async function calculateDay(
  prisma: PrismaClient,
  tenantId: string,
  dataScope: DataScope,
  employeeId: string,
  date: Date,
) {
  // Validate employee exists and is within data scope
  const employee = await repo.findById(prisma, tenantId, employeeId);
  if (!employee) {
    throw new EmployeeNotFoundError();
  }
  checkDataScope(dataScope, employee);

  // Trigger calculation
  const service = new DailyCalcService(prisma);
  const result = await service.calculateDay(tenantId, employeeId, date);

  // Also trigger monthly recalc (best-effort) so monthly values stay in sync
  // @see ZMI-TICKET-243
  try {
    const monthlyService = new MonthlyCalcService(prisma, tenantId);
    await monthlyService.calculateMonth(
      employeeId,
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
    );
  } catch {
    // Monthly recalc is best-effort
  }

  return result;
}

// --- Internal Helpers ---

/**
 * Maps calculation error codes to error type/severity for the day view response.
 * Port of Go error mapping from apps/api/internal/handler/booking.go lines 779-821.
 */
function mapErrorCodesToErrors(
  errorCodes: string[],
  warnings: string[],
): { errorType: string; message: string; severity: "error" | "warning" }[] {
  const errors: {
    errorType: string;
    message: string;
    severity: "error" | "warning";
  }[] = [];

  const errorCodeMap: Record<string, string> = {
    MISSING_COME: "missing_booking",
    MISSING_GO: "missing_booking",
    NO_BOOKINGS: "missing_booking",
    UNPAIRED_BOOKING: "unpaired_booking",
    DUPLICATE_IN_TIME: "overlapping_bookings",
    EARLY_COME: "core_time_violation",
    LATE_COME: "core_time_violation",
    MISSED_CORE_START: "core_time_violation",
    MISSED_CORE_END: "core_time_violation",
    BELOW_MIN_WORK_TIME: "below_min_hours",
    MAX_TIME_REACHED: "exceeds_max_hours",
  };

  for (const code of errorCodes) {
    errors.push({
      errorType: errorCodeMap[code] ?? "invalid_sequence",
      message: code,
      severity: "error",
    });
  }

  for (const code of warnings) {
    errors.push({
      errorType: code.toLowerCase(),
      message: code,
      severity: "warning",
    });
  }

  return errors;
}
