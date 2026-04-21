import { describe, it, expect, vi, beforeEach } from "vitest"
import * as service from "../service-object-import-service"
import type { PrismaClient } from "@/generated/prisma/client"

vi.mock("../audit-logs-service", () => ({
  log: vi.fn().mockResolvedValue(undefined),
  computeChanges: vi.fn().mockReturnValue(null),
}))

const TENANT_A = "aabbcc11-2233-4455-6677-8899aabbccdd"
const CUSTOMER_ID = "11111111-2222-3333-4444-555555555555"

function toBase64(content: string): string {
  return Buffer.from(content, "utf-8").toString("base64")
}

function makePrisma(
  overrides: Record<string, unknown> = {},
  createdRows: unknown[] = []
) {
  const rows: unknown[] = createdRows
  return {
    crmAddress: {
      findMany: vi.fn().mockResolvedValue([
        { id: CUSTOMER_ID, number: "K-1" },
      ]),
    },
    serviceObject: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        const obj = { id: `gen-${rows.length + 1}`, ...data }
        rows.push(obj)
        return obj
      }),
    },
    $transaction: vi.fn().mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(undefined)
    ),
    ...overrides,
  } as unknown as PrismaClient
}

describe("service-object-import-service — parseServiceObjectImport", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("parses a plain CSV with ; separator and UTF-8 BOM", async () => {
    const prisma = makePrisma()
    const csv = "﻿number;name;customerAddressNumber\nSO-1;Machine A;K-1\nSO-2;Machine B;K-1\n"

    const res = await service.parseServiceObjectImport(
      prisma,
      TENANT_A,
      toBase64(csv),
      "test.csv"
    )

    expect(res.rowCount).toBe(2)
    expect(res.validCount).toBe(2)
    expect(res.invalidCount).toBe(0)
    expect(res.hasErrors).toBe(false)
    expect(res.resolvedCustomerAddresses["K-1"]).toBe(CUSTOMER_ID)
  })

  it("parses CSV with comma separator", async () => {
    const prisma = makePrisma()
    const csv = "number,name,customerAddressNumber\nSO-1,Machine A,K-1\n"
    const res = await service.parseServiceObjectImport(
      prisma,
      TENANT_A,
      toBase64(csv),
      "test.csv"
    )
    expect(res.validCount).toBe(1)
  })

  it("flags rows with unresolved customer", async () => {
    const prisma = makePrisma({
      crmAddress: { findMany: vi.fn().mockResolvedValue([]) },
    })
    const csv = "number;name;customerAddressNumber\nSO-1;Machine;K-999\n"
    const res = await service.parseServiceObjectImport(
      prisma,
      TENANT_A,
      toBase64(csv),
      "test.csv"
    )
    expect(res.invalidCount).toBe(1)
    expect(res.unresolvedCustomerAddresses).toContain("K-999")
    expect(res.rows[0]!.errors.length).toBeGreaterThan(0)
  })

  it("flags duplicate `number` within the CSV", async () => {
    const prisma = makePrisma()
    const csv =
      "number;name;customerAddressNumber\nSO-1;Machine;K-1\nSO-1;Another;K-1\n"
    const res = await service.parseServiceObjectImport(
      prisma,
      TENANT_A,
      toBase64(csv),
      "test.csv"
    )
    expect(res.duplicateNumbers).toContain("SO-1")
    expect(res.invalidCount).toBeGreaterThan(0)
  })

  it("flags numbers that already exist in DB", async () => {
    const prisma = makePrisma({
      serviceObject: {
        findMany: vi.fn().mockResolvedValue([{ number: "SO-1" }]),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      },
    })
    const csv = "number;name;customerAddressNumber\nSO-1;Machine;K-1\n"
    const res = await service.parseServiceObjectImport(
      prisma,
      TENANT_A,
      toBase64(csv),
      "test.csv"
    )
    expect(res.invalidCount).toBe(1)
    expect(res.rows[0]!.errors.some((e) => /already exists/.test(e))).toBe(true)
  })

  it("flags invalid `kind` value", async () => {
    const prisma = makePrisma()
    const csv =
      "number;name;customerAddressNumber;kind\nSO-1;Machine;K-1;UNKNOWN\n"
    const res = await service.parseServiceObjectImport(
      prisma,
      TENANT_A,
      toBase64(csv),
      "test.csv"
    )
    expect(res.invalidCount).toBe(1)
    expect(res.rows[0]!.errors.some((e) => /invalid kind/.test(e))).toBe(true)
  })

  it("flags out-of-range yearBuilt", async () => {
    const prisma = makePrisma()
    const csv =
      "number;name;customerAddressNumber;yearBuilt\nSO-1;Machine;K-1;1800\n"
    const res = await service.parseServiceObjectImport(
      prisma,
      TENANT_A,
      toBase64(csv),
      "test.csv"
    )
    expect(res.invalidCount).toBe(1)
    expect(res.rows[0]!.errors.some((e) => /yearBuilt/i.test(e))).toBe(true)
  })

  it("flags cyclic parentNumber within the CSV", async () => {
    const prisma = makePrisma()
    // SO-A.parent = SO-B; SO-B.parent = SO-A → cycle
    const csv = [
      "number;name;customerAddressNumber;parentNumber",
      "SO-A;A;K-1;SO-B",
      "SO-B;B;K-1;SO-A",
    ].join("\n")
    const res = await service.parseServiceObjectImport(
      prisma,
      TENANT_A,
      toBase64(csv),
      "test.csv"
    )
    expect(res.invalidCount).toBe(2)
    expect(res.rows.every((r) => r.errors.some((e) => /cycle/i.test(e)))).toBe(
      true
    )
  })

  it("rejects CSV with missing required columns", async () => {
    const prisma = makePrisma()
    const csv = "number;name\nSO-1;Machine\n"
    await expect(
      service.parseServiceObjectImport(prisma, TENANT_A, toBase64(csv), "x.csv")
    ).rejects.toBeInstanceOf(service.ServiceObjectImportValidationError)
  })

  it("rejects empty CSV", async () => {
    const prisma = makePrisma()
    await expect(
      service.parseServiceObjectImport(prisma, TENANT_A, toBase64(""), "x.csv")
    ).rejects.toBeInstanceOf(service.ServiceObjectImportValidationError)
  })
})

