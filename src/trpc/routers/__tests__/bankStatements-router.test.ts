import { describe, it, expect, vi, beforeEach } from "vitest"

// Module mocks must precede router import.
vi.mock("@/lib/db", () => ({
  prisma: {
    tenantModule: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi
        .fn()
        .mockResolvedValue({ id: "mock", module: "bank_statements" }),
    },
  },
}))

vi.mock("@/lib/services/bank-statement-service", () => ({
  importCamtStatement: vi.fn(),
  BankStatementValidationError: class BankStatementValidationError extends Error {
    constructor(message: string) {
      super(message)
      this.name = "BankStatementValidationError"
    }
  },
}))

vi.mock("@/lib/services/bank-statement-repository", () => ({
  listStatements: vi.fn(),
}))

vi.mock("@/lib/services/bank-transaction-matcher-service", () => ({
  manualMatchTransaction: vi.fn(),
  BankTransactionMatchValidationError: class extends Error {
    constructor(message: string) {
      super(message)
      this.name = "BankTransactionMatchValidationError"
    }
  },
}))

vi.mock("@/lib/services/billing-payment-service", () => ({
  enrichOpenItem: vi.fn(),
}))

vi.mock("@/lib/platform/subscription-service", () => ({
  hasPlatformSubscriptionMarker: vi.fn().mockReturnValue(false),
}))

vi.mock("@/lib/services/audit-logs-service", () => ({
  log: vi.fn().mockResolvedValue(undefined),
}))

import { createCallerFactory } from "@/trpc/init"
import { bankStatementsRouter } from "../bankStatements"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"
import * as bankStatementService from "@/lib/services/bank-statement-service"
import * as bankStatementRepo from "@/lib/services/bank-statement-repository"

import * as matcherService from "@/lib/services/bank-transaction-matcher-service"

const VIEW = permissionIdByKey("bank_transactions.view")!
const IMPORT = permissionIdByKey("bank_transactions.import")!
const MATCH = permissionIdByKey("bank_transactions.match")!
const IGNORE = permissionIdByKey("bank_transactions.ignore")!
const ALL_PERMS = [VIEW, IMPORT, MATCH, IGNORE]

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"

const createCaller = createCallerFactory(bankStatementsRouter)

const MODULE_MOCK_ENABLED = {
  tenantModule: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi
      .fn()
      .mockResolvedValue({ id: "mock", module: "bank_statements" }),
  },
}

const MODULE_MOCK_DISABLED = {
  tenantModule: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
  },
}

