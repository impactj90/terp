import type { PrismaClient } from "@/generated/prisma/client"

// --- Error Classes ---

export class ReminderTemplateNotFoundError extends Error {
  constructor(id: string) {
    super(`ReminderTemplate "${id}" not found`)
    this.name = "ReminderTemplateNotFoundError"
  }
}

export class ReminderTemplateValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ReminderTemplateValidationError"
  }
}

// --- Types ---

export type ReminderTemplateInput = {
  name: string
  level: number
  headerText?: string
  footerText?: string
  emailSubject?: string
  emailBody?: string
  isDefault?: boolean
}

// --- Service Functions ---

export async function list(prisma: PrismaClient, tenantId: string) {
  return await prisma.reminderTemplate.findMany({
    where: { tenantId },
    orderBy: [{ level: "asc" }, { name: "asc" }],
  })
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const tpl = await prisma.reminderTemplate.findFirst({
    where: { id, tenantId },
  })
  if (!tpl) throw new ReminderTemplateNotFoundError(id)
  return tpl
}

export async function getDefaultForLevel(
  prisma: PrismaClient,
  tenantId: string,
  level: number
) {
  return await prisma.reminderTemplate.findFirst({
    where: { tenantId, level, isDefault: true },
  })
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: ReminderTemplateInput,
  createdById: string | null
) {
  validateInput(input)
  return await prisma.reminderTemplate.create({
    data: {
      tenantId,
      name: input.name,
      level: input.level,
      headerText: input.headerText ?? "",
      footerText: input.footerText ?? "",
      emailSubject: input.emailSubject ?? "",
      emailBody: input.emailBody ?? "",
      isDefault: input.isDefault ?? false,
      createdById,
    },
  })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input: Partial<ReminderTemplateInput>
) {
  await getById(prisma, tenantId, id)
  if (input.level !== undefined) validateLevel(input.level)
  return await prisma.reminderTemplate.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.level !== undefined && { level: input.level }),
      ...(input.headerText !== undefined && { headerText: input.headerText }),
      ...(input.footerText !== undefined && { footerText: input.footerText }),
      ...(input.emailSubject !== undefined && { emailSubject: input.emailSubject }),
      ...(input.emailBody !== undefined && { emailBody: input.emailBody }),
      ...(input.isDefault !== undefined && { isDefault: input.isDefault }),
    },
  })
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  await getById(prisma, tenantId, id)
  await prisma.reminderTemplate.delete({ where: { id } })
}

function validateInput(input: ReminderTemplateInput) {
  if (!input.name || input.name.trim().length === 0) {
    throw new ReminderTemplateValidationError("name darf nicht leer sein")
  }
  validateLevel(input.level)
}

function validateLevel(level: number) {
  if (level < 1 || level > 4) {
    throw new ReminderTemplateValidationError(
      "level muss zwischen 1 und 4 liegen"
    )
  }
}

// --- Default Templates Seed (D9) ---

const DEFAULT_TEMPLATES = [
  {
    name: "Zahlungserinnerung (Stufe 1)",
    level: 1,
    headerText:
      "{{briefanrede}}\n\nvielleicht ist es Ihrer Aufmerksamkeit entgangen: Folgende Rechnungen sind bei uns noch offen.",
    footerText:
      "Wir bitten um zeitnahen Ausgleich. Sollte sich die Angelegenheit zwischenzeitlich erledigt haben, betrachten Sie dieses Schreiben bitte als gegenstandslos.\n\nMit freundlichen Grüßen",
    emailSubject: "Zahlungserinnerung",
    emailBody:
      "{{briefanrede}}\n\nanbei erhalten Sie unsere Zahlungserinnerung.\n\nMit freundlichen Grüßen",
    isDefault: true,
  },
  {
    name: "Erste Mahnung (Stufe 2)",
    level: 2,
    headerText:
      "{{briefanrede}}\n\ntrotz unserer Zahlungserinnerung haben wir keinen Zahlungseingang feststellen können.",
    footerText:
      "Wir fordern Sie auf, den Gesamtbetrag zeitnah auf unser Konto zu überweisen.\n\nMit freundlichen Grüßen",
    emailSubject: "Mahnung — Stufe 2",
    emailBody:
      "{{briefanrede}}\n\nanbei erhalten Sie unsere Mahnung der Stufe 2.\n\nMit freundlichen Grüßen",
    isDefault: true,
  },
  {
    name: "Letzte Mahnung (Stufe 3)",
    level: 3,
    headerText:
      "{{briefanrede}}\n\ntrotz unserer wiederholten Aufforderungen haben Sie die folgenden Rechnungen nicht ausgeglichen.",
    footerText:
      "Dies ist unsere letzte Zahlungsaufforderung. Sollte kein Zahlungseingang erfolgen, behalten wir uns weitere rechtliche Schritte vor.\n\nMit freundlichen Grüßen",
    emailSubject: "Letzte Mahnung — Stufe 3",
    emailBody:
      "{{briefanrede}}\n\nanbei erhalten Sie unsere letzte Mahnung.\n\nMit freundlichen Grüßen",
    isDefault: true,
  },
]

/**
 * Seeds the three default templates (Stufe 1-3) for a tenant if no
 * reminder template exists yet. Idempotent: skipped entirely on second
 * call. Returns the number of templates that were actually created.
 */
export async function seedDefaultsForTenant(
  prisma: PrismaClient,
  tenantId: string
): Promise<{ seeded: number }> {
  const existing = await prisma.reminderTemplate.count({ where: { tenantId } })
  if (existing > 0) return { seeded: 0 }

  await prisma.reminderTemplate.createMany({
    data: DEFAULT_TEMPLATES.map((t) => ({ ...t, tenantId })),
  })
  return { seeded: DEFAULT_TEMPLATES.length }
}
