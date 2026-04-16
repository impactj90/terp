/**
 * CAMT.053 Test-Fixture-Generator.
 *
 * Liest den aktuellen Stand der lokalen Dev-DB und generiert eine valide
 * CAMT.053.001.08-XML, deren Buchungen auf reale Adressen, IBANs und
 * offene Rechnungen des Default-Tenants (`dev-company`) matchen. Wird
 * zur manuellen Verifikation des Upload-Flows aus Phase 4 des Plans
 * `thoughts/shared/plans/2026-04-14-camt053-import.md` benutzt.
 *
 * Usage:
 *   pnpm tsx scripts/generate-camt-test-fixture.ts
 *   TENANT_SLUG=dev-company pnpm tsx scripts/generate-camt-test-fixture.ts
 *
 * Output:
 *   tmp/camt-test-{timestamp}.xml — pro Lauf eine neue Datei, damit der
 *   SHA-256-Dedup-Schutz nicht triggert.
 *
 * Konsolen-Ausgabe:
 *   Pro Buchung eine Zeile mit Betrag, Counterparty und erwartetem
 *   Match-Verhalten ("AUTO-MATCH" / "UNMATCHED"). Nach dem Upload im UI
 *   lässt sich in Prisma Studio direkt gegenprüfen, ob `bank_transactions`
 *   die erwarteten Rows trägt.
 *
 * Das Script macht KEINE DB-Mutationen und lädt NICHTS in den Storage-
 * Bucket. Es liest nur.
 */
import { config as loadDotenv } from "dotenv"
import { resolve } from "node:path"
import * as fs from "node:fs"

// Env laden, bevor der Prisma-Client importiert wird, damit DATABASE_URL
// für den CLI-Lauf korrekt gesetzt ist.
const externalDbUrl = process.env.DATABASE_URL
loadDotenv({ path: resolve(process.cwd(), ".env") })
loadDotenv({ path: resolve(process.cwd(), ".env.local"), override: true })
if (externalDbUrl) {
  process.env.DATABASE_URL = externalDbUrl
}

import { PrismaPg } from "@prisma/adapter-pg"
import pg from "pg"
import { PrismaClient } from "@/generated/prisma/client"

const TENANT_SLUG = process.env.TENANT_SLUG ?? "dev-company"

// Unrelated IBAN for scenario (c). MOD-97 valid, aber garantiert nicht
// in `crm_bank_accounts` — genug "unrealistisch" für den Dev-Seed.
const FOREIGN_UNMATCHED_IBAN = "DE91100000000123456789"
const FOREIGN_UNMATCHED_NAME = "Unbekannter Absender GmbH"

function createPrisma(): PrismaClient {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL ist nicht gesetzt. Stelle sicher, dass .env.local existiert.",
    )
  }
  const isRemote =
    connectionString.includes("supabase.co") ||
    connectionString.includes("pooler.supabase.com")
  const pool = new pg.Pool({
    connectionString,
    ssl: isRemote ? { rejectUnauthorized: false } : undefined,
  })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter })
}

function normalizeIban(iban: string): string {
  return iban.replace(/\s+/g, "").toUpperCase()
}

function formatEur(amount: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(amount)
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function toIsoDateTime(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "")
}

interface Entry {
  direction: "CREDIT" | "DEBIT"
  amount: number
  counterpartyIban: string
  counterpartyName: string
  remittanceInfo: string
  endToEndId: string
  bankRef: string
  matchLabel: string
}

