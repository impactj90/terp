import { faker } from "@faker-js/faker/locale/de"
import { randomUUID } from "node:crypto"

import type { DemoTemplate, DemoTemplateContext, DemoTx } from "../types"

/**
 * "Industriedienstleister 150" — sales-enablement demo template.
 *
 * Seeds a self-contained demo tenant with:
 * - 4 departments (Produktion, Lager, Verwaltung, Außendienst)
 * - 1 account group + 10 accounts (flex, OT, vacation, bonus buckets, ...)
 * - 3 day plans (Frühschicht / Spätschicht / Nachtschicht)
 * - 3 week plans, one per shift model
 * - 12 tariffs spread across the 3 shift models (4 wage tiers per shift)
 * - 8 tenant-scoped booking types
 * - 6 absence types (U/K/S-prefixed, per domain constraint)
 * - 20 Bayern holidays (2026 + 2027)
 * - 150 employees distributed across departments, with per-day plans for the
 *   next 30 days (≈4500 EmployeeDayPlan rows)
 * - 3 CRM customer addresses
 * - 5 billing invoices with 3 positions each
 * - 2 warehouse article groups + 30 articles
 *
 * All writes go through ctx.tx. Faker is re-seeded at the start of apply() so
 * that two runs of the same template produce identical data shapes.
 *
 * Performance note: per-entity helpers use createMany with pre-generated UUIDs
 * whenever relations need to be resolved after the insert, keeping total
 * round-trips in the low double digits.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEPARTMENTS: Array<{ code: string; name: string; description: string }> = [
  { code: "PROD", name: "Produktion", description: "Fertigung und Montage" },
  { code: "LAG", name: "Lager", description: "Wareneingang, -ausgang, Kommissionierung" },
  { code: "VERW", name: "Verwaltung", description: "Buchhaltung, HR, Einkauf" },
  { code: "AD", name: "Außendienst", description: "Service und Montage beim Kunden" },
]

type ShiftKey = "FS" | "SS" | "NS"
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

// 20 Bayern-Feiertage across 2026 and 2027 (fixed dates for reproducibility).
const HOLIDAYS_BAYERN: Array<{ date: string; name: string }> = [
  { date: "2026-01-01", name: "Neujahr" },
  { date: "2026-01-06", name: "Heilige Drei Könige" },
  { date: "2026-04-03", name: "Karfreitag" },
  { date: "2026-04-06", name: "Ostermontag" },
  { date: "2026-05-01", name: "Tag der Arbeit" },
  { date: "2026-05-14", name: "Christi Himmelfahrt" },
  { date: "2026-05-25", name: "Pfingstmontag" },
  { date: "2026-06-04", name: "Fronleichnam" },
  { date: "2026-10-03", name: "Tag der Deutschen Einheit" },
  { date: "2026-11-01", name: "Allerheiligen" },
  { date: "2026-12-25", name: "1. Weihnachtstag" },
  { date: "2026-12-26", name: "2. Weihnachtstag" },
  { date: "2027-01-01", name: "Neujahr" },
  { date: "2027-01-06", name: "Heilige Drei Könige" },
  { date: "2027-03-26", name: "Karfreitag" },
  { date: "2027-03-29", name: "Ostermontag" },
  { date: "2027-05-01", name: "Tag der Arbeit" },
  { date: "2027-05-06", name: "Christi Himmelfahrt" },
  { date: "2027-05-17", name: "Pfingstmontag" },
  { date: "2027-05-27", name: "Fronleichnam" },
]

const EMPLOYEE_COUNT = 150
const EMPLOYEE_DAY_PLAN_HORIZON_DAYS = 30

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

async function apply(ctx: DemoTemplateContext): Promise<void> {
  // Deterministic seed so two runs of this template yield structurally
  // identical content (names, emails, article descriptions, ...).
  faker.seed(42)

  const { tx, tenantId } = ctx

  const departments = await seedDepartments(tx, tenantId)
  const accounts = await seedAccounts(tx, tenantId)
  const dayPlans = await seedDayPlans(tx, tenantId)
  const weekPlans = await seedWeekPlans(tx, tenantId, dayPlans)
  const tariffs = await seedTariffs(tx, tenantId, weekPlans)
  await seedBookingTypes(tx, tenantId)
  await seedAbsenceTypes(tx, tenantId)
  await seedHolidays(tx, tenantId)
  const employees = await seedEmployees(tx, tenantId, departments, tariffs)
  await seedEmployeeDayPlans(tx, tenantId, employees, dayPlans)
  const customers = await seedCrmAddresses(tx, tenantId)
  await seedBillingDocuments(tx, tenantId, customers)
  await seedWarehouse(tx, tenantId)

  // Silence unused-variable warning for accounts — seeded for visibility in the
  // demo but not referenced by other seed functions.
  void accounts
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function addDays(base: Date, days: number): Date {
  const d = new Date(base)
  d.setUTCDate(d.getUTCDate() + days)
  return d
}

function startOfUtcDay(d: Date): Date {
  const r = new Date(d)
  r.setUTCHours(0, 0, 0, 0)
  return r
}

async function seedDepartments(tx: DemoTx, tenantId: string) {
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

async function seedAccounts(tx: DemoTx, tenantId: string) {
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
  return records
}

async function seedDayPlans(tx: DemoTx, tenantId: string) {
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

async function seedWeekPlans(
  tx: DemoTx,
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

async function seedTariffs(
  tx: DemoTx,
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

async function seedBookingTypes(tx: DemoTx, tenantId: string) {
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

async function seedAbsenceTypes(tx: DemoTx, tenantId: string) {
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

async function seedHolidays(tx: DemoTx, tenantId: string) {
  const records = HOLIDAYS_BAYERN.map((h) => ({
    id: randomUUID(),
    tenantId,
    holidayDate: new Date(`${h.date}T00:00:00.000Z`),
    name: h.name,
  }))
  await tx.holiday.createMany({ data: records })
  return records
}

async function seedEmployees(
  tx: DemoTx,
  tenantId: string,
  departments: Awaited<ReturnType<typeof seedDepartments>>,
  tariffs: Awaited<ReturnType<typeof seedTariffs>>,
) {
  const entryBase = new Date("2020-01-01T00:00:00.000Z")
  const records: Array<{
    id: string
    tenantId: string
    personnelNumber: string
    pin: string
    firstName: string
    lastName: string
    email: string
    phone: string
    departmentId: string
    tariffId: string
    entryDate: Date
    weeklyHours: number
  }> = []

  for (let i = 0; i < EMPLOYEE_COUNT; i++) {
    const first = faker.person.firstName()
    const last = faker.person.lastName()
    const dept = departments[i % departments.length]!
    const tariff = tariffs[i % tariffs.length]!
    const entryOffset = faker.number.int({ min: 0, max: 365 * 5 })
    records.push({
      id: randomUUID(),
      tenantId,
      personnelNumber: `EMP-${String(i + 1).padStart(4, "0")}`,
      pin: String(1000 + i),
      firstName: first,
      lastName: last,
      email: faker.internet
        .email({ firstName: first, lastName: last })
        .toLowerCase(),
      phone: faker.phone.number(),
      departmentId: dept.id,
      tariffId: tariff.id,
      entryDate: addDays(entryBase, entryOffset),
      weeklyHours: 40,
    })
  }

  await tx.employee.createMany({ data: records })
  return records
}

async function seedEmployeeDayPlans(
  tx: DemoTx,
  tenantId: string,
  employees: Awaited<ReturnType<typeof seedEmployees>>,
  dayPlans: Awaited<ReturnType<typeof seedDayPlans>>,
) {
  // Assign a day plan per employee per day for the next N days.
  // Each employee sticks to a single day plan (derived from tariff order) to
  // match the deterministic tariff rotation above — keeps the demo coherent.
  const today = startOfUtcDay(new Date())
  const records: Array<{
    id: string
    tenantId: string
    employeeId: string
    planDate: Date
    dayPlanId: string
    source: string
  }> = []

  for (let idx = 0; idx < employees.length; idx++) {
    const employee = employees[idx]!
    // Pick the day plan that matches the employee's implicit shift from tariff idx.
    const dp = dayPlans[idx % dayPlans.length]!
    for (let d = 0; d < EMPLOYEE_DAY_PLAN_HORIZON_DAYS; d++) {
      const planDate = addDays(today, d)
      // Skip weekends to mirror the week plan (Mon–Fri only).
      const dow = planDate.getUTCDay()
      if (dow === 0 || dow === 6) continue
      records.push({
        id: randomUUID(),
        tenantId,
        employeeId: employee.id,
        planDate,
        dayPlanId: dp.id,
        source: "tariff",
      })
    }
  }

  // Batch to keep param counts below Postgres' 65k bind limit.
  const BATCH = 1000
  for (let i = 0; i < records.length; i += BATCH) {
    await tx.employeeDayPlan.createMany({ data: records.slice(i, i + BATCH) })
  }
  return records.length
}

async function seedCrmAddresses(tx: DemoTx, tenantId: string) {
  const records = [
    {
      id: randomUUID(),
      tenantId,
      number: "K-10001",
      type: "CUSTOMER" as const,
      company: "Bayrische Maschinenbau AG",
      street: "Industriestr. 12",
      zip: "80339",
      city: "München",
      country: "DE",
      email: "einkauf@bayr-mbau.example",
      phone: "+49 89 1234567",
    },
    {
      id: randomUUID(),
      tenantId,
      number: "K-10002",
      type: "CUSTOMER" as const,
      company: "Nordwerke GmbH & Co. KG",
      street: "Hafenallee 8",
      zip: "20457",
      city: "Hamburg",
      country: "DE",
      email: "rechnung@nordwerke.example",
      phone: "+49 40 9876543",
    },
    {
      id: randomUUID(),
      tenantId,
      number: "K-10003",
      type: "CUSTOMER" as const,
      company: "Rheinland Logistik SE",
      street: "Domstr. 44",
      zip: "50667",
      city: "Köln",
      country: "DE",
      email: "buchhaltung@rheinland-log.example",
      phone: "+49 221 5551234",
    },
  ]
  await tx.crmAddress.createMany({ data: records })
  return records
}

async function seedBillingDocuments(
  tx: DemoTx,
  tenantId: string,
  customers: Awaited<ReturnType<typeof seedCrmAddresses>>,
) {
  const today = startOfUtcDay(new Date())
  const [customerA, customerB, customerC] = customers
  if (!customerA || !customerB || !customerC) {
    throw new Error("seedBillingDocuments: expected at least 3 seeded customers")
  }
  const invoices = [
    { number: "INV-2026-0001", customer: customerA, docDate: addDays(today, -21) },
    { number: "INV-2026-0002", customer: customerB, docDate: addDays(today, -14) },
    { number: "INV-2026-0003", customer: customerA, docDate: addDays(today, -10) },
    { number: "INV-2026-0004", customer: customerC, docDate: addDays(today, -5) },
    { number: "INV-2026-0005", customer: customerB, docDate: addDays(today, -1) },
  ]

  for (const inv of invoices) {
    const positions = [
      {
        id: randomUUID(),
        sortOrder: 1,
        type: "FREE" as const,
        description: "Wartung Schichtleitsystem",
        quantity: 1,
        unit: "Pausch.",
        unitPrice: 1850,
        totalPrice: 1850,
        vatRate: 19,
      },
      {
        id: randomUUID(),
        sortOrder: 2,
        type: "FREE" as const,
        description: "Anfahrt und Montage",
        quantity: 2,
        unit: "Std",
        unitPrice: 95,
        totalPrice: 190,
        vatRate: 19,
      },
      {
        id: randomUUID(),
        sortOrder: 3,
        type: "FREE" as const,
        description: "Ersatzteile nach Aufwand",
        quantity: 1,
        unit: "Pausch.",
        unitPrice: 420,
        totalPrice: 420,
        vatRate: 19,
      },
    ]
    const subtotalNet = positions.reduce((s, p) => s + (p.totalPrice ?? 0), 0)
    const totalVat = Math.round(subtotalNet * 19) / 100
    const totalGross = subtotalNet + totalVat

    const docId = randomUUID()
    await tx.billingDocument.create({
      data: {
        id: docId,
        tenantId,
        number: inv.number,
        type: "INVOICE",
        status: "DRAFT",
        addressId: inv.customer.id,
        documentDate: inv.docDate,
        subtotalNet,
        totalVat,
        totalGross,
        paymentTermDays: 14,
        positions: {
          create: positions.map((p) => ({
            id: p.id,
            sortOrder: p.sortOrder,
            type: p.type,
            description: p.description,
            quantity: p.quantity,
            unit: p.unit,
            unitPrice: p.unitPrice,
            totalPrice: p.totalPrice,
            vatRate: p.vatRate,
          })),
        },
      },
    })
  }
}

async function seedWarehouse(tx: DemoTx, tenantId: string) {
  // 2 groups + 30 articles, 15 per group.
  const groupA = randomUUID()
  const groupB = randomUUID()
  await tx.whArticleGroup.createMany({
    data: [
      { id: groupA, tenantId, name: "Verbrauchsmaterial", sortOrder: 10 },
      { id: groupB, tenantId, name: "Ersatzteile", sortOrder: 20 },
    ],
  })

  const articles: Array<{
    id: string
    tenantId: string
    number: string
    name: string
    groupId: string
    unit: string
    vatRate: number
    sellPrice: number
    buyPrice: number
    stockTracking: boolean
    currentStock: number
    minStock: number
    isActive: boolean
  }> = []
  for (let i = 0; i < 30; i++) {
    const isGroupA = i < 15
    articles.push({
      id: randomUUID(),
      tenantId,
      number: `ART-${String(i + 1).padStart(4, "0")}`,
      name: isGroupA
        ? faker.commerce.productName()
        : `Ersatzteil ${faker.commerce.product()}`,
      groupId: isGroupA ? groupA : groupB,
      unit: isGroupA ? "Stk" : "Pck",
      vatRate: 19,
      sellPrice: Number(faker.commerce.price({ min: 10, max: 500, dec: 2 })),
      buyPrice: Number(faker.commerce.price({ min: 5, max: 300, dec: 2 })),
      stockTracking: true,
      currentStock: faker.number.int({ min: 0, max: 200 }),
      minStock: 10,
      isActive: true,
    })
  }
  await tx.whArticle.createMany({ data: articles })
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const industriedienstleister150: DemoTemplate = {
  key: "industriedienstleister_150",
  label: "Industriedienstleister (150 MA)",
  description:
    "150 Mitarbeiter, 4 Abteilungen, Schichtmodell FS/SS/NS, Demo-Rechnungen, Warehouse-Bestand. Nah am Pro-Di-Profil.",
  apply,
}
