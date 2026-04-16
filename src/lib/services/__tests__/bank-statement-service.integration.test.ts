import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest"

vi.mock("@/lib/supabase/storage", () => ({
  upload: vi.fn().mockResolvedValue({ path: "mocked" }),
  remove: vi.fn().mockResolvedValue(undefined),
}))

import { prisma } from "@/lib/db/prisma"
import { importCamtStatement, deleteStatement } from "../bank-statement-service"
import { unmatchBankTransaction, BankTransactionMatchConflictError } from "../bank-transaction-matcher-service"
import { seedBankTestContext, type BankTestContext } from "./helpers/bank-match-fixtures"

const TEST_TENANT_ID = "f0000000-0000-4000-a000-000000000550"
const TEST_TENANT_SLUG = "bank-match-integration"
const TEST_USER_ID = "a0000000-0000-4000-a000-000000000550"
const DOC_ID_HAPPY = "d0000000-0000-4000-a000-000000000551"
const DOC_ID_SKONTO = "d0000000-0000-4000-a000-000000000552"
const INB_INV_ID_DEBIT = "e0000000-0000-4000-a000-000000000561"
const INB_INV_ID_CONSISTENCY = "e0000000-0000-4000-a000-000000000562"
const PAYMENT_RUN_ID = "f0000000-0000-4000-a000-000000000570"
const PAYMENT_RUN_ITEM_ID = "f0000000-0000-4000-a000-000000000571"

let bankCtx: BankTestContext

function buildCreditXml(opts: {
  amount: string
  iban: string
  name?: string
  remittance?: string
  statementId?: string
  currency?: string
}): string {
  const stmtId = opts.statementId ?? `STMT-INT-${Date.now()}`
  const ccy = opts.currency ?? "EUR"
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">
  <BkToCstmrStmt>
    <Stmt>
      <Id>${stmtId}</Id>
      <Acct><Id><IBAN>DE89370400440532013000</IBAN></Id><Ccy>EUR</Ccy></Acct>
      <FrToDt>
        <FrDtTm>2026-04-01T00:00:00</FrDtTm>
        <ToDtTm>2026-04-30T23:59:59</ToDtTm>
      </FrToDt>
      <Bal>
        <Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="EUR">10000.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2026-04-01</Dt></Dt>
      </Bal>
      <Bal>
        <Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="EUR">10500.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2026-04-30</Dt></Dt>
      </Bal>
      <Ntry>
        <Amt Ccy="${ccy}">${opts.amount}</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Sts><Cd>BOOK</Cd></Sts>
        <BookgDt><Dt>2026-04-15</Dt></BookgDt>
        <ValDt><Dt>2026-04-15</Dt></ValDt>
        <AcctSvcrRef>REF-INT-1</AcctSvcrRef>
        <NtryDtls>
          <TxDtls>
            <Refs><EndToEndId>E2E-INT-1</EndToEndId></Refs>
            <Amt Ccy="${ccy}">${opts.amount}</Amt>
            <RltdPties>
              <Dbtr><Nm>${opts.name ?? "Bank-Test Kunde GmbH"}</Nm></Dbtr>
              <DbtrAcct><Id><IBAN>${opts.iban}</IBAN></Id></DbtrAcct>
            </RltdPties>
            ${opts.remittance ? `<RmtInf><Ustrd>${opts.remittance}</Ustrd></RmtInf>` : ""}
          </TxDtls>
        </NtryDtls>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`
}

function buildMultiCreditXml(entries: Array<{ amount: string; iban: string; name?: string }>): string {
  const stmtId = `STMT-MULTI-${Date.now()}`
  const entryXml = entries.map((e, i) => `
      <Ntry>
        <Amt Ccy="EUR">${e.amount}</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Sts><Cd>BOOK</Cd></Sts>
        <BookgDt><Dt>2026-04-15</Dt></BookgDt>
        <ValDt><Dt>2026-04-15</Dt></ValDt>
        <AcctSvcrRef>REF-MULTI-${i + 1}</AcctSvcrRef>
        <NtryDtls>
          <TxDtls>
            <Refs><EndToEndId>E2E-MULTI-${i + 1}</EndToEndId></Refs>
            <Amt Ccy="EUR">${e.amount}</Amt>
            <RltdPties>
              <Dbtr><Nm>${e.name ?? "Unknown"}</Nm></Dbtr>
              <DbtrAcct><Id><IBAN>${e.iban}</IBAN></Id></DbtrAcct>
            </RltdPties>
          </TxDtls>
        </NtryDtls>
      </Ntry>`).join("\n")

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">
  <BkToCstmrStmt>
    <Stmt>
      <Id>${stmtId}</Id>
      <Acct><Id><IBAN>DE89370400440532013000</IBAN></Id><Ccy>EUR</Ccy></Acct>
      <FrToDt>
        <FrDtTm>2026-04-01T00:00:00</FrDtTm>
        <ToDtTm>2026-04-30T23:59:59</ToDtTm>
      </FrToDt>
      <Bal>
        <Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="EUR">10000.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2026-04-01</Dt></Dt>
      </Bal>
      <Bal>
        <Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="EUR">10500.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2026-04-30</Dt></Dt>
      </Bal>
      ${entryXml}
    </Stmt>
  </BkToCstmrStmt>
</Document>`
}