function buildEntry(entry: Entry, bookingDate: Date, valueDate: Date): string {
  const { direction, amount, counterpartyIban, counterpartyName } = entry
  const cdtDbtInd = direction === "CREDIT" ? "CRDT" : "DBIT"
  const amt = amount.toFixed(2)
  const partyBlock =
    direction === "CREDIT"
      ? `<RltdPties>
          <Dbtr><Nm>${xmlEscape(counterpartyName)}</Nm></Dbtr>
          <DbtrAcct><Id><IBAN>${xmlEscape(counterpartyIban)}</IBAN></Id></DbtrAcct>
        </RltdPties>`
      : `<RltdPties>
          <Cdtr><Nm>${xmlEscape(counterpartyName)}</Nm></Cdtr>
          <CdtrAcct><Id><IBAN>${xmlEscape(counterpartyIban)}</IBAN></Id></CdtrAcct>
        </RltdPties>`

  return `      <Ntry>
        <Amt Ccy="EUR">${amt}</Amt>
        <CdtDbtInd>${cdtDbtInd}</CdtDbtInd>
        <Sts><Cd>BOOK</Cd></Sts>
        <BookgDt><Dt>${toIsoDate(bookingDate)}</Dt></BookgDt>
        <ValDt><Dt>${toIsoDate(valueDate)}</Dt></ValDt>
        <AcctSvcrRef>${xmlEscape(entry.bankRef)}</AcctSvcrRef>
        <BkTxCd>
          <Domn>
            <Cd>PMNT</Cd>
            <Fmly>
              <Cd>${direction === "CREDIT" ? "RCDT" : "ICDT"}</Cd>
              <SubFmlyCd>ESCT</SubFmlyCd>
            </Fmly>
          </Domn>
        </BkTxCd>
        <NtryDtls>
          <TxDtls>
            <Refs><EndToEndId>${xmlEscape(entry.endToEndId)}</EndToEndId></Refs>
            <Amt Ccy="EUR">${amt}</Amt>
            ${partyBlock}
            <RmtInf><Ustrd>${xmlEscape(entry.remittanceInfo)}</Ustrd></RmtInf>
          </TxDtls>
        </NtryDtls>
      </Ntry>`
}

