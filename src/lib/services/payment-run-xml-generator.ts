/**
 * Payment Run XML Generator — pain.001.001.09 (ISO 20022 Credit Transfer)
 *
 * Deterministic, dependency-light builder using fast-xml-parser's XMLBuilder
 * (already a project dependency via ZUGFeRD parsing). We emit exactly the
 * pain.001.001.09 elements required for a SEPA bulk credit transfer:
 *
 *   Document/CstmrCdtTrfInitn/
 *     GrpHdr/MsgId,CreDtTm,NbOfTxs,CtrlSum,InitgPty/Nm
 *     PmtInf/
 *       PmtInfId,PmtMtd=TRF,BtchBookg=true,NbOfTxs,CtrlSum
 *       PmtTpInf/SvcLvl/Cd=SEPA
 *       ReqdExctnDt/Dt=<executionDate>
 *       Dbtr/Nm,Dbtr/PstlAdr (optional)
 *       DbtrAcct/Id/IBAN
 *       DbtrAgt/FinInstnId/(BICFI or Othr/Id=NOTPROVIDED)
 *       ChrgBr=SLEV
 *       CdtTrfTxInf × N/
 *         PmtId/EndToEndId
 *         Amt/InstdAmt[@Ccy]
 *         CdtrAgt/FinInstnId/BICFI (if known)
 *         Cdtr/Nm + PstlAdr/TwnNm + Ctry  (STRUKTURIERTE ADRESSE, kein AdrLine)
 *         CdtrAcct/Id/IBAN
 *         RmtInf/Ustrd=<invoiceNumber>
 *
 * Plan: thoughts/shared/plans/2026-04-12-sepa-payment-runs.md Phase 1.8
 */
import { XMLBuilder } from "fast-xml-parser"
import { createHash } from "node:crypto"

const NAMESPACE_V09 = "urn:iso:std:iso:20022:tech:xsd:pain.001.001.09"

export interface XmlPaymentRunItem {
  id: string
  endToEndId: string
  effectiveCreditorName: string
  effectiveIban: string
  effectiveBic: string | null
  effectiveStreet: string | null
  effectiveZip: string | null
  effectiveCity: string
  effectiveCountry: string
  effectiveAmountCents: bigint
  effectiveCurrency: string
  effectiveRemittanceInfo: string
}

export interface XmlPaymentRun {
  id: string
  number: string
  executionDate: Date
  debtorName: string
  debtorIban: string
  debtorBic: string | null
  totalAmountCents: bigint
  itemCount: number
  items: XmlPaymentRunItem[]
}

export interface XmlGenerationInput {
  paymentRun: XmlPaymentRun
  msgId: string // <= 35 chars, typically `${run.number}`
  creationDateTime: Date
  initiatingPartyName: string
  debtorIban: string
  debtorBic: string | null
  debtorName: string
  debtorStreet?: string | null
  debtorZip?: string | null
  debtorCity?: string | null
  debtorCountry?: string | null
}

export interface XmlGenerationResult {
  xml: string
  checksum: string
}

// --- Helpers ---

function centsToAmount(cents: bigint): string {
  const negative = cents < 0n
  const abs = negative ? -cents : cents
  const whole = abs / 100n
  const frac = abs % 100n
  const fracStr = frac.toString().padStart(2, "0")
  return `${negative ? "-" : ""}${whole.toString()}.${fracStr}`
}

function formatDateIsoZ(d: Date): string {
  // ISO 8601 with seconds, no milliseconds, ending in Z. pain.001 accepts this.
  return d.toISOString().replace(/\.\d{3}Z$/, "Z")
}

function formatDateYmd(d: Date): string {
  const y = d.getUTCFullYear().toString().padStart(4, "0")
  const m = (d.getUTCMonth() + 1).toString().padStart(2, "0")
  const day = d.getUTCDate().toString().padStart(2, "0")
  return `${y}-${m}-${day}`
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value
  return value.slice(0, max)
}

function stripIbanWhitespace(iban: string): string {
  return iban.replace(/\s+/g, "").toUpperCase()
}

function buildDebtorAgent(bic: string | null): Record<string, unknown> {
  if (bic && bic.trim().length > 0) {
    return { FinInstnId: { BICFI: bic.trim().toUpperCase() } }
  }
  // pain.001.001.09 requires FinInstnId; NOTPROVIDED is the SEPA-wide fallback.
  return { FinInstnId: { Othr: { Id: "NOTPROVIDED" } } }
}

