# ZMI-TICKET-107: Unternehmensdaten-Erweiterung (Briefpapier, Bank, Handwerksrolle)

Status: Proposed
Priority: P1
Owner: TBD
Epic: Phase 1 — Stammdaten
Source: plancraft-anforderungen.md.pdf, Abschnitte 2.3, 11.1–11.3
Blocks: ZMI-TICKET-140, ZMI-TICKET-122, ZMI-TICKET-142

## Goal
Die bestehende Tenant-Entität um Handwerker-relevante Unternehmensdaten erweitern: Steuerdaten, Bankverbindung, Handwerkskammer, Logo, Briefpapier-Konfiguration und Kalkulations-Voreinstellungen. Diese Daten werden für PDF-Generierung, Rechnungsstellung und E-Rechnung (XRechnung) benötigt.

## Scope
- **In scope:** Migration zur Erweiterung der Tenants-Tabelle, neue Tabellen für Bankverbindung und Briefpapier-Konfiguration, Logo-Upload, Kalkulations-Voreinstellungen, API-Erweiterung, OpenAPI-Update.
- **Out of scope:** PDF-Generierungs-Engine (ZMI-TICKET-140), E-Rechnung XRechnung (ZMI-TICKET-142), Zuschlagssätze (bereits in ZMI-TICKET-104).

## Requirements

### Bestandsaufnahme: Vorhandene Felder im Tenant
```
name, slug, address_street, address_zip, address_city, address_country,
phone, email, payroll_export_base_path, notes, vacation_basis,
settings (JSONB), is_active
```

### Neue Felder auf `tenants` (ALTER TABLE)
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| website | VARCHAR(255) | | Firmen-Website |
| legal_form | VARCHAR(50) | | Rechtsform (GmbH, GmbH & Co. KG, e.K., Einzelunternehmen, etc.) |
| tax_number | VARCHAR(50) | | Steuernummer (z.B. "123/456/78901") |
| vat_id | VARCHAR(20) | | USt-IdNr. (z.B. "DE123456789") |
| trade_register | VARCHAR(100) | | Handelsregister (z.B. "HRB 12345, AG München") |
| chamber_of_crafts | VARCHAR(255) | | Handwerkskammer (z.B. "HWK München Oberbayern") |
| craft_register_number | VARCHAR(100) | | Handwerksrollennummer |
| managing_director | VARCHAR(255) | | Geschäftsführer / Inhaber Name |
| default_vat_rate | DECIMAL(5,2) | NOT NULL, DEFAULT 19.00 | Standard-MwSt-Satz (19% DE, 20% AT) |
| reduced_vat_rate | DECIMAL(5,2) | NOT NULL, DEFAULT 7.00 | Ermäßigter MwSt-Satz |
| default_hourly_rate | DECIMAL(10,2) | | Standard-Stundenverrechnungssatz (Lohn) |
| currency | VARCHAR(3) | NOT NULL, DEFAULT 'EUR' | Währung (EUR, CHF) |
| logo_file_path | VARCHAR(500) | | Pfad zum Logo-File im Storage |
| logo_content_type | VARCHAR(50) | | MIME-Type (image/png, image/jpeg, image/svg+xml) |

### Neue Tabelle `tenant_bank_accounts`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| tenant_id | UUID | FK tenants, NOT NULL | |
| bank_name | VARCHAR(255) | NOT NULL | Name der Bank |
| iban | VARCHAR(34) | NOT NULL | IBAN |
| bic | VARCHAR(11) | | BIC/SWIFT |
| account_holder | VARCHAR(255) | | Kontoinhaber (falls abweichend vom Firmennamen) |
| is_default | BOOLEAN | NOT NULL, DEFAULT false | Standard-Bankverbindung für Dokumente |
| created_at | TIMESTAMPTZ | NOT NULL | |
| updated_at | TIMESTAMPTZ | NOT NULL | |

**Constraints:**
- UNIQUE (tenant_id, iban) — keine doppelten IBANs pro Tenant
- Partial unique: nur ein is_default=true pro Tenant

