import type { PrismaClient } from "@/generated/prisma/client"

export interface BankTestContext {
  addressWithIban: { addressId: string; iban: string }
  supplierAddress: { addressId: string; iban: string }
  numberSequenceInvoicePrefix: string
  numberSequenceInboundPrefix: string
}

/**
 * Seeds a tenant with a CRM address (SUPPLIER + CUSTOMER), a default
 * `CrmBankAccount`, and `invoice` / `inbound_invoice` number sequences.
 *
 * Phase 4 uses only the address (for suggestedAddressId) and the
 * prefixes (for the parser-run snapshot). Phase 5/6 will extend this
 * helper with billing + inbound invoice seeding.
 */
export async function seedBankTestContext(
  prisma: PrismaClient,
  tenantId: string,
): Promise<BankTestContext> {
  const iban = "DE12500105170648489890"
  const address = await prisma.crmAddress.upsert({
    where: { id: "b0000000-0000-4000-b000-000000000001" },
    update: {},
    create: {
      id: "b0000000-0000-4000-b000-000000000001",
      tenantId,
      number: "BANK-TEST-001",
      company: "Bank-Test Kunde GmbH",
      type: "CUSTOMER",
      isActive: true,
    },
  })

  await prisma.crmBankAccount.upsert({
    where: {
      tenantId_iban: { tenantId, iban },
    },
    update: {},
    create: {
      tenantId,
      addressId: address.id,
      iban,
      isDefault: true,
    },
  })

  const supplierIban = "DE02120300000000202051"
  const supplierAddr = await prisma.crmAddress.upsert({
    where: { id: "b0000000-0000-4000-b000-000000000002" },
    update: {},
    create: {
      id: "b0000000-0000-4000-b000-000000000002",
      tenantId,
      number: "BANK-TEST-SUP-001",
      company: "Bank-Test Lieferant AG",
      type: "SUPPLIER",
      isActive: true,
    },
  })

  await prisma.crmBankAccount.upsert({
    where: {
      tenantId_iban: { tenantId, iban: supplierIban },
    },
    update: {},
    create: {
      tenantId,
      addressId: supplierAddr.id,
      iban: supplierIban,
      isDefault: true,
    },
  })

  await prisma.numberSequence.upsert({
    where: { tenantId_key: { tenantId, key: "invoice" } },
    update: {},
    create: { tenantId, key: "invoice", prefix: "RE-", nextValue: 1 },
  })
  await prisma.numberSequence.upsert({
    where: { tenantId_key: { tenantId, key: "inbound_invoice" } },
    update: {},
    create: { tenantId, key: "inbound_invoice", prefix: "ER-", nextValue: 1 },
  })

  return {
    addressWithIban: { addressId: address.id, iban },
    supplierAddress: { addressId: supplierAddr.id, iban: supplierIban },
    numberSequenceInvoicePrefix: "RE-",
    numberSequenceInboundPrefix: "ER-",
  }
}

type CamtScenario =
  | "credit-single"
  | "debit-single"
  | "batch"
  | "unknown-schema"

/**
 * Builds a canned CAMT.053 XML string for integration/router tests.
 * Keeps inline fixtures reusable across phases.
 */
export function buildCamtXml(scenario: CamtScenario): string {
  if (scenario === "unknown-schema") {
    return `<?xml version="1.0" encoding="UTF-8"?>
<NotACamt><Foo>bar</Foo></NotACamt>`
  }

  const wrap = (
    entries: string,
    statementId = "STMT-TEST-1",
  ) => `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">
  <BkToCstmrStmt>
    <Stmt>
      <Id>${statementId}</Id>
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

  if (scenario === "credit-single") {
    return wrap(`
  <Ntry>
    <Amt Ccy="EUR">500.00</Amt>
    <CdtDbtInd>CRDT</CdtDbtInd>
    <Sts><Cd>BOOK</Cd></Sts>
    <BookgDt><Dt>2026-04-15</Dt></BookgDt>
    <ValDt><Dt>2026-04-15</Dt></ValDt>
    <AcctSvcrRef>REF-CREDIT-1</AcctSvcrRef>
    <NtryDtls>
      <TxDtls>
        <Refs><EndToEndId>E2E-CREDIT-1</EndToEndId></Refs>
        <Amt Ccy="EUR">500.00</Amt>
        <RltdPties>
          <Dbtr><Nm>Bank-Test Kunde GmbH</Nm></Dbtr>
          <DbtrAcct><Id><IBAN>DE12500105170648489890</IBAN></Id></DbtrAcct>
        </RltdPties>
        <RmtInf><Ustrd>Rechnung RE-2026-001</Ustrd></RmtInf>
      </TxDtls>
    </NtryDtls>
  </Ntry>
`)
  }

  if (scenario === "debit-single") {
    return wrap(`
  <Ntry>
    <Amt Ccy="EUR">250.00</Amt>
    <CdtDbtInd>DBIT</CdtDbtInd>
    <Sts><Cd>BOOK</Cd></Sts>
    <BookgDt><Dt>2026-04-16</Dt></BookgDt>
    <ValDt><Dt>2026-04-16</Dt></ValDt>
    <AcctSvcrRef>REF-DEBIT-1</AcctSvcrRef>
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
  }

  // batch
  return wrap(`
  <Ntry>
    <Amt Ccy="EUR">900.00</Amt>
    <CdtDbtInd>DBIT</CdtDbtInd>
    <Sts><Cd>BOOK</Cd></Sts>
    <BookgDt><Dt>2026-04-17</Dt></BookgDt>
    <ValDt><Dt>2026-04-17</Dt></ValDt>
    <AcctSvcrRef>REF-BATCH-1</AcctSvcrRef>
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
}
