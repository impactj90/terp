import { randomUUID } from "node:crypto"

import type {
  TenantTemplateConfigResult,
  TenantTemplateContext,
  TenantTemplateTx,
} from "../../types"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEPARTMENTS: Array<{ code: string; name: string; description: string }> = [
  { code: "PROD", name: "Produktion", description: "Fertigung und Montage" },
  { code: "LAG", name: "Lager", description: "Wareneingang, -ausgang, Kommissionierung" },
  { code: "VERW", name: "Verwaltung", description: "Buchhaltung, HR, Einkauf" },
  { code: "AD", name: "Außendienst", description: "Service und Montage beim Kunden" },
]

export type ShiftKey = "FS" | "SS" | "NS"
const SHIFT_MODELS: Array<{ key: ShiftKey; label: string; comeFrom: number; comeTo: number; goFrom: number; goTo: number }> = [
  { key: "FS", label: "Frühschicht", comeFrom: 5 * 60, comeTo: 6 * 60 + 30, goFrom: 13 * 60 + 30, goTo: 15 * 60 },
  { key: "SS", label: "Spätschicht", comeFrom: 13 * 60, comeTo: 14 * 60 + 30, goFrom: 21 * 60 + 30, goTo: 23 * 60 },
  { key: "NS", label: "Nachtschicht", comeFrom: 21 * 60, comeTo: 22 * 60 + 30, goFrom: 5 * 60 + 30, goTo: 7 * 60 },
]

const ACCOUNTS: Array<{
  code: string
  name: string
  accountType: "bonus" | "day" | "month"
  unit: "minutes" | "hours" | "days"
  displayFormat: "decimal" | "hh_mm"
  sortOrder: number
}> = [
  { code: "FLEX", name: "Gleitzeit", accountType: "month", unit: "minutes", displayFormat: "hh_mm", sortOrder: 10 },
  { code: "OT", name: "Überstunden", accountType: "month", unit: "minutes", displayFormat: "hh_mm", sortOrder: 20 },
  { code: "VAC", name: "Urlaub", accountType: "month", unit: "days", displayFormat: "decimal", sortOrder: 30 },
  { code: "ILL", name: "Krankheit", accountType: "month", unit: "days", displayFormat: "decimal", sortOrder: 40 },
  { code: "BON_NT", name: "Nachtzuschlag", accountType: "bonus", unit: "minutes", displayFormat: "hh_mm", sortOrder: 50 },
  { code: "BON_SN", name: "Sonntagszuschlag", accountType: "bonus", unit: "minutes", displayFormat: "hh_mm", sortOrder: 60 },
  { code: "BON_FT", name: "Feiertagszuschlag", accountType: "bonus", unit: "minutes", displayFormat: "hh_mm", sortOrder: 70 },
  { code: "TRG", name: "Sollzeit", accountType: "day", unit: "minutes", displayFormat: "hh_mm", sortOrder: 80 },
  { code: "ACT", name: "Istzeit", accountType: "day", unit: "minutes", displayFormat: "hh_mm", sortOrder: 90 },
  { code: "BRK", name: "Pausen", accountType: "day", unit: "minutes", displayFormat: "hh_mm", sortOrder: 100 },
]

const BOOKING_TYPES: Array<{
  code: string
  name: string
  direction: "in" | "out"
  category: string
  description: string
}> = [
  { code: "DMO_KOM", name: "Kommen", direction: "in", category: "work", description: "Arbeitsbeginn" },
  { code: "DMO_GEH", name: "Gehen", direction: "out", category: "work", description: "Arbeitsende" },
  { code: "DMO_PSB", name: "Pause Beginn", direction: "out", category: "break", description: "Pausenbeginn" },
  { code: "DMO_PSE", name: "Pause Ende", direction: "in", category: "break", description: "Pausenende" },
  { code: "DMO_DGB", name: "Dienstgang Beginn", direction: "out", category: "business_trip", description: "Dienstgang gestartet" },
  { code: "DMO_DGE", name: "Dienstgang Ende", direction: "in", category: "business_trip", description: "Dienstgang beendet" },
  { code: "DMO_HOB", name: "Homeoffice Beginn", direction: "in", category: "work", description: "Beginn im Homeoffice" },
  { code: "DMO_HOE", name: "Homeoffice Ende", direction: "out", category: "work", description: "Ende im Homeoffice" },
]

