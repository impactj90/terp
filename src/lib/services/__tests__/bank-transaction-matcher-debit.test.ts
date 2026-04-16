import { describe, it, expect, vi, beforeEach } from "vitest"
import type { BankTransaction } from "@/generated/prisma/client"

vi.mock("../crm-address-repository", () => ({
  findAddressByIban: vi.fn(),
}))

vi.mock("../billing-payment-repository", () => ({
  findOpenItems: vi.fn(),
}))

vi.mock("../billing-payment-service", () => ({
  enrichOpenItem: vi.fn(),
}))

vi.mock("@/lib/platform/subscription-service", () => ({
  hasPlatformSubscriptionMarker: vi.fn(),
}))

vi.mock("@/lib/billing/payment-discount", () => ({
  getApplicableDiscount: vi.fn(),
}))

vi.mock("../inbound-invoice-payment-repository", () => ({
  createPayment: vi.fn(),
}))

vi.mock("../inbound-invoice-payment-service", () => ({
  computeInboundPaymentStatus: vi.fn(),
}))

vi.mock("../audit-logs-service", () => ({
  log: vi.fn().mockResolvedValue(undefined),
}))

import { computeDebitMatchDecision } from "../bank-transaction-matcher-service"
import type { TenantPrefixSnapshot } from "../number-sequence-service"

const TENANT_ID = "a0000000-0000-4000-a000-000000000200"

const DEFAULT_SNAPSHOT: TenantPrefixSnapshot = {
  invoicePrefix: "RE-",
  inboundInvoicePrefix: "ER-",
  creditNotePrefix: "G-",
}

function makeBankTx(overrides: Partial<BankTransaction> = {}): BankTransaction {
  return {
    id: "tx-d01",
    tenantId: TENANT_ID,
    statementId: "stmt-d01",
    bookingDate: new Date("2026-04-15"),
    valueDate: new Date("2026-04-15"),
    amount: 500,
    currency: "EUR",
    direction: "DEBIT",
    counterpartyIban: "DE02120300000000202051",
    counterpartyName: "Lieferant AG",
    counterpartyBic: null,
    remittanceInfo: null,
    endToEndId: null,
    mandateId: null,
    bankReference: "REF-D01",
    bankTxCode: null,
    status: "unmatched",
    suggestedAddressId: null,
    ignoredAt: null,
    ignoredById: null,
    ignoredReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as BankTransaction
}

function makeInboundInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: "inv-001",
    number: "ER-7",
    invoiceNumber: "LF-2026-042",
    totalGross: { toNumber: () => 500 } as unknown,
    sellerIban: "DE02120300000000202051",
    supplierId: "addr-sup-001",
    dueDate: new Date("2026-04-14"),
    paidAmount: 0,
    ...overrides,
  }
}

function makeMockTx(openInvoices: ReturnType<typeof makeInboundInvoice>[] = [], paymentRunItem: unknown = null) {
  return {
    paymentRunItem: {
      findFirst: vi.fn().mockResolvedValue(paymentRunItem),
    },
    inboundInvoice: {
      findMany: vi.fn().mockResolvedValue(openInvoices),
    },
  } as never
}