### Neue Tabelle `tenant_letterhead`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| tenant_id | UUID | FK tenants, NOT NULL, UNIQUE | 1:1 zum Tenant |
| mode | VARCHAR(20) | NOT NULL, DEFAULT 'auto' | 'auto' (System generiert) oder 'custom' (eigenes PDF) |
| custom_pdf_path | VARCHAR(500) | | Pfad zum eigenen Briefpapier-PDF im Storage |
| font_family | VARCHAR(100) | DEFAULT 'Arial' | Schriftart |
| primary_color | VARCHAR(7) | DEFAULT '#000000' | Primärfarbe (Hex) |
| secondary_color | VARCHAR(7) | DEFAULT '#666666' | Sekundärfarbe (Hex) |
| header_layout | VARCHAR(20) | DEFAULT 'logo_left' | 'logo_left', 'logo_right', 'logo_center' |
| show_bank_in_footer | BOOLEAN | DEFAULT true | Bankverbindung im Footer |
| show_tax_in_footer | BOOLEAN | DEFAULT true | Steuerdaten im Footer |
| show_contact_in_header | BOOLEAN | DEFAULT true | Kontaktdaten im Header |
| footer_text | TEXT | | Zusätzlicher Footer-Text |
| margin_top_mm | INT | DEFAULT 25 | Oberer Rand in mm |
| margin_bottom_mm | INT | DEFAULT 25 | Unterer Rand in mm |
| margin_left_mm | INT | DEFAULT 20 | Linker Rand in mm |
| margin_right_mm | INT | DEFAULT 20 | Rechter Rand in mm |
| hide_prices | BOOLEAN | DEFAULT false | Export-Option: Preise ausblenden |
| created_at | TIMESTAMPTZ | NOT NULL | |
| updated_at | TIMESTAMPTZ | NOT NULL | |

### Logo-Upload
- Akzeptierte Formate: PNG, JPEG, SVG
- Maximale Dateigröße: 5 MB
- Empfohlene Mindestgröße: 200x200px
- Speicherung: Lokaler Dateipfad (später S3-kompatibel)
- Pfad-Konvention: `uploads/{tenant_id}/logo.{ext}`
- Beim Upload: altes Logo wird überschrieben

### Briefpapier-Upload (Custom PDF)
- Akzeptierte Formate: PDF
- Maximale Dateigröße: 10 MB
- Wird als Hintergrund unter den Dokumenteninhalt gelegt
- Pfad-Konvention: `uploads/{tenant_id}/letterhead.pdf`

