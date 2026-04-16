import { XMLParser } from "fast-xml-parser"

// --- Error classes ---

export class CamtParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CamtParseError"
  }
}

export class CamtValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CamtValidationError"
  }
}

// --- Types ---

export interface ParsedCamtTransaction {
  bookingDate: Date
  valueDate: Date
  amount: number
  currency: string
  direction: "CREDIT" | "DEBIT"
  counterpartyIban: string | null
  counterpartyName: string | null
  counterpartyBic: string | null
  remittanceInfo: string | null
  endToEndId: string | null
  mandateId: string | null
  bankReference: string | null
  bankTxCode: {
    domain: string | null
    family: string | null
    subFamily: string | null
  } | null
}

export interface ParsedCamtStatement {
  statementId: string
  accountIban: string
  currency: string
  periodFrom: Date
  periodTo: Date
  openingBalance: number
  closingBalance: number
  transactions: ParsedCamtTransaction[]
}

// --- Helpers ---

function str(val: unknown): string | null {
  if (val == null) return null
  if (typeof val === "object" && "#text" in (val as Record<string, unknown>)) {
    const text = (val as Record<string, unknown>)["#text"]
    return text == null ? null : String(text)
  }
  if (typeof val === "object") return null
  return String(val)
}

function num(val: unknown): number {
  if (val == null) return 0
  if (typeof val === "number") return val
  if (typeof val === "object") {
    const text = (val as Record<string, unknown>)["#text"]
    if (text != null) {
      const n = parseFloat(String(text))
      return isNaN(n) ? 0 : n
    }
    return 0
  }
  const n = parseFloat(String(val))
  return isNaN(n) ? 0 : n
}

function parseCamtDate(val: unknown): Date | null {
  const s = str(val)
  if (!s) return null
  const d = new Date(s)
  if (isNaN(d.getTime())) return null
  return d
}

function ensureArray<T>(val: T | T[] | undefined | null): T[] {
  if (val == null) return []
  return Array.isArray(val) ? val : [val]
}

// --- Parser ---

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  isArray: (name) =>
    name === "Stmt" ||
    name === "Ntry" ||
    name === "TxDtls" ||
    name === "Bal" ||
    name === "Ustrd",
})

