import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { billingOutgoingInvoiceBookRouter } from "../billing/outgoingInvoiceBook"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// Mock Supabase Storage + @react-pdf/renderer used transitively by the PDF
// service. These are side-effect-only mocks; individual tests don't assert
// against them unless they cover the export paths.
vi.mock("@/lib/supabase/storage", () => ({
  upload: vi.fn().mockResolvedValue({ path: "mocked" }),
  createSignedReadUrl: vi
    .fn()
    .mockResolvedValue("https://example.com/signed"),
}))

vi.mock("@react-pdf/renderer", () => ({
  Document: () => null,
  Page: () => null,
  View: () => null,
  Text: () => null,
  Image: () => null,
  StyleSheet: { create: (o: unknown) => o },
  renderToBuffer: vi.fn().mockResolvedValue(Buffer.from("fake-pdf")),
}))

// Module-guard mock
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

const VIEW = permissionIdByKey("outgoing_invoice_book.view")!
const EXPORT = permissionIdByKey("outgoing_invoice_book.export")!
const BOTH = [VIEW, EXPORT]

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"

const createCaller = createCallerFactory(billingOutgoingInvoiceBookRouter)

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
  prisma: Record<string, unknown>,
  permissions: string[] = BOTH
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

const DATE_FROM = new Date("2026-03-01")
const DATE_TO = new Date("2026-03-31")

const mockInvoice = {
  id: "d0000000-0000-4000-a000-000000000001",
  number: "RE-1",
  type: "INVOICE",
  status: "PRINTED",
  documentDate: new Date("2026-03-15"),
  servicePeriodFrom: new Date("2026-03-01"),
  servicePeriodTo: new Date("2026-03-31"),
  address: {
    id: "addr1",
    company: "Müller GmbH",
    number: "K-001",
    vatId: "DE123456789",
  },
  positions: [
    { vatRate: 19, totalPrice: 100, type: "ARTICLE" },
  ],
  subtotalNet: 100,
  totalVat: 19,
  totalGross: 119,
}

const mockCreditNote = {
  ...mockInvoice,
  id: "d0000000-0000-4000-a000-000000000002",
  number: "GS-1",
  type: "CREDIT_NOTE",
}

describe("billing.outgoingInvoiceBook.list", () => {
  it("returns entries + summary with permission", async () => {
    const prisma = {
      billingDocument: {
        findMany: vi.fn().mockResolvedValue([mockInvoice]),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.list({
      dateFrom: DATE_FROM,
      dateTo: DATE_TO,
    })
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!.number).toBe("RE-1")
    expect(result.summary.perRate).toHaveLength(1)
    expect(result.summary.perRate[0]!.vatRate).toBe(19)
    expect(result.summary.totalGross).toBe(119)
  })

  it("requires outgoing_invoice_book.view permission", async () => {
    const prisma = {
      billingDocument: { findMany: vi.fn().mockResolvedValue([]) },
    }
    const caller = createCaller(createTestContext(prisma, []))
    await expect(
      caller.list({ dateFrom: DATE_FROM, dateTo: DATE_TO })
    ).rejects.toThrow(/Insufficient permissions/i)
  })

  it("grants access with view-only (no export) permission", async () => {
    const prisma = {
      billingDocument: { findMany: vi.fn().mockResolvedValue([]) },
    }
    const caller = createCaller(createTestContext(prisma, [VIEW]))
    await expect(
      caller.list({ dateFrom: DATE_FROM, dateTo: DATE_TO })
    ).resolves.toBeDefined()
  })

  it("negates credit note amounts", async () => {
    const prisma = {
      billingDocument: {
        findMany: vi.fn().mockResolvedValue([mockCreditNote]),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.list({
      dateFrom: DATE_FROM,
      dateTo: DATE_TO,
    })
    expect(result.entries[0]!.totalGross).toBe(-119)
    expect(result.summary.totalGross).toBe(-119)
  })

  it("rejects when dateFrom > dateTo", async () => {
    const prisma = {
      billingDocument: { findMany: vi.fn().mockResolvedValue([]) },
    }
    const caller = createCaller(createTestContext(prisma))
    await expect(
      caller.list({
        dateFrom: new Date("2026-04-01"),
        dateTo: new Date("2026-03-01"),
      })
    ).rejects.toThrow(/dateFrom/)
  })

  it("passes type + status filter to prisma", async () => {
    const findMany = vi.fn().mockResolvedValue([])
    const prisma = { billingDocument: { findMany } }
    const caller = createCaller(createTestContext(prisma))
    await caller.list({ dateFrom: DATE_FROM, dateTo: DATE_TO })
    const callArgs = findMany.mock.calls[0]?.[0]
    expect(callArgs?.where?.type).toEqual({ in: ["INVOICE", "CREDIT_NOTE"] })
    expect(callArgs?.where?.status).toEqual({
      notIn: ["DRAFT", "CANCELLED"],
    })
    expect(callArgs?.where?.tenantId).toBe(TENANT_ID)
  })
})

describe("billing.outgoingInvoiceBook.exportPdf", () => {
  it("requires outgoing_invoice_book.export permission (view alone → FORBIDDEN)", async () => {
    const prisma = {
      billingDocument: { findMany: vi.fn().mockResolvedValue([]) },
      billingTenantConfig: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    }
    const caller = createCaller(createTestContext(prisma, [VIEW]))
    await expect(
      caller.exportPdf({ dateFrom: DATE_FROM, dateTo: DATE_TO })
    ).rejects.toThrow(/Insufficient permissions/i)
  })

  it("requires permission when no perms set", async () => {
    const prisma = { billingDocument: { findMany: vi.fn() } }
    const caller = createCaller(createTestContext(prisma, []))
    await expect(
      caller.exportPdf({ dateFrom: DATE_FROM, dateTo: DATE_TO })
    ).rejects.toThrow(/Insufficient permissions/i)
  })
})

describe("billing.outgoingInvoiceBook.exportCsv", () => {
  it("requires outgoing_invoice_book.export permission (view alone → FORBIDDEN)", async () => {
    const prisma = {
      billingDocument: { findMany: vi.fn().mockResolvedValue([]) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    }
    const caller = createCaller(createTestContext(prisma, [VIEW]))
    await expect(
      caller.exportCsv({
        dateFrom: DATE_FROM,
        dateTo: DATE_TO,
        encoding: "utf8",
      })
    ).rejects.toThrow(/Insufficient permissions/i)
  })

  it("returns base64 CSV with both encodings", async () => {
    const prisma = {
      billingDocument: {
        findMany: vi.fn().mockResolvedValue([mockInvoice]),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    }
    const caller = createCaller(createTestContext(prisma))
    const resultUtf = await caller.exportCsv({
      dateFrom: DATE_FROM,
      dateTo: DATE_TO,
      encoding: "utf8",
    })
    expect(resultUtf?.csv).toMatch(/^[A-Za-z0-9+/=]+$/)
    expect(resultUtf?.filename).toBe("Rechnungsausgangsbuch_2026-03.csv")
    expect(resultUtf?.count).toBe(1)
    // UTF-8 BOM check on decoded buffer
    const buf = Buffer.from(resultUtf!.csv, "base64")
    expect(buf[0]).toBe(0xef)
    expect(buf[1]).toBe(0xbb)
    expect(buf[2]).toBe(0xbf)

    const resultWin = await caller.exportCsv({
      dateFrom: DATE_FROM,
      dateTo: DATE_TO,
      encoding: "win1252",
    })
    const bufWin = Buffer.from(resultWin!.csv, "base64")
    expect(bufWin[0]).not.toBe(0xef)
  })
})