### Business Rules
1. `vat_id` Format-Validierung: DE + 9 Ziffern (für DE), ATU + 8 Ziffern (für AT), oder frei (andere Länder).
2. `iban` Format-Validierung: Länge nach Land (DE=22, AT=20, CH=21), Prüfziffer-Validierung (Modulo 97).
3. `bic` Format: 8 oder 11 Zeichen alphanumerisch.
4. `default_vat_rate` und `reduced_vat_rate`: 0-100%, Standard 19%/7% für DE.
5. `currency`: Erlaubt 'EUR' und 'CHF' (initial).
6. Logo wird beim Upload auf Maximalmaße skaliert (max 1000px Breite) und als WebP/PNG gespeichert.
7. Briefpapier Modus `auto`: System generiert Header/Footer aus Logo + Adresse + Bankverbindung.
8. Briefpapier Modus `custom`: Eigenes PDF wird als Hintergrund verwendet, System-generierter Header/Footer wird deaktiviert.
9. Beim Löschen des Logos: `logo_file_path` wird NULL, Datei wird vom Storage entfernt.
10. Margins: Mindestens 10mm auf jeder Seite, maximal 50mm.
11. Farben: Validierung als Hex-Code (#RRGGBB).
12. Bankverbindungen: Mindestens eine als Default markiert wenn Bankverbindungen existieren.

### API / OpenAPI

#### Erweiterte Tenant-Endpoints (bestehend, ergänzt)
| Method | Path | Beschreibung |
|--------|------|--------------|
| PATCH | /tenants/{id} | Erweitert um neue Felder |
| GET | /tenants/{id} | Erweitert um neue Felder + Bank + Briefpapier |

#### Neue Endpoints
| Method | Path | Beschreibung |
|--------|------|--------------|
| POST | /tenants/{id}/logo | Logo hochladen (multipart/form-data) |
| DELETE | /tenants/{id}/logo | Logo löschen |
| GET | /tenants/{id}/logo | Logo-Datei abrufen (Bild-Response) |
| POST | /tenants/{id}/bank-accounts | Bankverbindung hinzufügen |
| GET | /tenants/{id}/bank-accounts | Bankverbindungen auflisten |
| PATCH | /tenants/{id}/bank-accounts/{bankId} | Bankverbindung aktualisieren |
| DELETE | /tenants/{id}/bank-accounts/{bankId} | Bankverbindung löschen |
| GET | /tenants/{id}/letterhead | Briefpapier-Konfiguration abrufen |
| PUT | /tenants/{id}/letterhead | Briefpapier-Konfiguration speichern |
| POST | /tenants/{id}/letterhead/pdf | Eigenes Briefpapier-PDF hochladen |
| DELETE | /tenants/{id}/letterhead/pdf | Eigenes Briefpapier-PDF löschen |
| GET | /tenants/{id}/letterhead/preview | Vorschau-PDF generieren (leere Seite mit Briefpapier) |

#### GET /tenants/{id} — Erweitertes Response
```json
{
  "id": "...",
  "name": "Malerbetrieb Müller GmbH",
  "slug": "malerbetrieb-mueller",
  "address_street": "Hauptstr. 1",
  "address_zip": "80331",
  "address_city": "München",
  "address_country": "DE",
  "phone": "089-123456",
  "email": "info@mueller-maler.de",
  "website": "https://mueller-maler.de",
  "legal_form": "GmbH",
  "tax_number": "143/123/45678",
  "vat_id": "DE123456789",
  "trade_register": "HRB 12345, AG München",
  "chamber_of_crafts": "HWK München Oberbayern",
  "craft_register_number": "MÜN-2024-1234",
  "managing_director": "Hans Müller",
  "default_vat_rate": 19.00,
  "reduced_vat_rate": 7.00,
  "default_hourly_rate": 45.00,
  "currency": "EUR",
  "has_logo": true,
  "logo_url": "/api/tenants/{id}/logo",
  "bank_accounts": [...],
  "letterhead": {...}
}
```

### Permissions
- `tenants.manage` — (existiert bereits) Unternehmensdaten bearbeiten
- `tenants.letterhead` — Briefpapier-Konfiguration bearbeiten (neues Permission)

## Acceptance Criteria
1. Alle neuen Felder können über PATCH /tenants/{id} gesetzt und gelesen werden.
2. Logo-Upload funktioniert mit PNG, JPEG, SVG bis 5 MB.
3. Logo wird korrekt gespeichert und über GET /tenants/{id}/logo ausgeliefert.
4. Bankverbindung CRUD funktioniert, IBAN-Validierung aktiv.
5. IBAN-Prüfziffern-Validierung lehnt ungültige IBANs ab.
6. USt-IdNr. Format-Validierung für DE/AT funktioniert.
7. Briefpapier-Konfiguration kann gespeichert und abgerufen werden.
8. Custom Briefpapier-PDF Upload funktioniert.
9. Briefpapier-Vorschau generiert ein PDF mit dem konfigurierten Layout.
10. Default-Bankverbindung-Logik funktioniert korrekt.
11. Bestehende Tenant-Funktionalität ist nicht beeinträchtigt.

## Tests

### Unit Tests — Repository

#### Tenant-Erweiterung
- `TestTenantRepository_Update_NewFields`: Alle neuen Felder setzen → korrekt gespeichert.
- `TestTenantRepository_Update_PartialNewFields`: Nur website setzen → andere neue Felder bleiben NULL.
- `TestTenantRepository_Update_PreservesExistingFields`: Neue Felder setzen → bestehende Felder (name, address, etc.) unverändert.
- `TestTenantRepository_Get_IncludesNewFields`: GET gibt alle neuen Felder zurück.
- `TestTenantRepository_Get_NullFields`: Neue Felder die nicht gesetzt sind → NULL im Response.

#### Bankverbindung
- `TestBankAccountRepository_Create`: Bankverbindung anlegen mit IBAN, BIC, Bankname.
- `TestBankAccountRepository_Create_DuplicateIBAN`: Gleiche IBAN im Tenant → Fehler.
- `TestBankAccountRepository_Create_DuplicateIBAN_DifferentTenant`: Gleiche IBAN, anderer Tenant → OK.
- `TestBankAccountRepository_List`: Alle Bankverbindungen eines Tenants auflisten.
- `TestBankAccountRepository_Update`: Bankname ändern.
- `TestBankAccountRepository_Delete`: Bankverbindung löschen.
- `TestBankAccountRepository_SetDefault`: is_default setzen → alte Default verliert Flag.
- `TestBankAccountRepository_TenantIsolation`: Bankverbindung Tenant A nicht in Tenant B sichtbar.

#### Briefpapier
- `TestLetterheadRepository_Upsert`: Briefpapier-Config anlegen (1:1 zu Tenant).
- `TestLetterheadRepository_Upsert_Update`: Config aktualisieren → existierenden Eintrag überschreiben.
- `TestLetterheadRepository_Get`: Config abrufen.
- `TestLetterheadRepository_Get_Default`: Kein Eintrag → Default-Werte zurückgeben.
- `TestLetterheadRepository_TenantIsolation`: Config Tenant A nicht in Tenant B sichtbar.

### Unit Tests — Service

#### Validierung
- `TestTenantService_Validate_VatID_DE`: "DE123456789" → OK.
- `TestTenantService_Validate_VatID_DE_TooShort`: "DE12345" → Fehler.
- `TestTenantService_Validate_VatID_DE_Letters`: "DEABCDEFGHI" → Fehler.
- `TestTenantService_Validate_VatID_AT`: "ATU12345678" → OK.
- `TestTenantService_Validate_VatID_Other`: "FR12345678901" → OK (keine strikte Validierung für andere Länder).
- `TestTenantService_Validate_VatID_Empty`: "" → OK (Feld ist optional).
- `TestTenantService_Validate_IBAN_DE`: "DE89370400440532013000" → OK (gültige Prüfziffer).
- `TestTenantService_Validate_IBAN_DE_InvalidChecksum`: "DE00370400440532013000" → Fehler.
- `TestTenantService_Validate_IBAN_DE_WrongLength`: "DE893704004405320130" → Fehler (20 statt 22).
- `TestTenantService_Validate_IBAN_AT`: "AT611904300234573201" → OK.
- `TestTenantService_Validate_IBAN_CH`: "CH9300762011623852957" → OK.
- `TestTenantService_Validate_IBAN_Spaces`: "DE89 3704 0044 0532 0130 00" → OK (Spaces entfernt).
- `TestTenantService_Validate_BIC_8Chars`: "COBADEFF" → OK.
- `TestTenantService_Validate_BIC_11Chars`: "COBADEFFXXX" → OK.
- `TestTenantService_Validate_BIC_Invalid`: "COBADEF" → Fehler (7 Zeichen).
- `TestTenantService_Validate_VatRate_Range`: 0.00 → OK, 100.00 → OK, -1.00 → Fehler, 101.00 → Fehler.
- `TestTenantService_Validate_Currency`: "EUR" → OK, "CHF" → OK, "USD" → Fehler.
- `TestTenantService_Validate_HexColor`: "#FF0000" → OK, "#ff0000" → OK, "FF0000" → Fehler (kein #), "#GG0000" → Fehler.
- `TestTenantService_Validate_Margins`: 10 → OK, 50 → OK, 9 → Fehler, 51 → Fehler.

#### Logo-Upload
- `TestTenantService_UploadLogo_PNG`: PNG Datei → gespeichert, Pfad in Tenant.
- `TestTenantService_UploadLogo_JPEG`: JPEG Datei → gespeichert.
- `TestTenantService_UploadLogo_SVG`: SVG Datei → gespeichert.
- `TestTenantService_UploadLogo_TooLarge`: >5 MB → Fehler.
- `TestTenantService_UploadLogo_InvalidFormat`: GIF → Fehler "Ungültiges Format".
- `TestTenantService_UploadLogo_ReplacesExisting`: Zweites Upload → erstes Logo gelöscht.
- `TestTenantService_DeleteLogo`: Logo löschen → Pfad NULL, Datei entfernt.
- `TestTenantService_DeleteLogo_NoLogo`: Kein Logo vorhanden → kein Fehler.

#### Bankverbindung
- `TestTenantService_BankAccount_FirstIsDefault`: Erste Bankverbindung → automatisch is_default=true.
- `TestTenantService_BankAccount_SwitchDefault`: Neue Default → alte verliert Flag.
- `TestTenantService_BankAccount_DeleteDefault_SetsNext`: Default löschen → nächste wird Default.
- `TestTenantService_BankAccount_DeleteLast`: Letzte löschen → OK, keine Default mehr.

#### Briefpapier
- `TestTenantService_Letterhead_SaveAutoMode`: mode='auto' → custom_pdf_path bleibt NULL.
- `TestTenantService_Letterhead_SaveCustomMode`: mode='custom' → erwartet custom_pdf_path.
- `TestTenantService_Letterhead_UploadPDF`: PDF hochladen → Pfad gespeichert.
- `TestTenantService_Letterhead_UploadPDF_TooLarge`: >10 MB → Fehler.
- `TestTenantService_Letterhead_UploadPDF_InvalidFormat`: PNG statt PDF → Fehler.
- `TestTenantService_Letterhead_DeletePDF`: PDF löschen → Pfad NULL, mode auf 'auto'.
- `TestTenantService_Letterhead_Preview`: Vorschau-PDF wird generiert (Stub für jetzt).

### API Tests (Handler)

#### Tenant-Erweiterung
- `TestTenantHandler_Patch_200_NewFields`: Neue Felder per PATCH setzen.
- `TestTenantHandler_Patch_200_PartialNewFields`: Nur website per PATCH → Rest unverändert.
- `TestTenantHandler_Get_200_IncludesNewFields`: GET enthält alle neuen Felder.
- `TestTenantHandler_Get_200_HasLogoFlag`: has_logo und logo_url im Response.
- `TestTenantHandler_Get_200_IncludesBankAccounts`: bank_accounts Array im Response.
- `TestTenantHandler_Get_200_IncludesLetterhead`: letterhead Objekt im Response.
- `TestTenantHandler_Patch_400_InvalidVatID`: Ungültige USt-IdNr → 400.
- `TestTenantHandler_Patch_400_InvalidCurrency`: "USD" → 400.
- `TestTenantHandler_Patch_400_InvalidVatRate`: MwSt > 100 → 400.
- `TestTenantHandler_Patch_403`: Ohne tenants.manage → 403.

#### Logo
- `TestLogoHandler_Upload_200`: PNG hochladen → 200, logo_url im Tenant.
- `TestLogoHandler_Upload_400_TooLarge`: >5 MB → 400.
- `TestLogoHandler_Upload_400_InvalidFormat`: GIF → 400.
- `TestLogoHandler_Get_200`: Logo abrufen → Bild-Response mit korrektem Content-Type.
- `TestLogoHandler_Get_404`: Kein Logo → 404.
- `TestLogoHandler_Delete_200`: Logo löschen.
- `TestLogoHandler_Delete_404`: Kein Logo → 404.
- `TestLogoHandler_Upload_403`: Ohne tenants.manage → 403.

#### Bankverbindung
- `TestBankAccountHandler_Create_201`: Bankverbindung anlegen.
- `TestBankAccountHandler_Create_400_InvalidIBAN`: Ungültige IBAN → 400 mit Details.
- `TestBankAccountHandler_Create_400_InvalidBIC`: Ungültiger BIC → 400.
- `TestBankAccountHandler_Create_400_DuplicateIBAN`: Doppelte IBAN → 400.
- `TestBankAccountHandler_Create_400_MissingBankName`: Ohne bank_name → 400.
- `TestBankAccountHandler_List_200`: Bankverbindungen auflisten.
- `TestBankAccountHandler_Patch_200`: Bankname ändern.
- `TestBankAccountHandler_Delete_200`: Bankverbindung löschen.
- `TestBankAccountHandler_Create_403`: Ohne tenants.manage → 403.

#### Briefpapier
- `TestLetterheadHandler_Get_200`: Konfiguration abrufen.
- `TestLetterheadHandler_Get_200_Default`: Kein Eintrag → Default-Werte.
- `TestLetterheadHandler_Put_200`: Konfiguration speichern.
- `TestLetterheadHandler_Put_400_InvalidColor`: Ungültiger Hex-Code → 400.
- `TestLetterheadHandler_Put_400_InvalidMargin`: Margin < 10 → 400.
- `TestLetterheadHandler_UploadPDF_200`: Briefpapier-PDF hochladen.
- `TestLetterheadHandler_UploadPDF_400_NotPDF`: PNG statt PDF → 400.
- `TestLetterheadHandler_DeletePDF_200`: PDF löschen, mode reset.
- `TestLetterheadHandler_Preview_200`: Vorschau-PDF abrufen (Content-Type: application/pdf).
- `TestLetterheadHandler_Put_403`: Ohne tenants.letterhead → 403.

### Integration Tests
- `TestTenant_ExtendedFields_FullLifecycle`: Tenant erstellen → Felder erweitern → Bank hinzufügen → Logo hochladen → Briefpapier konfigurieren → Alles per GET abrufen → konsistent.
- `TestTenant_BackwardsCompatibility`: Bestehende Tenants ohne neue Felder → GET gibt NULL für neue Felder, keine Fehler.
- `TestTenant_LogoRoundtrip`: PNG hochladen → GET /logo → gleiche Bytes zurück.
- `TestTenant_BankAccount_DefaultLogic`: 3 Bankverbindungen → Default wechseln → Löschen → nächste wird Default.
- `TestTenant_Letterhead_ModeSwitch`: Auto → Custom (PDF Upload) → Auto (PDF gelöscht) → korrekt.
- `TestTenant_IBAN_Validation_International`: DE, AT, CH IBANs jeweils testen.
- `TestTenant_TenantIsolation`: Tenant A Logo/Bank/Letterhead nicht über Tenant B abrufbar.

### Test Case Pack
1) **Handwerksbetrieb komplett einrichten**
   - Input: PATCH mit legal_form="GmbH", tax_number="143/123/45678", vat_id="DE123456789", chamber_of_crafts="HWK München", craft_register_number="MÜN-2024-1234", managing_director="Hans Müller", default_vat_rate=19.00, currency="EUR"
   - Expected: Alle Felder gespeichert und per GET abrufbar

2) **Logo hochladen**
   - Input: POST /tenants/{id}/logo mit PNG (200KB)
   - Expected: 200, GET /tenants/{id} zeigt has_logo=true, GET /logo liefert Bild