function buildPstlAdr(
  street: string | null | undefined,
  zip: string | null | undefined,
  city: string,
  country: string
): Record<string, unknown> {
  const adr: Record<string, unknown> = {}
  if (street && street.trim().length > 0) adr.StrtNm = truncate(street.trim(), 70)
  if (zip && zip.trim().length > 0) adr.PstCd = truncate(zip.trim(), 16)
  adr.TwnNm = truncate(city.trim(), 35)
  adr.Ctry = country.trim().toUpperCase().slice(0, 2)
  return adr
}

/**
 * Build a Credit Transfer Transaction Information block for one item.
 */
function buildTxInf(item: XmlPaymentRunItem): Record<string, unknown> {
  const tx: Record<string, unknown> = {
    PmtId: { EndToEndId: truncate(item.endToEndId, 35) },
    Amt: {
      InstdAmt: {
        "@_Ccy": item.effectiveCurrency,
        "#text": centsToAmount(item.effectiveAmountCents),
      },
    },
  }

  if (item.effectiveBic && item.effectiveBic.trim().length > 0) {
    tx.CdtrAgt = {
      FinInstnId: { BICFI: item.effectiveBic.trim().toUpperCase() },
    }
  }

  tx.Cdtr = {
    Nm: truncate(item.effectiveCreditorName, 70),
    PstlAdr: buildPstlAdr(
      item.effectiveStreet,
      item.effectiveZip,
      item.effectiveCity,
      item.effectiveCountry
    ),
  }

  tx.CdtrAcct = {
    Id: { IBAN: stripIbanWhitespace(item.effectiveIban) },
  }

  tx.RmtInf = {
    Ustrd: truncate(item.effectiveRemittanceInfo, 140),
  }

  return tx
}

/**
 * Generate a pain.001.001.09 SEPA Credit Transfer initiation XML
 * for the given payment run. Returns the XML text plus a SHA-256 checksum.
 */
export async function generatePain001V09(
  input: XmlGenerationInput
): Promise<XmlGenerationResult> {
  const run = input.paymentRun

  if (run.items.length === 0) {
    throw new Error("Cannot generate pain.001 for an empty payment run")
  }

  const ctrlSum = centsToAmount(run.totalAmountCents)
  const nbOfTxs = run.items.length.toString()

  const debtorHasPstlAdr =
    input.debtorCity && input.debtorCountry
      ? buildPstlAdr(
          input.debtorStreet ?? null,
          input.debtorZip ?? null,
          input.debtorCity,
          input.debtorCountry
        )
      : null

  const dbtr: Record<string, unknown> = {
    Nm: truncate(input.debtorName, 70),
  }
  if (debtorHasPstlAdr) dbtr.PstlAdr = debtorHasPstlAdr

  const pmtInf: Record<string, unknown> = {
    PmtInfId: truncate(run.number, 35),
    PmtMtd: "TRF",
    BtchBookg: "true",
    NbOfTxs: nbOfTxs,
    CtrlSum: ctrlSum,
    PmtTpInf: { SvcLvl: { Cd: "SEPA" } },
    ReqdExctnDt: { Dt: formatDateYmd(run.executionDate) },
    Dbtr: dbtr,
    DbtrAcct: { Id: { IBAN: stripIbanWhitespace(input.debtorIban) } },
    DbtrAgt: buildDebtorAgent(input.debtorBic),
    ChrgBr: "SLEV",
    CdtTrfTxInf: run.items.map(buildTxInf),
  }

  const doc: Record<string, unknown> = {
    "?xml": { "@_version": "1.0", "@_encoding": "UTF-8" },
    Document: {
      "@_xmlns": NAMESPACE_V09,
      "@_xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
      CstmrCdtTrfInitn: {
        GrpHdr: {
          MsgId: truncate(input.msgId, 35),
          CreDtTm: formatDateIsoZ(input.creationDateTime),
          NbOfTxs: nbOfTxs,
          CtrlSum: ctrlSum,
          InitgPty: { Nm: truncate(input.initiatingPartyName, 70) },
        },
        PmtInf: pmtInf,
      },
    },
  }

  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    format: true,
    suppressEmptyNode: false,
    suppressBooleanAttributes: false,
  })

  const xml = builder.build(doc) as string
  const checksum = createHash("sha256").update(xml, "utf-8").digest("hex")

  return { xml, checksum }
}
