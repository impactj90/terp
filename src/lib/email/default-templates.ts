/**
 * Default Email Templates
 *
 * Code-level fallback templates for each document type (in German).
 * Used when a tenant has no custom template for a given document type.
 * These are NOT seeded into the database — they're returned by the
 * template service when no DB template exists.
 */

export interface DefaultTemplate {
  documentType: string
  name: string
  subject: string
  bodyHtml: string
}

const DEFAULT_TEMPLATES: Record<string, DefaultTemplate> = {
  INVOICE: {
    documentType: "INVOICE",
    name: "Standard Rechnung",
    subject: "Rechnung {Dokumentennummer}",
    bodyHtml: `<p>{Anrede}</p>
<p>anbei erhalten Sie unsere Rechnung {Dokumentennummer} über {Betrag}.</p>
<p>Bitte überweisen Sie den Betrag bis zum {Fälligkeitsdatum}.</p>
<p>Bei Rückfragen stehen wir Ihnen gerne zur Verfügung.</p>
<p>Mit freundlichen Grüßen<br/>{Firmenname}</p>`,
  },
  OFFER: {
    documentType: "OFFER",
    name: "Standard Angebot",
    subject: "Angebot {Dokumentennummer}",
    bodyHtml: `<p>{Anrede}</p>
<p>anbei erhalten Sie unser Angebot {Dokumentennummer} über {Betrag}.</p>
<p>Wir freuen uns auf Ihre Rückmeldung.</p>
<p>Mit freundlichen Grüßen<br/>{Firmenname}</p>`,
  },
  ORDER_CONFIRMATION: {
    documentType: "ORDER_CONFIRMATION",
    name: "Standard Auftragsbestätigung",
    subject: "Auftragsbestätigung {Dokumentennummer}",
    bodyHtml: `<p>{Anrede}</p>
<p>anbei erhalten Sie unsere Auftragsbestätigung {Dokumentennummer} über {Betrag}.</p>
<p>Vielen Dank für Ihren Auftrag.</p>
<p>Mit freundlichen Grüßen<br/>{Firmenname}</p>`,
  },
  CREDIT_NOTE: {
    documentType: "CREDIT_NOTE",
    name: "Standard Gutschrift",
    subject: "Gutschrift {Dokumentennummer}",
    bodyHtml: `<p>{Anrede}</p>
<p>anbei erhalten Sie unsere Gutschrift {Dokumentennummer} über {Betrag}.</p>
<p>Bei Rückfragen stehen wir Ihnen gerne zur Verfügung.</p>
<p>Mit freundlichen Grüßen<br/>{Firmenname}</p>`,
  },
  DELIVERY_NOTE: {
    documentType: "DELIVERY_NOTE",
    name: "Standard Lieferschein",
    subject: "Lieferschein {Dokumentennummer}",
    bodyHtml: `<p>{Anrede}</p>
<p>anbei erhalten Sie unseren Lieferschein {Dokumentennummer}.</p>
<p>Mit freundlichen Grüßen<br/>{Firmenname}</p>`,
  },
  SERVICE_NOTE: {
    documentType: "SERVICE_NOTE",
    name: "Standard Serviceschein",
    subject: "Serviceschein {Dokumentennummer}",
    bodyHtml: `<p>{Anrede}</p>
<p>anbei erhalten Sie unseren Serviceschein {Dokumentennummer}.</p>
<p>Mit freundlichen Grüßen<br/>{Firmenname}</p>`,
  },
  RETURN_DELIVERY: {
    documentType: "RETURN_DELIVERY",
    name: "Standard Rücklieferschein",
    subject: "Rücklieferschein {Dokumentennummer}",
    bodyHtml: `<p>{Anrede}</p>
<p>anbei erhalten Sie unseren Rücklieferschein {Dokumentennummer}.</p>
<p>Mit freundlichen Grüßen<br/>{Firmenname}</p>`,
  },
  PURCHASE_ORDER: {
    documentType: "PURCHASE_ORDER",
    name: "Standard Bestellung",
    subject: "Bestellung {Dokumentennummer}",
    bodyHtml: `<p>{Anrede}</p>
<p>anbei erhalten Sie unsere Bestellung {Dokumentennummer} über {Betrag}.</p>
<p>Mit freundlichen Grüßen<br/>{Firmenname}</p>`,
  },
}

export function getDefaultTemplate(
  documentType: string
): DefaultTemplate | null {
  return DEFAULT_TEMPLATES[documentType] ?? null
}

export function getAllDocumentTypes(): string[] {
  return Object.keys(DEFAULT_TEMPLATES)
}