function buildDebitXml(opts: {
  amount: string
  iban: string
  name?: string
  remittance?: string
  endToEndId?: string
  statementId?: string
}): string {
  const stmtId = opts.statementId ?? `STMT-DEBIT-${Date.now()}`
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">
  <BkToCstmrStmt>
    <Stmt>
      <Id>${stmtId}</Id>
      <Acct><Id><IBAN>DE89370400440532013000</IBAN></Id><Ccy>EUR</Ccy></Acct>
      <FrToDt>
        <FrDtTm>2026-04-01T00:00:00</FrDtTm>
        <ToDtTm>2026-04-30T23:59:59</ToDtTm>
      </FrToDt>
      <Bal>
        <Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="EUR">10000.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2026-04-01</Dt></Dt>
      </Bal>
      <Bal>
        <Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="EUR">9500.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2026-04-30</Dt></Dt>
      </Bal>
      <Ntry>
        <Amt Ccy="EUR">${opts.amount}</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <Sts><Cd>BOOK</Cd></Sts>
        <BookgDt><Dt>2026-04-15</Dt></BookgDt>
        <ValDt><Dt>2026-04-15</Dt></ValDt>
        <AcctSvcrRef>REF-DEBIT-INT-1</AcctSvcrRef>
        <NtryDtls>
          <TxDtls>
            <Refs><EndToEndId>${opts.endToEndId ?? "E2E-DEBIT-INT-1"}</EndToEndId></Refs>
            <Amt Ccy="EUR">${opts.amount}</Amt>
            <RltdPties>
              <Cdtr><Nm>${opts.name ?? "Bank-Test Lieferant AG"}</Nm></Cdtr>
              <CdtrAcct><Id><IBAN>${opts.iban}</IBAN></Id></CdtrAcct>
            </RltdPties>
            ${opts.remittance ? `<RmtInf><Ustrd>${opts.remittance}</Ustrd></RmtInf>` : ""}
          </TxDtls>
        </NtryDtls>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`
}

function buildMixedXml(opts: {
  creditAmount: string
  creditIban: string
  creditRemittance?: string
  debitAmount: string
  debitIban: string
  debitRemittance?: string
  unknownAmount: string
}): string {
  const stmtId = `STMT-MIXED-${Date.now()}`
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">
  <BkToCstmrStmt>
    <Stmt>
      <Id>${stmtId}</Id>
      <Acct><Id><IBAN>DE89370400440532013000</IBAN></Id><Ccy>EUR</Ccy></Acct>
      <FrToDt>
        <FrDtTm>2026-04-01T00:00:00</FrDtTm>
        <ToDtTm>2026-04-30T23:59:59</ToDtTm>
      </FrToDt>
      <Bal>
        <Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="EUR">10000.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2026-04-01</Dt></Dt>
      </Bal>
      <Bal>
        <Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="EUR">10000.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2026-04-30</Dt></Dt>
      </Bal>
      <Ntry>
        <Amt Ccy="EUR">${opts.creditAmount}</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Sts><Cd>BOOK</Cd></Sts>
        <BookgDt><Dt>2026-04-15</Dt></BookgDt>
        <ValDt><Dt>2026-04-15</Dt></ValDt>
        <AcctSvcrRef>REF-MIX-CREDIT</AcctSvcrRef>
        <NtryDtls>
          <TxDtls>
            <Refs><EndToEndId>E2E-MIX-C</EndToEndId></Refs>
            <Amt Ccy="EUR">${opts.creditAmount}</Amt>
            <RltdPties>
              <Dbtr><Nm>Bank-Test Kunde GmbH</Nm></Dbtr>
              <DbtrAcct><Id><IBAN>${opts.creditIban}</IBAN></Id></DbtrAcct>
            </RltdPties>
            ${opts.creditRemittance ? `<RmtInf><Ustrd>${opts.creditRemittance}</Ustrd></RmtInf>` : ""}
          </TxDtls>
        </NtryDtls>
      </Ntry>
      <Ntry>
        <Amt Ccy="EUR">${opts.debitAmount}</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <Sts><Cd>BOOK</Cd></Sts>
        <BookgDt><Dt>2026-04-15</Dt></BookgDt>
        <ValDt><Dt>2026-04-15</Dt></ValDt>
        <AcctSvcrRef>REF-MIX-DEBIT</AcctSvcrRef>
        <NtryDtls>
          <TxDtls>
            <Refs><EndToEndId>E2E-MIX-D</EndToEndId></Refs>
            <Amt Ccy="EUR">${opts.debitAmount}</Amt>
            <RltdPties>
              <Cdtr><Nm>Bank-Test Lieferant AG</Nm></Cdtr>
              <CdtrAcct><Id><IBAN>${opts.debitIban}</IBAN></Id></CdtrAcct>
            </RltdPties>
            ${opts.debitRemittance ? `<RmtInf><Ustrd>${opts.debitRemittance}</Ustrd></RmtInf>` : ""}
          </TxDtls>
        </NtryDtls>
      </Ntry>
      <Ntry>
        <Amt Ccy="EUR">${opts.unknownAmount}</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <Sts><Cd>BOOK</Cd></Sts>
        <BookgDt><Dt>2026-04-15</Dt></BookgDt>
        <ValDt><Dt>2026-04-15</Dt></ValDt>
        <AcctSvcrRef>REF-MIX-UNKNOWN</AcctSvcrRef>
        <NtryDtls>
          <TxDtls>
            <Refs><EndToEndId>E2E-MIX-U</EndToEndId></Refs>
            <Amt Ccy="EUR">${opts.unknownAmount}</Amt>
            <RltdPties>
              <Cdtr><Nm>Unknown Vendor</Nm></Cdtr>
              <CdtrAcct><Id><IBAN>DE02120300000000999999</IBAN></Id></CdtrAcct>
            </RltdPties>
          </TxDtls>
        </NtryDtls>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`
}

function toB64(xml: string): string {
  return Buffer.from(xml, "utf8").toString("base64")
}