describe("service-object-import-service — confirmServiceObjectImport", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("aborts commit when preview has errors", async () => {
    const prisma = makePrisma()
    const csv = "number;name;customerAddressNumber\n;Empty;K-1\n"
    await expect(
      service.confirmServiceObjectImport(
        prisma,
        TENANT_A,
        toBase64(csv),
        "x.csv",
        { userId: "u-1" }
      )
    ).rejects.toBeInstanceOf(service.ServiceObjectImportValidationError)
  })

  it("topological sort: parent is inserted before its child", async () => {
    const created: Array<Record<string, unknown>> = []
    const prisma = {
      crmAddress: {
        findMany: vi.fn().mockResolvedValue([
          { id: CUSTOMER_ID, number: "K-1" },
        ]),
      },
      serviceObject: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: `gen-${created.length + 1}`, ...data }
          created.push(row)
          return row
        }),
      },
      $transaction: vi
        .fn()
        .mockImplementation(
          async (fn: (tx: unknown) => Promise<unknown>) => fn(undefined)
        ),
    } as unknown as PrismaClient

    // Patch: the import service passes tx to repo.create, but we want our
    // mock above to be used — so route tx through the parent prisma.
    const innerPrisma = prisma as unknown as {
      $transaction: (
        fn: (tx: unknown) => Promise<unknown>
      ) => Promise<unknown>
      serviceObject: { create: typeof prisma.serviceObject.create }
    }
    innerPrisma.$transaction = vi
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(prisma)
      )

    const csv = [
      "number;name;customerAddressNumber;parentNumber",
      // Intentionally list child first; topological sort must reorder.
      "SO-CHILD;Child;K-1;SO-PARENT",
      "SO-PARENT;Parent;K-1;",
    ].join("\n")

    const res = await service.confirmServiceObjectImport(
      prisma,
      TENANT_A,
      toBase64(csv),
      "x.csv",
      { userId: "u-1" }
    )

    expect(res.created).toBe(2)
    expect(res.failedRows).toHaveLength(0)
    // Parent must be inserted first, despite CSV order:
    expect(created[0]!.number).toBe("SO-PARENT")
    expect(created[1]!.number).toBe("SO-CHILD")
    // Child's parentId should point to the parent's generated id:
    expect(created[1]!.parentId).toBe(created[0]!.id)
  })

  it("partial failure: one bad row in commit does not abort the others", async () => {
    const created: Array<Record<string, unknown>> = []
    let callCount = 0
    const prisma = {
      crmAddress: {
        findMany: vi.fn().mockResolvedValue([
          { id: CUSTOMER_ID, number: "K-1" },
        ]),
      },
      serviceObject: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
          callCount++
          if (callCount === 2) {
            throw new Error("DB constraint boom")
          }
          const row = { id: `gen-${created.length + 1}`, ...data }
          created.push(row)
          return row
        }),
      },
      $transaction: vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
          fn(prisma)
        ),
    } as unknown as PrismaClient

    const csv = [
      "number;name;customerAddressNumber",
      "SO-1;A;K-1",
      "SO-2;B;K-1", // this one throws
      "SO-3;C;K-1",
    ].join("\n")

    const res = await service.confirmServiceObjectImport(
      prisma,
      TENANT_A,
      toBase64(csv),
      "x.csv",
      { userId: "u-1" }
    )
    expect(res.created).toBe(2)
    expect(res.failedRows).toHaveLength(1)
    expect(res.failedRows[0]!.number).toBe("SO-2")
  })
})
