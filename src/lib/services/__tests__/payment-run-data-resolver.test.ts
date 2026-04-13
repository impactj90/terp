/**
 * Unit tests for the payment-run data resolver.
 *
 * Covers the 8 IBAN / address combinations from D2 of the plan plus
 * the getPaymentStatus helper.
 */
import { describe, it, expect } from "vitest"
import {
  getPaymentStatus,
  resolveFromLoaded,
} from "../payment-run-data-resolver"

// Valid SEPA IBAN fixtures (both pass MOD-97)
const IBAN_A = "DE89370400440532013000"
const IBAN_A_SPACED = "DE89 3704 0044 0532 0130 00"
const IBAN_B = "DE44500105175407324931"
const IBAN_INVALID = "DE00000000000000000000"

type InvoiceArg = Parameters<typeof resolveFromLoaded>[0]

function baseInvoice(overrides: Partial<InvoiceArg> = {}): InvoiceArg {
  return {
    id: "00000000-0000-4000-a000-000000000001",
    status: "APPROVED",
    invoiceNumber: "R-2026-1",
    supplierId: "00000000-0000-4000-a000-000000000100",
    dueDate: new Date("2026-04-20"),
    totalGross: 119.0,
    sellerName: "Acme Ltd",
    sellerIban: null,
    sellerBic: null,
    sellerStreet: null,
    sellerZip: null,
    sellerCity: null,
    sellerCountry: null,
    supplier: {
      id: "00000000-0000-4000-a000-000000000100",
      company: "Acme Ltd",
      street: "Main 1",
      zip: "10115",
      city: "Berlin",
      country: "DE",
      bankAccounts: [],
    },
    ...overrides,
  }
}

