import { faker } from "@faker-js/faker/locale/de"
import { randomUUID } from "node:crypto"

import { Prisma } from "@/generated/prisma/client"
import type {
  TenantTemplate,
  TenantTemplateConfigResult,
  TenantTemplateTx,
} from "../../types"
import { applyIndustriedienstleisterConfig } from "./shared-config"
import {
  resolveLaborRateExtended,
  resolveTravelRateExtended,
} from "@/lib/services/labor-rate-resolver"

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

    // NK-1 (Decision 17): seed wage groups, order types, threshold
    // configs and activity-pricing presets so the demo tenant lands
    // with a working Soll/Ist baseline.
    await seedNkStammdaten(tx, tenantId)

    // NK-1 closing-pass (2026-05-06): seed Bewegungsdaten so the
    // Soll/Ist tab, Dashboard-Card and Reports-Page render with real
    // numbers out of the box. See `## Deviations` in the plan for the
    // direct-tx pattern justification.
    await seedNkBewegungsdaten(tx, tenantId, customers, employees)
  },

  // NK-1 (Decision 32): auto-enable nachkalkulation in addition to
  // the standard module set so the Soll/Ist UI is reachable out of
  // the box.
  modulesToEnable: ["nachkalkulation"],
}

// ---------------------------------------------------------------------------
// NK-1 seed helpers (Decision 17)
// ---------------------------------------------------------------------------

async function seedNkStammdaten(
  tx: TenantTemplateTx,
  tenantId: string,
): Promise<void> {
  // 1. Wage groups (Decision 2)
  await tx.wageGroup.createMany({
    data: [
      {
        tenantId,
        code: "MEISTER",
        name: "Meister",
        internalHourlyRate: 35,
        billingHourlyRate: 95,
        sortOrder: 10,
      },
      {
        tenantId,
        code: "MONTEUR",
        name: "Monteur",
        internalHourlyRate: 28,
        billingHourlyRate: 85,
        sortOrder: 20,
      },
      {
        tenantId,
        code: "GESELLE",
        name: "Geselle",
        internalHourlyRate: 24,
        billingHourlyRate: 75,
        sortOrder: 30,
      },
      {
        tenantId,
        code: "AZUBI",
        name: "Auszubildender",
        internalHourlyRate: 12,
        billingHourlyRate: 45,
        sortOrder: 40,
      },
      {
        tenantId,
        code: "HILFE",
        name: "Hilfskraft",
        internalHourlyRate: 18,
        billingHourlyRate: 55,
        sortOrder: 50,
      },
    ],
  })

  // 2. Order types (Decision 15)
  const orderTypeData = [
    { code: "WARTUNG", name: "Wartung", sortOrder: 10 },
    { code: "NOTDIENST", name: "Notdienst", sortOrder: 20 },
    { code: "REPARATUR", name: "Reparatur", sortOrder: 30 },
    { code: "INSPEKTION", name: "Inspektion", sortOrder: 40 },
    { code: "PROJEKT", name: "Projekt", sortOrder: 50 },
  ]
  await tx.orderType.createMany({
    data: orderTypeData.map((t) => ({ tenantId, ...t })),
  })

  // 3. Default threshold config + Notdienst override (Decision 9)
  await tx.nkThresholdConfig.create({
    data: {
      tenantId,
      orderTypeId: null,
      marginAmberFromPercent: 5,
      marginRedFromPercent: 0,
      productivityAmberFromPercent: 70,
      productivityRedFromPercent: 50,
    },
  })
  const notdienst = await tx.orderType.findFirst({
    where: { tenantId, code: "NOTDIENST" },
  })
  if (notdienst) {
    await tx.nkThresholdConfig.create({
      data: {
        tenantId,
        orderTypeId: notdienst.id,
        marginAmberFromPercent: 15,
        marginRedFromPercent: 5,
        productivityAmberFromPercent: 80,
        productivityRedFromPercent: 60,
      },
    })
  }

  // 4. Activity-Pricing presets (Decision 7) — only NEW codes
  // (existing universal-defaults activities stay as HOURLY).
  await tx.activity.createMany({
    data: [
      {
        tenantId,
        code: "NK_NOTANFAHRT",
        name: "Notdienst-Anfahrt",
        pricingType: "FLAT_RATE",
        flatRate: 89,
        calculatedHourEquivalent: 0.5,
      },
      {
        tenantId,
        code: "NK_VERLEGUNG",
        name: "Rohrverlegung",
        pricingType: "PER_UNIT",
        unit: "lfm",
        hourlyRate: 18,
      },
      {
        tenantId,
        code: "NK_BERATUNG",
        name: "Beratung",
        pricingType: "HOURLY",
        hourlyRate: 95,
      },
    ],
    skipDuplicates: true,
  })
}

