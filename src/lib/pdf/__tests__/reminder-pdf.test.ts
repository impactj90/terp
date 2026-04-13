/**
 * Smoke test for the reminder PDF component. Renders the React PDF tree
 * for real (no mocking of `@react-pdf/renderer`) and asserts the resulting
 * buffer is a valid-looking PDF. Catches: broken JSX, missing props, font
 * errors — the kind of thing the service-level test file skips by mocking
 * out `renderToBuffer`.
 */
import { describe, it, expect } from "vitest"
import { renderToBuffer } from "@react-pdf/renderer"
import { ReminderPdf, type ReminderPdfProps } from "../reminder-pdf"

function buildProps(): ReminderPdfProps {
  return {
    reminder: {
      number: "MA-2026-001",
      level: 1,
      headerText:
        "Sehr geehrte Damen und Herren, folgende Rechnungen sind offen.",
      footerText: "Wir bitten um zeitnahen Ausgleich.",
      totalOpenAmount: 300.0,
      totalInterest: 2.22,
      totalFees: 0,
      totalDue: 302.22,
      createdAt: new Date("2026-04-13"),
    },
    items: [
      {
        invoiceNumber: "RE-001",
        invoiceDate: new Date("2026-03-01"),
        dueDate: new Date("2026-03-15"),
        openAmountAtReminder: 100,
        daysOverdue: 29,
        interestAmount: 0.74,
      },
      {
        invoiceNumber: "RE-002",
        invoiceDate: new Date("2026-02-15"),
        dueDate: new Date("2026-03-01"),
        openAmountAtReminder: 200,
        daysOverdue: 43,
        interestAmount: 1.48,
      },
    ],
    address: {
      company: "Acme GmbH",
      street: "Musterstraße 1",
      zip: "12345",
      city: "Musterstadt",
    },
    tenantConfig: {
      companyName: "Terp Test Tenant GmbH",
      companyAddress: "Teststraße 1\n12345 Teststadt",
      bankName: "Testbank",
      iban: "DE89370400440532013000",
      bic: "COBADEFFXXX",
      taxId: "DE123456789",
      commercialRegister: "HRB 12345",
      managingDirector: "Max Mustermann",
      phone: "+49 123 456789",
      email: "info@test.de",
    },
  }
}

describe("ReminderPdf smoke test", () => {
  it("renders a valid-looking PDF buffer", async () => {
    const props = buildProps()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(ReminderPdf(props) as any)
    expect(buffer).toBeInstanceOf(Buffer)
    expect(buffer.length).toBeGreaterThan(1000)
    const header = buffer.slice(0, 5).toString("ascii")
    expect(header).toBe("%PDF-")
  })

  it("renders without address block when address is null", async () => {
    const props = buildProps()
    props.address = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(ReminderPdf(props) as any)
    expect(buffer.slice(0, 5).toString("ascii")).toBe("%PDF-")
  })

  it("renders with level-3 label (Letzte Mahnung)", async () => {
    const props = buildProps()
    props.reminder.level = 3
    props.reminder.totalFees = 5
    props.reminder.totalDue = 307.22
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(ReminderPdf(props) as any)
    expect(buffer.length).toBeGreaterThan(1000)
    expect(buffer.slice(0, 5).toString("ascii")).toBe("%PDF-")
  })

  it("renders with zero items", async () => {
    const props = buildProps()
    props.items = []
    props.reminder.totalOpenAmount = 0
    props.reminder.totalDue = 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(ReminderPdf(props) as any)
    expect(buffer.slice(0, 5).toString("ascii")).toBe("%PDF-")
  })
})