describe("resolveFromLoaded — IBAN resolution matrix", () => {
  it("CRM only → GREEN, source=CRM", () => {
    const row = resolveFromLoaded(
      baseInvoice({
        supplier: {
          ...baseInvoice().supplier!,
          bankAccounts: [{ iban: IBAN_A, bic: "COBADEFFXXX" }],
        },
      })
    )
    expect(row.status).toBe("GREEN")
    expect(row.iban.source).toBe("CRM")
    expect(row.iban.iban).toBe(IBAN_A)
    expect(row.iban.bic).toBe("COBADEFFXXX")
    expect(row.iban.conflict).toBeNull()
  })

  it("Invoice only → GREEN, source=INVOICE", () => {
    const row = resolveFromLoaded(
      baseInvoice({ sellerIban: IBAN_A, sellerBic: "COBADEFFXXX" })
    )
    expect(row.status).toBe("GREEN")
    expect(row.iban.source).toBe("INVOICE")
    expect(row.iban.iban).toBe(IBAN_A)
  })

  it("Both equal → GREEN, source=CRM", () => {
    const row = resolveFromLoaded(
      baseInvoice({
        sellerIban: IBAN_A,
        supplier: {
          ...baseInvoice().supplier!,
          bankAccounts: [{ iban: IBAN_A, bic: null }],
        },
      })
    )
    expect(row.status).toBe("GREEN")
    expect(row.iban.source).toBe("CRM")
    expect(row.iban.conflict).toBeNull()
  })

  it("Both equal, one with spaces → normalized, GREEN", () => {
    const row = resolveFromLoaded(
      baseInvoice({
        sellerIban: IBAN_A,
        supplier: {
          ...baseInvoice().supplier!,
          bankAccounts: [{ iban: IBAN_A_SPACED, bic: null }],
        },
      })
    )
    expect(row.status).toBe("GREEN")
    expect(row.iban.iban).toBe(IBAN_A)
    expect(row.iban.conflict).toBeNull()
  })

  it("Both different → YELLOW, IBAN_CONFLICT blocker", () => {
    const row = resolveFromLoaded(
      baseInvoice({
        sellerIban: IBAN_B,
        supplier: {
          ...baseInvoice().supplier!,
          bankAccounts: [{ iban: IBAN_A, bic: null }],
        },
      })
    )
    expect(row.status).toBe("YELLOW")
    expect(row.blockers.some((b) => b.type === "IBAN_CONFLICT")).toBe(true)
    expect(row.iban.conflict).toMatchObject({
      crm: { iban: IBAN_A },
      invoice: { iban: IBAN_B },
    })
    expect(row.iban.iban).toBeNull()
  })

  it("Both different → resolved with choice CRM", () => {
    const row = resolveFromLoaded(
      baseInvoice({
        sellerIban: IBAN_B,
        supplier: {
          ...baseInvoice().supplier!,
          bankAccounts: [{ iban: IBAN_A, bic: null }],
        },
      }),
      { ibanSource: "CRM" }
    )
    expect(row.status).toBe("GREEN")
    expect(row.iban.iban).toBe(IBAN_A)
    expect(row.iban.source).toBe("CRM")
  })

  it("Both different → resolved with choice INVOICE", () => {
    const row = resolveFromLoaded(
      baseInvoice({
        sellerIban: IBAN_B,
        supplier: {
          ...baseInvoice().supplier!,
          bankAccounts: [{ iban: IBAN_A, bic: null }],
        },
      }),
      { ibanSource: "INVOICE" }
    )
    expect(row.status).toBe("GREEN")
    expect(row.iban.iban).toBe(IBAN_B)
    expect(row.iban.source).toBe("INVOICE")
  })

  it("Both absent → RED, NO_IBAN", () => {
    const row = resolveFromLoaded(baseInvoice())
    expect(row.status).toBe("RED")
    expect(row.blockers.some((b) => b.type === "NO_IBAN")).toBe(true)
  })

  it("Invalid MOD-97 → RED, IBAN_INVALID", () => {
    const row = resolveFromLoaded(
      baseInvoice({
        supplier: {
          ...baseInvoice().supplier!,
          bankAccounts: [{ iban: IBAN_INVALID, bic: null }],
        },
      })
    )
    expect(row.status).toBe("RED")
    expect(row.blockers.some((b) => b.type === "IBAN_INVALID")).toBe(true)
  })

  it("No supplier record, invoice-only IBAN and address → GREEN", () => {
    const row = resolveFromLoaded(
      baseInvoice({
        supplier: null,
        supplierId: null,
        sellerIban: IBAN_A,
        sellerCity: "Hamburg",
        sellerCountry: "DE",
        sellerStreet: "Hafen 1",
        sellerZip: "20457",
      })
    )
    expect(row.status).toBe("GREEN")
    expect(row.iban.source).toBe("INVOICE")
    expect(row.address.source).toBe("INVOICE")
    expect(row.address.city).toBe("Hamburg")
  })
})