// ---------------------------------------------------------------------------
// NK-1 Bewegungsdaten-Seed (closing-pass 2026-05-06)
// ---------------------------------------------------------------------------
//
// PAUSE+Deviation-Note (R-1-Pattern): Der Plan empfahl, die Bewegungsdaten
// über die normalen Services zu erstellen. Tatsächlich öffnen alle
// NK-1-Services (`createWithdrawal`, `updateTarget`, `sign`, ...) eigene
// `prisma.$transaction(...)` — Prisma erlaubt aber keine geschachtelten
// Transaktionen, und `applySeedData` läuft selbst inside einer Outer-Tx.
// Resolution: Wir folgen dem etablierten Codebase-Pattern (alle anderen
// `seedXxx`-Funktionen schreiben ebenfalls direkt via `tx.<model>.*`)
// und mirroren die Snapshot-Logik durch Aufruf der **pure resolver**
// `resolveLaborRateExtended` / `resolveTravelRateExtended` aus
// `labor-rate-resolver.ts`. Das Ergebnis ist 1:1 identisch zum
// Production-Pfad. Audit-Logs werden bewusst übersprungen — Demo-Daten
// brauchen keine Audit-Spur.
//
// Datenmenge: 3 ServiceObjects, 5 Aufträge mit OrderTargets (1× v1+v2),
// 6 WorkReports (5 SIGNED + 1 DRAFT), 24 OrderBookings (HOURLY +
// FLAT_RATE + PER_UNIT-Mix), 12 WhStockMovements + 1 InboundInvoice
// mit 3 Line-Items (2 mit Order-Verlinkung). Mindestens ein Booking
// triggert bewusst ein DataQualityIssue (Mitarbeiter ohne WageGroup,
// Activity ohne hourlyRate, Order ohne billingRatePerHour) damit der
// Drill-Down im Demo sichtbar ist.