async function cleanup() {
  await prisma.inboundInvoiceBankAllocation.deleteMany({ where: { tenantId: TEST_TENANT_ID } }).catch(() => {})
  await prisma.inboundInvoicePayment.deleteMany({ where: { tenantId: TEST_TENANT_ID } }).catch(() => {})
  await prisma.billingDocumentBankAllocation.deleteMany({ where: { tenantId: TEST_TENANT_ID } }).catch(() => {})
  await prisma.billingPayment.deleteMany({ where: { tenantId: TEST_TENANT_ID } }).catch(() => {})
  await prisma.bankTransaction.deleteMany({ where: { tenantId: TEST_TENANT_ID } }).catch(() => {})
  await prisma.bankStatement.deleteMany({ where: { tenantId: TEST_TENANT_ID } }).catch(() => {})
  await prisma.paymentRunItem.deleteMany({ where: { tenantId: TEST_TENANT_ID } }).catch(() => {})
  await prisma.paymentRun.deleteMany({ where: { tenantId: TEST_TENANT_ID } }).catch(() => {})
  await prisma.inboundInvoice.deleteMany({ where: { tenantId: TEST_TENANT_ID } }).catch(() => {})
  await prisma.billingDocument.deleteMany({ where: { tenantId: TEST_TENANT_ID } }).catch(() => {})
  await prisma.auditLog.deleteMany({ where: { tenantId: TEST_TENANT_ID } }).catch(() => {})
}

beforeAll(async () => {
  await prisma.tenant.upsert({
    where: { id: TEST_TENANT_ID },
    update: {},
    create: { id: TEST_TENANT_ID, name: "Bank Match Integration", slug: TEST_TENANT_SLUG, isActive: true },
  })
  await prisma.user.upsert({
    where: { id: TEST_USER_ID },
    update: {},
    create: { id: TEST_USER_ID, email: "bank-match-int@test.local", displayName: "Bank Match Int" },
  })
  await prisma.userTenant.upsert({
    where: { userId_tenantId: { userId: TEST_USER_ID, tenantId: TEST_TENANT_ID } },
    update: {},
    create: { userId: TEST_USER_ID, tenantId: TEST_TENANT_ID },
  })
  bankCtx = await seedBankTestContext(prisma, TEST_TENANT_ID)
})

afterAll(async () => {
  await cleanup()
  await prisma.numberSequence.deleteMany({ where: { tenantId: TEST_TENANT_ID } }).catch(() => {})
  await prisma.crmBankAccount.deleteMany({ where: { tenantId: TEST_TENANT_ID } }).catch(() => {})
  await prisma.crmAddress.deleteMany({ where: { tenantId: TEST_TENANT_ID } }).catch(() => {})
  await prisma.userTenant.deleteMany({ where: { tenantId: TEST_TENANT_ID } }).catch(() => {})
  await prisma.user.deleteMany({ where: { id: TEST_USER_ID } }).catch(() => {})
  await prisma.tenant.deleteMany({ where: { id: TEST_TENANT_ID } }).catch(() => {})
})

