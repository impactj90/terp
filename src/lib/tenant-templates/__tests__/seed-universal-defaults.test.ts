/**
 * Unit test for seedUniversalDefaults.
 *
 * Mocks the tx-safe services (reminder-template + reminder-settings)
 * and fakes a minimal tx surface for the inline email-template seed.
 * Verifies:
 *  - All three seeders run in the documented order: reminder-templates,
 *    email-templates (inline), reminder-settings.
 *  - reminderSettings.updateSettings receives the exact BGB §288 Abs. 2
 *    B2B defaults (maxLevel=3, gracePeriodDays=[7,14,21],
 *    interestRatePercent=9, enabled=true).
 *  - The inline email seed creates one row per documentType on a fresh
 *    tenant and skips already-existing types on a second invocation.
 *
 * Integration coverage (actual DB writes through a rollback tx) lives
 * in the starter template's integration test.
 */
import { beforeEach, describe, expect, test, vi } from "vitest"

import { getAllDocumentTypes } from "@/lib/email/default-templates"

const mockReminderTemplateSeed = vi.fn()
vi.mock("@/lib/services/reminder-template-service", () => ({
  seedDefaultsForTenant: (...args: unknown[]) =>
    mockReminderTemplateSeed(...args),
}))

const mockReminderSettingsUpdate = vi.fn()
vi.mock("@/lib/services/reminder-settings-service", () => ({
  updateSettings: (...args: unknown[]) => mockReminderSettingsUpdate(...args),
}))

// Imported after vi.mock so the mocked modules are picked up.
import { seedUniversalDefaults } from "../seed-universal-defaults"

const TENANT_ID = "tenant-test-1"

type FakeTx = Parameters<typeof seedUniversalDefaults>[0]

type EmailTemplateRow = {
  id: string
  tenantId: string
  documentType: string
  name: string
  subject: string
  bodyHtml: string
  isDefault: boolean
}

function makeFakeTx(initial: EmailTemplateRow[] = []) {
  const store: EmailTemplateRow[] = [...initial]
  const findFirst = vi.fn(async ({ where }: { where: { tenantId: string; documentType: string } }) => {
    const hit = store.find(
      (r) =>
        r.tenantId === where.tenantId && r.documentType === where.documentType,
    )
    return hit ?? null
  })
  const create = vi.fn(
    async ({
      data,
    }: {
      data: {
        tenant: { connect: { id: string } }
        documentType: string
        name: string
        subject: string
        bodyHtml: string
        isDefault: boolean
      }
    }) => {
      const row: EmailTemplateRow = {
        id: `et-${store.length + 1}`,
        tenantId: data.tenant.connect.id,
        documentType: data.documentType,
        name: data.name,
        subject: data.subject,
        bodyHtml: data.bodyHtml,
        isDefault: data.isDefault,
      }
      store.push(row)
      return row
    },
  )
  const tx = {
    emailTemplate: { findFirst, create },
  } as unknown as FakeTx
  return { tx, store, findFirst, create }
}

describe("seedUniversalDefaults", () => {
  beforeEach(() => {
    mockReminderTemplateSeed.mockReset()
    mockReminderSettingsUpdate.mockReset()
    mockReminderTemplateSeed.mockResolvedValue({ seeded: 3 })
    mockReminderSettingsUpdate.mockResolvedValue({})
  })

  test("calls the three seeders in the documented order", async () => {
    const { tx, create } = makeFakeTx()

    await seedUniversalDefaults(tx, TENANT_ID)

    expect(mockReminderTemplateSeed).toHaveBeenCalledTimes(1)
    expect(create.mock.calls.length).toBeGreaterThan(0)
    expect(mockReminderSettingsUpdate).toHaveBeenCalledTimes(1)

    const reminderOrder =
      mockReminderTemplateSeed.mock.invocationCallOrder[0]!
    const firstEmailOrder = create.mock.invocationCallOrder[0]!
    const settingsOrder =
      mockReminderSettingsUpdate.mock.invocationCallOrder[0]!

    expect(reminderOrder).toBeLessThan(firstEmailOrder)
    expect(firstEmailOrder).toBeLessThan(settingsOrder)
  })

  test("passes tx + tenantId to reminder-template seeder", async () => {
    const { tx } = makeFakeTx()

    await seedUniversalDefaults(tx, TENANT_ID)

    expect(mockReminderTemplateSeed).toHaveBeenCalledWith(tx, TENANT_ID)
  })

  test("inlines one email-template row per documentType on a fresh tenant", async () => {
    const { tx, store } = makeFakeTx()
    const expectedTypes = getAllDocumentTypes()

    await seedUniversalDefaults(tx, TENANT_ID)

    expect(store).toHaveLength(expectedTypes.length)
    for (const docType of expectedTypes) {
      const row = store.find((r) => r.documentType === docType)
      expect(row).toBeDefined()
      expect(row?.tenantId).toBe(TENANT_ID)
      expect(row?.isDefault).toBe(true)
      expect(row?.subject.length).toBeGreaterThan(0)
      expect(row?.bodyHtml.length).toBeGreaterThan(0)
    }
  })

  test("updates reminder settings with the exact BGB §288 Abs. 2 defaults", async () => {
    const { tx } = makeFakeTx()

    await seedUniversalDefaults(tx, TENANT_ID)

    expect(mockReminderSettingsUpdate).toHaveBeenCalledWith(tx, TENANT_ID, {
      enabled: true,
      maxLevel: 3,
      gracePeriodDays: [7, 14, 21],
      interestRatePercent: 9,
    })
  })

  test("second call against the same tenant skips existing email rows", async () => {
    const { tx, store, create } = makeFakeTx()

    await seedUniversalDefaults(tx, TENANT_ID)
    const firstRoundRows = store.length
    const firstRoundCreates = create.mock.calls.length

    await expect(
      seedUniversalDefaults(tx, TENANT_ID),
    ).resolves.toBeUndefined()

    expect(store.length).toBe(firstRoundRows)
    expect(create.mock.calls.length).toBe(firstRoundCreates)
    expect(mockReminderTemplateSeed).toHaveBeenCalledTimes(2)
    expect(mockReminderSettingsUpdate).toHaveBeenCalledTimes(2)
  })
})
