/**
 * Smoke tests for the WorkReport PDF component. Renders the React PDF
 * tree for real (no mocking of `@react-pdf/renderer`) and asserts the
 * resulting buffer is a valid-looking PDF across all three statuses
 * (DRAFT / SIGNED / VOID) and across sparse-data edge cases (no
 * serviceObject, no assignments, no description).
 *
 * Plan: 2026-04-22-workreport-arbeitsschein-m1.md (Phase 5)
 */
import { describe, it, expect } from "vitest"
import { renderToBuffer } from "@react-pdf/renderer"
import { WorkReportPdf, type WorkReportPdfProps } from "../work-report-pdf"

/**
 * Tiny 1×1 PNG so the signed-variant renders don't blow up on a missing
 * signature image. The bytes below decode as a fully-valid transparent
 * 1×1 PNG.
 */
const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFhAJ/wlseKgAAAABJRU5ErkJggg=="

function buildDraftProps(): WorkReportPdfProps {
  return {
    report: {
      code: "AS-1",
      visitDate: new Date("2026-04-22"),
      travelMinutes: 45,
      workDescription:
        "Filter gewechselt, Dichtung erneuert, Drucktest bestanden.",
      status: "DRAFT",
      signedAt: null,
      signerName: null,
      signerRole: null,
      signerIpHash: null,
      voidedAt: null,
      voidReason: null,
    },
    order: {
      code: "A-2026-001",
      name: "Wartung Kälteanlage Q2",
      customer: "Muster Kälte GmbH",
    },
    serviceObject: {
      number: "SO-42",
      name: "Kältemaschine Halle 3",
      kind: "EQUIPMENT",
    },
    assignments: [
      {
        firstName: "Max",
        lastName: "Müller",
        personnelNumber: "P-001",
        role: "Werkmeister",
      },
      {
        firstName: "Anna",
        lastName: "Schmidt",
        personnelNumber: "P-002",
        role: "Azubi",
      },
    ],
    signatureDataUrl: null,
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

describe("WorkReportPdf smoke test", () => {
  it("renders a valid DRAFT PDF with all fields populated", async () => {
    const props = buildDraftProps()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(WorkReportPdf(props) as any)
    expect(buffer).toBeInstanceOf(Buffer)
    expect(buffer.length).toBeGreaterThan(1000)
    expect(buffer.slice(0, 5).toString("ascii")).toBe("%PDF-")
  })

  it("renders a valid DRAFT PDF with minimal props (no serviceObject, no assignments, no description)", async () => {
    const props = buildDraftProps()
    props.serviceObject = null
    props.assignments = []
    props.report.workDescription = null
    props.report.travelMinutes = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(WorkReportPdf(props) as any)
    expect(buffer.slice(0, 5).toString("ascii")).toBe("%PDF-")
    expect(buffer.length).toBeGreaterThan(500)
  })

  it("renders a valid SIGNED PDF with signature image", async () => {
    const props = buildDraftProps()
    props.report.status = "SIGNED"
    props.report.signedAt = new Date("2026-04-22T14:30:00Z")
    props.report.signerName = "Thomas Kunde"
    props.report.signerRole = "Hausmeister"
    props.report.signerIpHash = "a1b2c3d4e5f6g7h8"
    props.signatureDataUrl = TINY_PNG_DATA_URL
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(WorkReportPdf(props) as any)
    expect(buffer.slice(0, 5).toString("ascii")).toBe("%PDF-")
    expect(buffer.length).toBeGreaterThan(1000)
  })

  it("renders a valid SIGNED PDF when signature upload is missing (falls back to empty signature block)", async () => {
    const props = buildDraftProps()
    props.report.status = "SIGNED"
    props.report.signedAt = new Date("2026-04-22T14:30:00Z")
    props.report.signerName = "Thomas Kunde"
    props.report.signerRole = "Hausmeister"
    props.signatureDataUrl = null // e.g. storage blob missing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(WorkReportPdf(props) as any)
    expect(buffer.slice(0, 5).toString("ascii")).toBe("%PDF-")
  })

  it("renders a valid VOID PDF with overlay and reason block", async () => {
    const props = buildDraftProps()
    props.report.status = "VOID"
    props.report.signedAt = new Date("2026-04-22T14:30:00Z")
    props.report.signerName = "Thomas Kunde"
    props.report.signerRole = "Hausmeister"
    props.report.voidedAt = new Date("2026-04-23T09:15:00Z")
    props.report.voidReason = "Falsche Leistung erfasst — neu erstellt als AS-2"
    props.signatureDataUrl = TINY_PNG_DATA_URL
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(WorkReportPdf(props) as any)
    expect(buffer.slice(0, 5).toString("ascii")).toBe("%PDF-")
    expect(buffer.length).toBeGreaterThan(1000)
  })

  it("renders without tenantConfig (no branding / footer)", async () => {
    const props = buildDraftProps()
    props.tenantConfig = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(WorkReportPdf(props) as any)
    expect(buffer.slice(0, 5).toString("ascii")).toBe("%PDF-")
  })

  it("renders without order block (degenerate but non-crashing)", async () => {
    const props = buildDraftProps()
    props.order = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(WorkReportPdf(props) as any)
    expect(buffer.slice(0, 5).toString("ascii")).toBe("%PDF-")
  })

  it("renders with assignments that have null personnelNumber and null role", async () => {
    const props = buildDraftProps()
    props.assignments = [
      {
        firstName: "Einzelner",
        lastName: "Mitarbeiter",
        personnelNumber: null,
        role: null,
      },
    ]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(WorkReportPdf(props) as any)
    expect(buffer.slice(0, 5).toString("ascii")).toBe("%PDF-")
  })
})
