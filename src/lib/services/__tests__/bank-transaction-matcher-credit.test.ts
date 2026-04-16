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

vi.mock("../audit-logs-service", () => ({
  log: vi.fn().mockResolvedValue(undefined),
}))

import * as crmAddressRepo from "../crm-address-repository"
import * as billingPaymentRepo from "../billing-payment-repository"
import { enrichOpenItem } from "../billing-payment-service"
import { hasPlatformSubscriptionMarker } from "@/lib/platform/subscription-service"
import { getApplicableDiscount } from "@/lib/billing/payment-discount"
import { computeCreditMatchDecision } from "../bank-transaction-matcher-service"
import type { TenantPrefixSnapshot } from "../number-sequence-service"

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"

const DEFAULT_SNAPSHOT: TenantPrefixSnapshot = {
  invoicePrefix: "RE-",
  inboundInvoicePrefix: "ER-",
  creditNotePrefix: "G-",
}

function makeBankTx(overrides: Partial<BankTransaction> = {}): BankTransaction {
  return {
    id: "tx-001",
    tenantId: TENANT_ID,
    statementId: "stmt-001",
    bookingDate: new Date("2026-04-15"),
    valueDate: new Date("2026-04-15"),
    amount: 500,
    currency: "EUR",
    direction: "CREDIT",
    counterpartyIban: "DE12500105170648489890",
    counterpartyName: "Kunde GmbH",
    counterpartyBic: null,
    remittanceInfo: null,
    endToEndId: null,
    mandateId: null,
    bankReference: "REF-001",
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

function makeOpenItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "doc-001",
    number: "RE-1",
    type: "INVOICE",
    status: "PRINTED",
    totalGross: 500,
    documentDate: new Date("2026-04-01"),
    paymentTermDays: 30,
    discountPercent: null,
    discountDays: null,
    discountPercent2: null,
    discountDays2: null,
    internalNotes: null,
    payments: [],
    childDocuments: [],
    address: { id: "addr-001", company: "Kunde GmbH" },
    ...overrides,
  }
}

const mockTx = {} as never

