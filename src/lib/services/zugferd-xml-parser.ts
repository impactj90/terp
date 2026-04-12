import { XMLParser } from "fast-xml-parser"

// --- Types ---

export interface ParsedInvoice {
  invoiceNumber: string | null
  invoiceDate: string | null
  invoiceTypeCode: string | null
  currency: string | null
  dueDate: string | null
  sellerName: string | null
  sellerVatId: string | null
  sellerTaxNumber: string | null
  sellerStreet: string | null
  sellerZip: string | null
  sellerCity: string | null
  sellerCountry: string | null
  sellerIban: string | null
  sellerBic: string | null
  buyerName: string | null
  buyerVatId: string | null
  buyerReference: string | null
  totalNet: number | null
  totalVat: number | null
  totalGross: number | null
  amountDue: number | null
  paymentTermDays: number | null
  lineItems: ParsedLineItem[]
  profile: string | null
}

export interface ParsedLineItem {
  lineId: string | null
  description: string | null
  quantity: number | null
  unit: string | null
  unitPriceNet: number | null
  totalNet: number | null
  vatRate: number | null
  vatAmount: number | null
  articleNumber: string | null
}

// --- Profile Detection ---

const PROFILE_MAP: Record<string, string> = {
  "urn:factur-x.eu:1p0:minimum": "MINIMUM",
  "urn:factur-x.eu:1p0:basicwl": "BASIC_WL",
  "urn:factur-x.eu:1p0:basic": "BASIC",
  "urn:cen.eu:en16931:2017": "EN16931",
  "urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:en16931": "EN16931",
  "urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:extended": "EXTENDED",
  "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0": "XRECHNUNG",
  "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_2.0": "XRECHNUNG",
  "urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_2.3": "XRECHNUNG",
  "urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_2.2": "XRECHNUNG",
  "urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_2.1": "XRECHNUNG",
  "urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_2.0": "XRECHNUNG",
  "urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_1.2": "XRECHNUNG",
}

// --- Helpers ---

function str(val: unknown): string | null {
  if (val == null) return null
  if (typeof val === "object" && "#text" in (val as Record<string, unknown>)) {
    return String((val as Record<string, unknown>)["#text"])
  }
  return String(val)
}

