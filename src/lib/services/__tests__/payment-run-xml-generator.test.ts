/**
 * Unit tests for pain.001.001.09 generator.
 *
 * Acts as the smoke + regression test: asserts the generated XML contains
 * all required ISO 20022 elements, uses structured postal address
 * (TwnNm/Ctry, not AdrLine), and derives the control sum correctly.
 */
import { describe, it, expect } from "vitest"
import {
  generatePain001V09,
  type XmlPaymentRun,
} from "../payment-run-xml-generator"

const FIXED_DATE = new Date("2026-04-15T10:00:00Z")

function makeRun(): XmlPaymentRun {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    number: "PR-2026-001",
    executionDate: new Date("2026-04-16T00:00:00Z"),
    debtorName: "Terp Test GmbH",
    debtorIban: "DE89370400440532013000",
    debtorBic: "COBADEFFXXX",
    totalAmountCents: 150025n, // €1500.25
    itemCount: 2,
    items: [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        endToEndId: "INV-42",
        effectiveCreditorName: "Musterfirma GmbH",
        effectiveIban: "DE44500105175407324931",
        effectiveBic: "INGDDEFFXXX",
        effectiveStreet: "Musterstr. 1",
        effectiveZip: "10115",
        effectiveCity: "Musterstadt",
        effectiveCountry: "DE",
        effectiveAmountCents: 119000n,
        effectiveCurrency: "EUR",
        effectiveRemittanceInfo: "INV-42",
      },
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        endToEndId: "INV-43",
        effectiveCreditorName: "Beispiel AG",
        effectiveIban: "FR1420041010050500013M02606",
        effectiveBic: null,
        effectiveStreet: null,
        effectiveZip: null,
        effectiveCity: "Paris",
        effectiveCountry: "FR",
        effectiveAmountCents: 31025n,
        effectiveCurrency: "EUR",
        effectiveRemittanceInfo: "INV-43",
      },
    ],
  }
}

describe("generatePain001V09", () => {
  it("emits namespace pain.001.001.09", async () => {
    const { xml } = await generatePain001V09({
      paymentRun: makeRun(),
      msgId: "PR-2026-001",
      creationDateTime: FIXED_DATE,
      initiatingPartyName: "Terp Test GmbH",
      debtorIban: "DE89370400440532013000",
      debtorBic: "COBADEFFXXX",
      debtorName: "Terp Test GmbH",
    })
    expect(xml).toContain(
      'xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.09"'
    )
  })

  it("uses structured PstlAdr with TwnNm + Ctry (not AdrLine)", async () => {
    const { xml } = await generatePain001V09({
      paymentRun: makeRun(),
      msgId: "PR-2026-001",
      creationDateTime: FIXED_DATE,
      initiatingPartyName: "Terp Test GmbH",
      debtorIban: "DE89370400440532013000",
      debtorBic: "COBADEFFXXX",
      debtorName: "Terp Test GmbH",
    })
    expect(xml).toMatch(/<TwnNm>Musterstadt<\/TwnNm>/)
    expect(xml).toMatch(/<Ctry>DE<\/Ctry>/)
    expect(xml).toMatch(/<TwnNm>Paris<\/TwnNm>/)
    expect(xml).toMatch(/<Ctry>FR<\/Ctry>/)
    expect(xml).not.toContain("<AdrLine>")
  })

  it("emits all mandatory SEPA elements", async () => {
    const { xml } = await generatePain001V09({
      paymentRun: makeRun(),
      msgId: "PR-2026-001",
      creationDateTime: FIXED_DATE,
      initiatingPartyName: "Terp Test GmbH",
      debtorIban: "DE89370400440532013000",
      debtorBic: "COBADEFFXXX",
      debtorName: "Terp Test GmbH",
    })
    expect(xml).toContain("<PmtMtd>TRF</PmtMtd>")
    expect(xml).toContain("<BtchBookg>true</BtchBookg>")
    expect(xml).toMatch(/<SvcLvl>\s*<Cd>SEPA<\/Cd>\s*<\/SvcLvl>/)
    expect(xml).toContain("<ChrgBr>SLEV</ChrgBr>")
    expect(xml).toMatch(/<MsgId>PR-2026-001<\/MsgId>/)
    expect(xml).toMatch(/<ReqdExctnDt>\s*<Dt>2026-04-16<\/Dt>\s*<\/ReqdExctnDt>/)
  })

  it("derives ctrl sum and nb-of-txs from items", async () => {
    const { xml } = await generatePain001V09({
      paymentRun: makeRun(),
      msgId: "PR-2026-001",
      creationDateTime: FIXED_DATE,
      initiatingPartyName: "Terp Test GmbH",
      debtorIban: "DE89370400440532013000",
      debtorBic: "COBADEFFXXX",
      debtorName: "Terp Test GmbH",
    })
    const nbOfTxs = xml.match(/<NbOfTxs>(\d+)<\/NbOfTxs>/g)
    expect(nbOfTxs?.[0]).toMatch(/<NbOfTxs>2<\/NbOfTxs>/)
    expect(xml).toMatch(/<CtrlSum>1500\.25<\/CtrlSum>/)
  })

  it("emits Amt with Ccy attribute and instructed amount", async () => {
    const { xml } = await generatePain001V09({
      paymentRun: makeRun(),
      msgId: "PR-2026-001",
      creationDateTime: FIXED_DATE,
      initiatingPartyName: "Terp Test GmbH",
      debtorIban: "DE89370400440532013000",
      debtorBic: "COBADEFFXXX",
      debtorName: "Terp Test GmbH",
    })
    expect(xml).toMatch(/<InstdAmt Ccy="EUR">1190\.00<\/InstdAmt>/)
    expect(xml).toMatch(/<InstdAmt Ccy="EUR">310\.25<\/InstdAmt>/)
  })

  it("uses NOTPROVIDED fallback when debtorBic is null", async () => {
    const { xml } = await generatePain001V09({
      paymentRun: makeRun(),
      msgId: "PR-2026-001",
      creationDateTime: FIXED_DATE,
      initiatingPartyName: "Terp Test GmbH",
      debtorIban: "DE89370400440532013000",
      debtorBic: null,
      debtorName: "Terp Test GmbH",
    })
    // DbtrAgt → FinInstnId → Othr/Id (not BICFI)
    const dbtrAgtMatch = xml.match(/<DbtrAgt>[\s\S]*?<\/DbtrAgt>/)
    expect(dbtrAgtMatch).not.toBeNull()
    expect(dbtrAgtMatch![0]).toContain("NOTPROVIDED")
    expect(dbtrAgtMatch![0]).not.toContain("BICFI")
  })

  it("returns a stable sha-256 checksum", async () => {
    const { checksum } = await generatePain001V09({
      paymentRun: makeRun(),
      msgId: "PR-2026-001",
      creationDateTime: FIXED_DATE,
      initiatingPartyName: "Terp Test GmbH",
      debtorIban: "DE89370400440532013000",
      debtorBic: "COBADEFFXXX",
      debtorName: "Terp Test GmbH",
    })
    expect(checksum).toMatch(/^[0-9a-f]{64}$/)
  })

  it("throws when items is empty", async () => {
    const run: XmlPaymentRun = { ...makeRun(), items: [], itemCount: 0 }
    await expect(
      generatePain001V09({
        paymentRun: run,
        msgId: "PR-2026-001",
        creationDateTime: FIXED_DATE,
        initiatingPartyName: "Terp Test GmbH",
        debtorIban: "DE89370400440532013000",
        debtorBic: null,
        debtorName: "Terp Test GmbH",
      })
    ).rejects.toThrow(/empty payment run/i)
  })
})