describe.sequential("bank-statement credit-match integration", () => {
  beforeEach(async () => {
    await cleanup()
  })

  async function seedInvoice(opts: {
    id: string
    number: string
    totalGross: number
    discountPercent?: number
    discountDays?: number
  }) {
    return prisma.billingDocument.create({
      data: {
        id: opts.id,
        tenantId: TEST_TENANT_ID,
        number: opts.number,
        type: "INVOICE",
        status: "PRINTED",
        addressId: bankCtx.addressWithIban.addressId,
        documentDate: new Date("2026-04-01"),
        totalGross: opts.totalGross,
        paymentTermDays: 30,
        discountPercent: opts.discountPercent ?? null,
        discountDays: opts.discountDays ?? null,
      },
    })
  }

  it("end-to-end: matches a credit transaction to an open invoice", async () => {
    await seedInvoice({ id: DOC_ID_HAPPY, number: "RE-1", totalGross: 500 })

    const xml = buildCreditXml({
      amount: "500.00",
      iban: bankCtx.addressWithIban.iban,
      remittance: "Rechnung RE-1",
    })

    const result = await importCamtStatement(
      prisma, TEST_TENANT_ID,
      { fileBase64: toB64(xml), fileName: "happy.xml" },
      TEST_USER_ID,
    )

    expect(result.autoMatched).toBe(1)
    expect(result.unmatched).toBe(0)

    const txRow = await prisma.bankTransaction.findFirst({
      where: { tenantId: TEST_TENANT_ID },
    })
    expect(txRow?.status).toBe("matched")

    const allocation = await prisma.billingDocumentBankAllocation.findFirst({
      where: { tenantId: TEST_TENANT_ID, billingDocumentId: DOC_ID_HAPPY },
    })
    expect(allocation).toBeTruthy()
    expect(allocation?.billingPaymentId).toBeTruthy()
    expect(allocation?.autoMatched).toBe(true)

    const payment = await prisma.billingPayment.findFirst({
      where: { tenantId: TEST_TENANT_ID, documentId: DOC_ID_HAPPY },
    })
    expect(payment).toBeTruthy()
    expect(payment?.amount).toBe(500)
    expect(payment?.type).toBe("BANK")
    expect(payment?.bankAllocationId).toBe(allocation?.id)

    const auditRow = await prisma.auditLog.findFirst({
      where: { tenantId: TEST_TENANT_ID, action: "match", entityType: "bank_transaction" },
    })
    expect(auditRow).toBeTruthy()
    expect(auditRow?.userId).toBe(TEST_USER_ID)
  })

  it("matches with skonto tier 1 and creates discount payment row", async () => {
    await seedInvoice({
      id: DOC_ID_SKONTO,
      number: "RE-2",
      totalGross: 1000,
      discountPercent: 2,
      discountDays: 14,
    })

    const xml = buildCreditXml({
      amount: "980.00",
      iban: bankCtx.addressWithIban.iban,
      remittance: "RE-2 Skonto",
    })

    const result = await importCamtStatement(
      prisma, TEST_TENANT_ID,
      { fileBase64: toB64(xml), fileName: "skonto.xml" },
      TEST_USER_ID,
    )

    expect(result.autoMatched).toBe(1)

    const payments = await prisma.billingPayment.findMany({
      where: { tenantId: TEST_TENANT_ID, documentId: DOC_ID_SKONTO },
      orderBy: { amount: "desc" },
    })
    expect(payments).toHaveLength(2)
    const mainPayment = payments.find((p) => !p.isDiscount)
    const skontoPayment = payments.find((p) => p.isDiscount)
    expect(mainPayment?.amount).toBe(980)
    expect(skontoPayment?.amount).toBe(20)
    expect(skontoPayment?.notes).toContain("Skonto")
  })

  it("partial match: 3 credits, 1 matches, 2 unmatched", async () => {
    await seedInvoice({ id: DOC_ID_HAPPY, number: "RE-10", totalGross: 500 })

    const xml = buildMultiCreditXml([
      { amount: "500.00", iban: bankCtx.addressWithIban.iban, name: "Kunde GmbH" },
      { amount: "999.99", iban: bankCtx.addressWithIban.iban, name: "Kunde GmbH" },
      { amount: "200.00", iban: "DE02120300000000999999", name: "Unbekannt AG" },
    ])

    const result = await importCamtStatement(
      prisma, TEST_TENANT_ID,
      { fileBase64: toB64(xml), fileName: "partial.xml" },
      TEST_USER_ID,
    )

    expect(result.transactionsImported).toBe(3)
    expect(result.autoMatched).toBe(1)
    expect(result.unmatched).toBe(2)

    const txRows = await prisma.bankTransaction.findMany({
      where: { tenantId: TEST_TENANT_ID },
      orderBy: { amount: "asc" },
    })
    expect(txRows).toHaveLength(3)

    const matched = txRows.find((t) => t.status === "matched")
    expect(matched?.amount).toBe(500)

    const unmatchedWithAddress = txRows.find(
      (t) => t.status === "unmatched" && t.suggestedAddressId !== null,
    )
    expect(unmatchedWithAddress).toBeTruthy()
    expect(unmatchedWithAddress?.amount).toBe(999.99)
  })

  it("matcher failure does not roll back imported statement", async () => {
    await seedInvoice({ id: DOC_ID_HAPPY, number: "RE-20", totalGross: 500 })

    const xml = buildCreditXml({
      amount: "500.00",
      iban: bankCtx.addressWithIban.iban,
    })

    const createSpy = vi.spyOn(
      await import("../billing-payment-repository"),
      "createPayment",
    )
    createSpy.mockRejectedValueOnce(new Error("simulated payment failure"))

    const result = await importCamtStatement(
      prisma, TEST_TENANT_ID,
      { fileBase64: toB64(xml), fileName: "atomicity.xml" },
      TEST_USER_ID,
    )

    createSpy.mockRestore()

    expect(result.transactionsImported).toBe(1)
    expect(result.autoMatched).toBe(0)
    expect(result.unmatched).toBe(1)

    const stmtCount = await prisma.bankStatement.count({ where: { tenantId: TEST_TENANT_ID } })
    const txCount = await prisma.bankTransaction.count({ where: { tenantId: TEST_TENANT_ID } })
    const payCount = await prisma.billingPayment.count({ where: { tenantId: TEST_TENANT_ID } })

    expect(stmtCount).toBe(1)
    expect(txCount).toBe(1)
    expect(payCount).toBe(0)
  })
})