export function parseCamt053(xml: string): ParsedCamtStatement {
  let raw
  try {
    raw = parser.parse(xml)
  } catch (err) {
    throw new CamtValidationError(
      `CAMT-XML konnte nicht geparst werden: ${(err as Error).message}`,
    )
  }

  const doc = raw?.Document
  if (!doc) {
    throw new CamtValidationError(
      "Kein <Document>-Root-Element. Datei ist kein CAMT.053.",
    )
  }
  const bkToCstmr = doc.BkToCstmrStmt
  if (!bkToCstmr) {
    throw new CamtValidationError(
      "Kein <BkToCstmrStmt>-Element. Datei ist kein CAMT.053.",
    )
  }

  const statements = ensureArray(bkToCstmr.Stmt)
  if (statements.length === 0) {
    throw new CamtValidationError("Keine <Stmt>-Elemente gefunden.")
  }
  if (statements.length > 1) {
    throw new CamtValidationError(
      `Multi-Statement-Files werden nicht unterstützt (${statements.length} <Stmt>). Bitte pro Statement einzeln importieren.`,
    )
  }

  const stmt = statements[0]
  const statementId = str(stmt?.Id)
  if (!statementId) {
    throw new CamtValidationError("statement id missing (<Stmt>/<Id>)")
  }

  const accountIban = str(stmt?.Acct?.Id?.IBAN)
  if (!accountIban) {
    throw new CamtValidationError(
      "account IBAN missing (<Stmt>/<Acct>/<Id>/<IBAN>)",
    )
  }

  const currency = str(stmt?.Acct?.Ccy) ?? "EUR"

  const periodFrom = parseCamtDate(stmt?.FrToDt?.FrDtTm)
  const periodTo = parseCamtDate(stmt?.FrToDt?.ToDtTm)
  if (!periodFrom || !periodTo) {
    throw new CamtValidationError("statement period missing (<FrToDt>)")
  }

  const balances = ensureArray(stmt?.Bal)
  const opening = balances.find(
    (b) => str(b?.Tp?.CdOrPrtry?.Cd) === "OPBD",
  )
  const closing = balances.find(
    (b) => str(b?.Tp?.CdOrPrtry?.Cd) === "CLBD",
  )
  const openingBalance = opening ? num(opening?.Amt) : 0
  const closingBalance = closing ? num(closing?.Amt) : 0

  const transactions: ParsedCamtTransaction[] = []
  for (const ntry of ensureArray(stmt?.Ntry)) {
    if (str(ntry?.Sts?.Cd) === "PDNG" || str(ntry?.Sts) === "PDNG") continue

    const entryDirection: "CREDIT" | "DEBIT" =
      str(ntry?.CdtDbtInd) === "CRDT" ? "CREDIT" : "DEBIT"
    const entryBookingDate = parseCamtDate(
      ntry?.BookgDt?.Dt ?? ntry?.BookgDt?.DtTm,
    )
    const entryValueDate = parseCamtDate(
      ntry?.ValDt?.Dt ?? ntry?.ValDt?.DtTm,
    )
    if (!entryBookingDate || !entryValueDate) {
      throw new CamtValidationError("booking or value date missing on entry")
    }

    const entryAmt = num(ntry?.Amt)
    const entryCurrency = str(ntry?.Amt?.["@_Ccy"]) ?? currency
    const entryBankRef = str(ntry?.AcctSvcrRef)
    const bankTxCode = {
      domain: str(ntry?.BkTxCd?.Domn?.Cd),
      family: str(ntry?.BkTxCd?.Domn?.Fmly?.Cd),
      subFamily: str(ntry?.BkTxCd?.Domn?.Fmly?.SubFmlyCd),
    }

    const ntryDtls = ntry?.NtryDtls
    const txDtlsList = ensureArray(ntryDtls?.TxDtls)
    if (txDtlsList.length === 0) {
      transactions.push({
        bookingDate: entryBookingDate,
        valueDate: entryValueDate,
        amount: entryAmt,
        currency: entryCurrency,
        direction: entryDirection,
        counterpartyIban: null,
        counterpartyName: null,
        counterpartyBic: null,
        remittanceInfo: null,
        endToEndId: null,
        mandateId: null,
        bankReference: entryBankRef,
        bankTxCode,
      })
      continue
    }

    for (const tx of txDtlsList) {
      const counterpartyIban =
        entryDirection === "CREDIT"
          ? str(tx?.RltdPties?.DbtrAcct?.Id?.IBAN)
          : str(tx?.RltdPties?.CdtrAcct?.Id?.IBAN)
      const counterpartyName =
        entryDirection === "CREDIT"
          ? str(tx?.RltdPties?.Dbtr?.Nm) ??
            str(tx?.RltdPties?.Dbtr?.Pty?.Nm)
          : str(tx?.RltdPties?.Cdtr?.Nm) ??
            str(tx?.RltdPties?.Cdtr?.Pty?.Nm)
      const counterpartyBic =
        entryDirection === "CREDIT"
          ? str(tx?.RltdAgts?.DbtrAgt?.FinInstnId?.BIC) ??
            str(tx?.RltdAgts?.DbtrAgt?.FinInstnId?.BICFI)
          : str(tx?.RltdAgts?.CdtrAgt?.FinInstnId?.BIC) ??
            str(tx?.RltdAgts?.CdtrAgt?.FinInstnId?.BICFI)

      const ustrdList = ensureArray(tx?.RmtInf?.Ustrd)
        .map(str)
        .filter((v): v is string => Boolean(v))
      const remittanceInfo = ustrdList.length > 0 ? ustrdList.join("\n") : null
      const endToEndId = str(tx?.Refs?.EndToEndId)
      const mandateId = str(tx?.Refs?.MndtId)
      const txAmt = num(tx?.Amt)
      const txCurrency = str(tx?.Amt?.["@_Ccy"]) ?? entryCurrency

      transactions.push({
        bookingDate: entryBookingDate,
        valueDate: entryValueDate,
        amount: txAmt > 0 ? txAmt : entryAmt,
        currency: txCurrency,
        direction: entryDirection,
        counterpartyIban,
        counterpartyName,
        counterpartyBic,
        remittanceInfo,
        endToEndId,
        mandateId,
        bankReference: entryBankRef,
        bankTxCode,
      })
    }
  }

  return {
    statementId,
    accountIban,
    currency,
    periodFrom,
    periodTo,
    openingBalance,
    closingBalance,
    transactions,
  }
}
