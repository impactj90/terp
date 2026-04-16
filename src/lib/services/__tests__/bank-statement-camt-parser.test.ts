import { describe, it, expect } from "vitest"
import {
  parseCamt053,
  CamtValidationError,
} from "../bank-statement-camt-parser"

function wrapStmt(entries: string, opts?: { noId?: boolean }): string {
  const id = opts?.noId ? "" : "<Id>STMT-001</Id>"
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">
  <BkToCstmrStmt>
    <Stmt>
      ${id}
      <Acct>
        <Id><IBAN>DE89370400440532013000</IBAN></Id>
        <Ccy>EUR</Ccy>
      </Acct>
      <FrToDt>
        <FrDtTm>2026-04-01T00:00:00</FrDtTm>
        <ToDtTm>2026-04-30T23:59:59</ToDtTm>
      </FrToDt>
      <Bal>
        <Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="EUR">1000.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2026-04-01</Dt></Dt>
      </Bal>
      <Bal>
        <Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="EUR">1500.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2026-04-30</Dt></Dt>
      </Bal>
      ${entries}
    </Stmt>
  </BkToCstmrStmt>
</Document>`
}

const FIXTURE_CREDIT_SINGLE = wrapStmt(`
  <Ntry>
    <Amt Ccy="EUR">500.00</Amt>
    <CdtDbtInd>CRDT</CdtDbtInd>
    <Sts><Cd>BOOK</Cd></Sts>
    <BookgDt><Dt>2026-04-15</Dt></BookgDt>
    <ValDt><Dt>2026-04-15</Dt></ValDt>
    <AcctSvcrRef>REF-CREDIT-1</AcctSvcrRef>
    <BkTxCd>
      <Domn>
        <Cd>PMNT</Cd>
        <Fmly>
          <Cd>RCDT</Cd>
          <SubFmlyCd>ESCT</SubFmlyCd>
        </Fmly>
      </Domn>
    </BkTxCd>
    <NtryDtls>
      <TxDtls>
        <Refs><EndToEndId>E2E-CREDIT-1</EndToEndId></Refs>
        <Amt Ccy="EUR">500.00</Amt>
        <RltdPties>
          <Dbtr><Nm>Acme GmbH</Nm></Dbtr>
          <DbtrAcct><Id><IBAN>DE12500105170648489890</IBAN></Id></DbtrAcct>
        </RltdPties>
        <RltdAgts>
          <DbtrAgt><FinInstnId><BIC>COBADEFFXXX</BIC></FinInstnId></DbtrAgt>
        </RltdAgts>
        <RmtInf><Ustrd>Rechnung RE-2026-001</Ustrd></RmtInf>
      </TxDtls>
    </NtryDtls>
  </Ntry>
`)

const FIXTURE_DEBIT_SINGLE = wrapStmt(`
  <Ntry>
    <Amt Ccy="EUR">250.00</Amt>
    <CdtDbtInd>DBIT</CdtDbtInd>
    <Sts><Cd>BOOK</Cd></Sts>
    <BookgDt><Dt>2026-04-16</Dt></BookgDt>
    <ValDt><Dt>2026-04-16</Dt></ValDt>
    <AcctSvcrRef>REF-DEBIT-1</AcctSvcrRef>
    <BkTxCd>
      <Domn>
        <Cd>PMNT</Cd>
        <Fmly>
          <Cd>ICDT</Cd>
          <SubFmlyCd>ESCT</SubFmlyCd>
        </Fmly>
      </Domn>
    </BkTxCd>
    <NtryDtls>
      <TxDtls>
        <Refs><EndToEndId>E2E-DEBIT-1</EndToEndId></Refs>
        <Amt Ccy="EUR">250.00</Amt>
        <RltdPties>
          <Cdtr><Nm>Lieferant AG</Nm></Cdtr>
          <CdtrAcct><Id><IBAN>DE02120300000000202051</IBAN></Id></CdtrAcct>
        </RltdPties>
        <RmtInf><Ustrd>Eingangsrechnung ER-2026-042</Ustrd></RmtInf>
      </TxDtls>
    </NtryDtls>
  </Ntry>
`)

const FIXTURE_BATCH = wrapStmt(`
  <Ntry>
    <Amt Ccy="EUR">900.00</Amt>
    <CdtDbtInd>DBIT</CdtDbtInd>
    <Sts><Cd>BOOK</Cd></Sts>
    <BookgDt><Dt>2026-04-17</Dt></BookgDt>
    <ValDt><Dt>2026-04-17</Dt></ValDt>
    <AcctSvcrRef>REF-BATCH-1</AcctSvcrRef>
    <BkTxCd>
      <Domn>
        <Cd>PMNT</Cd>
        <Fmly>
          <Cd>ICDT</Cd>
          <SubFmlyCd>ESCT</SubFmlyCd>
        </Fmly>
      </Domn>
    </BkTxCd>
    <NtryDtls>
      <Btch><NbOfTxs>3</NbOfTxs></Btch>
      <TxDtls>
        <Refs><EndToEndId>BATCH-1</EndToEndId></Refs>
        <Amt Ccy="EUR">300.00</Amt>
        <RltdPties>
          <Cdtr><Nm>Lieferant A</Nm></Cdtr>
          <CdtrAcct><Id><IBAN>DE02120300000000111111</IBAN></Id></CdtrAcct>
        </RltdPties>
      </TxDtls>
      <TxDtls>
        <Refs><EndToEndId>BATCH-2</EndToEndId></Refs>
        <Amt Ccy="EUR">300.00</Amt>
        <RltdPties>
          <Cdtr><Nm>Lieferant B</Nm></Cdtr>
          <CdtrAcct><Id><IBAN>DE02120300000000222222</IBAN></Id></CdtrAcct>
        </RltdPties>
      </TxDtls>
      <TxDtls>
        <Refs><EndToEndId>BATCH-3</EndToEndId></Refs>
        <Amt Ccy="EUR">300.00</Amt>
        <RltdPties>
          <Cdtr><Nm>Lieferant C</Nm></Cdtr>
          <CdtrAcct><Id><IBAN>DE02120300000000333333</IBAN></Id></CdtrAcct>
        </RltdPties>
      </TxDtls>
    </NtryDtls>
  </Ntry>
`)

const FIXTURE_MULTILINE_REMITTANCE = wrapStmt(`
  <Ntry>
    <Amt Ccy="EUR">100.00</Amt>
    <CdtDbtInd>CRDT</CdtDbtInd>
    <Sts><Cd>BOOK</Cd></Sts>
    <BookgDt><Dt>2026-04-18</Dt></BookgDt>
    <ValDt><Dt>2026-04-18</Dt></ValDt>
    <NtryDtls>
      <TxDtls>
        <Amt Ccy="EUR">100.00</Amt>
        <RltdPties>
          <Dbtr><Nm>Kunde XY</Nm></Dbtr>
          <DbtrAcct><Id><IBAN>DE12500105170648489890</IBAN></Id></DbtrAcct>
        </RltdPties>
        <RmtInf>
          <Ustrd>line1</Ustrd>
          <Ustrd>line2</Ustrd>
          <Ustrd>line3</Ustrd>
        </RmtInf>
      </TxDtls>
    </NtryDtls>
  </Ntry>
`)

const FIXTURE_UNKNOWN_SCHEMA = `<?xml version="1.0" encoding="UTF-8"?>
<Nothing><Foo>bar</Foo></Nothing>`

const FIXTURE_MISSING_STMT_ID = wrapStmt(
  `
  <Ntry>
    <Amt Ccy="EUR">10.00</Amt>
    <CdtDbtInd>CRDT</CdtDbtInd>
    <Sts><Cd>BOOK</Cd></Sts>
    <BookgDt><Dt>2026-04-19</Dt></BookgDt>
    <ValDt><Dt>2026-04-19</Dt></ValDt>
  </Ntry>
`,
  { noId: true },
)

const FIXTURE_PENDING = wrapStmt(`
  <Ntry>
    <Amt Ccy="EUR">42.00</Amt>
    <CdtDbtInd>CRDT</CdtDbtInd>
    <Sts><Cd>PDNG</Cd></Sts>
    <BookgDt><Dt>2026-04-20</Dt></BookgDt>
    <ValDt><Dt>2026-04-20</Dt></ValDt>
    <NtryDtls>
      <TxDtls>
        <Amt Ccy="EUR">42.00</Amt>
        <RltdPties>
          <Dbtr><Nm>Pending Sender</Nm></Dbtr>
        </RltdPties>
      </TxDtls>
    </NtryDtls>
  </Ntry>
  <Ntry>
    <Amt Ccy="EUR">77.00</Amt>
    <CdtDbtInd>CRDT</CdtDbtInd>
    <Sts><Cd>BOOK</Cd></Sts>
    <BookgDt><Dt>2026-04-20</Dt></BookgDt>
    <ValDt><Dt>2026-04-20</Dt></ValDt>
    <NtryDtls>
      <TxDtls>
        <Amt Ccy="EUR">77.00</Amt>
        <RltdPties>
          <Dbtr><Nm>Booked Sender</Nm></Dbtr>
        </RltdPties>
      </TxDtls>
    </NtryDtls>
  </Ntry>
`)

describe("parseCamt053", () => {
  it("parses a simple CREDIT entry with TxDtls", () => {
    const stmt = parseCamt053(FIXTURE_CREDIT_SINGLE)

    expect(stmt.statementId).toBe("STMT-001")
    expect(stmt.accountIban).toBe("DE89370400440532013000")
    expect(stmt.currency).toBe("EUR")
    expect(stmt.openingBalance).toBe(1000)
    expect(stmt.closingBalance).toBe(1500)
    expect(stmt.transactions).toHaveLength(1)

    const tx = stmt.transactions[0]!
    expect(tx.direction).toBe("CREDIT")
    expect(tx.amount).toBe(500)
    expect(tx.currency).toBe("EUR")
    expect(tx.counterpartyIban).toBe("DE12500105170648489890")
    expect(tx.counterpartyName).toBe("Acme GmbH")
    expect(tx.counterpartyBic).toBe("COBADEFFXXX")
    expect(tx.remittanceInfo).toBe("Rechnung RE-2026-001")
    expect(tx.endToEndId).toBe("E2E-CREDIT-1")
    expect(tx.bankReference).toBe("REF-CREDIT-1")
    expect(tx.bankTxCode?.domain).toBe("PMNT")
    expect(tx.bankTxCode?.family).toBe("RCDT")
    expect(tx.bankTxCode?.subFamily).toBe("ESCT")
  })

  it("parses a simple DEBIT entry with TxDtls", () => {
    const stmt = parseCamt053(FIXTURE_DEBIT_SINGLE)

    expect(stmt.transactions).toHaveLength(1)
    const tx = stmt.transactions[0]!
    expect(tx.direction).toBe("DEBIT")
    expect(tx.amount).toBe(250)
    expect(tx.counterpartyIban).toBe("DE02120300000000202051")
    expect(tx.counterpartyName).toBe("Lieferant AG")
    expect(tx.remittanceInfo).toBe("Eingangsrechnung ER-2026-042")
    expect(tx.endToEndId).toBe("E2E-DEBIT-1")
  })

  it("expands a batch entry with 3 TxDtls into 3 transactions", () => {
    const stmt = parseCamt053(FIXTURE_BATCH)

    expect(stmt.transactions).toHaveLength(3)
    const ibans = stmt.transactions.map((t) => t.counterpartyIban)
    expect(ibans).toEqual([
      "DE02120300000000111111",
      "DE02120300000000222222",
      "DE02120300000000333333",
    ])
    const e2eIds = stmt.transactions.map((t) => t.endToEndId)
    expect(e2eIds).toEqual(["BATCH-1", "BATCH-2", "BATCH-3"])

    const bookingDates = stmt.transactions.map((t) =>
      t.bookingDate.toISOString().slice(0, 10),
    )
    expect(bookingDates).toEqual(["2026-04-17", "2026-04-17", "2026-04-17"])
    const bankRefs = stmt.transactions.map((t) => t.bankReference)
    expect(bankRefs).toEqual(["REF-BATCH-1", "REF-BATCH-1", "REF-BATCH-1"])
  })

  it("joins multi-line Ustrd remittance info with newlines", () => {
    const stmt = parseCamt053(FIXTURE_MULTILINE_REMITTANCE)
    expect(stmt.transactions).toHaveLength(1)
    expect(stmt.transactions[0]!.remittanceInfo).toBe("line1\nline2\nline3")
  })

  it("rejects files without a CAMT.053 <Document> root", () => {
    expect(() => parseCamt053(FIXTURE_UNKNOWN_SCHEMA)).toThrow(
      CamtValidationError,
    )
    expect(() => parseCamt053(FIXTURE_UNKNOWN_SCHEMA)).toThrow(
      /kein CAMT\.053/i,
    )
  })

  it("rejects a <Stmt> without an <Id>", () => {
    expect(() => parseCamt053(FIXTURE_MISSING_STMT_ID)).toThrow(
      CamtValidationError,
    )
    expect(() => parseCamt053(FIXTURE_MISSING_STMT_ID)).toThrow(
      /statement id missing/i,
    )
  })

  it("skips pending (PDNG) entries and keeps booked ones", () => {
    const stmt = parseCamt053(FIXTURE_PENDING)
    expect(stmt.transactions).toHaveLength(1)
    expect(stmt.transactions[0]!.amount).toBe(77)
    expect(stmt.transactions[0]!.counterpartyName).toBe("Booked Sender")
  })

  it("maps BkTxCd domain/family/subFamily", () => {
    const stmt = parseCamt053(FIXTURE_CREDIT_SINGLE)
    const tx = stmt.transactions[0]!
    expect(tx.bankTxCode).toEqual({
      domain: "PMNT",
      family: "RCDT",
      subFamily: "ESCT",
    })
  })
})