3) **Logo ersetzen**
   - Setup: Logo existiert
   - Input: Neues Logo hochladen
   - Expected: Altes Logo gelöscht, neues gespeichert

4) **Ungültige IBAN (Prüfziffer)**
   - Input: POST /bank-accounts mit iban="DE00370400440532013000"
   - Expected: 400 "IBAN-Prüfziffer ungültig"

5) **IBAN mit Leerzeichen**
   - Input: iban="DE89 3704 0044 0532 0130 00"
   - Expected: 201, gespeichert als "DE89370400440532013000" (Spaces entfernt)

6) **Österreichischer Betrieb**
   - Input: vat_id="ATU12345678", default_vat_rate=20.00, currency="EUR"
   - Expected: AT-Format akzeptiert, MwSt 20%

7) **Briefpapier Auto-Modus**
   - Input: PUT /letterhead mit mode="auto", logo_left, primary_color="#1a5276"
   - Expected: Konfiguration gespeichert, Preview-PDF zeigt Logo links, Farbe blau

8) **Briefpapier Custom-Modus**
   - Input: PUT /letterhead mit mode="custom", dann POST /letterhead/pdf mit eigenem PDF
   - Expected: PDF gespeichert, Preview zeigt eigenes PDF als Hintergrund

9) **Erste Bankverbindung wird Default**
   - Input: POST /bank-accounts (erste Bankverbindung)
   - Expected: is_default automatisch true