describe.sequential("bank-statement debit-match integration", () => {
  beforeEach(async () => {
    await cleanup()
  })

  async function seedInboundInvoice(opts: {
    id: string
    number: string
    invoiceNumber?: string
    totalGross: number
    sellerIban?: string
    dueDate?: Date
    status?: string
  }) {
    return prisma.inboundInvoice.create({
      data: {
        id: opts.id,
        tenantId: TEST_TENANT_ID,
        number: opts.number,
        invoiceNumber: opts.invoiceNumber ?? null,
        totalGross: opts.totalGross,
        sellerIban: opts.sellerIban ?? bankCtx.supplierAddress.iban,
        supplierId: bankCtx.supplierAddress.addressId,
        dueDate: opts.dueDate ?? new Date("2026-04-14"),
        status: opts.status ?? "APPROVED",
        paymentStatus: "UNPAID",
        paidAmount: 0,
      },
    })
  }

  async function seedPaymentRunWithItem(opts: {
    invoiceId: string
    endToEndId: string
  }) {
    const run = await prisma.paymentRun.create({
      data: {
        id: PAYMENT_RUN_ID,
        tenantId: TEST_TENANT_ID,
        number: "ZL-TEST-1",
        status: "BOOKED",
        executionDate: new Date("2026-04-14"),
        debtorName: "Test Tenant GmbH",
        debtorIban: "DE89370400440532013000",
        bookedAt: new Date("2026-04-14"),
      },
    })
    await prisma.paymentRunItem.create({
      data: {
        id: PAYMENT_RUN_ITEM_ID,
        tenantId: TEST_TENANT_ID,
        paymentRunId: run.id,
        inboundInvoiceId: opts.invoiceId,
        effectiveCreditorName: "Bank-Test Lieferant AG",
        effectiveIban: bankCtx.supplierAddress.iban,
        effectiveCity: "Berlin",
        effectiveCountry: "DE",
        effectiveAmountCents: BigInt(50000),
        effectiveRemittanceInfo: "ER-1 Test",
        ibanSource: "INVOICE",
        addressSource: "INVOICE",
        endToEndId: opts.endToEndId,
      },
    })
    return run
  }

  it("end-to-end: matches a debit transaction to an open inbound invoice", async () => {
    await seedInboundInvoice({
      id: INB_INV_ID_DEBIT,
      number: "ER-1",
      invoiceNumber: "LF-2026-042",
      totalGross: 500,
    })

    const xml = buildDebitXml({
      amount: "500.00",
      iban: bankCtx.supplierAddress.iban,
      remittance: "Zahlung LF-2026-042",
    })

    const result = await importCamtStatement(
      prisma, TEST_TENANT_ID,
      { fileBase64: toB64(xml), fileName: "debit-happy.xml" },
      TEST_USER_ID,
    )

    expect(result.autoMatched).toBe(1)
    expect(result.unmatched).toBe(0)

    const txRow = await prisma.bankTransaction.findFirst({
      where: { tenantId: TEST_TENANT_ID },
    })
    expect(txRow?.status).toBe("matched")
    expect(txRow?.direction).toBe("DEBIT")

    const allocation = await prisma.inboundInvoiceBankAllocation.findFirst({
      where: { tenantId: TEST_TENANT_ID, inboundInvoiceId: INB_INV_ID_DEBIT },
    })
    expect(allocation).toBeTruthy()
    expect(allocation?.inboundInvoicePaymentId).toBeTruthy()
    expect(allocation?.autoMatched).toBe(true)

    const payment = await prisma.inboundInvoicePayment.findFirst({
      where: { tenantId: TEST_TENANT_ID, invoiceId: INB_INV_ID_DEBIT },
    })
    expect(payment).toBeTruthy()
    expect(payment?.amount).toBe(500)
    expect(payment?.type).toBe("BANK")
    expect(payment?.bankAllocationId).toBe(allocation?.id)

    const invoice = await prisma.inboundInvoice.findUnique({
      where: { id: INB_INV_ID_DEBIT },
    })
    expect(invoice?.paymentStatus).toBe("PAID")

    const auditRow = await prisma.auditLog.findFirst({
      where: { tenantId: TEST_TENANT_ID, action: "match", entityType: "bank_transaction" },
    })
    expect(auditRow).toBeTruthy()
  })

  it("consistency match: already-PAID invoice via endToEndId creates no payment or allocation", async () => {
    const inv = await seedInboundInvoice({
      id: INB_INV_ID_CONSISTENCY,
      number: "ER-2",
      invoiceNumber: "LF-CONS-001",
      totalGross: 500,
    })

    // Simulate markBooked: set paymentStatus=PAID and create a manual payment
    await prisma.inboundInvoicePayment.create({
      data: {
        tenantId: TEST_TENANT_ID,
        invoiceId: inv.id,
        date: new Date("2026-04-14"),
        amount: 500,
        type: "BANK",
        notes: "PaymentRun markBooked",
      },
    })
    await prisma.inboundInvoice.update({
      where: { id: inv.id },
      data: { paymentStatus: "PAID", paidAmount: 500, paidAt: new Date("2026-04-14") },
    })

    await seedPaymentRunWithItem({
      invoiceId: inv.id,
      endToEndId: "E2E-CONS-001",
    })

    const paymentCountBefore = await prisma.inboundInvoicePayment.count({
      where: { tenantId: TEST_TENANT_ID, invoiceId: inv.id },
    })
    const allocationCountBefore = await prisma.inboundInvoiceBankAllocation.count({
      where: { tenantId: TEST_TENANT_ID },
    })

    const xml = buildDebitXml({
      amount: "500.00",
      iban: bankCtx.supplierAddress.iban,
      endToEndId: "E2E-CONS-001",
    })

    const result = await importCamtStatement(
      prisma, TEST_TENANT_ID,
      { fileBase64: toB64(xml), fileName: "consistency.xml" },
      TEST_USER_ID,
    )

    expect(result.autoMatched).toBe(1)

    const txRow = await prisma.bankTransaction.findFirst({
      where: { tenantId: TEST_TENANT_ID },
    })
    expect(txRow?.status).toBe("matched")

    const paymentCountAfter = await prisma.inboundInvoicePayment.count({
      where: { tenantId: TEST_TENANT_ID, invoiceId: inv.id },
    })
    expect(paymentCountAfter).toBe(paymentCountBefore)

    const allocationCountAfter = await prisma.inboundInvoiceBankAllocation.count({
      where: { tenantId: TEST_TENANT_ID },
    })
    expect(allocationCountAfter).toBe(allocationCountBefore)

    const auditRow = await prisma.auditLog.findFirst({
      where: { tenantId: TEST_TENANT_ID, action: "confirm_match", entityType: "bank_transaction" },
    })
    expect(auditRow).toBeTruthy()
    const meta = auditRow?.metadata as Record<string, unknown> | null
    expect(meta?.invoiceId).toBe(inv.id)
    expect(meta?.paymentRunItemId).toBe(PAYMENT_RUN_ITEM_ID)
  })

  it("mixed match: 1 credit + 1 debit + 1 unknown in one upload", async () => {
    // Seed credit invoice
    await prisma.billingDocument.create({
      data: {
        id: DOC_ID_HAPPY,
        tenantId: TEST_TENANT_ID,
        number: "RE-50",
        type: "INVOICE",
        status: "PRINTED",
        addressId: bankCtx.addressWithIban.addressId,
        documentDate: new Date("2026-04-01"),
        totalGross: 300,
        paymentTermDays: 30,
      },
    })

    // Seed debit invoice
    await seedInboundInvoice({
      id: INB_INV_ID_DEBIT,
      number: "ER-50",
      invoiceNumber: "LF-MIX-001",
      totalGross: 200,
    })

    const xml = buildMixedXml({
      creditAmount: "300.00",
      creditIban: bankCtx.addressWithIban.iban,
      creditRemittance: "RE-50",
      debitAmount: "200.00",
      debitIban: bankCtx.supplierAddress.iban,
      debitRemittance: "LF-MIX-001",
      unknownAmount: "777.77",
    })

    const result = await importCamtStatement(
      prisma, TEST_TENANT_ID,
      { fileBase64: toB64(xml), fileName: "mixed.xml" },
      TEST_USER_ID,
    )

    expect(result.transactionsImported).toBe(3)
    expect(result.autoMatched).toBe(2)
    expect(result.unmatched).toBe(1)

    const creditAllocation = await prisma.billingDocumentBankAllocation.findFirst({
      where: { tenantId: TEST_TENANT_ID, billingDocumentId: DOC_ID_HAPPY },
    })
    expect(creditAllocation).toBeTruthy()

    const debitAllocation = await prisma.inboundInvoiceBankAllocation.findFirst({
      where: { tenantId: TEST_TENANT_ID, inboundInvoiceId: INB_INV_ID_DEBIT },
    })
    expect(debitAllocation).toBeTruthy()

    const txRows = await prisma.bankTransaction.findMany({
      where: { tenantId: TEST_TENANT_ID },
      orderBy: { amount: "asc" },
    })
    expect(txRows).toHaveLength(3)
    const matched = txRows.filter((t) => t.status === "matched")
    const unmatched = txRows.filter((t) => t.status === "unmatched")
    expect(matched).toHaveLength(2)
    expect(unmatched).toHaveLength(1)
    expect(unmatched[0]?.amount).toBe(777.77)
  })
})

