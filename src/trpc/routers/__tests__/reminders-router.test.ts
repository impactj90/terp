/**
 * Tests for the billing.reminders tRPC router.
 *
 * Mocks the underlying services (eligibility, settings, templates,
 * reminder-service, pdf-service) so the router contract is verified in
 * isolation. Database integration coverage for the eligibility filter
 * matrix lives in src/lib/services/__tests__/reminder-eligibility-service.test.ts
 * (Phase 4).
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { remindersRouter } from "../billing/reminders"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// --- Mocks ---

vi.mock("@/lib/db", () => ({
  prisma: {
    tenantModule: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi
        .fn()
        .mockResolvedValue({ id: "mock", module: "billing" }),
    },
  },
}))

const mockEligibilityList = vi.fn()
vi.mock("@/lib/services/reminder-eligibility-service", () => ({
  listEligibleInvoices: (...args: unknown[]) => mockEligibilityList(...args),
}))

const mockSettingsGet = vi.fn()
const mockSettingsUpdate = vi.fn()
vi.mock("@/lib/services/reminder-settings-service", () => ({
  getSettings: (...args: unknown[]) => mockSettingsGet(...args),
  updateSettings: (...args: unknown[]) => mockSettingsUpdate(...args),
}))

const mockTemplateList = vi.fn()
const mockTemplateGetById = vi.fn()
const mockTemplateCreate = vi.fn()
const mockTemplateUpdate = vi.fn()
const mockTemplateRemove = vi.fn()
const mockTemplateSeed = vi.fn()
vi.mock("@/lib/services/reminder-template-service", () => ({
  list: (...args: unknown[]) => mockTemplateList(...args),
  getById: (...args: unknown[]) => mockTemplateGetById(...args),
  create: (...args: unknown[]) => mockTemplateCreate(...args),
  update: (...args: unknown[]) => mockTemplateUpdate(...args),
  remove: (...args: unknown[]) => mockTemplateRemove(...args),
  seedDefaultsForTenant: (...args: unknown[]) => mockTemplateSeed(...args),
}))

const mockReminderCreateRun = vi.fn()
const mockReminderSend = vi.fn()
const mockReminderMarkSentManually = vi.fn()
const mockReminderCancel = vi.fn()
const mockReminderSetInvoiceBlock = vi.fn()
const mockReminderSetCustomerBlock = vi.fn()
const mockGetReminderForView = vi.fn()
vi.mock("@/lib/services/reminder-service", () => {
  class MockReminderNotFoundError extends Error {
    constructor(id: string) {
      super(`Reminder "${id}" not found`)
      this.name = "ReminderNotFoundError"
    }
  }
  return {
    createRun: (...args: unknown[]) => mockReminderCreateRun(...args),
    sendReminder: (...args: unknown[]) => mockReminderSend(...args),
    markSentManually: (...args: unknown[]) =>
      mockReminderMarkSentManually(...args),
    cancelReminderWithSideEffects: (...args: unknown[]) =>
      mockReminderCancel(...args),
    setInvoiceBlock: (...args: unknown[]) => mockReminderSetInvoiceBlock(...args),
    setCustomerBlock: (...args: unknown[]) => mockReminderSetCustomerBlock(...args),
    getReminderForView: (...args: unknown[]) => mockGetReminderForView(...args),
    ReminderNotFoundError: MockReminderNotFoundError,
  }
})

const mockReminderRepoList = vi.fn()
const mockReminderRepoFindById = vi.fn()
vi.mock("@/lib/services/reminder-repository", () => ({
  list: (...args: unknown[]) => mockReminderRepoList(...args),
  findById: (...args: unknown[]) => mockReminderRepoFindById(...args),
}))

const mockPdfGenerate = vi.fn()
const mockPdfGetUrl = vi.fn()
vi.mock("@/lib/services/reminder-pdf-service", () => ({
  generateAndStorePdf: (...args: unknown[]) => mockPdfGenerate(...args),
  getSignedDownloadUrl: (...args: unknown[]) => mockPdfGetUrl(...args),
}))

// --- Constants ---

const DUNNING_VIEW = permissionIdByKey("dunning.view")!
const DUNNING_CREATE = permissionIdByKey("dunning.create")!
const DUNNING_SEND = permissionIdByKey("dunning.send")!
const DUNNING_CANCEL = permissionIdByKey("dunning.cancel")!
const DUNNING_SETTINGS = permissionIdByKey("dunning.settings")!
const ALL_PERMS = [
  DUNNING_VIEW,
  DUNNING_CREATE,
  DUNNING_SEND,
  DUNNING_CANCEL,
  DUNNING_SETTINGS,
]

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const REMINDER_ID = "d0000000-0000-4000-a000-000000000010"
const ADDRESS_ID = "b0000000-0000-4000-b000-000000000001"
const TEMPLATE_ID = "c0000000-0000-4000-a000-000000000010"
const DOC_ID = "e0000000-0000-4000-a000-000000000010"

const createCaller = createCallerFactory(remindersRouter)

const MODULE_MOCK = {
  tenantModule: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi
      .fn()
      .mockResolvedValue({ id: "mock", module: "billing" }),
  },
}

function withModuleMock(prisma: Record<string, unknown>) {
  return { ...MODULE_MOCK, ...prisma }
}

function createTestContext(
  prisma: Record<string, unknown> = {},
  permissions: string[] = ALL_PERMS
) {
  return createMockContext({
    prisma: withModuleMock(prisma) as unknown as ReturnType<
      typeof createMockContext
    >["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions(permissions, {
      id: USER_ID,
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

function createNoPermContext() {
  return createTestContext({}, [])
}

beforeEach(() => {
  vi.clearAllMocks()
})

// --- Tests ---

describe("billing.reminders.getEligibleProposal", () => {
  it("returns list from eligibility service", async () => {
    mockEligibilityList.mockResolvedValue([
      {
        customerAddressId: ADDRESS_ID,
        customerName: "Test Kunde GmbH",
        customerEmail: "kunde@example.com",
        groupTargetLevel: 1,
        invoices: [],
        totalOpenAmount: 100,
        totalInterest: 5,
        totalFees: 0,
        totalDue: 105,
      },
    ])
    const caller = createCaller(createTestContext())
    const result = await caller.getEligibleProposal()
    expect(result).toHaveLength(1)
    expect(result![0]!.customerName).toBe("Test Kunde GmbH")
    expect(mockEligibilityList).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID
    )
  })

  it("returns empty array when nothing eligible", async () => {
    mockEligibilityList.mockResolvedValue([])
    const caller = createCaller(createTestContext())
    const result = await caller.getEligibleProposal()
    expect(result).toEqual([])
  })

  it("rejects without dunning.view permission", async () => {
    const caller = createCaller(createNoPermContext())
    await expect(caller.getEligibleProposal()).rejects.toThrow(
      "Insufficient permissions"
    )
  })
})

describe("billing.reminders.getSettings / updateSettings", () => {
  const settingsRow = {
    id: "settings-1",
    tenantId: TENANT_ID,
    enabled: false,
    maxLevel: 3,
    gracePeriodDays: [7, 14, 21],
    feeAmounts: [0, 2.5, 5],
    interestEnabled: true,
    interestRatePercent: 9,
    feesEnabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  it("getSettings returns existing row", async () => {
    mockSettingsGet.mockResolvedValue(settingsRow)
    const caller = createCaller(createTestContext())
    const result = await caller.getSettings()
    expect(result!.maxLevel).toBe(3)
    expect(result!.enabled).toBe(false)
  })

  it("updateSettings seeds default templates when enabling", async () => {
    mockSettingsUpdate.mockResolvedValue({ ...settingsRow, enabled: true })
    mockTemplateSeed.mockResolvedValue({ seeded: 3 })
    const caller = createCaller(createTestContext())
    await caller.updateSettings({ enabled: true })
    expect(mockTemplateSeed).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID
    )
  })

  it("updateSettings does not seed templates when disabling", async () => {
    mockSettingsUpdate.mockResolvedValue({ ...settingsRow, enabled: false })
    const caller = createCaller(createTestContext())
    await caller.updateSettings({ enabled: false })
    expect(mockTemplateSeed).not.toHaveBeenCalled()
  })

  it("updateSettings rejects without dunning.settings permission", async () => {
    const caller = createCaller(createTestContext({}, [DUNNING_VIEW]))
    await expect(
      caller.updateSettings({ enabled: true })
    ).rejects.toThrow("Insufficient permissions")
  })
})

describe("billing.reminders templates", () => {
  const tpl = {
    id: TEMPLATE_ID,
    tenantId: TENANT_ID,
    name: "Stufe 1",
    level: 1,
    headerText: "",
    footerText: "",
    emailSubject: "",
    emailBody: "",
    isDefault: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdById: null,
  }

  it("listTemplates returns templates", async () => {
    mockTemplateList.mockResolvedValue([tpl])
    const caller = createCaller(createTestContext())
    const result = await caller.listTemplates()
    expect(result).toHaveLength(1)
  })

  it("createTemplate requires dunning.settings", async () => {
    const caller = createCaller(createTestContext({}, [DUNNING_VIEW]))
    await expect(
      caller.createTemplate({ name: "Test", level: 1 })
    ).rejects.toThrow("Insufficient permissions")
  })

  it("seedDefaultTemplates calls service", async () => {
    mockTemplateSeed.mockResolvedValue({ seeded: 3 })
    const caller = createCaller(createTestContext())
    const result = await caller.seedDefaultTemplates()
    expect(result!.seeded).toBe(3)
  })
})

describe("billing.reminders.createRun", () => {
  it("creates a run", async () => {
    mockReminderCreateRun.mockResolvedValue({
      reminderIds: [REMINDER_ID],
      skippedInvoices: [],
    })
    const caller = createCaller(createTestContext())
    const result = await caller.createRun({
      groups: [
        { customerAddressId: ADDRESS_ID, billingDocumentIds: [DOC_ID] },
      ],
    })
    expect(result!.reminderIds).toEqual([REMINDER_ID])
  })

  it("rejects without dunning.create", async () => {
    const caller = createCaller(createTestContext({}, [DUNNING_VIEW]))
    await expect(
      caller.createRun({
        groups: [
          { customerAddressId: ADDRESS_ID, billingDocumentIds: [DOC_ID] },
        ],
      })
    ).rejects.toThrow("Insufficient permissions")
  })

  it("rejects empty group selection", async () => {
    const caller = createCaller(createTestContext())
    await expect(caller.createRun({ groups: [] })).rejects.toThrow()
  })
})

describe("billing.reminders.listRuns / getRun", () => {
  const reminderRow = {
    id: REMINDER_ID,
    tenantId: TENANT_ID,
    number: "MA-2026-001",
    customerAddressId: ADDRESS_ID,
    level: 1,
    status: "DRAFT",
    sentAt: null,
    sentById: null,
    sendMethod: null,
    pdfStoragePath: null,
    totalOpenAmount: 100,
    totalInterest: 5,
    totalFees: 0,
    totalDue: 105,
    headerText: "",
    footerText: "",
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdById: USER_ID,
    items: [],
    customerAddress: { id: ADDRESS_ID, company: "Test Kunde" },
  }

  it("listRuns proxies to repo with status filter", async () => {
    mockReminderRepoList.mockResolvedValue([reminderRow])
    const caller = createCaller(createTestContext())
    const result = await caller.listRuns({ status: "DRAFT" })
    expect(result).toHaveLength(1)
    expect(mockReminderRepoList).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      { status: "DRAFT" }
    )
  })

  it("listRuns ALL passes undefined status", async () => {
    mockReminderRepoList.mockResolvedValue([reminderRow])
    const caller = createCaller(createTestContext())
    await caller.listRuns({ status: "ALL" })
    expect(mockReminderRepoList).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      { status: undefined }
    )
  })

  it("getRun returns reminder", async () => {
    mockGetReminderForView.mockResolvedValue(reminderRow)
    const caller = createCaller(createTestContext())
    const result = await caller.getRun({ id: REMINDER_ID })
    expect(result!.number).toBe("MA-2026-001")
  })

  it("getRun maps NotFound to NOT_FOUND", async () => {
    class NotFound extends Error {
      constructor() {
        super("not found")
        this.name = "ReminderNotFoundError"
      }
    }
    mockGetReminderForView.mockRejectedValue(new NotFound())
    const caller = createCaller(createTestContext())
    await expect(caller.getRun({ id: REMINDER_ID })).rejects.toThrow()
  })
})

describe("billing.reminders.send / markSentManually / cancel", () => {
  it("send calls reminder service", async () => {
    mockReminderSend.mockResolvedValue({ id: REMINDER_ID, status: "SENT" })
    const caller = createCaller(createTestContext())
    const result = await caller.send({ id: REMINDER_ID })
    expect(result!.status).toBe("SENT")
    expect(mockReminderSend).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      REMINDER_ID,
      USER_ID
    )
  })

  it("send requires dunning.send", async () => {
    const caller = createCaller(createTestContext({}, [DUNNING_VIEW]))
    await expect(caller.send({ id: REMINDER_ID })).rejects.toThrow(
      "Insufficient permissions"
    )
  })

  it("markSentManually with method=letter", async () => {
    mockReminderMarkSentManually.mockResolvedValue({
      id: REMINDER_ID,
      status: "SENT",
      sendMethod: "letter",
    })
    const caller = createCaller(createTestContext())
    const result = await caller.markSentManually({
      id: REMINDER_ID,
      method: "letter",
    })
    expect(result!.sendMethod).toBe("letter")
  })

  it("cancel proxies to cancelReminderWithSideEffects", async () => {
    mockReminderCancel.mockResolvedValue({
      id: REMINDER_ID,
      status: "CANCELLED",
    })
    const caller = createCaller(createTestContext())
    const result = await caller.cancel({ id: REMINDER_ID, reason: "Bezahlt" })
    expect(result!.status).toBe("CANCELLED")
    expect(mockReminderCancel).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      REMINDER_ID,
      "Bezahlt",
      USER_ID
    )
  })

  it("cancel requires dunning.cancel", async () => {
    const caller = createCaller(createTestContext({}, [DUNNING_VIEW]))
    await expect(
      caller.cancel({ id: REMINDER_ID })
    ).rejects.toThrow("Insufficient permissions")
  })
})

describe("billing.reminders blocks", () => {
  it("setInvoiceBlock proxies with reason", async () => {
    mockReminderSetInvoiceBlock.mockResolvedValue({
      id: DOC_ID,
      number: "RE-1",
      dunningBlocked: true,
      dunningBlockReason: "Klärung läuft",
    })
    const caller = createCaller(createTestContext())
    const result = await caller.setInvoiceBlock({
      billingDocumentId: DOC_ID,
      blocked: true,
      reason: "Klärung läuft",
    })
    expect(result!.dunningBlocked).toBe(true)
    expect(mockReminderSetInvoiceBlock).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      DOC_ID,
      true,
      "Klärung läuft",
      USER_ID
    )
  })

  it("setCustomerBlock proxies", async () => {
    mockReminderSetCustomerBlock.mockResolvedValue({
      id: ADDRESS_ID,
      company: "Test Kunde",
      dunningBlocked: false,
      dunningBlockReason: null,
    })
    const caller = createCaller(createTestContext())
    const result = await caller.setCustomerBlock({
      customerAddressId: ADDRESS_ID,
      blocked: false,
    })
    expect(result!.dunningBlocked).toBe(false)
    expect(mockReminderSetCustomerBlock).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      ADDRESS_ID,
      false,
      null,
      USER_ID
    )
  })

  it("setInvoiceBlock requires dunning.cancel", async () => {
    const caller = createCaller(createTestContext({}, [DUNNING_VIEW]))
    await expect(
      caller.setInvoiceBlock({ billingDocumentId: DOC_ID, blocked: true })
    ).rejects.toThrow("Insufficient permissions")
  })
})

describe("billing.reminders.getPdfDownloadUrl", () => {
  it("returns signed URL when PDF exists", async () => {
    mockPdfGetUrl.mockResolvedValue({
      signedUrl: "https://example.com/x.pdf",
      filename: "MA-2026-001.pdf",
    })
    const caller = createCaller(createTestContext())
    const result = await caller.getPdfDownloadUrl({ id: REMINDER_ID })
    expect(result!.signedUrl).toBeDefined()
  })

  it("returns null when PDF not yet generated", async () => {
    mockPdfGetUrl.mockResolvedValue(null)
    const caller = createCaller(createTestContext())
    const result = await caller.getPdfDownloadUrl({ id: REMINDER_ID })
    expect(result).toBeNull()
  })
})