beforeEach(() => {
  vi.mocked(crmAddressRepo.findAddressByIban).mockReset()
  vi.mocked(billingPaymentRepo.findOpenItems).mockReset()
  vi.mocked(enrichOpenItem).mockReset()
  vi.mocked(hasPlatformSubscriptionMarker).mockReset()
  vi.mocked(getApplicableDiscount).mockReset()

  vi.mocked(hasPlatformSubscriptionMarker).mockReturnValue(false)
  vi.mocked(getApplicableDiscount).mockReturnValue(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(enrichOpenItem).mockImplementation((doc: any) => ({
    paidAmount: 0,
    openAmount: doc.totalGross as number,
    effectiveTotalGross: doc.totalGross as number,
    creditNoteReduction: 0,
    paymentStatus: "UNPAID" as const,
    dueDate: null,
    isOverdue: false,
  }))
})

describe("computeCreditMatchDecision", () => {
  it("1. matches when IBAN→address→one open invoice with exact amount", async () => {
    vi.mocked(crmAddressRepo.findAddressByIban).mockResolvedValue({
      addressId: "addr-001",
      bankAccountId: "ba-001",
    })
    vi.mocked(billingPaymentRepo.findOpenItems).mockResolvedValue({
      items: [makeOpenItem()] as never,
      total: 1,
    })

    const decision = await computeCreditMatchDecision(
      mockTx, TENANT_ID, makeBankTx(), DEFAULT_SNAPSHOT,
    )

    expect(decision.result).toBe("matched")
    expect(decision.allocation?.billingDocumentId).toBe("doc-001")
    expect(decision.allocation?.amount).toBe(500)
    expect(decision.suggestedAddressId).toBe("addr-001")
  })

  it("2. returns ambiguous when two invoices have the same amount and no remittance hint", async () => {
    vi.mocked(crmAddressRepo.findAddressByIban).mockResolvedValue({
      addressId: "addr-001",
      bankAccountId: "ba-001",
    })
    vi.mocked(billingPaymentRepo.findOpenItems).mockResolvedValue({
      items: [
        makeOpenItem({ id: "doc-001", number: "RE-1" }),
        makeOpenItem({ id: "doc-002", number: "RE-2" }),
      ] as never,
      total: 2,
    })

    const decision = await computeCreditMatchDecision(
      mockTx, TENANT_ID, makeBankTx(), DEFAULT_SNAPSHOT,
    )

    expect(decision.result).toBe("unmatched")
    expect(decision.reason).toBe("ambiguous")
    expect(decision.suggestedAddressId).toBe("addr-001")
  })

  it("3. returns iban_unknown when IBAN is not in CRM", async () => {
    vi.mocked(crmAddressRepo.findAddressByIban).mockResolvedValue(null)

    const decision = await computeCreditMatchDecision(
      mockTx, TENANT_ID, makeBankTx(), DEFAULT_SNAPSHOT,
    )

    expect(decision.result).toBe("unmatched")
    expect(decision.reason).toBe("iban_unknown")
    expect(decision.suggestedAddressId).toBeUndefined()
  })

  it("4. matches with skonto tier 1 when amount equals discounted total", async () => {
    vi.mocked(crmAddressRepo.findAddressByIban).mockResolvedValue({
      addressId: "addr-001",
      bankAccountId: "ba-001",
    })
    const doc = makeOpenItem({
      totalGross: 1000,
      discountPercent: 2,
      discountDays: 14,
    })
    vi.mocked(billingPaymentRepo.findOpenItems).mockResolvedValue({
      items: [doc] as never,
      total: 1,
    })
    vi.mocked(enrichOpenItem).mockReturnValue({
      paidAmount: 0,
      openAmount: 1000,
      effectiveTotalGross: 1000,
      creditNoteReduction: 0,
      paymentStatus: "UNPAID",
      dueDate: null,
      isOverdue: false,
    })
    vi.mocked(getApplicableDiscount).mockReturnValue({ percent: 2, tier: 1 })

    const decision = await computeCreditMatchDecision(
      mockTx,
      TENANT_ID,
      makeBankTx({ amount: 980 }),
      DEFAULT_SNAPSHOT,
    )

    expect(decision.result).toBe("matched")
    expect(decision.allocation?.discount).toEqual({ percent: 2, tier: 1 })
    expect(decision.allocation?.amount).toBe(980)
  })

  it("5. returns remittance_conflict when reference mentions a different invoice", async () => {
    vi.mocked(crmAddressRepo.findAddressByIban).mockResolvedValue({
      addressId: "addr-001",
      bankAccountId: "ba-001",
    })
    vi.mocked(billingPaymentRepo.findOpenItems).mockResolvedValue({
      items: [makeOpenItem({ id: "doc-043", number: "RE-43" })] as never,
      total: 1,
    })

    const decision = await computeCreditMatchDecision(
      mockTx,
      TENANT_ID,
      makeBankTx({ remittanceInfo: "Zahlung fuer RE-42" }),
      DEFAULT_SNAPSHOT,
    )

    expect(decision.result).toBe("unmatched")
    expect(decision.reason).toBe("remittance_conflict")
    expect(decision.suggestedAddressId).toBe("addr-001")
  })

  it("6. filters out platform-subscription invoices", async () => {
    vi.mocked(crmAddressRepo.findAddressByIban).mockResolvedValue({
      addressId: "addr-001",
      bankAccountId: "ba-001",
    })
    vi.mocked(billingPaymentRepo.findOpenItems).mockResolvedValue({
      items: [
        makeOpenItem({ internalNotes: "[platform_subscription:xyz]" }),
      ] as never,
      total: 1,
    })
    vi.mocked(hasPlatformSubscriptionMarker).mockReturnValue(true)

    const decision = await computeCreditMatchDecision(
      mockTx, TENANT_ID, makeBankTx(), DEFAULT_SNAPSHOT,
    )

    expect(decision.result).toBe("unmatched")
    expect(decision.reason).toBe("no_open_items")
    expect(decision.suggestedAddressId).toBe("addr-001")
  })

  it("7. recognizes custom prefix from tenant config", async () => {
    vi.mocked(crmAddressRepo.findAddressByIban).mockResolvedValue({
      addressId: "addr-001",
      bankAccountId: "ba-001",
    })
    const doc = makeOpenItem({ id: "doc-042", number: "RG-42" })
    vi.mocked(billingPaymentRepo.findOpenItems).mockResolvedValue({
      items: [
        doc,
        makeOpenItem({ id: "doc-043", number: "RG-43" }),
      ] as never,
      total: 2,
    })

    const customSnapshot: TenantPrefixSnapshot = {
      invoicePrefix: "RG-",
      inboundInvoicePrefix: "ER-",
      creditNotePrefix: "GS-",
    }

    const decision = await computeCreditMatchDecision(
      mockTx,
      TENANT_ID,
      makeBankTx({ remittanceInfo: "RG-42 abzgl. Skonto" }),
      customSnapshot,
    )

    expect(decision.result).toBe("matched")
    expect(decision.allocation?.billingDocumentId).toBe("doc-042")
  })

  it("8. returns foreign_currency for non-EUR transactions", async () => {
    const decision = await computeCreditMatchDecision(
      mockTx,
      TENANT_ID,
      makeBankTx({ currency: "USD" }),
      DEFAULT_SNAPSHOT,
    )

    expect(decision.result).toBe("unmatched")
    expect(decision.reason).toBe("foreign_currency")
  })
})