describe.sequential("bank-statement unmatch integration", () => {
  beforeEach(async () => {
    await cleanup()
  })

  async function seedInvoice(opts: {
    id: string
    number: string
    totalGross: number
  }) {
    return prisma.billingDocument.create({
      data: {
        id: opts.id,
        tenantId: TEST_TENANT_ID,
        number: opts.number,
        type: "INVOICE",
        status: "PRINTED",
        addressId: bankCtx.addressWithIban.addressId,
        documentDate: new Date("2026-04-01"),
        totalGross: opts.totalGross,
        paymentTermDays: 30,
      },
    })
  }

  async function seedInboundInvoice(opts: {
    id: string
    number: string
    invoiceNumber?: string
    totalGross: number
  }) {
    return prisma.inboundInvoice.create({
      data: {
        id: opts.id,
        tenantId: TEST_TENANT_ID,
        number: opts.number,
        invoiceNumber: opts.invoiceNumber ?? null,
        totalGross: opts.totalGross,
        sellerIban: bankCtx.supplierAddress.iban,
        supplierId: bankCtx.supplierAddress.addressId,
        dueDate: new Date("2026-04-14"),
        status: "APPROVED",
        paymentStatus: "UNPAID",
        paidAmount: 0,
      },
    })
  }

  it("unmatch auto-matched credit: cancels payment, removes allocation, resets status", async () => {
    await seedInvoice({ id: DOC_ID_HAPPY, number: "RE-1", totalGross: 500 })

    const xml = buildCreditXml({
      amount: "500.00",
      iban: bankCtx.addressWithIban.iban,
      remittance: "Rechnung RE-1",
    })

    await importCamtStatement(
      prisma, TEST_TENANT_ID,
      { fileBase64: toB64(xml), fileName: "unmatch-credit.xml" },
      TEST_USER_ID,
    )

    const txBefore = await prisma.bankTransaction.findFirst({
      where: { tenantId: TEST_TENANT_ID },
    })
    expect(txBefore?.status).toBe("matched")

    await unmatchBankTransaction(prisma, TEST_TENANT_ID, txBefore!.id, TEST_USER_ID)

    const txAfter = await prisma.bankTransaction.findUnique({
      where: { id: txBefore!.id },
    })
    expect(txAfter?.status).toBe("unmatched")

    const allocations = await prisma.billingDocumentBankAllocation.findMany({
      where: { tenantId: TEST_TENANT_ID, bankTransactionId: txBefore!.id },
    })
    expect(allocations).toHaveLength(0)

    const payments = await prisma.billingPayment.findMany({
      where: { tenantId: TEST_TENANT_ID, documentId: DOC_ID_HAPPY, status: "ACTIVE" },
    })
    expect(payments).toHaveLength(0)

    const auditRow = await prisma.auditLog.findFirst({
      where: { tenantId: TEST_TENANT_ID, action: "unmatch", entityType: "bank_transaction" },
    })
    expect(auditRow).toBeTruthy()
  })

  it("unmatch consistency match: resets status, invoice stays PAID", async () => {
    const inv = await seedInboundInvoice({
      id: INB_INV_ID_CONSISTENCY,
      number: "ER-2",
      invoiceNumber: "LF-CONS-001",
      totalGross: 500,
    })

    await prisma.inboundInvoicePayment.create({
      data: {
        tenantId: TEST_TENANT_ID,
        invoiceId: inv.id,
        date: new Date("2026-04-14"),
        amount: 500,
        type: "BANK",
        notes: "PaymentRun markBooked",
      },
    })
    await prisma.inboundInvoice.update({
      where: { id: inv.id },
      data: { paymentStatus: "PAID", paidAmount: 500, paidAt: new Date("2026-04-14") },
    })

    await prisma.paymentRun.create({
      data: {
        id: PAYMENT_RUN_ID,
        tenantId: TEST_TENANT_ID,
        number: "ZL-TEST-1",
        status: "BOOKED",
        executionDate: new Date("2026-04-14"),
        debtorName: "Test Tenant GmbH",
        debtorIban: "DE89370400440532013000",
        bookedAt: new Date("2026-04-14"),
      },
    })
    await prisma.paymentRunItem.create({
      data: {
        id: PAYMENT_RUN_ITEM_ID,
        tenantId: TEST_TENANT_ID,
        paymentRunId: PAYMENT_RUN_ID,
        inboundInvoiceId: inv.id,
        effectiveCreditorName: "Bank-Test Lieferant AG",
        effectiveIban: bankCtx.supplierAddress.iban,
        effectiveCity: "Berlin",
        effectiveCountry: "DE",
        effectiveAmountCents: BigInt(50000),
        effectiveRemittanceInfo: "ER-2 Test",
        ibanSource: "INVOICE",
        addressSource: "INVOICE",
        endToEndId: "E2E-CONS-UNMATCH",
      },
    })

    const xml = buildDebitXml({
      amount: "500.00",
      iban: bankCtx.supplierAddress.iban,
      endToEndId: "E2E-CONS-UNMATCH",
    })

    await importCamtStatement(
      prisma, TEST_TENANT_ID,
      { fileBase64: toB64(xml), fileName: "unmatch-consistency.xml" },
      TEST_USER_ID,
    )

    const txBefore = await prisma.bankTransaction.findFirst({
      where: { tenantId: TEST_TENANT_ID },
    })
    expect(txBefore?.status).toBe("matched")

    // No allocations should exist for a consistency match
    const allocsBefore = await prisma.inboundInvoiceBankAllocation.count({
      where: { tenantId: TEST_TENANT_ID, bankTransactionId: txBefore!.id },
    })
    expect(allocsBefore).toBe(0)

    await unmatchBankTransaction(prisma, TEST_TENANT_ID, txBefore!.id, TEST_USER_ID)

    const txAfter = await prisma.bankTransaction.findUnique({
      where: { id: txBefore!.id },
    })
    expect(txAfter?.status).toBe("unmatched")

    // Invoice stays PAID — the payment came from markBooked, not the matcher
    const invoice = await prisma.inboundInvoice.findUnique({
      where: { id: inv.id },
    })
    expect(invoice?.paymentStatus).toBe("PAID")
  })

  it("double unmatch throws BankTransactionMatchConflictError", async () => {
    await seedInvoice({ id: DOC_ID_HAPPY, number: "RE-1", totalGross: 500 })

    const xml = buildCreditXml({
      amount: "500.00",
      iban: bankCtx.addressWithIban.iban,
      remittance: "Rechnung RE-1",
    })

    await importCamtStatement(
      prisma, TEST_TENANT_ID,
      { fileBase64: toB64(xml), fileName: "double-unmatch.xml" },
      TEST_USER_ID,
    )

    const txRow = await prisma.bankTransaction.findFirst({
      where: { tenantId: TEST_TENANT_ID },
    })

    await unmatchBankTransaction(prisma, TEST_TENANT_ID, txRow!.id, TEST_USER_ID)

    await expect(
      unmatchBankTransaction(prisma, TEST_TENANT_ID, txRow!.id, TEST_USER_ID),
    ).rejects.toThrow(BankTransactionMatchConflictError)
  })

  it("unmatch split allocation: cancels all payments and removes all allocations atomically", async () => {
    const docId2 = "d0000000-0000-4000-a000-000000000553"
    await seedInvoice({ id: DOC_ID_HAPPY, number: "RE-1", totalGross: 300 })
    await seedInvoice({ id: docId2, number: "RE-2", totalGross: 200 })

    // Import a credit for 500 (unmatched since no single doc matches)
    const xml = buildCreditXml({
      amount: "500.00",
      iban: bankCtx.addressWithIban.iban,
    })

    await importCamtStatement(
      prisma, TEST_TENANT_ID,
      { fileBase64: toB64(xml), fileName: "split-unmatch.xml" },
      TEST_USER_ID,
    )

    const txRow = await prisma.bankTransaction.findFirst({
      where: { tenantId: TEST_TENANT_ID },
    })
    expect(txRow?.status).toBe("unmatched")

    // Set up split allocation directly (avoid nested $transaction issue in manualMatchTransaction)
    const payment1 = await prisma.billingPayment.create({
      data: {
        tenantId: TEST_TENANT_ID,
        documentId: DOC_ID_HAPPY,
        date: new Date("2026-04-15"),
        amount: 300,
        type: "BANK",
        notes: "CAMT manual split",
        isDiscount: false,
        createdById: TEST_USER_ID,
      },
    })
    const payment2 = await prisma.billingPayment.create({
      data: {
        tenantId: TEST_TENANT_ID,
        documentId: docId2,
        date: new Date("2026-04-15"),
        amount: 200,
        type: "BANK",
        notes: "CAMT manual split",
        isDiscount: false,
        createdById: TEST_USER_ID,
      },
    })
    const alloc1 = await prisma.billingDocumentBankAllocation.create({
      data: {
        tenantId: TEST_TENANT_ID,
        bankTransactionId: txRow!.id,
        billingDocumentId: DOC_ID_HAPPY,
        billingPaymentId: payment1.id,
        amount: 300,
        autoMatched: false,
        matchedById: TEST_USER_ID,
      },
    })
    const alloc2 = await prisma.billingDocumentBankAllocation.create({
      data: {
        tenantId: TEST_TENANT_ID,
        bankTransactionId: txRow!.id,
        billingDocumentId: docId2,
        billingPaymentId: payment2.id,
        amount: 200,
        autoMatched: false,
        matchedById: TEST_USER_ID,
      },
    })
    await prisma.billingPayment.update({
      where: { id: payment1.id },
      data: { bankAllocationId: alloc1.id },
    })
    await prisma.billingPayment.update({
      where: { id: payment2.id },
      data: { bankAllocationId: alloc2.id },
    })
    await prisma.bankTransaction.update({
      where: { id: txRow!.id },
      data: { status: "matched" },
    })

    const allocsBefore = await prisma.billingDocumentBankAllocation.findMany({
      where: { tenantId: TEST_TENANT_ID, bankTransactionId: txRow!.id },
    })
    expect(allocsBefore).toHaveLength(2)

    await unmatchBankTransaction(prisma, TEST_TENANT_ID, txRow!.id, TEST_USER_ID)

    const txAfter = await prisma.bankTransaction.findUnique({ where: { id: txRow!.id } })
    expect(txAfter?.status).toBe("unmatched")

    const allocsAfter = await prisma.billingDocumentBankAllocation.findMany({
      where: { tenantId: TEST_TENANT_ID, bankTransactionId: txRow!.id },
    })
    expect(allocsAfter).toHaveLength(0)

    const activePayments = await prisma.billingPayment.findMany({
      where: {
        tenantId: TEST_TENANT_ID,
        documentId: { in: [DOC_ID_HAPPY, docId2] },
        status: "ACTIVE",
      },
    })
    expect(activePayments).toHaveLength(0)
  })
})

