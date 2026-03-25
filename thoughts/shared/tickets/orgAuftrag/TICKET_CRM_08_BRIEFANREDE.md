# CRM_08 — Briefanrede bei Kontaktpersonen

| Field | Value |
|-------|-------|
| **Module** | CRM |
| **Dependencies** | CRM_01 (Adressen) |
| **Complexity** | S |
| **Priority** | Mittlere Priorität |
| **New Models** | — (Felderweiterung `CrmContact`) |

---

## ZMI-Referenz

ZMI orgAuftrag Kap. 2.3.2: Dediziertes Feld für die Briefanrede des Ansprechpartners, das in Belege und Reports übernommen wird (z.B. "Sehr geehrter Herr Dr. Müller", "Sehr geehrte Frau Professorin Schmidt").

---

## Terp aktuell

- Kontaktpersonen haben: Vorname, Nachname, Position, Abteilung, E-Mail, Telefon
- Kein Feld für Briefanrede oder Titel (Dr., Prof.)
- Belege und Reports können keine persönliche Anrede enthalten

---

## Goal

Zwei neue Felder bei Kontaktpersonen: `salutation` (Anrede: Herr/Frau/Divers) und `letterSalutation` (Briefanrede, z.B. "Sehr geehrter Herr Dr. Müller"). Die Briefanrede wird automatisch aus Anrede + Titel + Nachname vorgeschlagen, kann aber manuell überschrieben werden. Wird in Belegen und Reports verwendet.

---

## Schema-Änderungen

### CrmContact Erweiterung

```prisma
model CrmContact {
  // ... bestehende Felder ...
  salutation        String?  // "Herr", "Frau", "Divers"
  title             String?  // "Dr.", "Prof.", "Prof. Dr."
  letterSalutation  String?  @map("letter_salutation") // "Sehr geehrter Herr Dr. Müller"
}
```

---

## Auto-Generierung der Briefanrede

```ts
function generateLetterSalutation(salutation?: string, title?: string, lastName?: string): string {
  if (!salutation || !lastName) return ""
  const prefix = salutation === "Herr" ? "Sehr geehrter Herr" : "Sehr geehrte Frau"
  const titlePart = title ? ` ${title}` : ""
  return `${prefix}${titlePart} ${lastName}`
}
```

- Wird beim Speichern vorgeschlagen, wenn `letterSalutation` leer ist
- Manuell überschreibbar (z.B. "Lieber Hans", "Dear Mr. Miller")

---

## UI Änderungen

### Kontaktperson-Formular

In `src/components/crm/contact-form.tsx`:
- Neue Felder vor dem Vornamen:
  - **Anrede**: Dropdown (Herr / Frau / Divers)
  - **Titel**: Dropdown mit Freitext (Dr. / Prof. / Prof. Dr. / custom)
- Neues Feld nach dem Nachnamen:
  - **Briefanrede**: Textfeld mit Auto-Vorschlag (grauer Platzhalter)
  - Button "Auto-Generieren" (Pfeil-Icon)

---

## Service Layer

Minimale Änderung in `src/lib/services/crm-contact-service.ts`:
- `salutation`, `title`, `letterSalutation` in Create/Update Schema aufnehmen
- Bei Create/Update: Auto-Generierung der Briefanrede wenn Feld leer und Anrede+Name vorhanden

---

## Tests

### Unit Tests

- `generateLetterSalutation` — "Herr" + "Dr." + "Müller" → "Sehr geehrter Herr Dr. Müller"
- `generateLetterSalutation` — "Frau" + null + "Schmidt" → "Sehr geehrte Frau Schmidt"
- `generateLetterSalutation` — null + null + "Test" → ""
- `createContact` — speichert salutation, title, letterSalutation
- `updateContact` — Auto-Generierung wenn letterSalutation leer
- `updateContact` — manuelle Überschreibung bleibt erhalten

### Router Tests

```ts
describe("crm.contacts", () => {
  it("create — saves salutation and letter salutation", async () => { })
  it("update — auto-generates letter salutation", async () => { })
  it("getById — returns salutation fields", async () => { })
})
```

### E2E Tests (API) — Tenant Isolation

```ts
describe("tenant isolation", () => {
  it("Mandant A sieht Kontakte von Mandant B nicht", async () => { })
})
```

### Browser E2E Tests

**File:** `src/e2e-browser/57-crm-letter-salutation.spec.ts`

```ts
test.describe("UC-CRM-08: Briefanrede", () => {
  test("Briefanrede wird automatisch generiert", async ({ page }) => {
    // 1. Kontakt anlegen: Anrede=Herr, Titel=Dr., Nachname=Müller
    // 2. Briefanrede-Feld zeigt: "Sehr geehrter Herr Dr. Müller"
  })

  test("Briefanrede manuell überschreiben", async ({ page }) => {
    // 1. Auto-generierte Briefanrede ändern zu "Lieber Hans"
    // 2. Speichern → "Lieber Hans" bleibt erhalten
  })

  test("Briefanrede bei Anrede-Änderung aktualisiert (wenn nicht manuell)", async ({ page }) => {
    // 1. Kontakt mit Auto-Briefanrede
    // 2. Anrede von Herr → Frau ändern
    // 3. Briefanrede aktualisiert sich automatisch
  })
})
```

---

## Tenant Isolation Requirements (MANDATORY)

Bestehende Tenant-Isolation der CRM-Kontakte greift automatisch.

---

## Acceptance Criteria

- [ ] Felder `salutation`, `title`, `letterSalutation` in `CrmContact` (Migration)
- [ ] UI: Anrede-Dropdown (Herr/Frau/Divers)
- [ ] UI: Titel-Dropdown (Dr./Prof./Prof. Dr./Freitext)
- [ ] UI: Briefanrede-Feld mit Auto-Vorschlag
- [ ] Auto-Generierung: "Sehr geehrter Herr Dr. Müller"
- [ ] Manuell überschreibbar
- [ ] Briefanrede in Belegen verwendbar (Platzhalter für PDF)
- [ ] Cross-tenant isolation verified (Tests included)