const ABSENCE_TYPES: Array<{
  code: string
  name: string
  category: string
  color: string
  deductsVacation: boolean
  requiresApproval: boolean
  sortOrder: number
}> = [
  { code: "U", name: "Urlaub", category: "vacation", color: "#2E7D32", deductsVacation: true, requiresApproval: true, sortOrder: 10 },
  { code: "K", name: "Krankheit", category: "illness", color: "#C62828", deductsVacation: false, requiresApproval: false, sortOrder: 20 },
  { code: "S1", name: "Sonderurlaub", category: "special", color: "#6A1B9A", deductsVacation: false, requiresApproval: true, sortOrder: 30 },
  { code: "S2", name: "Fortbildung", category: "training", color: "#1565C0", deductsVacation: false, requiresApproval: true, sortOrder: 40 },
  { code: "S3", name: "Mutterschutz", category: "maternity", color: "#EC407A", deductsVacation: false, requiresApproval: false, sortOrder: 50 },
  { code: "U1", name: "Unbezahlter Urlaub", category: "unpaid", color: "#757575", deductsVacation: false, requiresApproval: true, sortOrder: 60 },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export async function seedDepartments(tx: TenantTemplateTx, tenantId: string) {
  const records = DEPARTMENTS.map((d) => ({
    id: randomUUID(),
    tenantId,
    code: d.code,
    name: d.name,
    description: d.description,
  }))
  await tx.department.createMany({ data: records })
  return records
}

export async function seedAccounts(tx: TenantTemplateTx, tenantId: string) {
  // Create a single account group to nest the demo accounts under.
  const groupId = randomUUID()
  await tx.accountGroup.create({
    data: {
      id: groupId,
      tenantId,
      code: "DEMO",
      name: "Demo-Kontengruppe",
      description: "Alle Konten des Demo-Tenants",
      sortOrder: 0,
    },
  })

  const records = ACCOUNTS.map((a) => ({
    id: randomUUID(),
    tenantId,
    accountGroupId: groupId,
    code: a.code,
    name: a.name,
    accountType: a.accountType,
    unit: a.unit,
    displayFormat: a.displayFormat,
    sortOrder: a.sortOrder,
  }))
  await tx.account.createMany({ data: records })
  return { groups: [{ id: groupId }], accounts: records }
}

export async function seedDayPlans(tx: TenantTemplateTx, tenantId: string) {
  const records = SHIFT_MODELS.map((s) => ({
    id: randomUUID(),
    tenantId,
    code: s.key,
    name: s.label,
    description: `${s.label} (Demo-Template)`,
    planType: "fixed",
    comeFrom: s.comeFrom,
    comeTo: s.comeTo,
    goFrom: s.goFrom,
    goTo: s.goTo,
    regularHours: 480, // 8h
    shiftKey: s.key,
  }))
  await tx.dayPlan.createMany({
    data: records.map(({ shiftKey: _shiftKey, ...rest }) => rest),
  })
  return records
}

export async function seedWeekPlans(
  tx: TenantTemplateTx,
  tenantId: string,
  dayPlans: Awaited<ReturnType<typeof seedDayPlans>>,
) {
  const records = dayPlans.map((dp) => ({
    id: randomUUID(),
    tenantId,
    code: `WP_${dp.shiftKey}`,
    name: `Wochenplan ${dp.name}`,
    mondayDayPlanId: dp.id,
    tuesdayDayPlanId: dp.id,
    wednesdayDayPlanId: dp.id,
    thursdayDayPlanId: dp.id,
    fridayDayPlanId: dp.id,
    saturdayDayPlanId: null as string | null,
    sundayDayPlanId: null as string | null,
    shiftKey: dp.shiftKey,
  }))
  await tx.weekPlan.createMany({
    data: records.map(({ shiftKey: _shiftKey, ...rest }) => rest),
  })
  return records
}

export async function seedTariffs(
  tx: TenantTemplateTx,
  tenantId: string,
  weekPlans: Awaited<ReturnType<typeof seedWeekPlans>>,
) {
  // 12 tariffs: 4 wage tiers × 3 shift models.
  const tiers = ["A", "B", "C", "D"] as const
  const records: Array<{
    id: string
    tenantId: string
    code: string
    name: string
    weekPlanId: string
    dailyTargetHours: number
    weeklyTargetHours: number
    annualVacationDays: number
    workDaysPerWeek: number
    shiftKey: ShiftKey
  }> = []
  for (const wp of weekPlans) {
    for (const tier of tiers) {
      records.push({
        id: randomUUID(),
        tenantId,
        code: `T_${wp.shiftKey}_${tier}`,
        name: `Tarif ${wp.shiftKey} Stufe ${tier}`,
        weekPlanId: wp.id,
        dailyTargetHours: 8,
        weeklyTargetHours: 40,
        annualVacationDays: 30,
        workDaysPerWeek: 5,
        shiftKey: wp.shiftKey,
      })
    }
  }
  await tx.tariff.createMany({
    data: records.map(({ shiftKey: _shiftKey, ...rest }) => rest),
  })
  return records
}

export async function seedBookingTypes(tx: TenantTemplateTx, tenantId: string) {
  const records = BOOKING_TYPES.map((bt) => ({
    id: randomUUID(),
    tenantId,
    code: bt.code,
    name: bt.name,
    direction: bt.direction,
    category: bt.category,
    description: bt.description,
  }))
  await tx.bookingType.createMany({ data: records })
  return records
}

export async function seedAbsenceTypes(tx: TenantTemplateTx, tenantId: string) {
  const records = ABSENCE_TYPES.map((at) => ({
    id: randomUUID(),
    tenantId,
    code: at.code,
    name: at.name,
    category: at.category,
    color: at.color,
    deductsVacation: at.deductsVacation,
    requiresApproval: at.requiresApproval,
    sortOrder: at.sortOrder,
  }))
  await tx.absenceType.createMany({ data: records })
  return records
}

export async function seedWhArticleGroups(
  tx: TenantTemplateTx,
  tenantId: string,
) {
  const groupA = randomUUID()
  const groupB = randomUUID()
  await tx.whArticleGroup.createMany({
    data: [
      { id: groupA, tenantId, name: "Verbrauchsmaterial", sortOrder: 10 },
      { id: groupB, tenantId, name: "Ersatzteile", sortOrder: 20 },
    ],
  })
  return [
    { id: groupA, code: "Verbrauchsmaterial" },
    { id: groupB, code: "Ersatzteile" },
  ]
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export async function applyIndustriedienstleisterConfig(
  ctx: TenantTemplateContext,
): Promise<TenantTemplateConfigResult> {
  const { tx, tenantId } = ctx

  const departments = await seedDepartments(tx, tenantId)
  const accountsResult = await seedAccounts(tx, tenantId)
  const dayPlans = await seedDayPlans(tx, tenantId)
  const weekPlans = await seedWeekPlans(tx, tenantId, dayPlans)
  const tariffs = await seedTariffs(tx, tenantId, weekPlans)
  const bookingTypes = await seedBookingTypes(tx, tenantId)
  const absenceTypes = await seedAbsenceTypes(tx, tenantId)
  const whArticleGroups = await seedWhArticleGroups(tx, tenantId)

  return {
    departments,
    tariffs,
    dayPlans,
    weekPlans,
    accountGroups: accountsResult.groups,
    accounts: accountsResult.accounts,
    bookingTypes,
    absenceTypes,
    whArticleGroups,
  }
}