function buildStatement(opts: {
  statementId: string
  accountIban: string
  periodFrom: Date
  periodTo: Date
  openingBalance: number
  closingBalance: number
  entries: string[]
}): string {
  const {
    statementId,
    accountIban,
    periodFrom,
    periodTo,
    openingBalance,
    closingBalance,
    entries,
  } = opts
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">
  <BkToCstmrStmt>
    <GrpHdr>
      <MsgId>${xmlEscape(statementId)}</MsgId>
      <CreDtTm>${toIsoDateTime(new Date())}</CreDtTm>
    </GrpHdr>
    <Stmt>
      <Id>${xmlEscape(statementId)}</Id>
      <CreDtTm>${toIsoDateTime(new Date())}</CreDtTm>
      <Acct>
        <Id><IBAN>${xmlEscape(accountIban)}</IBAN></Id>
        <Ccy>EUR</Ccy>
      </Acct>
      <FrToDt>
        <FrDtTm>${toIsoDateTime(periodFrom)}</FrDtTm>
        <ToDtTm>${toIsoDateTime(periodTo)}</ToDtTm>
      </FrToDt>
      <Bal>
        <Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="EUR">${openingBalance.toFixed(2)}</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>${toIsoDate(periodFrom)}</Dt></Dt>
      </Bal>
      <Bal>
        <Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="EUR">${closingBalance.toFixed(2)}</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>${toIsoDate(periodTo)}</Dt></Dt>
      </Bal>
${entries.join("\n")}
    </Stmt>
  </BkToCstmrStmt>
</Document>
`
}

async function main() {
  const prisma = createPrisma()

  try {
    const tenant = await prisma.tenant.findFirst({
      where: { slug: TENANT_SLUG, isActive: true },
    })
    if (!tenant) {
      throw new Error(
        `Kein aktiver Tenant mit slug="${TENANT_SLUG}" gefunden. Nutze TENANT_SLUG=<slug> pnpm tsx ...`,
      )
    }

    const config = await prisma.billingTenantConfig.findFirst({
      where: { tenantId: tenant.id },
      select: { iban: true },
    })
    if (!config?.iban) {
      throw new Error(
        `Tenant ${tenant.slug} hat keine IBAN in billing_tenant_configs gesetzt.`,
      )
    }
    const ownIban = normalizeIban(config.iban)

    // --- Szenario (a): offene Ausgangsrechnung an Customer mit IBAN ---
    const openInvoices = await prisma.billingDocument.findMany({
      where: {
        tenantId: tenant.id,
        type: "INVOICE",
        status: { in: ["PRINTED", "PARTIALLY_FORWARDED", "FORWARDED"] },
      },
      include: {
        payments: { where: { status: "ACTIVE" }, select: { amount: true } },
        address: {
          include: {
            bankAccounts: { orderBy: { isDefault: "desc" } },
          },
        },
      },
      orderBy: { documentDate: "asc" },
    })

    const creditCandidates = openInvoices
      .map((inv) => {
        const paid = inv.payments.reduce((sum, p) => sum + p.amount, 0)
        const openAmount = Number((inv.totalGross - paid).toFixed(2))
        const iban = inv.address.bankAccounts[0]?.iban ?? null
        return { inv, paid, openAmount, iban }
      })
      .filter((c) => c.iban && c.openAmount > 0.01)

    const creditChoice = creditCandidates[0] ?? null

    // --- Szenario (b): offene Eingangsrechnung + Supplier mit IBAN ---
    const openInboundInvoices = await prisma.inboundInvoice.findMany({
      where: {
        tenantId: tenant.id,
        status: { in: ["APPROVED", "EXPORTED"] },
        paymentStatus: { in: ["UNPAID", "PARTIAL"] },
      },
      include: {
        inboundPayments: {
          where: { status: "ACTIVE" },
          select: { amount: true },
        },
        supplier: {
          include: {
            bankAccounts: { orderBy: { isDefault: "desc" } },
          },
        },
      },
      orderBy: { invoiceDate: "asc" },
    })

    const debitCandidates = openInboundInvoices
      .map((inv) => {
        const paid = inv.inboundPayments.reduce((sum, p) => sum + p.amount, 0)
        const gross = Number(inv.totalGross ?? 0)
        const openAmount = Number((gross - paid).toFixed(2))
        const iban =
          (inv.sellerIban ? normalizeIban(inv.sellerIban) : null) ??
          inv.supplier?.bankAccounts[0]?.iban ??
          null
        const supplierName = inv.supplier?.company ?? inv.sellerName ?? null
        const invoiceNumber = inv.invoiceNumber ?? inv.number
        return { inv, paid, openAmount, iban, supplierName, invoiceNumber }
      })
      .filter(
        (c) => c.iban && c.supplierName && c.invoiceNumber && c.openAmount > 0.01,
      )

    const debitChoice = debitCandidates[0] ?? null

    // --- Bauen der Einträge ---
    const today = new Date()
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
    const twoDaysAgo = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000)
    const periodFrom = new Date(today.getFullYear(), today.getMonth(), 1)
    const periodTo = today

    const ts = new Date()
    const tsStamp = `${ts.toISOString().replace(/[-:.TZ]/g, "")}`.slice(0, 14)

    const entriesXml: string[] = []
    const summaryLines: string[] = []
    let openingBalance = 0
    let closingBalance = 0

    if (creditChoice) {
      const normalizedIban = normalizeIban(creditChoice.iban!)
      entriesXml.push(
        buildEntry(
          {
            direction: "CREDIT",
            amount: creditChoice.openAmount,
            counterpartyIban: normalizedIban,
            counterpartyName: creditChoice.inv.address.company ?? "Kunde",
            remittanceInfo: `Rechnung ${creditChoice.inv.number}`,
            endToEndId: `E2E-CREDIT-${tsStamp}-${creditChoice.inv.number}`,
            bankRef: `REF-CR-${tsStamp}-A`,
          },
          yesterday,
          yesterday,
        ),
      )
      closingBalance += creditChoice.openAmount
      summaryLines.push(
        `  ✓ (a) CREDIT ${formatEur(creditChoice.openAmount)} von "${creditChoice.inv.address.company}" → Rechnung ${creditChoice.inv.number} (sollte AUTO-MATCH werden, Counterparty-IBAN ${normalizedIban})`,
      )
    } else {
      summaryLines.push(
        "  ✗ (a) CREDIT übersprungen: keine offene Ausgangsrechnung mit Customer-IBAN gefunden",
      )
    }

    if (debitChoice) {
      const normalizedIban = normalizeIban(debitChoice.iban!)
      entriesXml.push(
        buildEntry(
          {
            direction: "DEBIT",
            amount: debitChoice.openAmount,
            counterpartyIban: normalizedIban,
            counterpartyName: debitChoice.supplierName!,
            remittanceInfo: `Eingangsrechnung ${debitChoice.invoiceNumber}`,
            endToEndId: `E2E-DEBIT-${tsStamp}-${debitChoice.invoiceNumber}`,
            bankRef: `REF-DB-${tsStamp}-B`,
          },
          yesterday,
          yesterday,
        ),
      )
      closingBalance -= debitChoice.openAmount
      summaryLines.push(
        `  ✓ (b) DEBIT ${formatEur(debitChoice.openAmount)} an "${debitChoice.supplierName}" → Eingangsrechnung ${debitChoice.invoiceNumber} (sollte AUTO-MATCH werden, Counterparty-IBAN ${normalizedIban})`,
      )
    } else {
      summaryLines.push(
        "  ✗ (b) DEBIT übersprungen: keine offene Eingangsrechnung mit Supplier-IBAN gefunden",
      )
    }

    // --- Szenario (c): unbekannte IBAN, garantiert unmatched ---
    const unmatchedAmount = 123.45
    entriesXml.push(
      buildEntry(
        {
          direction: "CREDIT",
          amount: unmatchedAmount,
          counterpartyIban: FOREIGN_UNMATCHED_IBAN,
          counterpartyName: FOREIGN_UNMATCHED_NAME,
          remittanceInfo: "Zahlung ohne Referenz — Test unmatched",
          endToEndId: `E2E-UNMATCHED-${tsStamp}`,
          bankRef: `REF-CR-${tsStamp}-C`,
        },
        twoDaysAgo,
        twoDaysAgo,
      ),
    )
    closingBalance += unmatchedAmount
    summaryLines.push(
      `  ✓ (c) CREDIT ${formatEur(unmatchedAmount)} von "${FOREIGN_UNMATCHED_NAME}" (IBAN ${FOREIGN_UNMATCHED_IBAN}) → sollte UNMATCHED in der Inbox landen`,
    )

    // --- Statement zusammenbauen ---
    const statementId = `TERP-DEV-${tsStamp}`
    const xml = buildStatement({
      statementId,
      accountIban: ownIban,
      periodFrom,
      periodTo,
      openingBalance,
      closingBalance,
      entries: entriesXml,
    })

    // --- Datei schreiben ---
    const tmpDir = resolve(process.cwd(), "tmp")
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true })
    }
    const outputPath = resolve(tmpDir, `camt-test-${tsStamp}.xml`)
    fs.writeFileSync(outputPath, xml, "utf8")

    // --- Konsolen-Summary ---
    console.log()
    console.log("CAMT.053 Test-Fixture generiert")
    console.log("===============================")
    console.log(`  Tenant:       ${tenant.name} (${tenant.slug}) [${tenant.id}]`)
    console.log(`  Konto-IBAN:   ${ownIban}`)
    console.log(`  Statement-ID: ${statementId}`)
    console.log(`  Datei:        ${outputPath}`)
    console.log()
    console.log(`Enthaltene Buchungen (${entriesXml.length}):`)
    for (const line of summaryLines) {
      console.log(line)
    }
    console.log()
    console.log("Nächste Schritte:")
    console.log("  1. pnpm dev (falls noch nicht läuft)")
    console.log(
      "  2. Als BUCHHALTUNG einloggen und zu /admin/bank-statements/upload navigieren",
    )
    console.log("  3. Diese Datei hochladen")
    console.log(
      "  4. In Prisma Studio (pnpm db:studio) die Tabelle bank_transactions prüfen",
    )
    console.log(
      "     — Phase 4 hat noch keinen Matcher, alle Rows sollten status=unmatched sein",
    )
    console.log(
      "  5. Ab Phase 5/6 werden die markierten Buchungen automatisch gematcht",
    )
    console.log()
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error("Fehler beim Generieren:", err)
  process.exit(1)
})