async function seedNkBewegungsdaten(
  tx: TenantTemplateTx,
  tenantId: string,
  customers: Awaited<ReturnType<typeof seedCrmAddresses>>,
  employees: Awaited<ReturnType<typeof seedEmployees>>,
): Promise<void> {
  const today = startOfUtcDay(new Date())

  // 1. Lookup Stammdaten (von seedNkStammdaten + seedWhArticles + universal-defaults)
  const wageGroups = await tx.wageGroup.findMany({
    where: { tenantId },
    orderBy: { sortOrder: "asc" },
    select: { id: true, code: true, billingHourlyRate: true },
  })
  const wgByCode: Record<string, { id: string; rate: number | null }> = {}
  for (const wg of wageGroups) {
    wgByCode[wg.code] = {
      id: wg.id,
      rate: wg.billingHourlyRate ? Number(wg.billingHourlyRate) : null,
    }
  }
  const orderTypes = await tx.orderType.findMany({
    where: { tenantId },
    select: { id: true, code: true },
  })
  const otByCode: Record<string, string> = {}
  for (const ot of orderTypes) otByCode[ot.code] = ot.id

  // 2. Eine HOURLY-Default-Activity ohne Rate (Cascade-Test: fällt zur
  //    Lohngruppen-Rate oder Order-Rate durch). Plus die 3 NK-Pricing-
  //    Presets aus seedNkStammdaten sind bereits da.
  const arbeitActivity = await tx.activity.create({
    data: {
      tenantId,
      code: "NK_ARBEIT",
      name: "Arbeitsleistung",
      pricingType: "HOURLY",
      hourlyRate: null, // Cascade durch zur Lohngruppe / Order-Rate
      isActive: true,
    },
    select: { id: true, pricingType: true, flatRate: true, hourlyRate: true, unit: true },
  })
  const nkActivities = await tx.activity.findMany({
    where: { tenantId, code: { in: ["NK_NOTANFAHRT", "NK_VERLEGUNG", "NK_BERATUNG"] } },
    select: { id: true, code: true, pricingType: true, flatRate: true, hourlyRate: true, unit: true },
  })
  const actByCode: Record<
    string,
    {
      id: string
      pricingType: "HOURLY" | "FLAT_RATE" | "PER_UNIT"
      flatRate: unknown
      hourlyRate: unknown
      unit: string | null
    }
  > = {
    NK_ARBEIT: {
      id: arbeitActivity.id,
      pricingType: arbeitActivity.pricingType as "HOURLY" | "FLAT_RATE" | "PER_UNIT",
      flatRate: arbeitActivity.flatRate,
      hourlyRate: arbeitActivity.hourlyRate,
      unit: arbeitActivity.unit,
    },
  }
  for (const a of nkActivities) {
    actByCode[a.code] = {
      id: a.id,
      pricingType: a.pricingType as "HOURLY" | "FLAT_RATE" | "PER_UNIT",
      flatRate: a.flatRate,
      hourlyRate: a.hourlyRate,
      unit: a.unit,
    }
  }

  // 3. Mitarbeiter-Subset Lohngruppen zuordnen (Mitarbeiter 0–19,
  //    Round-Robin über die 5 Lohngruppen). Mitarbeiter 20+ bleibt
  //    bewusst ohne Lohngruppe → mind. 1 Booking als DataQuality-Edge-Case.
  const wgRotation = ["MEISTER", "MONTEUR", "GESELLE", "AZUBI", "HILFE"]
  for (let i = 0; i < 20 && i < employees.length; i++) {
    const wgCode = wgRotation[i % wgRotation.length]!
    const wg = wgByCode[wgCode]
    if (!wg) continue
    await tx.employee.update({
      where: { id: employees[i]!.id },
      data: { wageGroupId: wg.id },
    })
  }
  // Cache: employeeId -> { wageGroupRate, employeeRate } für Resolver
  const empRateById: Record<
    string,
    { wgRate: number | null; emplRate: number | null }
  > = {}
  for (let i = 0; i < employees.length; i++) {
    const emp = employees[i]!
    if (i < 20) {
      const wgCode = wgRotation[i % wgRotation.length]!
      empRateById[emp.id] = { wgRate: wgByCode[wgCode]?.rate ?? null, emplRate: null }
    } else {
      empRateById[emp.id] = { wgRate: null, emplRate: null }
    }
  }

  // 4. ServiceObjects (3 Anlagen) — pro Customer eine
  const customerA = customers[0]!
  const customerB = customers[1]!
  const customerC = customers[2]!
  const serviceObjects = [
    {
      id: randomUUID(),
      tenantId,
      number: "ANL-BM-450",
      name: "Bohrmaschine BM-450",
      kind: "EQUIPMENT" as const,
      manufacturer: "Bohrtech AG",
      model: "BM-450",
      serialNumber: "BM450-2019-0117",
      yearBuilt: 2019,
      customerAddressId: customerA.id,
    },
    {
      id: randomUUID(),
      tenantId,
      number: "ANL-F-12",
      name: "Förderband F-12 (Halle 3)",
      kind: "EQUIPMENT" as const,
      manufacturer: "Fördertec GmbH",
      model: "F-12",
      serialNumber: "F12-2021-0084",
      yearBuilt: 2021,
      customerAddressId: customerB.id,
    },
    {
      id: randomUUID(),
      tenantId,
      number: "ANL-SR-9",
      name: "Schweißroboter SR-9",
      kind: "EQUIPMENT" as const,
      manufacturer: "RoboWeld SE",
      model: "SR-9",
      serialNumber: "SR9-2020-0231",
      yearBuilt: 2020,
      customerAddressId: customerC.id,
    },
  ]
  await tx.serviceObject.createMany({ data: serviceObjects })
  const [soA, soB, soC] = serviceObjects

  // 5. Aufträge (5 staggered über die letzten 14 Tage)
  type OrderSeed = {
    id: string
    code: string
    name: string
    customer: string
    serviceObjectId: string
    orderTypeCode: string
    billingRatePerHour: number | null
    daysAgo: number
    customerAddressId: string
  }
  const orderSeeds: OrderSeed[] = [
    {
      id: randomUUID(),
      code: "A-2026-0101",
      name: "Quartalswartung BM-450",
      customer: customerA.company,
      serviceObjectId: soA!.id,
      orderTypeCode: "WARTUNG",
      billingRatePerHour: 95,
      daysAgo: 12,
      customerAddressId: customerA.id,
    },
    {
      id: randomUUID(),
      code: "A-2026-0102",
      name: "Notruf Fördermotor-Ausfall Halle 3",
      customer: customerB.company,
      serviceObjectId: soB!.id,
      orderTypeCode: "NOTDIENST",
      billingRatePerHour: 110,
      daysAgo: 10,
      customerAddressId: customerB.id,
    },
    {
      id: randomUUID(),
      code: "A-2026-0103",
      name: "Ersatzteilwechsel Greifarm SR-9",
      customer: customerC.company,
      serviceObjectId: soC!.id,
      orderTypeCode: "REPARATUR",
      billingRatePerHour: null, // Cascade-Test
      daysAgo: 8,
      customerAddressId: customerC.id,
    },
    {
      id: randomUUID(),
      code: "A-2026-0104",
      name: "Sicherheits-Inspektion BM-450",
      customer: customerA.company,
      serviceObjectId: soA!.id,
      orderTypeCode: "INSPEKTION",
      billingRatePerHour: 80,
      daysAgo: 5,
      customerAddressId: customerA.id,
    },
    {
      id: randomUUID(),
      code: "A-2026-0105",
      name: "Modernisierung Förderband F-12",
      customer: customerB.company,
      serviceObjectId: soB!.id,
      orderTypeCode: "PROJEKT",
      billingRatePerHour: null, // Cascade-Test
      daysAgo: 3,
      customerAddressId: customerB.id,
    },
  ]
  await tx.order.createMany({
    data: orderSeeds.map((o) => ({
      id: o.id,
      tenantId,
      code: o.code,
      name: o.name,
      status: "active",
      customer: o.customer,
      serviceObjectId: o.serviceObjectId,
      orderTypeId: otByCode[o.orderTypeCode] ?? null,
      billingRatePerHour: o.billingRatePerHour,
      isActive: true,
    })),
  })

  // 6. OrderTargets — eine pro Auftrag, plus eine v2 für O2 (Notdienst-
  //    Scope-Erweiterung)
  type TargetSeed = {
    orderId: string
    daysAgo: number
    targetHours: number
    targetMaterialCost: number
    targetTravelMinutes: number
    targetExternalCost: number
    targetRevenue: number
    unitItems?: Array<{ activityId: string; quantity: number }>
  }
  const targetSeeds: TargetSeed[] = [
    {
      orderId: orderSeeds[0]!.id,
      daysAgo: 12,
      targetHours: 8,
      targetMaterialCost: 250,
      targetTravelMinutes: 30,
      targetExternalCost: 0,
      targetRevenue: 1100,
    },
    {
      orderId: orderSeeds[1]!.id,
      daysAgo: 10,
      targetHours: 4,
      targetMaterialCost: 180,
      targetTravelMinutes: 45,
      targetExternalCost: 0,
      targetRevenue: 950,
    },
    {
      orderId: orderSeeds[2]!.id,
      daysAgo: 8,
      targetHours: 12,
      targetMaterialCost: 1200,
      targetTravelMinutes: 90,
      targetExternalCost: 0,
      targetRevenue: 2400,
    },
    {
      orderId: orderSeeds[3]!.id,
      daysAgo: 5,
      targetHours: 6,
      targetMaterialCost: 120,
      targetTravelMinutes: 30,
      targetExternalCost: 0,
      targetRevenue: 850,
    },
    {
      orderId: orderSeeds[4]!.id,
      daysAgo: 3,
      targetHours: 40,
      targetMaterialCost: 2000,
      targetTravelMinutes: 120,
      targetExternalCost: 1500,
      targetRevenue: 8500,
      unitItems: [{ activityId: actByCode["NK_VERLEGUNG"]!.id, quantity: 30 }],
    },
  ]
  for (const t of targetSeeds) {
    await tx.orderTarget.create({
      data: {
        tenantId,
        orderId: t.orderId,
        version: 1,
        validFrom: addDays(today, -t.daysAgo),
        validTo: null,
        targetHours: t.targetHours,
        targetMaterialCost: t.targetMaterialCost,
        targetTravelMinutes: t.targetTravelMinutes,
        targetExternalCost: t.targetExternalCost,
        targetRevenue: t.targetRevenue,
        targetUnitItems:
          (t.unitItems ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        changeReason: "INITIAL",
      },
    })
  }
  // Re-Plan auf Order O2 (Notdienst): v1 schliessen, v2 anlegen
  // (validTo = neue.validFrom - 1 Tag)
  const o2NewValidFrom = addDays(today, -7) // Re-Plan vor 7 Tagen
  const o2OldValidTo = addDays(o2NewValidFrom, -1)
  await tx.orderTarget.updateMany({
    where: { tenantId, orderId: orderSeeds[1]!.id, validTo: null },
    data: { validTo: o2OldValidTo },
  })
  await tx.orderTarget.create({
    data: {
      tenantId,
      orderId: orderSeeds[1]!.id,
      version: 2,
      validFrom: o2NewValidFrom,
      validTo: null,
      targetHours: 8, // verdoppelt nach Scope-Erweiterung
      targetMaterialCost: 350,
      targetTravelMinutes: 45,
      targetExternalCost: 0,
      targetRevenue: 1700,
      targetUnitItems: Prisma.JsonNull,
      changeReason: "Scope-Erweiterung Kunde",
    },
  })

  // 7. OrderAssignments — pro Auftrag 1–2 Mitarbeiter aus dem ersten
  //    Subset (mit Lohngruppe) zuordnen, damit WorkReport-Travel-
  //    Snapshots korrekt aufgelöst werden.
  const assignmentRecords: Array<{
    id: string
    tenantId: string
    orderId: string
    employeeId: string
    role: string
    isActive: boolean
  }> = []
  // Order 0 (Wartung) → Meister (idx 0) + Monteur (idx 1)
  // Order 1 (Notdienst) → Meister (idx 5) + Geselle (idx 7)
  // Order 2 (Reparatur) → Monteur (idx 6)
  // Order 3 (Inspektion) → Meister (idx 10)
  // Order 4 (Projekt) → Meister (idx 15) + Monteur (idx 16) + Geselle (idx 17)
  const orderAssignmentMap: Array<{ orderId: string; employeeIds: string[] }> = [
    { orderId: orderSeeds[0]!.id, employeeIds: [employees[0]!.id, employees[1]!.id] },
    { orderId: orderSeeds[1]!.id, employeeIds: [employees[5]!.id, employees[7]!.id] },
    { orderId: orderSeeds[2]!.id, employeeIds: [employees[6]!.id] },
    { orderId: orderSeeds[3]!.id, employeeIds: [employees[10]!.id] },
    { orderId: orderSeeds[4]!.id, employeeIds: [employees[15]!.id, employees[16]!.id, employees[17]!.id] },
  ]
  for (const a of orderAssignmentMap) {
    for (const empId of a.employeeIds) {
      assignmentRecords.push({
        id: randomUUID(),
        tenantId,
        orderId: a.orderId,
        employeeId: empId,
        role: "worker",
        isActive: true,
      })
    }
  }
  await tx.orderAssignment.createMany({ data: assignmentRecords })

  // 8. WorkReports — 6 (5 SIGNED, 1 DRAFT). Travel-Snapshot via
  //    `resolveTravelRateExtended` Pure-Function — 1:1 wie Sign-Service.
  type WorkReportSeed = {
    id: string
    orderId: string
    serviceObjectId: string
    code: string
    daysAgo: number
    travelMinutes: number
    workDescription: string
    status: "SIGNED" | "DRAFT"
    signerName: string | null
    signerRole: string | null
    assignmentEmployees: Array<{
      hourlyRate: number | null
      wageGroup: { billingHourlyRate: number | null } | null
    }>
    orderRate: number | null
  }
  const reportSeeds: WorkReportSeed[] = [
    {
      id: randomUUID(),
      orderId: orderSeeds[0]!.id,
      serviceObjectId: soA!.id,
      code: "WS-2026-0101",
      daysAgo: 11,
      travelMinutes: 30,
      workDescription: "Quartalswartung durchgeführt — Filter gewechselt, Schmierstellen kontrolliert.",
      status: "SIGNED",
      signerName: "Erika Bauer",
      signerRole: "Werkstattleiter",
      assignmentEmployees: orderAssignmentMap[0]!.employeeIds.map((eId) => ({
        hourlyRate: empRateById[eId]?.emplRate ?? null,
        wageGroup: empRateById[eId]?.wgRate
          ? { billingHourlyRate: empRateById[eId]!.wgRate }
          : null,
      })),
      orderRate: 95,
    },
    {
      id: randomUUID(),
      orderId: orderSeeds[1]!.id,
      serviceObjectId: soB!.id,
      code: "WS-2026-0102",
      daysAgo: 9,
      travelMinutes: 45,
      workDescription: "Notruf — Antriebsmotor abgeraucht, Ersatzmotor montiert, Probelauf OK.",
      status: "SIGNED",
      signerName: "Hans Müller",
      signerRole: "Schichtführer",
      assignmentEmployees: orderAssignmentMap[1]!.employeeIds.map((eId) => ({
        hourlyRate: empRateById[eId]?.emplRate ?? null,
        wageGroup: empRateById[eId]?.wgRate
          ? { billingHourlyRate: empRateById[eId]!.wgRate }
          : null,
      })),
      orderRate: 110,
    },
    {
      id: randomUUID(),
      orderId: orderSeeds[2]!.id,
      serviceObjectId: soC!.id,
      code: "WS-2026-0103",
      daysAgo: 7,
      travelMinutes: 90,
      workDescription: "Greifarm-Servomotor getauscht, Programmierung neu eingelernt, Test mit 50 Zyklen.",
      status: "SIGNED",
      signerName: "Lukas Wagner",
      signerRole: "Produktionsleiter",
      assignmentEmployees: orderAssignmentMap[2]!.employeeIds.map((eId) => ({
        hourlyRate: empRateById[eId]?.emplRate ?? null,
        wageGroup: empRateById[eId]?.wgRate
          ? { billingHourlyRate: empRateById[eId]!.wgRate }
          : null,
      })),
      orderRate: null, // Cascade
    },
    {
      id: randomUUID(),
      orderId: orderSeeds[3]!.id,
      serviceObjectId: soA!.id,
      code: "WS-2026-0104",
      daysAgo: 4,
      travelMinutes: 30,
      workDescription: "BG-Sicherheits-Inspektion bestanden, Prüfprotokoll an QM übergeben.",
      status: "SIGNED",
      signerName: "Erika Bauer",
      signerRole: "Werkstattleiter",
      assignmentEmployees: orderAssignmentMap[3]!.employeeIds.map((eId) => ({
        hourlyRate: empRateById[eId]?.emplRate ?? null,
        wageGroup: empRateById[eId]?.wgRate
          ? { billingHourlyRate: empRateById[eId]!.wgRate }
          : null,
      })),
      orderRate: 80,
    },
    {
      id: randomUUID(),
      orderId: orderSeeds[4]!.id,
      serviceObjectId: soB!.id,
      code: "WS-2026-0105",
      daysAgo: 2,
      travelMinutes: 60,
      workDescription: "Modernisierung — neue Bandlängen verlegt, Steuerung updated, Zwischenabnahme positiv.",
      status: "SIGNED",
      signerName: "Sandra Klein",
      signerRole: "Geschäftsführerin",
      assignmentEmployees: orderAssignmentMap[4]!.employeeIds.map((eId) => ({
        hourlyRate: empRateById[eId]?.emplRate ?? null,
        wageGroup: empRateById[eId]?.wgRate
          ? { billingHourlyRate: empRateById[eId]!.wgRate }
          : null,
      })),
      orderRate: null, // Cascade
    },
    {
      id: randomUUID(),
      orderId: orderSeeds[4]!.id,
      serviceObjectId: soB!.id,
      code: "WS-2026-0106",
      daysAgo: 0,
      travelMinutes: 60,
      workDescription: "Fortsetzung Modernisierung — letzte Steuerung-Module integriert. Noch nicht abgenommen.",
      status: "DRAFT",
      signerName: null,
      signerRole: null,
      assignmentEmployees: orderAssignmentMap[4]!.employeeIds.map((eId) => ({
        hourlyRate: empRateById[eId]?.emplRate ?? null,
        wageGroup: empRateById[eId]?.wgRate
          ? { billingHourlyRate: empRateById[eId]!.wgRate }
          : null,
      })),
      orderRate: null,
    },
  ]
  for (const r of reportSeeds) {
    let travelSnapshot: { rate: number | null; source: string } = { rate: null, source: "none" }
    if (r.status === "SIGNED") {
      const resolved = resolveTravelRateExtended({
        orderRate: r.orderRate as never,
        assignmentEmployees: r.assignmentEmployees.map((e) => ({
          hourlyRate: e.hourlyRate as never,
          wageGroup: e.wageGroup as never,
        })),
      })
      travelSnapshot = { rate: resolved.rate, source: resolved.source }
    }
    const visitDate = addDays(today, -r.daysAgo)
    await tx.workReport.create({
      data: {
        id: r.id,
        tenantId,
        orderId: r.orderId,
        serviceObjectId: r.serviceObjectId,
        code: r.code,
        visitDate,
        travelMinutes: r.travelMinutes,
        workDescription: r.workDescription,
        status: r.status,
        signedAt: r.status === "SIGNED" ? visitDate : null,
        signerName: r.signerName,
        signerRole: r.signerRole,
        signerIpHash: r.status === "SIGNED" ? "demo-ip-hash" : null,
        signaturePath:
          r.status === "SIGNED" ? `tenants/${tenantId}/work-reports/${r.id}/signature.png` : null,
        travelRateAtSign: travelSnapshot.rate,
        travelRateSourceAtSign: r.status === "SIGNED" ? travelSnapshot.source : null,
      },
    })
    // WorkReport-Assignment für jeden Mitarbeiter aus dem Order
    const assignmentEmployeeIds = orderAssignmentMap.find(
      (m) => m.orderId === r.orderId,
    )?.employeeIds ?? []
    for (const empId of assignmentEmployeeIds) {
      await tx.workReportAssignment.create({
        data: {
          tenantId,
          workReportId: r.id,
          employeeId: empId,
          role: r.signerRole === "Geschäftsführerin" ? "Bauleiter" : "Monteur",
        },
      })
    }
  }

  // 9. OrderBookings — 24 stück, gemixt aus HOURLY/FLAT_RATE/PER_UNIT.
  //    Snapshots via `resolveLaborRateExtended` (1:1 wie Booking-Service).
  type BookingSeed = {
    orderId: string
    employeeIdx: number
    activityCode: string
    daysAgo: number
    timeMinutes: number
    quantity?: number
    workReportIdx?: number // 0..5 → reportSeeds[idx].id
    description?: string
    overrideOrderRate?: number | null
  }
  const bookingSeeds: BookingSeed[] = [
    // Order 0 (Wartung) — 4 Stunden + Anfahrt-Pauschal
    { orderId: orderSeeds[0]!.id, employeeIdx: 0, activityCode: "NK_NOTANFAHRT", daysAgo: 11, timeMinutes: 30, workReportIdx: 0, description: "Anfahrt 30km" },
    { orderId: orderSeeds[0]!.id, employeeIdx: 0, activityCode: "NK_ARBEIT", daysAgo: 11, timeMinutes: 240, workReportIdx: 0, description: "Wartungsroutine" },
    { orderId: orderSeeds[0]!.id, employeeIdx: 1, activityCode: "NK_ARBEIT", daysAgo: 11, timeMinutes: 180, workReportIdx: 0, description: "Filter + Öl" },
    // Order 1 (Notdienst) — Anfahrt-Pauschal + Reparatur
    { orderId: orderSeeds[1]!.id, employeeIdx: 5, activityCode: "NK_NOTANFAHRT", daysAgo: 9, timeMinutes: 45, workReportIdx: 1, description: "Anfahrt Halle 3" },
    { orderId: orderSeeds[1]!.id, employeeIdx: 5, activityCode: "NK_ARBEIT", daysAgo: 9, timeMinutes: 150, workReportIdx: 1, description: "Motor-Tausch" },
    { orderId: orderSeeds[1]!.id, employeeIdx: 7, activityCode: "NK_ARBEIT", daysAgo: 9, timeMinutes: 90, workReportIdx: 1, description: "Probelauf-Assistenz" },
    // Order 1 v2 — Re-Plan-Buchung, vor 6 Tagen
    { orderId: orderSeeds[1]!.id, employeeIdx: 5, activityCode: "NK_BERATUNG", daysAgo: 6, timeMinutes: 60, workReportIdx: 1, description: "Nach-Beratung Kunde" },
    // Order 2 (Reparatur) — kein Order-Rate, fällt zur Lohngruppe
    { orderId: orderSeeds[2]!.id, employeeIdx: 6, activityCode: "NK_ARBEIT", daysAgo: 7, timeMinutes: 480, workReportIdx: 2, description: "Greifarm-Demontage und Tausch" },
    { orderId: orderSeeds[2]!.id, employeeIdx: 6, activityCode: "NK_ARBEIT", daysAgo: 7, timeMinutes: 240, workReportIdx: 2, description: "Programm-Reanimation" },
    // Order 3 (Inspektion) — Stunden-Inspektion + Beratung
    { orderId: orderSeeds[3]!.id, employeeIdx: 10, activityCode: "NK_BERATUNG", daysAgo: 4, timeMinutes: 120, workReportIdx: 3, description: "Sicherheits-Audit Vorbereitung" },
    { orderId: orderSeeds[3]!.id, employeeIdx: 10, activityCode: "NK_ARBEIT", daysAgo: 4, timeMinutes: 240, workReportIdx: 3, description: "Inspektion + Protokollierung" },
    // Order 4 (Projekt) — viele Buchungen mit PER_UNIT-Verlegung
    { orderId: orderSeeds[4]!.id, employeeIdx: 15, activityCode: "NK_ARBEIT", daysAgo: 2, timeMinutes: 480, workReportIdx: 4, description: "Bandlänge-Vorbereitung" },
    { orderId: orderSeeds[4]!.id, employeeIdx: 16, activityCode: "NK_VERLEGUNG", daysAgo: 2, timeMinutes: 360, quantity: 12, workReportIdx: 4, description: "Verlegung Abschnitt A" },
    { orderId: orderSeeds[4]!.id, employeeIdx: 17, activityCode: "NK_VERLEGUNG", daysAgo: 2, timeMinutes: 360, quantity: 8, workReportIdx: 4, description: "Verlegung Abschnitt B" },
    { orderId: orderSeeds[4]!.id, employeeIdx: 15, activityCode: "NK_BERATUNG", daysAgo: 1, timeMinutes: 60, workReportIdx: 4, description: "Steuerungs-Konfiguration" },
    { orderId: orderSeeds[4]!.id, employeeIdx: 15, activityCode: "NK_ARBEIT", daysAgo: 0, timeMinutes: 360, workReportIdx: 5, description: "Steuerungs-Module Integration" },
    { orderId: orderSeeds[4]!.id, employeeIdx: 16, activityCode: "NK_VERLEGUNG", daysAgo: 0, timeMinutes: 240, quantity: 6, workReportIdx: 5, description: "Verlegung Abschnitt C (Restarbeit)" },
    { orderId: orderSeeds[4]!.id, employeeIdx: 17, activityCode: "NK_ARBEIT", daysAgo: 0, timeMinutes: 240, workReportIdx: 5, description: "Endmontage Zwischenabnahme-Beihilfe" },
    // 4 weitere Bookings ohne WR-Verlinkung (Pending-Anteil im Report
    // demonstrieren — DataQualityIssue BOOKING_WITHOUT_WORKREPORT)
    { orderId: orderSeeds[2]!.id, employeeIdx: 11, activityCode: "NK_ARBEIT", daysAgo: 6, timeMinutes: 90, description: "Nacharbeit ohne WR" },
    { orderId: orderSeeds[3]!.id, employeeIdx: 12, activityCode: "NK_ARBEIT", daysAgo: 3, timeMinutes: 60, description: "Notiz-Update ohne WR" },
    { orderId: orderSeeds[4]!.id, employeeIdx: 18, activityCode: "NK_ARBEIT", daysAgo: 1, timeMinutes: 120, description: "Materialvorbereitung" },
    // EDGE-CASE: Mitarbeiter ohne Lohngruppe (idx 100), Activity ohne
    // hourlyRate (NK_ARBEIT), Order ohne billingRatePerHour (Order 4 oder 2)
    // → triggert BOOKING_RATE_NULL_SNAPSHOT bzw. BOOKING_WITHOUT_RATE
    { orderId: orderSeeds[2]!.id, employeeIdx: 100, activityCode: "NK_ARBEIT", daysAgo: 6, timeMinutes: 60, description: "Edge: Mitarbeiter ohne WG, kein Order-Rate (Cascade fehlgeschlagen)" },
    { orderId: orderSeeds[4]!.id, employeeIdx: 101, activityCode: "NK_ARBEIT", daysAgo: 1, timeMinutes: 60, description: "Edge: Cascade-Fail-Booking" },
    { orderId: orderSeeds[4]!.id, employeeIdx: 19, activityCode: "NK_BERATUNG", daysAgo: 2, timeMinutes: 60, description: "Phase-A Beratung" },
  ]
  for (const b of bookingSeeds) {
    const employee = employees[b.employeeIdx]
    if (!employee) continue
    const activity = actByCode[b.activityCode]
    if (!activity) continue
    const order = orderSeeds.find((o) => o.id === b.orderId)
    if (!order) continue
    const empRate = empRateById[employee.id] ?? { wgRate: null, emplRate: null }
    const orderRate = b.overrideOrderRate ?? order.billingRatePerHour
    const resolved = resolveLaborRateExtended({
      bookingActivity: {
        pricingType: activity.pricingType,
        flatRate: activity.flatRate as never,
        hourlyRate: activity.hourlyRate as never,
        unit: activity.unit,
      },
      orderRate: orderRate as never,
      employeeWageGroupRate: empRate.wgRate as never,
      employeeRate: empRate.emplRate as never,
    })
    const workReportId =
      b.workReportIdx != null ? reportSeeds[b.workReportIdx]?.id ?? null : null
    await tx.orderBooking.create({
      data: {
        tenantId,
        employeeId: employee.id,
        orderId: b.orderId,
        activityId: activity.id,
        workReportId,
        bookingDate: addDays(today, -b.daysAgo),
        timeMinutes: b.timeMinutes,
        description: b.description ?? null,
        source: "manual",
        hourlyRateAtBooking: resolved.rate,
        hourlyRateSourceAtBooking: resolved.source,
        quantity: b.quantity ?? null,
      },
    })
  }

  // 10. WhStockMovements — 12 Material-Entnahmen, mit
  //     `unitCostAtMovement` als Snapshot (1:1 wie createWithdrawal).
  const articles = await tx.whArticle.findMany({
    where: { tenantId, stockTracking: true },
    take: 8,
    orderBy: { number: "asc" },
    select: { id: true, buyPrice: true, currentStock: true },
  })
  type MovementSeed = {
    orderId: string
    articleIdx: number
    quantity: number
    daysAgo: number
    notes?: string
  }
  const movementSeeds: MovementSeed[] = [
    { orderId: orderSeeds[0]!.id, articleIdx: 0, quantity: 2, daysAgo: 11, notes: "Filterset Quartal" },
    { orderId: orderSeeds[0]!.id, articleIdx: 1, quantity: 1, daysAgo: 11, notes: "Schmierstoff-Kanister" },
    { orderId: orderSeeds[1]!.id, articleIdx: 2, quantity: 1, daysAgo: 9, notes: "Antriebsmotor Ersatz" },
    { orderId: orderSeeds[1]!.id, articleIdx: 3, quantity: 4, daysAgo: 9, notes: "Kabelbinder + Klemmen" },
    { orderId: orderSeeds[2]!.id, articleIdx: 4, quantity: 1, daysAgo: 7, notes: "Servomotor Greifarm" },
    { orderId: orderSeeds[2]!.id, articleIdx: 5, quantity: 2, daysAgo: 7, notes: "Lager + Dichtungen" },
    { orderId: orderSeeds[3]!.id, articleIdx: 0, quantity: 1, daysAgo: 4, notes: "Prüf-Kit Inspektion" },
    { orderId: orderSeeds[4]!.id, articleIdx: 6, quantity: 30, daysAgo: 2, notes: "Rohrabschnitte (lfm)" },
    { orderId: orderSeeds[4]!.id, articleIdx: 7, quantity: 6, daysAgo: 2, notes: "Schraubenset M10" },
    { orderId: orderSeeds[4]!.id, articleIdx: 1, quantity: 2, daysAgo: 1, notes: "Steuerungs-Module" },
    { orderId: orderSeeds[4]!.id, articleIdx: 3, quantity: 8, daysAgo: 1, notes: "Verbinder-Set" },
    { orderId: orderSeeds[4]!.id, articleIdx: 5, quantity: 2, daysAgo: 0, notes: "Restarbeit Material" },
  ]
  for (const m of movementSeeds) {
    const article = articles[m.articleIdx]
    if (!article) continue
    await tx.whStockMovement.create({
      data: {
        tenantId,
        articleId: article.id,
        type: "WITHDRAWAL",
        quantity: -m.quantity, // negativ wie im Service
        previousStock: article.currentStock,
        newStock: Math.max(0, article.currentStock - m.quantity),
        date: addDays(today, -m.daysAgo),
        orderId: m.orderId,
        unitCostAtMovement: article.buyPrice ?? null,
        notes: m.notes ?? null,
      },
    })
  }

  // 11. InboundInvoice mit 3 Position-Level-Order-Verlinkungen
  //     (Subunternehmer-Rechnung). Demonstriert externalCost-Pfad im
  //     Aggregator (`InboundInvoiceLineItem.orderId`).
  const inboundInvoiceId = randomUUID()
  await tx.inboundInvoice.create({
    data: {
      id: inboundInvoiceId,
      tenantId,
      number: "ER-2026-DEMO-001",
      invoiceNumber: "FK-2026-0042",
      source: "manual",
      supplierStatus: "matched",
      invoiceDate: addDays(today, -4),
      dueDate: addDays(today, 10),
      totalNet: 2050,
      totalVat: 389.5,
      totalGross: 2439.5,
      currency: "EUR",
      paymentTermDays: 14,
      sellerName: "Subunternehmer Schmidt Industrieservice GmbH",
      lineItems: {
        create: [
          {
            tenantId,
            position: 1,
            description: "Subunternehmer-Anfahrt Modernisierung F-12",
            quantity: 1,
            unit: "Pausch.",
            unitPriceNet: 350,
            totalNet: 350,
            vatRate: 19,
            vatAmount: 66.5,
            totalGross: 416.5,
            sortOrder: 1,
            orderId: orderSeeds[4]!.id,
          },
          {
            tenantId,
            position: 2,
            description: "Spezial-Steuerungs-Programmierung (extern)",
            quantity: 8,
            unit: "Std",
            unitPriceNet: 150,
            totalNet: 1200,
            vatRate: 19,
            vatAmount: 228,
            totalGross: 1428,
            sortOrder: 2,
            orderId: orderSeeds[4]!.id,
          },
          {
            tenantId,
            position: 3,
            description: "Beratungspauschale ohne Auftrag",
            quantity: 1,
            unit: "Pausch.",
            unitPriceNet: 500,
            totalNet: 500,
            vatRate: 19,
            vatAmount: 95,
            totalGross: 595,
            sortOrder: 3,
            // Bewusst KEINE orderId — landet im Sammel-Pool
            orderId: null,
          },
        ],
      },
    },
  })
  void inboundInvoiceId
}
