/**
 * Export Context Builder (Phase 2)
 *
 * Builds the `ExportContext` object that the LiquidJS engine consumes
 * when rendering an export template. The context exposes employee
 * payroll master data, monthly aggregations and benefit records that
 * were active during the requested payroll period.
 *
 * Sensitive fields (taxId, socialSecurityNumber, iban, recipientIban,
 * creditorName, fileReference) are decrypted via the field-encryption
 * utility before being placed into the context. Decrypted values must
 * never be logged.
 *
 * Period filtering — see plan addendum: only benefits/garnishments/
 * foreign assignments / parental & maternity leaves whose date range
 * intersects [periodStart, periodEnd] are included. Filter expression:
 *
 *   start_date <= periodEnd  AND  (end_date IS NULL OR end_date >= periodStart)
 */
import type { PrismaClient, Prisma } from "@/generated/prisma/client"
import { decryptField, isEncrypted } from "./field-encryption"

const MONTH_NAMES_DE = [
  "",
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
]
const MONTH_NAMES_EN = [
  "",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

// ──────────────────────────────────────────────────────────────────
// Type definitions
// ──────────────────────────────────────────────────────────────────

export interface ExportContextPeriod {
  year: number
  month: number
  monthPadded: string
  monthName: string
  monthNameEn: string
  isoDate: string
  ddmmyyyy: string
  firstDay: string
  lastDay: string
}

export interface ExportContextTemplate {
  fieldSeparator: string
  decimalSeparator: string
  dateFormat: string
  targetSystem: string
}

export interface ExportContextInterface {
  name: string
  mandantNumber: string
  beraterNr: string
}

export interface ExportContextTenant {
  name: string
  addressStreet: string | null
  addressZip: string | null
  addressCity: string | null
  addressCountry: string | null
}

export interface ExportContextWage {
  code: string
  name: string
  terpSource: string
  category: string
}

export interface ExportContextEmployee {
  personnelNumber: string
  firstName: string
  lastName: string
  birthName: string | null
  birthDate: string | null
  gender: string | null
  nationality: string | null
  maritalStatus: string | null
  address: {
    street: string | null
    houseNumber: string | null
    zip: string | null
    city: string | null
    country: string | null
  }
  tax: {
    taxId: string | null
    taxClass: number | null
    taxFactor: number | null
    denomination: string | null
    spouseDenomination: string | null
    childAllowance: number | null
    freeAllowance: number | null
    additionAmount: number | null
    isPrimaryEmployer: boolean
  }
  socialSecurity: {
    ssn: string | null
    healthInsurance: string | null
    healthInsuranceCode: string | null
    healthInsuranceStatus: string | null
    privateHealthContribution: number | null
    personnelGroupCode: string | null
    contributionGroupCode: string | null
    activityCode: string | null
    midijobFlag: number
  }
  bank: {
    iban: string | null
    bic: string | null
    accountHolder: string | null
  }
  compensation: {
    grossSalary: number | null
    hourlyRate: number | null
    paymentType: string | null
    salaryGroup: string | null
  }
  contract: {
    entryDate: string | null
    exitDate: string | null
    contractType: string | null
    department: string | null
    departmentCode: string | null
    costCenter: string | null
    costCenterCode: string | null
  }
  monthlyValues: {
    targetHours: number
    workedHours: number
    overtimeHours: number
    vacationDays: number
    sickDays: number
    otherAbsenceDays: number
  }
  benefits: {
    companyCars: Array<{
      listPrice: number
      propulsionType: string
      distanceToWorkKm: number
      usageType: string
    }>
    jobBikes: Array<{ listPrice: number; usageType: string }>
    mealAllowances: Array<{ dailyAmount: number; workDaysPerMonth: number }>
    vouchers: Array<{ monthlyAmount: number; provider: string | null }>
    jobTickets: Array<{ monthlyAmount: number; isAdditional: boolean }>
    pensions: Array<{
      executionType: string
      employeeContribution: number
      employerContribution: number
      mandatorySubsidy: number
    }>
    savings: Array<{
      investmentType: string
      monthlyAmount: number
      employerShare: number
      employeeShare: number
      recipientIban: string | null
    }>
  }
  garnishments: Array<{
    creditorName: string
    fileReference: string | null
    amount: number
    method: string
    dependents: number
    rank: number
  }>
  children: Array<{
    firstName: string
    lastName: string
    birthDate: string
    taxAllowanceShare: number
  }>
  foreignAssignments: Array<{
    countryCode: string
    countryName: string
    startDate: string
    endDate: string | null
    a1Number: string | null
  }>
  parentalLeaves: Array<{
    startDate: string
    endDate: string | null
    isPartnerMonths: boolean
  }>
  maternityLeaves: Array<{
    startDate: string
    expectedBirthDate: string
    actualBirthDate: string | null
    actualEndDate: string | null
  }>
  disability: {
    degree: number | null
    equalStatus: boolean
    markers: string | null
    idValidUntil: string | null
  }
  pension: {
    receivesOldAge: boolean
    receivesDisability: boolean
    receivesSurvivor: boolean
    startDate: string | null
  }
}

export interface ExportContext {
  exportInterface: ExportContextInterface
  period: ExportContextPeriod
  tenant: ExportContextTenant
  template: ExportContextTemplate
  payrollWages: ExportContextWage[]
  employees: ExportContextEmployee[]
}

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

function decimalToNumber(
  val: Prisma.Decimal | number | null | undefined,
): number | null {
  if (val === null || val === undefined) return null
  return Number(val)
}

function formatDateIso(date: Date | null | undefined): string | null {
  if (!date) return null
  // Use UTC components so dates do not shift on TZ-changing systems.
  const yyyy = String(date.getUTCFullYear())
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(date.getUTCDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

/**
 * Safely decrypt a possibly-encrypted field. Returns null on error so
 * a single corrupt record cannot break the entire export.
 */
function safeDecrypt(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null
  try {
    if (isEncrypted(value)) return decryptField(value)
    return value
  } catch {
    return null
  }
}

export function buildPeriod(year: number, month: number): ExportContextPeriod {
  const monthPadded = String(month).padStart(2, "0")
  const firstDayDate = new Date(Date.UTC(year, month - 1, 1))
  const lastDayDate = new Date(Date.UTC(year, month, 0))
  const dd = "01"
  const mm = monthPadded
  return {
    year,
    month,
    monthPadded,
    monthName: MONTH_NAMES_DE[month] ?? "",
    monthNameEn: MONTH_NAMES_EN[month] ?? "",
    isoDate: `${year}-${monthPadded}`,
    ddmmyyyy: `${dd}${mm}${year}`,
    firstDay: `${dd}.${mm}.${year}`,
    lastDay: `${String(lastDayDate.getUTCDate()).padStart(2, "0")}.${monthPadded}.${year}`,
    // unused defaults filled in for completeness
    ...(firstDayDate ? {} : {}),
  }
}

/**
 * Period intersection predicate.
 * Returns true if the record [startDate, endDate) overlaps with the
 * payroll period [periodStart, periodEnd].
 */
function isActiveInPeriod(
  startDate: Date | null | undefined,
  endDate: Date | null | undefined,
  periodStart: Date,
  periodEnd: Date,
): boolean {
  if (!startDate) return false
  if (startDate > periodEnd) return false
  if (endDate && endDate < periodStart) return false
  return true
}

// ──────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────

export interface BuildContextOptions {
  tenantId: string
  exportInterfaceId?: string | null
  templateId?: string | null
  year: number
  month: number
  employeeIds?: string[]
  template?: {
    fieldSeparator?: string
    decimalSeparator?: string
    dateFormat?: string
    targetSystem?: string
  }
}

export async function buildExportContext(
  prisma: PrismaClient,
  options: BuildContextOptions,
): Promise<ExportContext> {
  const { tenantId, year, month } = options
  const periodStart = new Date(Date.UTC(year, month - 1, 1))
  const periodEnd = new Date(Date.UTC(year, month, 0))
  const period = buildPeriod(year, month)

  // Tenant + ExportInterface
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: {
      name: true,
      addressStreet: true,
      addressZip: true,
      addressCity: true,
      addressCountry: true,
    },
  })

  let exportInterface: ExportContextInterface = {
    name: "",
    mandantNumber: "",
    beraterNr: "",
  }
  if (options.exportInterfaceId) {
    const ei = await prisma.exportInterface.findFirst({
      where: { id: options.exportInterfaceId, tenantId },
      select: { name: true, mandantNumber: true, beraterNr: true },
    })
    if (ei) {
      exportInterface = {
        name: ei.name,
        mandantNumber: ei.mandantNumber ?? "",
        beraterNr: ei.beraterNr ?? "",
      }
    }
  }

  // Payroll wages (per tenant — used by templates to look up Lohnart codes)
  const wages = await prisma.tenantPayrollWage.findMany({
    where: { tenantId, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  })
  const payrollWages: ExportContextWage[] = wages.map((w) => ({
    code: w.code,
    name: w.name,
    terpSource: w.terpSource,
    category: w.category,
  }))

  // Employees + relations
  const employees = await prisma.employee.findMany({
    where: {
      tenantId,
      deletedAt: null,
      ...(options.employeeIds && options.employeeIds.length > 0
        ? { id: { in: options.employeeIds } }
        : { isActive: true }),
    },
    include: {
      department: { select: { name: true, code: true } },
      costCenter: { select: { name: true, code: true } },
      healthInsuranceProvider: {
        select: { name: true, institutionCode: true },
      },
      children: true,
      // Period-filtered benefits / records (see plan addendum)
      companyCars: {
        where: {
          startDate: { lte: periodEnd },
          OR: [{ endDate: null }, { endDate: { gte: periodStart } }],
        },
      },
      jobBikes: {
        where: {
          startDate: { lte: periodEnd },
          OR: [{ endDate: null }, { endDate: { gte: periodStart } }],
        },
      },
      mealAllowances: {
        where: {
          startDate: { lte: periodEnd },
          OR: [{ endDate: null }, { endDate: { gte: periodStart } }],
        },
      },
      vouchers: {
        where: {
          startDate: { lte: periodEnd },
          OR: [{ endDate: null }, { endDate: { gte: periodStart } }],
        },
      },
      jobTickets: {
        where: {
          startDate: { lte: periodEnd },
          OR: [{ endDate: null }, { endDate: { gte: periodStart } }],
        },
      },
      pensions: {
        where: {
          startDate: { lte: periodEnd },
          OR: [{ endDate: null }, { endDate: { gte: periodStart } }],
        },
      },
      savings: {
        where: {
          startDate: { lte: periodEnd },
          OR: [{ endDate: null }, { endDate: { gte: periodStart } }],
        },
      },
      garnishments: {
        where: {
          startDate: { lte: periodEnd },
          OR: [{ endDate: null }, { endDate: { gte: periodStart } }],
        },
      },
      foreignAssignments: {
        where: {
          startDate: { lte: periodEnd },
          OR: [{ endDate: null }, { endDate: { gte: periodStart } }],
        },
      },
      parentalLeaves: {
        where: {
          startDate: { lte: periodEnd },
          OR: [{ endDate: null }, { endDate: { gte: periodStart } }],
        },
      },
      maternityLeaves: {
        where: {
          startDate: { lte: periodEnd },
          OR: [
            { actualEndDate: null },
            { actualEndDate: { gte: periodStart } },
          ],
        },
      },
    },
    orderBy: [{ personnelNumber: "asc" }],
  })

  // Monthly value batch fetch
  const empIds = employees.map((e) => e.id)
  const monthlyValues = empIds.length
    ? await prisma.monthlyValue.findMany({
        where: { tenantId, employeeId: { in: empIds }, year, month },
      })
    : []
  const mvMap = new Map(monthlyValues.map((mv) => [mv.employeeId, mv]))

  const employeeContexts: ExportContextEmployee[] = employees.map((emp) => {
    const mv = mvMap.get(emp.id)

    return {
      personnelNumber: emp.personnelNumber,
      firstName: emp.firstName,
      lastName: emp.lastName,
      birthName: emp.birthName,
      birthDate: formatDateIso(emp.birthDate),
      gender: emp.gender,
      nationality: emp.nationality,
      maritalStatus: emp.maritalStatus,
      address: {
        street: emp.addressStreet,
        houseNumber: emp.houseNumber,
        zip: emp.addressZip,
        city: emp.addressCity,
        country: emp.addressCountry,
      },
      tax: {
        taxId: safeDecrypt(emp.taxId),
        taxClass: emp.taxClass,
        taxFactor: decimalToNumber(emp.taxFactor),
        denomination: emp.denomination,
        spouseDenomination: emp.spouseDenomination,
        childAllowance: decimalToNumber(emp.childTaxAllowance),
        freeAllowance: decimalToNumber(emp.payrollTaxAllowance),
        additionAmount: decimalToNumber(emp.payrollTaxAddition),
        isPrimaryEmployer: emp.isPrimaryEmployer ?? true,
      },
      socialSecurity: {
        ssn: safeDecrypt(emp.socialSecurityNumber),
        healthInsurance: emp.healthInsuranceProvider?.name ?? null,
        healthInsuranceCode: emp.healthInsuranceProvider?.institutionCode ?? null,
        healthInsuranceStatus: emp.healthInsuranceStatus,
        privateHealthContribution: decimalToNumber(
          emp.privateHealthInsuranceContribution,
        ),
        personnelGroupCode: emp.personnelGroupCode,
        contributionGroupCode: emp.contributionGroupCode,
        activityCode: emp.activityCode,
        midijobFlag: emp.midijobFlag ?? 0,
      },
      bank: {
        iban: safeDecrypt(emp.iban),
        bic: emp.bic,
        accountHolder: emp.accountHolder,
      },
      compensation: {
        grossSalary: decimalToNumber(emp.grossSalary),
        hourlyRate: decimalToNumber(emp.hourlyRate),
        paymentType: emp.paymentType,
        salaryGroup: emp.salaryGroup,
      },
      contract: {
        entryDate: formatDateIso(emp.entryDate),
        exitDate: formatDateIso(emp.exitDate),
        contractType: emp.contractType,
        department: emp.department?.name ?? null,
        departmentCode: emp.department?.code ?? null,
        costCenter: emp.costCenter?.name ?? null,
        costCenterCode: emp.costCenter?.code ?? null,
      },
      monthlyValues: {
        targetHours: mv ? mv.totalTargetTime / 60 : 0,
        workedHours: mv ? mv.totalNetTime / 60 : 0,
        overtimeHours: mv ? mv.totalOvertime / 60 : 0,
        vacationDays: mv ? Number(mv.vacationTaken) : 0,
        sickDays: mv ? mv.sickDays : 0,
        otherAbsenceDays: mv ? mv.otherAbsenceDays : 0,
      },
      benefits: {
        companyCars: emp.companyCars.map((c) => ({
          listPrice: Number(c.listPrice),
          propulsionType: c.propulsionType,
          distanceToWorkKm: Number(c.distanceToWorkKm),
          usageType: c.usageType,
        })),
        jobBikes: emp.jobBikes.map((b) => ({
          listPrice: Number(b.listPrice),
          usageType: b.usageType,
        })),
        mealAllowances: emp.mealAllowances.map((m) => ({
          dailyAmount: Number(m.dailyAmount),
          workDaysPerMonth: Number(m.workDaysPerMonth),
        })),
        vouchers: emp.vouchers.map((v) => ({
          monthlyAmount: Number(v.monthlyAmount),
          provider: v.provider,
        })),
        jobTickets: emp.jobTickets.map((j) => ({
          monthlyAmount: Number(j.monthlyAmount),
          isAdditional: j.isAdditional,
        })),
        pensions: emp.pensions.map((p) => ({
          executionType: p.executionType,
          employeeContribution: Number(p.employeeContribution),
          employerContribution: Number(p.employerContribution),
          mandatorySubsidy: Number(p.mandatoryEmployerSubsidy),
        })),
        savings: emp.savings.map((s) => ({
          investmentType: s.investmentType,
          monthlyAmount: Number(s.monthlyAmount),
          employerShare: Number(s.employerShare),
          employeeShare: Number(s.employeeShare),
          recipientIban: safeDecrypt(s.recipientIban),
        })),
      },
      garnishments: emp.garnishments.map((g) => ({
        creditorName: safeDecrypt(g.creditorName) ?? "",
        fileReference: safeDecrypt(g.fileReference),
        amount: Number(g.garnishmentAmount),
        method: g.calculationMethod,
        dependents: g.dependentsCount,
        rank: g.rank,
      })),
      children: emp.children.map((c) => ({
        firstName: c.firstName,
        lastName: c.lastName,
        birthDate: formatDateIso(c.birthDate) ?? "",
        taxAllowanceShare: Number(c.taxAllowanceShare),
      })),
      foreignAssignments: emp.foreignAssignments.map((fa) => ({
        countryCode: fa.countryCode,
        countryName: fa.countryName,
        startDate: formatDateIso(fa.startDate) ?? "",
        endDate: formatDateIso(fa.endDate),
        a1Number: fa.a1CertificateNumber,
      })),
      parentalLeaves: emp.parentalLeaves.map((pl) => ({
        startDate: formatDateIso(pl.startDate) ?? "",
        endDate: formatDateIso(pl.endDate),
        isPartnerMonths: pl.isPartnerMonths,
      })),
      maternityLeaves: emp.maternityLeaves.map((ml) => ({
        startDate: formatDateIso(ml.startDate) ?? "",
        expectedBirthDate: formatDateIso(ml.expectedBirthDate) ?? "",
        actualBirthDate: formatDateIso(ml.actualBirthDate),
        actualEndDate: formatDateIso(ml.actualEndDate),
      })),
      disability: {
        degree: emp.disabilityDegree,
        equalStatus: emp.disabilityEqualStatus ?? false,
        markers: emp.disabilityMarkers,
        idValidUntil: formatDateIso(emp.disabilityIdValidUntil),
      },
      pension: {
        receivesOldAge: emp.receivesOldAgePension ?? false,
        receivesDisability: emp.receivesDisabilityPension ?? false,
        receivesSurvivor: emp.receivesSurvivorPension ?? false,
        startDate: formatDateIso(emp.pensionStartDate),
      },
    }
  })

  // Period filtering for in-memory data is also applied above via Prisma.
  // The helper is exported for tests / future refactors.
  void isActiveInPeriod

  return {
    exportInterface,
    period,
    tenant,
    template: {
      fieldSeparator: options.template?.fieldSeparator ?? ";",
      decimalSeparator: options.template?.decimalSeparator ?? ",",
      dateFormat: options.template?.dateFormat ?? "TT.MM.JJJJ",
      targetSystem: options.template?.targetSystem ?? "custom",
    },
    payrollWages,
    employees: employeeContexts,
  }
}

// Re-export the period predicate so tests / consumers can verify it.
export function isRecordActiveInPeriod(
  startDate: Date | null | undefined,
  endDate: Date | null | undefined,
  year: number,
  month: number,
): boolean {
  const periodStart = new Date(Date.UTC(year, month - 1, 1))
  const periodEnd = new Date(Date.UTC(year, month, 0))
  if (!startDate) return false
  if (startDate > periodEnd) return false
  if (endDate && endDate < periodStart) return false
  return true
}