function createTestContext(opts: {
  permissions?: string[]
  moduleEnabled?: boolean
  extraPrisma?: Record<string, unknown>
}) {
  const moduleMock =
    opts.moduleEnabled === false ? MODULE_MOCK_DISABLED : MODULE_MOCK_ENABLED
  const prisma = { ...moduleMock, ...(opts.extraPrisma ?? {}) }
  return createMockContext({
    prisma: prisma as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions(opts.permissions ?? ALL_PERMS, {
      id: USER_ID,
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

beforeEach(() => {
  vi.mocked(bankStatementService.importCamtStatement).mockReset()
  vi.mocked(bankStatementRepo.listStatements).mockReset()
  vi.mocked(matcherService.manualMatchTransaction).mockReset()
})

describe("bankStatements.import", () => {
  it("returns the service result on happy path", async () => {
    vi.mocked(bankStatementService.importCamtStatement).mockResolvedValue({
      statementId: "stmt-1",
      alreadyImported: false,
      transactionsImported: 3,
      autoMatched: 0,
      unmatched: 3,
      ignored: 0,
    })

    const caller = createCaller(createTestContext({}))
    const result = await caller.import({
      fileBase64: Buffer.from("<xml/>").toString("base64"),
      fileName: "test.xml",
    })

    expect(result.transactionsImported).toBe(3)
    expect(bankStatementService.importCamtStatement).toHaveBeenCalledTimes(1)
    const [, tenantId, input, userId] = vi.mocked(
      bankStatementService.importCamtStatement,
    ).mock.calls[0]!
    expect(tenantId).toBe(TENANT_ID)
    expect(input.fileName).toBe("test.xml")
    expect(userId).toBe(USER_ID)
  })

  it("throws FORBIDDEN without bank_transactions.import permission", async () => {
    const caller = createCaller(createTestContext({ permissions: [VIEW] }))
    await expect(
      caller.import({
        fileBase64: "YWJj",
        fileName: "test.xml",
      }),
    ).rejects.toThrow(/permission/i)
    expect(bankStatementService.importCamtStatement).not.toHaveBeenCalled()
  })

  it("throws FORBIDDEN when bank_statements module is disabled", async () => {
    const caller = createCaller(
      createTestContext({ moduleEnabled: false }),
    )
    await expect(
      caller.import({ fileBase64: "YWJj", fileName: "test.xml" }),
    ).rejects.toThrow(/bank_statements/i)
    expect(bankStatementService.importCamtStatement).not.toHaveBeenCalled()
  })

  it("rejects empty fileBase64 with BAD_REQUEST (zod)", async () => {
    const caller = createCaller(createTestContext({}))
    await expect(
      caller.import({ fileBase64: "", fileName: "test.xml" }),
    ).rejects.toThrow()
    expect(bankStatementService.importCamtStatement).not.toHaveBeenCalled()
  })

  it("maps BankStatementValidationError to BAD_REQUEST via handleServiceError", async () => {
    const { BankStatementValidationError } = await import(
      "@/lib/services/bank-statement-service"
    )
    vi.mocked(bankStatementService.importCamtStatement).mockRejectedValue(
      new BankStatementValidationError("bad file"),
    )

    const caller = createCaller(createTestContext({}))
    await expect(
      caller.import({ fileBase64: "YWJj", fileName: "test.xml" }),
    ).rejects.toThrow(/bad file/)
  })
})

describe("bankStatements.list", () => {
  it("returns paginated statements", async () => {
    vi.mocked(bankStatementRepo.listStatements).mockResolvedValue({
      items: [],
      total: 0,
    } as never)

    const caller = createCaller(createTestContext({}))
    const result = await caller.list({ limit: 25, offset: 0 })
    expect(result?.total).toBe(0)
    expect(bankStatementRepo.listStatements).toHaveBeenCalledTimes(1)
  })

  it("requires bank_transactions.view permission", async () => {
    const caller = createCaller(createTestContext({ permissions: [] }))
    await expect(
      caller.list({ limit: 25, offset: 0 }),
    ).rejects.toThrow(/permission/i)
  })
})

describe("bankStatements.bankTransactions.list", () => {
  it("returns paginated transactions for a given status", async () => {
    const mockTx = {
      id: "tx-1",
      tenantId: TENANT_ID,
      status: "unmatched",
      amount: 500,
      direction: "CREDIT",
      suggestedAddress: null,
    }
    const ctx = createTestContext({
      extraPrisma: {
        bankTransaction: {
          findMany: vi.fn().mockResolvedValue([mockTx]),
          count: vi.fn().mockResolvedValue(1),
        },
      },
    })

    const caller = createCaller(ctx)
    const result = await caller.bankTransactions.list({
      status: "unmatched",
      limit: 50,
      offset: 0,
    })

    expect(result?.total).toBe(1)
    expect(result?.items).toHaveLength(1)
  })

  it("requires bank_transactions.view permission", async () => {
    const caller = createCaller(createTestContext({ permissions: [] }))
    await expect(
      caller.bankTransactions.list({ status: "unmatched", limit: 50, offset: 0 }),
    ).rejects.toThrow(/permission/i)
  })
})

describe("bankStatements.bankTransactions.manualMatch", () => {
  it("calls manualMatchTransaction on happy path", async () => {
    vi.mocked(matcherService.manualMatchTransaction).mockResolvedValue(undefined)

    const caller = createCaller(createTestContext({}))
    await caller.bankTransactions.manualMatch({
      bankTransactionId: "a0000000-0000-4000-a000-000000000099",
      allocations: [
        { billingDocumentId: "a0000000-0000-4000-a000-000000000050", amount: 500 },
      ],
    })

    expect(matcherService.manualMatchTransaction).toHaveBeenCalledTimes(1)
    const [, tenantId, , , userId] = vi.mocked(matcherService.manualMatchTransaction).mock.calls[0]!
    expect(tenantId).toBe(TENANT_ID)
    expect(userId).toBe(USER_ID)
  })

  it("requires bank_transactions.match permission", async () => {
    const caller = createCaller(createTestContext({ permissions: [VIEW] }))
    await expect(
      caller.bankTransactions.manualMatch({
        bankTransactionId: "a0000000-0000-4000-a000-000000000099",
        allocations: [{ billingDocumentId: "a0000000-0000-4000-a000-000000000050", amount: 500 }],
      }),
    ).rejects.toThrow(/permission/i)
    expect(matcherService.manualMatchTransaction).not.toHaveBeenCalled()
  })

  it("rejects empty allocations (zod)", async () => {
    const caller = createCaller(createTestContext({}))
    await expect(
      caller.bankTransactions.manualMatch({
        bankTransactionId: "a0000000-0000-4000-a000-000000000099",
        allocations: [],
      }),
    ).rejects.toThrow()
  })

  it("maps BankTransactionMatchValidationError to BAD_REQUEST", async () => {
    vi.mocked(matcherService.manualMatchTransaction).mockRejectedValue(
      new matcherService.BankTransactionMatchValidationError("sum mismatch"),
    )

    const caller = createCaller(createTestContext({}))
    await expect(
      caller.bankTransactions.manualMatch({
        bankTransactionId: "a0000000-0000-4000-a000-000000000099",
        allocations: [{ billingDocumentId: "a0000000-0000-4000-a000-000000000050", amount: 500 }],
      }),
    ).rejects.toThrow(/sum mismatch/)
  })
})

describe("bankStatements.bankTransactions.ignore", () => {
  it("sets status=ignored with reason and audit log", async () => {
    const mockTx = {
      id: "a0000000-0000-4000-a000-000000000099",
      tenantId: TENANT_ID,
      status: "unmatched",
    }
    const updateFn = vi.fn().mockResolvedValue({ ...mockTx, status: "ignored" })
    const ctx = createTestContext({
      extraPrisma: {
        bankTransaction: {
          findFirst: vi.fn().mockResolvedValue(mockTx),
          update: updateFn,
        },
      },
    })

    const caller = createCaller(ctx)
    await caller.bankTransactions.ignore({
      bankTransactionId: "a0000000-0000-4000-a000-000000000099",
      reason: "Bankgebühr",
    })

    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "ignored",
          ignoredReason: "Bankgebühr",
        }),
      }),
    )
  })

  it("requires bank_transactions.ignore permission", async () => {
    const caller = createCaller(createTestContext({ permissions: [VIEW] }))
    await expect(
      caller.bankTransactions.ignore({
        bankTransactionId: "a0000000-0000-4000-a000-000000000099",
      }),
    ).rejects.toThrow(/permission/i)
  })

  it("rejects if transaction is not unmatched", async () => {
    const ctx = createTestContext({
      extraPrisma: {
        bankTransaction: {
          findFirst: vi.fn().mockResolvedValue({
            id: "a0000000-0000-4000-a000-000000000099",
            tenantId: TENANT_ID,
            status: "matched",
          }),
        },
      },
    })

    const caller = createCaller(ctx)
    await expect(
      caller.bankTransactions.ignore({
        bankTransactionId: "a0000000-0000-4000-a000-000000000099",
      }),
    ).rejects.toThrow(/not unmatched/)
  })
})

describe("bankStatements.bankTransactions.getCandidates", () => {
  it("requires bank_transactions.match permission", async () => {
    const caller = createCaller(createTestContext({ permissions: [VIEW] }))
    await expect(
      caller.bankTransactions.getCandidates({
        bankTransactionId: "a0000000-0000-4000-a000-000000000099",
      }),
    ).rejects.toThrow(/permission/i)
  })

  it("returns empty candidates when transaction not found", async () => {
    const ctx = createTestContext({
      extraPrisma: {
        bankTransaction: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
    })

    const caller = createCaller(ctx)
    const result = await caller.bankTransactions.getCandidates({
      bankTransactionId: "a0000000-0000-4000-a000-000000000099",
    })

    expect(result?.creditCandidates).toEqual([])
    expect(result?.debitCandidates).toEqual([])
  })
})
