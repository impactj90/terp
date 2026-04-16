import { describe, it, expect, vi, beforeEach } from "vitest"
import { buildCamtXml } from "./helpers/bank-match-fixtures"

// --- Module mocks (must be before importing the service under test) ---

vi.mock("@/lib/supabase/storage", () => ({
  upload: vi.fn().mockResolvedValue({ path: "mocked" }),
  remove: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../bank-statement-repository", () => ({
  findStatementByHash: vi.fn(),
  createStatement: vi.fn(),
  createTransactionsBatch: vi.fn(),
  listStatements: vi.fn(),
  findStatementById: vi.fn(),
}))

vi.mock("../audit-logs-service", () => ({
  log: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../number-sequence-service", () => ({
  getPrefixSnapshot: vi.fn().mockResolvedValue({
    invoicePrefix: "RE-",
    inboundInvoicePrefix: "ER-",
    creditNotePrefix: "G-",
  }),
}))

vi.mock("../bank-transaction-matcher-service", () => ({
  runCreditMatchForTransaction: vi.fn().mockResolvedValue({ result: "unmatched" }),
}))

import * as storage from "@/lib/supabase/storage"
import * as repo from "../bank-statement-repository"
import * as auditLog from "../audit-logs-service"
import * as numberSequenceService from "../number-sequence-service"
import {
  importCamtStatement,
  BankStatementValidationError,
} from "../bank-statement-service"
import { CamtValidationError } from "../bank-statement-camt-parser"
import type { PrismaClient } from "@/generated/prisma/client"

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"

function makePrismaStub(): PrismaClient {
  const stub = {
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => {
      return cb(stub)
    }),
  } as unknown as PrismaClient
  return stub
}

function makeB64(xml: string): string {
  return Buffer.from(xml, "utf8").toString("base64")
}

beforeEach(() => {
  vi.mocked(repo.findStatementByHash).mockReset()
  vi.mocked(repo.createStatement).mockReset()
  vi.mocked(repo.createTransactionsBatch).mockReset()
  vi.mocked(storage.upload).mockReset()
  vi.mocked(storage.remove).mockReset()
  vi.mocked(auditLog.log).mockReset()

  vi.mocked(storage.upload).mockResolvedValue({ path: "mocked" } as never)
  vi.mocked(storage.remove).mockResolvedValue(undefined as never)
  vi.mocked(auditLog.log).mockResolvedValue(undefined as never)
})

