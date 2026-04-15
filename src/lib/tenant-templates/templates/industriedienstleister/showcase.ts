import { faker } from "@faker-js/faker/locale/de"
import { randomUUID } from "node:crypto"

import type {
  TenantTemplate,
  TenantTemplateConfigResult,
  TenantTemplateTx,
} from "../../types"
import { applyIndustriedienstleisterConfig } from "./shared-config"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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
// Date helpers
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

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

async function seedHolidaysBayern(tx: TenantTemplateTx, tenantId: string) {
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
  tx: TenantTemplateTx,
  tenantId: string,
  departments: TenantTemplateConfigResult["departments"],
  tariffs: TenantTemplateConfigResult["tariffs"],
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
  tx: TenantTemplateTx,
  tenantId: string,
  employees: Awaited<ReturnType<typeof seedEmployees>>,
  dayPlans: TenantTemplateConfigResult["dayPlans"],
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

async function seedCrmAddresses(tx: TenantTemplateTx, tenantId: string) {
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
  tx: TenantTemplateTx,
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

async function seedWhArticles(
  tx: TenantTemplateTx,
  tenantId: string,
  groups: TenantTemplateConfigResult["whArticleGroups"],
) {
  const [groupA, groupB] = groups
  if (!groupA || !groupB) {
    throw new Error("seedWhArticles: expected at least 2 seeded whArticleGroups")
  }
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
      groupId: isGroupA ? groupA.id : groupB.id,
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
// Template export
// ---------------------------------------------------------------------------

export const industriedienstleisterShowcase: TenantTemplate = {
  key: "industriedienstleister_150",
  label: "Industriedienstleister (150 MA)",
  description:
    "150 Mitarbeiter, 4 Abteilungen, Schichtmodell FS/SS/NS, Demo-Rechnungen, Warehouse-Bestand. Nah am Pro-Di-Profil.",
  industry: "industriedienstleister",
  kind: "showcase",

  applyConfig: async (ctx) => {
    // Deterministic seed so two runs of this template yield structurally
    // identical content (names, emails, article descriptions, ...). Must run
    // before any faker-using helper in applySeedData below.
    faker.seed(42)
    return applyIndustriedienstleisterConfig(ctx)
  },

  applySeedData: async (ctx, config) => {
    const { tx, tenantId } = ctx
    await seedHolidaysBayern(tx, tenantId)
    const employees = await seedEmployees(
      tx,
      tenantId,
      config.departments,
      config.tariffs,
    )
    await seedEmployeeDayPlans(tx, tenantId, employees, config.dayPlans)
    const customers = await seedCrmAddresses(tx, tenantId)
    await seedBillingDocuments(tx, tenantId, customers)
    await seedWhArticles(tx, tenantId, config.whArticleGroups)
  },
}