describe("resolveFromLoaded — address resolution matrix", () => {
  const crmBank = [{ iban: IBAN_A, bic: null }]

  it("CRM address only → GREEN, source=CRM", () => {
    const row = resolveFromLoaded(
      baseInvoice({
        supplier: {
          ...baseInvoice().supplier!,
          bankAccounts: crmBank,
        },
      })
    )
    expect(row.status).toBe("GREEN")
    expect(row.address.source).toBe("CRM")
    expect(row.address.city).toBe("Berlin")
    expect(row.address.country).toBe("DE")
  })

  it("Invoice address only → GREEN, source=INVOICE", () => {
    const row = resolveFromLoaded(
      baseInvoice({
        sellerCity: "Leipzig",
        sellerCountry: "DE",
        supplier: {
          ...baseInvoice().supplier!,
          bankAccounts: crmBank,
          city: null,
          country: null,
        },
      })
    )
    expect(row.status).toBe("GREEN")
    expect(row.address.source).toBe("INVOICE")
    expect(row.address.city).toBe("Leipzig")
  })

  it("Both differ → YELLOW, ADDRESS_CONFLICT", () => {
    const row = resolveFromLoaded(
      baseInvoice({
        sellerCity: "Munich",
        sellerCountry: "DE",
        supplier: {
          ...baseInvoice().supplier!,
          bankAccounts: crmBank,
        },
      })
    )
    expect(row.status).toBe("YELLOW")
    expect(row.blockers.some((b) => b.type === "ADDRESS_CONFLICT")).toBe(true)
  })

  it("Both differ, resolved with CRM choice → GREEN", () => {
    const row = resolveFromLoaded(
      baseInvoice({
        sellerCity: "Munich",
        sellerCountry: "DE",
        supplier: {
          ...baseInvoice().supplier!,
          bankAccounts: crmBank,
        },
      }),
      { addressSource: "CRM" }
    )
    expect(row.status).toBe("GREEN")
    expect(row.address.city).toBe("Berlin")
  })

  it("Both absent → RED, NO_ADDRESS", () => {
    const row = resolveFromLoaded(
      baseInvoice({
        supplier: {
          ...baseInvoice().supplier!,
          bankAccounts: crmBank,
          city: null,
          country: null,
        },
      })
    )
    expect(row.status).toBe("RED")
    expect(row.blockers.some((b) => b.type === "NO_ADDRESS")).toBe(true)
  })

  it("Invoice country is 5-char → normalized to 2-char alpha-2", () => {
    const row = resolveFromLoaded(
      baseInvoice({
        sellerCity: "Paris",
        sellerCountry: "FR-FR", // ZUGFeRD can emit longer codes; we slice
        supplier: {
          ...baseInvoice().supplier!,
          bankAccounts: crmBank,
          city: null,
          country: null,
        },
      })
    )
    expect(row.status).toBe("GREEN")
    expect(row.address.country).toBe("FR")
  })
})

describe("resolveFromLoaded — invoice state gating", () => {
  const crmBank = [{ iban: IBAN_A, bic: null }]

  it("DRAFT invoice → RED, NOT_APPROVED", () => {
    const row = resolveFromLoaded(
      baseInvoice({
        status: "DRAFT",
        supplier: { ...baseInvoice().supplier!, bankAccounts: crmBank },
      })
    )
    expect(row.status).toBe("RED")
    expect(row.blockers.some((b) => b.type === "NOT_APPROVED")).toBe(true)
  })

  it("in-active-payment-run flag → RED, ALREADY_IN_ACTIVE_RUN", () => {
    const row = resolveFromLoaded(
      baseInvoice({
        supplier: { ...baseInvoice().supplier!, bankAccounts: crmBank },
      }),
      {},
      { inActivePaymentRun: true }
    )
    expect(row.status).toBe("RED")
    expect(row.blockers.some((b) => b.type === "ALREADY_IN_ACTIVE_RUN")).toBe(
      true
    )
  })
})

describe("getPaymentStatus", () => {
  it("returns UNPAID when no items", () => {
    expect(getPaymentStatus([])).toBe("UNPAID")
  })

  it("ignores CANCELLED runs", () => {
    expect(
      getPaymentStatus([{ paymentRun: { status: "CANCELLED" } }])
    ).toBe("UNPAID")
  })

  it("returns IN_PAYMENT_RUN for DRAFT or EXPORTED", () => {
    expect(
      getPaymentStatus([{ paymentRun: { status: "DRAFT" } }])
    ).toBe("IN_PAYMENT_RUN")
    expect(
      getPaymentStatus([{ paymentRun: { status: "EXPORTED" } }])
    ).toBe("IN_PAYMENT_RUN")
  })

  it("returns PAID when any non-cancelled run is BOOKED", () => {
    expect(
      getPaymentStatus([
        { paymentRun: { status: "EXPORTED" } },
        { paymentRun: { status: "BOOKED" } },
      ])
    ).toBe("PAID")
  })
})
