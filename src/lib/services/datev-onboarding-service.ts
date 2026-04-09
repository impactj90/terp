/**
 * DATEV Onboarding Service (Phase 3.6)
 *
 * Aggregates the onboarding status for the currently active tenant:
 *  - Is a BeraterNr pflegegt?
 *  - Is a Mandantennummer pflegegt?
 *  - Is there at least one active export template?
 *  - Does the active interface reference a default template?
 *  - Does the tenant have any template-based export runs (from audit log)?
 *  - Lohnart-Mapping angepasst (any edited from defaults)?
 *  - How many employees have complete payroll master data?
 *  - Which employees are missing mandatory fields?
 *
 * Everything is read-only. The UI is a traffic-light checklist.
 */
import type { PrismaClient } from "@/generated/prisma/client"

export interface DatevOnboardingStatus {
  beraterNrSet: boolean
  mandantNumberSet: boolean
  hasActiveTemplate: boolean
  hasDefaultTemplate: boolean
  templateTestedOrRun: boolean
  wagesCustomized: boolean
  totalEmployees: number
  completeEmployees: number
  incompleteEmployees: Array<{
    id: string
    personnelNumber: string
    firstName: string
    lastName: string
    missingFields: string[]
  }>
}

const MANDATORY_FIELDS: Array<{ key: string; label: string }> = [
  { key: "taxId", label: "Steuer-ID" },
  { key: "socialSecurityNumber", label: "SV-Nr." },
  { key: "iban", label: "IBAN" },
  { key: "healthInsuranceProviderId", label: "Krankenkasse" },
  { key: "taxClass", label: "Steuerklasse" },
  { key: "personnelGroupCode", label: "Personengruppenschlüssel" },
  { key: "contributionGroupCode", label: "Beitragsgruppenschlüssel" },
]

export async function getStatus(
  prisma: PrismaClient,
  tenantId: string,
): Promise<DatevOnboardingStatus> {
  const [interfaces, templates, wages, defaultWages, employees, auditRuns] =
    await Promise.all([
      prisma.exportInterface.findMany({
        where: { tenantId, isActive: true },
        select: {
          id: true,
          beraterNr: true,
          mandantNumber: true,
          defaultTemplateId: true,
        },
      }),
      prisma.exportTemplate.findMany({
        where: { tenantId, isActive: true },
        select: { id: true },
      }),
      prisma.tenantPayrollWage.findMany({
        where: { tenantId },
        select: { code: true, name: true, category: true, terpSource: true },
      }),
      prisma.defaultPayrollWage.findMany({
        select: { code: true, name: true, category: true, terpSource: true },
      }),
      prisma.employee.findMany({
        where: { tenantId, isActive: true, deletedAt: null },
        select: {
          id: true,
          personnelNumber: true,
          firstName: true,
          lastName: true,
          taxId: true,
          socialSecurityNumber: true,
          iban: true,
          healthInsuranceProviderId: true,
          taxClass: true,
          personnelGroupCode: true,
          contributionGroupCode: true,
        },
      }),
      prisma.auditLog.count({
        where: {
          tenantId,
          entityType: "export_template",
          action: { in: ["run", "preview", "test"] },
        },
      }),
    ])

  const beraterNrSet = interfaces.some(
    (i) => i.beraterNr != null && i.beraterNr.length > 0,
  )
  const mandantNumberSet = interfaces.some(
    (i) => i.mandantNumber != null && i.mandantNumber.length > 0,
  )
  const hasActiveTemplate = templates.length > 0
  const hasDefaultTemplate = interfaces.some(
    (i) => i.defaultTemplateId != null,
  )

  // A template is considered "tested or run" if any export run exists
  // in the audit log, OR if at least one tenant has >= 1 template and
  // there are any audit entries. We check based on the audit count.
  const templateTestedOrRun = auditRuns > 0

  // Lohnart-Mapping angepasst: diff to defaults
  const defaultMap = new Map(defaultWages.map((w) => [w.code, w]))
  const wagesCustomized = wages.some((w) => {
    const def = defaultMap.get(w.code)
    if (!def) return true // new custom wage
    return (
      def.name !== w.name ||
      def.category !== w.category ||
      def.terpSource !== w.terpSource
    )
  }) || wages.length !== defaultWages.length

  const incompleteEmployees: DatevOnboardingStatus["incompleteEmployees"] = []
  let complete = 0
  for (const emp of employees) {
    const missing: string[] = []
    for (const field of MANDATORY_FIELDS) {
      // @ts-expect-error dynamic access
      const val = emp[field.key]
      if (val == null || (typeof val === "string" && val.length === 0)) {
        missing.push(field.label)
      }
    }
    if (missing.length === 0) complete += 1
    else
      incompleteEmployees.push({
        id: emp.id,
        personnelNumber: emp.personnelNumber,
        firstName: emp.firstName,
        lastName: emp.lastName,
        missingFields: missing,
      })
  }

  return {
    beraterNrSet,
    mandantNumberSet,
    hasActiveTemplate,
    hasDefaultTemplate,
    templateTestedOrRun,
    wagesCustomized,
    totalEmployees: employees.length,
    completeEmployees: complete,
    incompleteEmployees,
  }
}

/**
 * Generates the Steuerberater-PDF (Phase 3.7). Returns a Buffer.
 */
export async function generateSteuerberaterPdf(
  prisma: PrismaClient,
  tenantId: string,
): Promise<{ filename: string; buffer: Buffer }> {
  const [tenant, interfaces, wages] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true },
    }),
    prisma.exportInterface.findMany({
      where: { tenantId, isActive: true },
      include: {
        defaultTemplate: {
          select: { id: true, name: true, targetSystem: true },
        },
      },
    }),
    prisma.tenantPayrollWage.findMany({
      where: { tenantId, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    }),
  ])

  // Pick the first active interface as "the" interface for the PDF
  const primary = interfaces[0]

  const React = (await import("react")).default
  const { renderToBuffer } = await import("@react-pdf/renderer")
  const { DatevSteuerberaterAnleitungPdf } = await import(
    "@/lib/pdf/datev-steuerberater-anleitung-pdf"
  )

  const element = React.createElement(DatevSteuerberaterAnleitungPdf, {
    tenantName: tenant?.name ?? "Unbekannter Mandant",
    beraterNr: primary?.beraterNr ?? null,
    mandantNumber: primary?.mandantNumber ?? null,
    activeTemplateName: primary?.defaultTemplate?.name ?? null,
    targetSystem: primary?.defaultTemplate?.targetSystem ?? null,
    wages: wages.map((w) => ({
      code: w.code,
      name: w.name,
      category: w.category,
      terpSource: w.terpSource,
    })),
    contactName: null,
    contactEmail: null,
    generatedAt: new Date(),
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(element as any)
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "")
  const filename = `DATEV_Import_Anleitung_${dateStr}.pdf`
  return { filename, buffer }
}