describe("importCamtStatement", () => {
  it("imports a happy-path credit CAMT file", async () => {
    vi.mocked(repo.findStatementByHash).mockResolvedValue(null)
    vi.mocked(repo.createStatement).mockImplementation(
      async (_tx, input) =>
        ({
          id: input.id ?? "stmt-row-id",
          tenantId: input.tenantId,
        }) as never,
    )
    vi.mocked(repo.createTransactionsBatch).mockResolvedValue([
      { id: "tx-1", direction: "CREDIT", status: "unmatched" },
    ] as never)

    const xml = buildCamtXml("credit-single")
    const result = await importCamtStatement(
      makePrismaStub(),
      TENANT_ID,
      { fileBase64: makeB64(xml), fileName: "test-credit.xml" },
      USER_ID,
    )

    expect(result.alreadyImported).toBe(false)
    expect(result.transactionsImported).toBe(1)
    expect(result.unmatched).toBe(1)
    expect(result.autoMatched).toBe(0)
    expect(storage.upload).toHaveBeenCalledTimes(1)
    expect(storage.upload).toHaveBeenCalledWith(
      "bank-statements",
      expect.stringMatching(new RegExp(`^${TENANT_ID}/[0-9a-f-]{36}\\.xml$`)),
      expect.any(Buffer),
      { contentType: "application/xml", upsert: false },
    )
    expect(repo.createStatement).toHaveBeenCalledTimes(1)
    expect(repo.createTransactionsBatch).toHaveBeenCalledTimes(1)
    expect(auditLog.log).toHaveBeenCalledTimes(1)
    expect(storage.remove).not.toHaveBeenCalled()
  })

  it("returns alreadyImported=true on duplicate hash and skips writes", async () => {
    vi.mocked(repo.findStatementByHash).mockResolvedValue({
      id: "existing-stmt-id",
    } as never)

    const xml = buildCamtXml("credit-single")
    const result = await importCamtStatement(
      makePrismaStub(),
      TENANT_ID,
      { fileBase64: makeB64(xml), fileName: "test-credit.xml" },
      USER_ID,
    )

    expect(result).toEqual({
      statementId: "existing-stmt-id",
      alreadyImported: true,
      transactionsImported: 0,
      autoMatched: 0,
      unmatched: 0,
      ignored: 0,
    })
    expect(storage.upload).not.toHaveBeenCalled()
    expect(repo.createStatement).not.toHaveBeenCalled()
    expect(repo.createTransactionsBatch).not.toHaveBeenCalled()
  })

  it("rejects invalid XML with CamtValidationError and does not touch storage", async () => {
    vi.mocked(repo.findStatementByHash).mockResolvedValue(null)
    const invalidXml = buildCamtXml("unknown-schema")

    await expect(
      importCamtStatement(
        makePrismaStub(),
        TENANT_ID,
        { fileBase64: makeB64(invalidXml), fileName: "bogus.xml" },
        USER_ID,
      ),
    ).rejects.toBeInstanceOf(CamtValidationError)

    expect(storage.upload).not.toHaveBeenCalled()
    expect(repo.createStatement).not.toHaveBeenCalled()
  })

  it("rejects empty buffer with BankStatementValidationError", async () => {
    await expect(
      importCamtStatement(
        makePrismaStub(),
        TENANT_ID,
        { fileBase64: "", fileName: "empty.xml" },
        USER_ID,
      ),
    ).rejects.toBeInstanceOf(BankStatementValidationError)
  })

  it("compensates storage upload when the DB transaction throws", async () => {
    vi.mocked(repo.findStatementByHash).mockResolvedValue(null)
    vi.mocked(repo.createStatement).mockRejectedValue(
      new Error("simulated DB failure"),
    )

    const xml = buildCamtXml("credit-single")
    await expect(
      importCamtStatement(
        makePrismaStub(),
        TENANT_ID,
        { fileBase64: makeB64(xml), fileName: "test-credit.xml" },
        USER_ID,
      ),
    ).rejects.toThrow("simulated DB failure")

    expect(storage.upload).toHaveBeenCalledTimes(1)
    expect(storage.remove).toHaveBeenCalledTimes(1)
    expect(storage.remove).toHaveBeenCalledWith(
      "bank-statements",
      expect.arrayContaining([
        expect.stringMatching(new RegExp(`^${TENANT_ID}/[0-9a-f-]{36}\\.xml$`)),
      ]),
    )
  })

  it("expands a batch entry into multiple transactions", async () => {
    vi.mocked(repo.findStatementByHash).mockResolvedValue(null)
    vi.mocked(repo.createStatement).mockImplementation(
      async (_tx, input) =>
        ({
          id: input.id ?? "stmt-row-id",
          tenantId: input.tenantId,
        }) as never,
    )
    vi.mocked(repo.createTransactionsBatch).mockResolvedValue([
      { id: "tx-1", direction: "DEBIT", status: "unmatched" },
      { id: "tx-2", direction: "DEBIT", status: "unmatched" },
      { id: "tx-3", direction: "DEBIT", status: "unmatched" },
    ] as never)

    const xml = buildCamtXml("batch")
    const result = await importCamtStatement(
      makePrismaStub(),
      TENANT_ID,
      { fileBase64: makeB64(xml), fileName: "batch.xml" },
      USER_ID,
    )
    expect(result.transactionsImported).toBe(3)
    expect(result.unmatched).toBe(3)

    const call = vi.mocked(repo.createTransactionsBatch).mock.calls[0]!
    const rows = call[3]
    expect(rows).toHaveLength(3)
    expect(rows.every((r) => r.status === "unmatched")).toBe(true)
    expect(rows.every((r) => r.direction === "DEBIT")).toBe(true)
  })
})