function num(val: unknown): number | null {
  const s = str(val)
  if (s == null) return null
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

function parseCiiDate(val: unknown): string | null {
  if (val == null) return null
  // Handle nested DateTimeString object
  let dateStr: string | null = null
  if (typeof val === "object" && val !== null) {
    const obj = val as Record<string, unknown>
    // <udt:DateTimeString format="102">20180305</udt:DateTimeString>
    const dts =
      obj["udt:DateTimeString"] ??
      obj["DateTimeString"] ??
      obj["#text"]
    dateStr = str(dts)
  } else {
    dateStr = str(val)
  }
  if (!dateStr) return null

  // YYYYMMDD → YYYY-MM-DD
  const cleaned = dateStr.replace(/\D/g, "")
  if (cleaned.length === 8) {
    return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 8)}`
  }
  return dateStr
}

function ensureArray<T>(val: T | T[] | undefined | null): T[] {
  if (val == null) return []
  return Array.isArray(val) ? val : [val]
}

function extractPaymentTermDays(description: string | null): number | null {
  if (!description) return null
  // "Zahlbar innerhalb 30 Tagen" → 30
  const match = description.match(/(\d+)\s*Tag/i)
  return match?.[1] ? parseInt(match[1], 10) : null
}

// --- Parser ---

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: false,
  isArray: (name) => {
    return name === "ram:IncludedSupplyChainTradeLineItem" ||
      name === "ram:ApplicableTradeTax" ||
      name === "ram:SpecifiedTaxRegistration"
  },
})

export function parseZugferdXml(xmlBuffer: Buffer): ParsedInvoice {
  const xmlStr = xmlBuffer.toString("utf-8")
  const doc = parser.parse(xmlStr)

  const root =
    doc["rsm:CrossIndustryInvoice"] ??
    doc["CrossIndustryInvoice"] ??
    {}

  const exchangedDoc =
    root["rsm:ExchangedDocument"] ??
    root["ExchangedDocument"] ??
    {}

  const transaction =
    root["rsm:SupplyChainTradeTransaction"] ??
    root["SupplyChainTradeTransaction"] ??
    {}

  const agreement =
    transaction["ram:ApplicableHeaderTradeAgreement"] ??
    transaction["ApplicableHeaderTradeAgreement"] ??
    {}

  const settlement =
    transaction["ram:ApplicableHeaderTradeSettlement"] ??
    transaction["ApplicableHeaderTradeSettlement"] ??
    {}

  const monetarySummation =
    settlement["ram:SpecifiedTradeSettlementHeaderMonetarySummation"] ??
    settlement["SpecifiedTradeSettlementHeaderMonetarySummation"] ??
    {}

  // --- Seller (BG-4) ---
  const seller =
    agreement["ram:SellerTradeParty"] ??
    agreement["SellerTradeParty"] ??
    {}

  const sellerAddress =
    seller["ram:PostalTradeAddress"] ??
    seller["PostalTradeAddress"] ??
    {}

  const sellerTaxRegs = ensureArray(
    seller["ram:SpecifiedTaxRegistration"] ??
    seller["SpecifiedTaxRegistration"]
  )

  let sellerVatId: string | null = null
  let sellerTaxNumber: string | null = null
  for (const reg of sellerTaxRegs) {
    const id = reg["ram:ID"] ?? reg["ID"]
    const schemeId = typeof id === "object" ? id["@_schemeID"] : null
    const value = str(id)
    if (schemeId === "VA") sellerVatId = value
    else if (schemeId === "FC") sellerTaxNumber = value
  }

  // Seller bank account
  const sellerPayment =
    settlement["ram:SpecifiedTradeSettlementPaymentMeans"] ??
    settlement["SpecifiedTradeSettlementPaymentMeans"] ??
    {}
  const payeeAccount =
    sellerPayment["ram:PayeePartyDebtorFinancialAccount"] ??
    sellerPayment["PayeePartyDebtorFinancialAccount"] ??
    sellerPayment["ram:PayeeSpecifiedCreditorFinancialInstitution"] ??
    {}
  const creditorAccount =
    sellerPayment["ram:PayeeSpecifiedCreditorFinancialInstitution"] ??
    sellerPayment["PayeeSpecifiedCreditorFinancialInstitution"] ??
    {}

  // --- Buyer (BG-7) ---
  const buyer =
    agreement["ram:BuyerTradeParty"] ??
    agreement["BuyerTradeParty"] ??
    {}

  const buyerTaxRegs = ensureArray(
    buyer["ram:SpecifiedTaxRegistration"] ??
    buyer["SpecifiedTaxRegistration"]
  )
  let buyerVatId: string | null = null
  for (const reg of buyerTaxRegs) {
    const id = reg["ram:ID"] ?? reg["ID"]
    const schemeId = typeof id === "object" ? id["@_schemeID"] : null
    const value = str(id)
    if (schemeId === "VA") buyerVatId = value
  }

  // Buyer reference (BT-10 Leitweg-ID)
  const buyerReference = str(
    agreement["ram:BuyerReference"] ?? agreement["BuyerReference"]
  )

  // --- Payment terms ---
  const paymentTerms =
    settlement["ram:SpecifiedTradePaymentTerms"] ??
    settlement["SpecifiedTradePaymentTerms"] ??
    {}
  const paymentTermDesc = str(
    paymentTerms["ram:Description"] ?? paymentTerms["Description"]
  )
  const dueDateRaw =
    paymentTerms["ram:DueDateDateTime"] ?? paymentTerms["DueDateDateTime"]

  // --- VAT total ---
  const taxTotalObj =
    monetarySummation["ram:TaxTotalAmount"] ??
    monetarySummation["TaxTotalAmount"]
  const totalVat = num(taxTotalObj)

  // --- Line items ---
  const lineItemsRaw = ensureArray(
    transaction["ram:IncludedSupplyChainTradeLineItem"] ??
    transaction["IncludedSupplyChainTradeLineItem"]
  )

  const lineItems: ParsedLineItem[] = lineItemsRaw.map((item) => {
    const lineDoc =
      item["ram:AssociatedDocumentLineDocument"] ??
      item["AssociatedDocumentLineDocument"] ??
      {}
    const product =
      item["ram:SpecifiedTradeProduct"] ??
      item["SpecifiedTradeProduct"] ??
      {}
    const lineAgreement =
      item["ram:SpecifiedLineTradeAgreement"] ??
      item["SpecifiedLineTradeAgreement"] ??
      {}
    const lineDelivery =
      item["ram:SpecifiedLineTradeDelivery"] ??
      item["SpecifiedLineTradeDelivery"] ??
      {}
    const lineSettlement =
      item["ram:SpecifiedLineTradeSettlement"] ??
      item["SpecifiedLineTradeSettlement"] ??
      {}
    const lineSummation =
      lineSettlement["ram:SpecifiedTradeSettlementLineMonetarySummation"] ??
      lineSettlement["SpecifiedTradeSettlementLineMonetarySummation"] ??
      {}
    const lineTax = ensureArray(
      lineSettlement["ram:ApplicableTradeTax"] ??
      lineSettlement["ApplicableTradeTax"]
    )[0] ?? {}

    const netPrice =
      lineAgreement["ram:NetPriceProductTradePrice"] ??
      lineAgreement["NetPriceProductTradePrice"] ??
      {}

    const billedQty =
      lineDelivery["ram:BilledQuantity"] ??
      lineDelivery["BilledQuantity"]
    const qtyVal = num(billedQty)
    const unit = typeof billedQty === "object" ? billedQty["@_unitCode"] ?? null : null

    return {
      lineId: str(lineDoc["ram:LineID"] ?? lineDoc["LineID"]),
      description: str(product["ram:Name"] ?? product["Name"]),
      quantity: qtyVal,
      unit,
      unitPriceNet: num(
        netPrice["ram:ChargeAmount"] ?? netPrice["ChargeAmount"]
      ),
      totalNet: num(
        lineSummation["ram:LineTotalAmount"] ?? lineSummation["LineTotalAmount"]
      ),
      vatRate: num(
        lineTax["ram:RateApplicablePercent"] ?? lineTax["RateApplicablePercent"]
      ),
      vatAmount: null, // CII doesn't always carry per-line VAT amount
      articleNumber: str(
        product["ram:SellerAssignedID"] ?? product["SellerAssignedID"]
      ),
    }
  })

  // --- Profile ---
  const context =
    root["rsm:ExchangedDocumentContext"] ??
    root["ExchangedDocumentContext"] ??
    {}
  const guidelineParam =
    context["ram:GuidelineSpecifiedDocumentContextParameter"] ??
    context["GuidelineSpecifiedDocumentContextParameter"] ??
    {}
  const guidelineId = str(
    guidelineParam["ram:ID"] ?? guidelineParam["ID"]
  )
  const profile = guidelineId ? (PROFILE_MAP[guidelineId] ?? guidelineId) : null

  return {
    invoiceNumber: str(exchangedDoc["ram:ID"] ?? exchangedDoc["ID"]),
    invoiceDate: parseCiiDate(
      exchangedDoc["ram:IssueDateTime"] ?? exchangedDoc["IssueDateTime"]
    ),
    invoiceTypeCode: str(
      exchangedDoc["ram:TypeCode"] ?? exchangedDoc["TypeCode"]
    ),
    currency: str(
      settlement["ram:InvoiceCurrencyCode"] ?? settlement["InvoiceCurrencyCode"]
    ),
    dueDate: parseCiiDate(dueDateRaw),
    sellerName: str(seller["ram:Name"] ?? seller["Name"]),
    sellerVatId,
    sellerTaxNumber,
    sellerStreet: str(
      sellerAddress["ram:LineOne"] ?? sellerAddress["LineOne"]
    ),
    sellerZip: str(
      sellerAddress["ram:PostcodeCode"] ?? sellerAddress["PostcodeCode"]
    ),
    sellerCity: str(
      sellerAddress["ram:CityName"] ?? sellerAddress["CityName"]
    ),
    sellerCountry: str(
      sellerAddress["ram:CountryID"] ?? sellerAddress["CountryID"]
    ),
    sellerIban: str(
      payeeAccount["ram:IBANID"] ?? payeeAccount["IBANID"]
    ),
    sellerBic: str(
      creditorAccount["ram:BICID"] ?? creditorAccount["BICID"]
    ),
    buyerName: str(buyer["ram:Name"] ?? buyer["Name"]),
    buyerVatId,
    buyerReference,
    totalNet: num(
      monetarySummation["ram:TaxBasisTotalAmount"] ??
      monetarySummation["TaxBasisTotalAmount"]
    ),
    totalVat,
    totalGross: num(
      monetarySummation["ram:GrandTotalAmount"] ??
      monetarySummation["GrandTotalAmount"]
    ),
    amountDue: num(
      monetarySummation["ram:DuePayableAmount"] ??
      monetarySummation["DuePayableAmount"]
    ),
    paymentTermDays: extractPaymentTermDays(paymentTermDesc),
    lineItems,
    profile,
  }
}

/**
 * Detect the ZUGFeRD profile from an XML buffer without full parsing.
 */
export function detectProfile(xmlBuffer: Buffer): string | null {
  const xmlStr = xmlBuffer.toString("utf-8")
  const doc = parser.parse(xmlStr)
  const root =
    doc["rsm:CrossIndustryInvoice"] ??
    doc["CrossIndustryInvoice"] ??
    {}
  const context =
    root["rsm:ExchangedDocumentContext"] ??
    root["ExchangedDocumentContext"] ??
    {}
  const guidelineParam =
    context["ram:GuidelineSpecifiedDocumentContextParameter"] ??
    context["GuidelineSpecifiedDocumentContextParameter"] ??
    {}
  const id = str(guidelineParam["ram:ID"] ?? guidelineParam["ID"])
  return id ? (PROFILE_MAP[id] ?? id) : null
}