describe.sequential("bank-statement delete integration", () => {
  beforeEach(async () => {
    await cleanup()
  })

  it("deleteStatement: reverses matched payments, deletes all transactions and statement", async () => {
    await prisma.billingDocument.create({
      data: {
        id: DOC_ID_HAPPY,
        tenantId: TEST_TENANT_ID,
        number: "RE-1",
        type: "INVOICE",
        status: "PRINTED",
        addressId: bankCtx.addressWithIban.addressId,
        documentDate: new Date("2026-04-01"),
        totalGross: 500,
        paymentTermDays: 30,
      },
    })

    const xml = buildCreditXml({
      amount: "500.00",
      iban: bankCtx.addressWithIban.iban,
      remittance: "Rechnung RE-1",
    })

    const importResult = await importCamtStatement(
      prisma, TEST_TENANT_ID,
      { fileBase64: toB64(xml), fileName: "delete-test.xml" },
      TEST_USER_ID,
    )
    expect(importResult.autoMatched).toBe(1)

    const paymentBefore = await prisma.billingPayment.findFirst({
      where: { tenantId: TEST_TENANT_ID, documentId: DOC_ID_HAPPY, status: "ACTIVE" },
    })
    expect(paymentBefore).toBeTruthy()

    const result = await deleteStatement(
      prisma, TEST_TENANT_ID, importResult.statementId, TEST_USER_ID,
    )

    expect(result.transactionsDeleted).toBe(1)
    expect(result.paymentsReversed).toBe(1)

    const stmtAfter = await prisma.bankStatement.findFirst({
      where: { tenantId: TEST_TENANT_ID, id: importResult.statementId },
    })
    expect(stmtAfter).toBeNull()

    const txAfter = await prisma.bankTransaction.count({
      where: { tenantId: TEST_TENANT_ID },
    })
    expect(txAfter).toBe(0)

    const allocAfter = await prisma.billingDocumentBankAllocation.count({
      where: { tenantId: TEST_TENANT_ID },
    })
    expect(allocAfter).toBe(0)

    const paymentAfter = await prisma.billingPayment.findFirst({
      where: { tenantId: TEST_TENANT_ID, documentId: DOC_ID_HAPPY, status: "ACTIVE" },
    })
    expect(paymentAfter).toBeNull()

    const auditRow = await prisma.auditLog.findFirst({
      where: { tenantId: TEST_TENANT_ID, action: "delete", entityType: "bank_statement" },
    })
    expect(auditRow).toBeTruthy()
  })

  it("deleteStatement debit: reverses inbound invoice payment and resets paymentStatus", async () => {
    await prisma.inboundInvoice.create({
      data: {
        id: INB_INV_ID_DEBIT,
        tenantId: TEST_TENANT_ID,
        number: "ER-1",
        invoiceNumber: "LF-DEL-001",
        totalGross: 500,
        sellerIban: bankCtx.supplierAddress.iban,
        supplierId: bankCtx.supplierAddress.addressId,
        dueDate: new Date("2026-04-14"),
        status: "APPROVED",
        paymentStatus: "UNPAID",
        paidAmount: 0,
      },
    })

    const xml = buildDebitXml({
      amount: "500.00",
      iban: bankCtx.supplierAddress.iban,
      remittance: "Zahlung LF-DEL-001",
    })

    const importResult = await importCamtStatement(
      prisma, TEST_TENANT_ID,
      { fileBase64: toB64(xml), fileName: "delete-debit.xml" },
      TEST_USER_ID,
    )
    expect(importResult.autoMatched).toBe(1)

    const invoiceBefore = await prisma.inboundInvoice.findUnique({
      where: { id: INB_INV_ID_DEBIT },
    })
    expect(invoiceBefore?.paymentStatus).toBe("PAID")

    const result = await deleteStatement(
      prisma, TEST_TENANT_ID, importResult.statementId, TEST_USER_ID,
    )

    expect(result.transactionsDeleted).toBe(1)
    expect(result.paymentsReversed).toBe(1)

    const invoiceAfter = await prisma.inboundInvoice.findUnique({
      where: { id: INB_INV_ID_DEBIT },
    })
    expect(invoiceAfter?.paymentStatus).toBe("UNPAID")
    expect(invoiceAfter?.paidAmount).toBe(0)
    expect(invoiceAfter?.paidAt).toBeNull()
  })

  it("deleteStatement: not found throws BankStatementNotFoundError", async () => {
    await expect(
      deleteStatement(prisma, TEST_TENANT_ID, "00000000-0000-4000-a000-000000000000", TEST_USER_ID),
    ).rejects.toThrow("Statement not found")
  })
})