describe("computeDebitMatchDecision", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("1. matches on supplier invoiceNumber in remittance info", async () => {
    const inv = makeInboundInvoice()
    const tx = makeMockTx([inv])

    const decision = await computeDebitMatchDecision(
      tx, TENANT_ID,
      makeBankTx({ remittanceInfo: "Zahlung LF-2026-042" }),
      DEFAULT_SNAPSHOT,
    )

    expect(decision.result).toBe("matched")
    expect(decision.allocation?.inboundInvoiceId).toBe("inv-001")
    expect(decision.allocation?.amount).toBe(500)
    expect(decision.suggestedAddressId).toBe("addr-sup-001")
  })

  it("2. matches on Terp-internal number (ER-7) in remittance info", async () => {
    const inv = makeInboundInvoice({ invoiceNumber: null })
    const tx = makeMockTx([inv])

    const decision = await computeDebitMatchDecision(
      tx, TENANT_ID,
      makeBankTx({ remittanceInfo: "Bezahlung ER-7" }),
      DEFAULT_SNAPSHOT,
    )

    expect(decision.result).toBe("matched")
    expect(decision.allocation?.inboundInvoiceId).toBe("inv-001")
  })

  it("3. invoiceNumber has priority over Terp number when both match different invoices", async () => {
    const invBySupplierNr = makeInboundInvoice({
      id: "inv-a",
      number: "ER-10",
      invoiceNumber: "LF-99",
      supplierId: "addr-a",
    })
    const invByTerpNr = makeInboundInvoice({
      id: "inv-b",
      number: "ER-7",
      invoiceNumber: "LF-OTHER",
      supplierId: "addr-b",
    })
    const tx = makeMockTx([invBySupplierNr, invByTerpNr])

    const decision = await computeDebitMatchDecision(
      tx, TENANT_ID,
      makeBankTx({ remittanceInfo: "LF-99 ER-7 Zahlung" }),
      DEFAULT_SNAPSHOT,
    )

    expect(decision.result).toBe("matched")
    expect(decision.allocation?.inboundInvoiceId).toBe("inv-a")
  })

  it("4. IBAN fallback matches via sellerIban when no remittance reference", async () => {
    const inv = makeInboundInvoice({ invoiceNumber: null })
    const tx = makeMockTx([inv])

    const decision = await computeDebitMatchDecision(
      tx, TENANT_ID,
      makeBankTx({ remittanceInfo: null, counterpartyIban: "DE02120300000000202051" }),
      DEFAULT_SNAPSHOT,
    )

    expect(decision.result).toBe("matched")
    expect(decision.allocation?.inboundInvoiceId).toBe("inv-001")
  })

  it("5. endToEndId matches PAID invoice → consistency_confirmed, no payment", async () => {
    const paymentRunItem = {
      id: "pri-001",
      tenantId: TENANT_ID,
      endToEndId: "E2E-PAY-001",
      inboundInvoice: {
        id: "inv-paid",
        invoiceNumber: "LF-PAID",
        number: "ER-99",
        totalGross: { toNumber: () => 500 },
        paymentStatus: "PAID",
        supplierId: "addr-sup-001",
        dueDate: new Date("2026-04-14"),
      },
    }
    const tx = makeMockTx([], paymentRunItem)

    const decision = await computeDebitMatchDecision(
      tx, TENANT_ID,
      makeBankTx({ endToEndId: "E2E-PAY-001" }),
      DEFAULT_SNAPSHOT,
    )

    expect(decision.result).toBe("consistency_confirmed")
    expect(decision.consistencyMatch?.inboundInvoiceId).toBe("inv-paid")
    expect(decision.consistencyMatch?.paymentRunItemId).toBe("pri-001")
    expect(decision.allocation).toBeUndefined()
  })

  it("6. endToEndId matches UNPAID invoice → normal matched", async () => {
    const inv = makeInboundInvoice({ id: "inv-unpaid" })
    const paymentRunItem = {
      id: "pri-002",
      tenantId: TENANT_ID,
      endToEndId: "E2E-PAY-002",
      inboundInvoice: {
        id: "inv-unpaid",
        invoiceNumber: "LF-2026-042",
        number: "ER-7",
        totalGross: { toNumber: () => 500 },
        paymentStatus: "UNPAID",
        supplierId: "addr-sup-001",
        dueDate: new Date("2026-04-14"),
      },
    }
    const tx = makeMockTx([inv], paymentRunItem)

    const decision = await computeDebitMatchDecision(
      tx, TENANT_ID,
      makeBankTx({ endToEndId: "E2E-PAY-002" }),
      DEFAULT_SNAPSHOT,
    )

    expect(decision.result).toBe("matched")
    expect(decision.allocation?.inboundInvoiceId).toBe("inv-unpaid")
  })

  it("7. date tolerance: valueDate is dueDate + 2 days → matched", async () => {
    const inv = makeInboundInvoice({ dueDate: new Date("2026-04-13") })
    const tx = makeMockTx([inv])

    const decision = await computeDebitMatchDecision(
      tx, TENANT_ID,
      makeBankTx({
        valueDate: new Date("2026-04-15"),
        remittanceInfo: "LF-2026-042",
      }),
      DEFAULT_SNAPSHOT,
    )

    expect(decision.result).toBe("matched")
  })

  it("8. date tolerance exceeded: valueDate is dueDate + 5 days → unmatched with suggestedAddressId", async () => {
    const inv = makeInboundInvoice({ dueDate: new Date("2026-04-10") })
    const tx = makeMockTx([inv])

    const decision = await computeDebitMatchDecision(
      tx, TENANT_ID,
      makeBankTx({
        valueDate: new Date("2026-04-15"),
        remittanceInfo: "LF-2026-042",
      }),
      DEFAULT_SNAPSHOT,
    )

    expect(decision.result).toBe("unmatched")
    expect(decision.reason).toBe("no_amount_date_match")
    expect(decision.suggestedAddressId).toBe("addr-sup-001")
  })

  it("9. foreign currency USD → unmatched", async () => {
    const tx = makeMockTx()

    const decision = await computeDebitMatchDecision(
      tx, TENANT_ID,
      makeBankTx({ currency: "USD" }),
      DEFAULT_SNAPSHOT,
    )

    expect(decision.result).toBe("unmatched")
    expect(decision.reason).toBe("foreign_currency")
  })
})