10) **Default-Bankverbindung wechseln**
    - Setup: 2 Bankverbindungen, A ist Default
    - Input: PATCH B mit is_default=true
    - Expected: B ist Default, A nicht mehr

11) **Bestehender Tenant bleibt kompatibel**
    - Setup: Tenant ohne neue Felder
    - Input: GET /tenants/{id}
    - Expected: Neue Felder sind null/default, kein Fehler

12) **Ungültige USt-IdNr (DE)**
    - Input: PATCH mit vat_id="DE12345" (zu kurz)
    - Expected: 400 "USt-IdNr muss für DE das Format DE + 9 Ziffern haben"

## Verification Checklist
- [ ] Migration erstellt und `make migrate-up` erfolgreich
- [ ] Migration ist reversibel (`make migrate-down` funktioniert)
- [ ] ALTER TABLE tenants: alle 14 neuen Spalten hinzugefügt
- [ ] Neue Tabelle `tenant_bank_accounts` erstellt
- [ ] Neue Tabelle `tenant_letterhead` erstellt
- [ ] Bestehende Tenants funktionieren weiterhin (keine Breaking Changes)
- [ ] Model-Structs erweitert/neu in `apps/api/internal/model/`
- [ ] Repository: Tenant-Update mit neuen Feldern
- [ ] Repository: Bankverbindung CRUD
- [ ] Repository: Briefpapier Upsert/Get
- [ ] Service: USt-IdNr Validierung (DE: DE+9 Ziffern, AT: ATU+8 Ziffern)
- [ ] Service: IBAN Validierung (Länge + Modulo 97 Prüfziffer)
- [ ] Service: IBAN Spaces werden entfernt vor Speicherung
- [ ] Service: BIC Validierung (8 oder 11 Zeichen)
- [ ] Service: MwSt-Satz Validierung (0-100)
- [ ] Service: Währung Validierung (EUR, CHF)
- [ ] Service: Hex-Color Validierung
- [ ] Service: Margin Validierung (10-50mm)
- [ ] Service: Logo-Upload (PNG, JPEG, SVG, max 5MB)
- [ ] Service: Logo wird im Dateisystem gespeichert
- [ ] Service: Briefpapier-PDF Upload (max 10MB)
- [ ] Service: Default-Bankverbindung-Logik
- [ ] Handler registriert in `cmd/server/main.go`
- [ ] Permission `tenants.letterhead` registriert
- [ ] OpenAPI-Spec aktualisiert (Tenant-Schema erweitert, neue Endpoints)
- [ ] `make swagger-bundle` erfolgreich
- [ ] `make generate` erzeugt aktualisierte Models
- [ ] Handler verwendet generierte Models
- [ ] GET /tenants/{id} enthält bank_accounts und letterhead
- [ ] Logo-Endpoint liefert korrekte Bild-Response
- [ ] Briefpapier-Preview generiert ein PDF
- [ ] Backwards-Kompatibilität: alte Tenants ohne neue Felder funktionieren
- [ ] Alle Unit Tests bestehen
- [ ] Alle API Tests bestehen
- [ ] Alle Integration Tests bestehen
- [ ] Tenant-Isolation verifiziert
- [ ] `make lint` zeigt keine neuen Issues
- [ ] `make fmt` zeigt keine Formatierungsfehler

## Dependencies
- Bestehendes Tenant-System (ZMI-TICKET-001, Migration 000002 + 000037)
- Bestehendes Permission-System
- File-Storage-Mechanismus (initial: lokales Dateisystem, später S3)

## Notes
- Die Briefpapier-Vorschau (Preview-Endpoint) ist vorerst ein Stub der ein leeres PDF mit dem konfigurierten Layout generiert. Die volle PDF-Engine kommt in ZMI-TICKET-140.
- Logo-Speicherung ist zunächst lokal im Dateisystem. Für Produktion sollte S3-kompatibles Storage verwendet werden — das ist ein Infrastruktur-Ticket.
- Die `default_hourly_rate` dient als Kontroll-Referenz für Kalkulationen (ZMI-TICKET-122), nicht als direkte Berechnungsgrundlage. Die tatsächlichen Lohnkosten kommen aus den Zuschlagssätzen und Zeitwerten.
- `legal_form` ist Freitext statt Enum, da die Rechtsformen je nach Land variieren (GmbH, AG, e.K., OG, KG, etc.).
- IBAN-Validierung: Modulo 97 Algorithmus (ISO 13616). Spaces und Bindestriche werden vor Validierung entfernt.
