/**
 * Unit tests for payment-run-service.
 *
 * Covers idempotent state transitions (markBooked, cancel, setExported)
 * and the pre-flight guard on create. Uses a fake in-memory repo.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const repoMock = vi.hoisted(() => ({
  findById: vi.fn(),
  findMany: vi.fn(),
  createWithItems: vi.fn(),
  updateStatus: vi.fn(),
  findInvoiceIdsWithActivePaymentRun: vi.fn(),
}))

const configMock = vi.hoisted(() => ({
  get: vi.fn(),
}))

const numberSequenceMock = vi.hoisted(() => ({
  getNextNumber: vi.fn(),
}))

const auditMock = vi.hoisted(() => ({
  log: vi.fn().mockResolvedValue(undefined),
  logBulk: vi.fn().mockResolvedValue(undefined),
  computeChanges: vi.fn().mockReturnValue(null),
}))

vi.mock("../payment-run-repository", () => repoMock)
vi.mock("../billing-tenant-config-service", () => configMock)
vi.mock("../number-sequence-service", () => numberSequenceMock)
vi.mock("../audit-logs-service", () => auditMock)

import {
  PaymentRunInvalidStateError,
  PaymentRunNotFoundError,
  PaymentRunPreflightError,
  cancel,
  create,
  getPreflight,
  markBooked,
  setExported,
} from "../payment-run-service"
import type { PrismaClient } from "@/generated/prisma/client"

const TENANT_ID = "00000000-0000-4000-a000-000000000001"
const USER_ID = "00000000-0000-4000-a000-000000000002"
const RUN_ID = "10000000-0000-4000-a000-000000000001"

const fakePrisma = {
  inboundInvoice: {
    findMany: vi.fn(),
  },
  $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
} as unknown as PrismaClient

function run(
  status: string,
  extra: Record<string, unknown> = {}
) {
  return {
    id: RUN_ID,
    tenantId: TENANT_ID,
    number: "PR-2026-001",
    status,
    executionDate: new Date("2026-04-16"),
    debtorName: "Terp Test GmbH",
    debtorIban: "DE89370400440532013000",
    debtorBic: "COBADEFFXXX",
    totalAmountCents: 119000n,
    itemCount: 1,
    xmlStoragePath: null,
    xmlGeneratedAt: null,
    bookedAt: null,
    bookedBy: null,
    cancelledAt: null,
    cancelledBy: null,
    cancelledReason: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: USER_ID,
    items: [],
    ...extra,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("getPreflight", () => {
  it("returns ready when all fields are set", async () => {
    configMock.get.mockResolvedValue({
      iban: "DE89370400440532013000",
      companyName: "Terp Test GmbH",
      companyCity: "Berlin",
      companyCountry: "DE",
    })
    const result = await getPreflight(fakePrisma, TENANT_ID)
    expect(result.ready).toBe(true)
    expect(result.blockers).toEqual([])
  })

  it("reports every missing field", async () => {
    configMock.get.mockResolvedValue({
      iban: null,
      companyName: "",
      companyCity: null,
      companyCountry: null,
    })
    const result = await getPreflight(fakePrisma, TENANT_ID)
    expect(result.ready).toBe(false)
    expect(result.blockers).toEqual(["NO_IBAN", "NO_NAME", "NO_CITY", "NO_COUNTRY"])
  })

  it("handles missing config", async () => {
    configMock.get.mockResolvedValue(null)
    const result = await getPreflight(fakePrisma, TENANT_ID)
    expect(result.ready).toBe(false)
    expect(result.blockers.length).toBeGreaterThan(0)
  })
})

describe("create", () => {
  it("throws PaymentRunPreflightError when config incomplete", async () => {
    configMock.get.mockResolvedValue({ iban: null })
    await expect(
      create(
        fakePrisma,
        TENANT_ID,
        {
          executionDate: new Date("2026-04-16"),
          items: [
            {
              invoiceId: "20000000-0000-4000-a000-000000000001",
              ibanSource: "CRM",
              addressSource: "CRM",
            },
          ],
        },
        USER_ID
      )
    ).rejects.toBeInstanceOf(PaymentRunPreflightError)
  })

  it("rejects empty item list", async () => {
    configMock.get.mockResolvedValue({
      iban: "DE89370400440532013000",
      companyName: "Terp",
      companyCity: "Berlin",
      companyCountry: "DE",
    })
    await expect(
      create(
        fakePrisma,
        TENANT_ID,
        { executionDate: new Date("2026-04-16"), items: [] },
        USER_ID
      )
    ).rejects.toMatchObject({ name: "PaymentRunItemInvalidError" })
  })
})

describe("markBooked", () => {
  it("DRAFT → throws invalid state", async () => {
    repoMock.findById.mockResolvedValue(run("DRAFT"))
    await expect(
      markBooked(fakePrisma, TENANT_ID, RUN_ID, USER_ID)
    ).rejects.toBeInstanceOf(PaymentRunInvalidStateError)
  })

  it("EXPORTED → transitions to BOOKED", async () => {
    repoMock.findById.mockResolvedValue(run("EXPORTED"))
    repoMock.updateStatus.mockResolvedValue(
      run("BOOKED", { bookedAt: new Date(), bookedBy: USER_ID })
    )
    const result = await markBooked(fakePrisma, TENANT_ID, RUN_ID, USER_ID)
    expect(result.status).toBe("BOOKED")
    expect(repoMock.updateStatus).toHaveBeenCalledWith(
      fakePrisma,
      TENANT_ID,
      RUN_ID,
      expect.objectContaining({ status: "BOOKED", bookedBy: USER_ID })
    )
  })

  it("already BOOKED → idempotent no-op", async () => {
    repoMock.findById.mockResolvedValue(run("BOOKED"))
    const result = await markBooked(fakePrisma, TENANT_ID, RUN_ID, USER_ID)
    expect(result.status).toBe("BOOKED")
    expect(repoMock.updateStatus).not.toHaveBeenCalled()
  })

  it("unknown id → PaymentRunNotFoundError", async () => {
    repoMock.findById.mockResolvedValue(null)
    await expect(
      markBooked(fakePrisma, TENANT_ID, RUN_ID, USER_ID)
    ).rejects.toBeInstanceOf(PaymentRunNotFoundError)
  })
})

describe("cancel", () => {
  it("DRAFT → CANCELLED", async () => {
    repoMock.findById.mockResolvedValue(run("DRAFT"))
    repoMock.updateStatus.mockResolvedValue(run("CANCELLED"))
    const result = await cancel(
      fakePrisma,
      TENANT_ID,
      RUN_ID,
      USER_ID,
      "manual rollback"
    )
    expect(result.status).toBe("CANCELLED")
    expect(repoMock.updateStatus).toHaveBeenCalled()
  })

  it("already CANCELLED → idempotent no-op", async () => {
    repoMock.findById.mockResolvedValue(run("CANCELLED"))
    const result = await cancel(fakePrisma, TENANT_ID, RUN_ID, USER_ID, "")
    expect(result.status).toBe("CANCELLED")
    expect(repoMock.updateStatus).not.toHaveBeenCalled()
  })

  it("BOOKED → throws invalid state", async () => {
    repoMock.findById.mockResolvedValue(run("BOOKED"))
    await expect(
      cancel(fakePrisma, TENANT_ID, RUN_ID, USER_ID, "")
    ).rejects.toBeInstanceOf(PaymentRunInvalidStateError)
  })
})

describe("setExported", () => {
  it("DRAFT → EXPORTED with storage path", async () => {
    repoMock.findById.mockResolvedValue(run("DRAFT"))
    repoMock.updateStatus.mockResolvedValue(
      run("EXPORTED", { xmlStoragePath: `${TENANT_ID}/${RUN_ID}.xml` })
    )
    const result = await setExported(
      fakePrisma,
      TENANT_ID,
      RUN_ID,
      `${TENANT_ID}/${RUN_ID}.xml`
    )
    expect(result.status).toBe("EXPORTED")
    expect(repoMock.updateStatus).toHaveBeenCalledWith(
      fakePrisma,
      TENANT_ID,
      RUN_ID,
      expect.objectContaining({
        status: "EXPORTED",
        xmlStoragePath: `${TENANT_ID}/${RUN_ID}.xml`,
      })
    )
  })

  it("already EXPORTED → idempotent no-op", async () => {
    const existing = run("EXPORTED", {
      xmlStoragePath: `${TENANT_ID}/${RUN_ID}.xml`,
    })
    repoMock.findById.mockResolvedValue(existing)
    const result = await setExported(
      fakePrisma,
      TENANT_ID,
      RUN_ID,
      `${TENANT_ID}/${RUN_ID}.xml`
    )
    expect(result).toBe(existing)
    expect(repoMock.updateStatus).not.toHaveBeenCalled()
  })

  it("BOOKED → throws invalid state", async () => {
    repoMock.findById.mockResolvedValue(run("BOOKED"))
    await expect(
      setExported(fakePrisma, TENANT_ID, RUN_ID, "path")
    ).rejects.toBeInstanceOf(PaymentRunInvalidStateError)
  })
})
