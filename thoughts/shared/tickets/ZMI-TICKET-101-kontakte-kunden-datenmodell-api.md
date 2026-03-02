# ZMI-TICKET-101: Kontakte/Kunden — Datenmodell & API

Status: Proposed
Priority: P1
Owner: TBD
Epic: Phase 1 — Stammdaten
Source: plancraft-anforderungen.md.pdf, Abschnitt 2.1 Kontakte/Kunden
Blocks: ZMI-TICKET-102, ZMI-TICKET-103, ZMI-TICKET-110

## Goal
Kundenverwaltung (CRM-Stammdaten) als neue Domäne in Terp implementieren. Kunden/Kontakte sind Voraussetzung für Projekte, Dokumente und Rechnungen.

## Scope
- **In scope:** Datenmodell, Migration, Repository, Service, Handler, OpenAPI-Spec für Kontakte/Kunden CRUD.
- **Out of scope:** CSV-Import (ZMI-TICKET-102), Frontend UI (ZMI-TICKET-103), Verknüpfung mit Projekten (ZMI-TICKET-110).

## Requirements

### Datenmodell

#### Tabelle `contacts`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| tenant_id | UUID | FK tenants, NOT NULL | Mandant |
| company_name | VARCHAR(255) | | Firmenname (leer bei Privatkunden) |
| salutation | VARCHAR(20) | | Anrede (Herr/Frau/Firma/Divers) |
| first_name | VARCHAR(100) | | Vorname |
| last_name | VARCHAR(100) | NOT NULL | Nachname |
| contact_type | VARCHAR(20) | NOT NULL, DEFAULT 'private' | 'private' oder 'business' |
| tax_number | VARCHAR(50) | | Steuernummer (Geschäftskunden) |
| vat_id | VARCHAR(50) | | USt-IdNr. (Geschäftskunden) |
| notes | TEXT | | Freitext-Notizen |
| payment_terms_id | UUID | FK payment_terms, NULL | Individuelle Zahlungsbedingungen |
| is_archived | BOOLEAN | NOT NULL, DEFAULT false | Soft-Delete |
| created_at | TIMESTAMPTZ | NOT NULL | |
| updated_at | TIMESTAMPTZ | NOT NULL | |
| created_by | UUID | FK users | |
| updated_by | UUID | FK users | |

#### Tabelle `contact_addresses`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| contact_id | UUID | FK contacts, NOT NULL | |
| address_type | VARCHAR(20) | NOT NULL | 'billing', 'construction_site', 'other' |
| street | VARCHAR(255) | NOT NULL | |
| zip | VARCHAR(20) | NOT NULL | |
| city | VARCHAR(100) | NOT NULL | |
| country | VARCHAR(2) | NOT NULL, DEFAULT 'DE' | ISO 3166-1 alpha-2 |
| is_default | BOOLEAN | NOT NULL, DEFAULT false | Standard-Rechnungsadresse |
| created_at | TIMESTAMPTZ | NOT NULL | |

#### Tabelle `contact_communications`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| contact_id | UUID | FK contacts, NOT NULL | |
| comm_type | VARCHAR(20) | NOT NULL | 'phone', 'mobile', 'fax', 'email' |
| value | VARCHAR(255) | NOT NULL | Telefonnummer oder E-Mail |
| is_primary | BOOLEAN | NOT NULL, DEFAULT false | Primärer Kontaktweg |
| label | VARCHAR(50) | | z.B. "Büro", "Privat", "Bauleiter" |
| created_at | TIMESTAMPTZ | NOT NULL | |

**Indizes:**
- `contacts`: (tenant_id, last_name, company_name) für Suche
- `contacts`: (tenant_id, is_archived) für gefilterte Listen
- `contacts`: (tenant_id, contact_type)
- `contact_addresses`: (contact_id)
- `contact_communications`: (contact_id)
- Unique: (contact_id, is_default) WHERE is_default = true (nur eine Default-Adresse)
- Unique: (contact_id, comm_type, is_primary) WHERE is_primary = true (nur ein Primary pro Typ)

### Business Rules
1. `last_name` ist Pflicht. Bei Geschäftskunden ist `company_name` ebenfalls Pflicht.
2. Bei `contact_type = 'business'` sollte `tax_number` oder `vat_id` vorhanden sein (Warnung, kein Hard-Block).
3. Archivierte Kontakte (`is_archived = true`) werden in Listen standardmäßig ausgeblendet, können aber per Filter angezeigt werden.
4. Beim Archivieren: Verknüpfte Projekte/Dokumente bleiben erhalten, Kontakt wird nur als archiviert markiert.
5. Mindestens eine Adresse vom Typ 'billing' muss existieren wenn Dokumente erstellt werden sollen (Validierung im Dokumenten-Service, nicht hier).
6. Pro Kontakt maximal eine `is_default`-Adresse und ein `is_primary`-Kommunikationsweg pro `comm_type`.

### API / OpenAPI

#### Endpoints
| Method | Path | Beschreibung |
|--------|------|--------------|
| POST | /contacts | Kontakt anlegen (inkl. Adressen & Kommunikation) |
| GET | /contacts | Liste mit Filtern (Suche, Typ, Archiv) |
| GET | /contacts/{id} | Kontakt-Detail mit Adressen & Kommunikation |
| PATCH | /contacts/{id} | Kontakt aktualisieren |
| DELETE | /contacts/{id} | Soft-Delete (archivieren) |
| POST | /contacts/{id}/addresses | Adresse hinzufügen |
| PATCH | /contacts/{id}/addresses/{addressId} | Adresse aktualisieren |
| DELETE | /contacts/{id}/addresses/{addressId} | Adresse löschen |
| POST | /contacts/{id}/communications | Kommunikationsweg hinzufügen |
| PATCH | /contacts/{id}/communications/{commId} | Kommunikationsweg aktualisieren |
| DELETE | /contacts/{id}/communications/{commId} | Kommunikationsweg löschen |

#### Query-Parameter für GET /contacts
- `search` (string): Volltextsuche über last_name, first_name, company_name, email
- `contact_type` (string): 'private' | 'business'
- `is_archived` (bool): Default false
- `sort_by` (string): 'name' | 'company' | 'created_at' | 'updated_at'
- `sort_order` (string): 'asc' | 'desc'
- `page`, `page_size`: Pagination

#### Request/Response
- POST/PATCH `/contacts` akzeptiert nested `addresses` und `communications` Arrays.
- GET `/contacts/{id}` gibt immer `addresses` und `communications` mit zurück.
- GET `/contacts` (Liste) gibt nur Primär-Adresse und Primär-Email/Telefon zurück (Performance).
- Alle Responses verwenden generierte Models aus `gen/models/`.

### Permissions
- `contacts.view` — Kontakte anzeigen
- `contacts.create` — Kontakte anlegen
- `contacts.edit` — Kontakte bearbeiten
- `contacts.delete` — Kontakte archivieren/löschen

## Acceptance Criteria
1. Kontakt-CRUD funktioniert mit striktem Tenant-Scoping.
2. Adressen und Kommunikationswege können separat verwaltet werden.
3. Soft-Delete archiviert statt zu löschen.
4. Geschäftskunden-Validierung (company_name Pflicht) wird enforced.
5. Suchfunktion findet über Name, Firma und E-Mail.
6. OpenAPI-Spec ist vollständig dokumentiert mit allen Feldern und Validierungsregeln.
7. Permissions werden korrekt durchgesetzt.

## Tests

### Unit Tests — Repository
- `TestContactRepository_Create`: Kontakt mit allen Feldern anlegen, zurücklesen, alle Felder prüfen.
- `TestContactRepository_Create_TenantIsolation`: Kontakt in Tenant A anlegen, aus Tenant B nicht abrufbar.
- `TestContactRepository_Create_RequiredFields`: Ohne last_name → Fehler. Geschäftskunde ohne company_name → Fehler.
- `TestContactRepository_Update`: Felder aktualisieren, updated_at wird gesetzt.
- `TestContactRepository_Archive`: is_archived = true, Kontakt taucht nicht in Default-Liste auf.
- `TestContactRepository_Archive_WithFilter`: is_archived = true, mit Filter `is_archived=true` abrufbar.
- `TestContactRepository_Search`: Suche über last_name, first_name, company_name, email.
- `TestContactRepository_Search_PartialMatch`: Teilstring-Suche funktioniert ("Müll" findet "Müller").
- `TestContactRepository_Search_CaseInsensitive`: Suche ist case-insensitive.
- `TestContactRepository_List_Pagination`: Page 1 und 2 geben korrekte Ergebnisse.
- `TestContactRepository_List_Sorting`: Sortierung nach Name, Firma, Datum.

### Unit Tests — Service
- `TestContactService_Create_BusinessValidation`: Geschäftskunde ohne company_name → ValidationError.
- `TestContactService_Create_PrivateNoCompany`: Privatkunde ohne company_name → OK.
- `TestContactService_Create_VatWarning`: Geschäftskunde ohne tax_number/vat_id → Warnung im Response (kein Fehler).
- `TestContactService_Archive_SetsFlag`: Archivierung setzt Flag und updated_by.
- `TestContactService_DefaultAddress_Uniqueness`: Zweite Default-Adresse → alte verliert is_default.
- `TestContactService_PrimaryCommunication_Uniqueness`: Zweiter Primary-Phone → alter verliert is_primary.

### Unit Tests — Adressen
- `TestAddressRepository_Create`: Adresse anlegen mit allen Feldern.
- `TestAddressRepository_Create_RequiredFields`: Ohne street/zip/city → Fehler.
- `TestAddressRepository_Delete_LastAddress`: Letzte Adresse löschen → erlaubt (Validierung erst bei Dokumentenerstellung).
- `TestAddressRepository_CountryDefault`: Ohne country → 'DE'.

### Unit Tests — Kommunikation
- `TestCommunicationRepository_Create`: Kommunikationsweg anlegen.
- `TestCommunicationRepository_Create_InvalidType`: Ungültiger comm_type → Fehler.
- `TestCommunicationRepository_EmailValidation`: Ungültige E-Mail → Fehler.
- `TestCommunicationRepository_PhoneFormat`: Telefonnummer wird normalisiert gespeichert.

### API Tests (Handler)
- `TestContactHandler_Create_201`: Valider Kontakt mit Adressen → 201, alle Felder im Response.
- `TestContactHandler_Create_400_MissingName`: Ohne last_name → 400 mit Fehlermeldung.
- `TestContactHandler_Create_400_BusinessNoCompany`: Geschäftskunde ohne company_name → 400.
- `TestContactHandler_Create_401_Unauthorized`: Ohne Auth-Token → 401.
- `TestContactHandler_Create_403_NoPermission`: Ohne contacts.create Permission → 403.
- `TestContactHandler_Get_200`: Kontakt abrufen mit Adressen und Kommunikation.
- `TestContactHandler_Get_404`: Nicht existierende ID → 404.
- `TestContactHandler_Get_404_OtherTenant`: Kontakt aus anderem Tenant → 404 (nicht 403).
- `TestContactHandler_List_200`: Liste mit Pagination, korrekte Gesamtzahl.
- `TestContactHandler_List_Search`: Suchparameter filtert korrekt.
- `TestContactHandler_List_ExcludesArchived`: Archivierte nicht in Default-Liste.
- `TestContactHandler_List_IncludesArchived`: Mit is_archived=true Filter.
- `TestContactHandler_Patch_200`: Felder aktualisieren, nur geänderte Felder überschrieben.
- `TestContactHandler_Patch_PartialUpdate`: Nur company_name senden → rest bleibt.
- `TestContactHandler_Delete_200`: Soft-Delete, Kontakt archiviert.
- `TestContactHandler_Delete_Idempotent`: Bereits archiviert → trotzdem 200.
- `TestContactHandler_AddAddress_201`: Adresse zu bestehendem Kontakt hinzufügen.
- `TestContactHandler_AddCommunication_201`: Kommunikationsweg hinzufügen.
- `TestContactHandler_DeleteAddress_200`: Adresse entfernen.
- `TestContactHandler_DeleteCommunication_200`: Kommunikationsweg entfernen.

### Integration Tests
- `TestContact_FullLifecycle`: Anlegen → Adressen hinzufügen → Bearbeiten → Archivieren → Mit Filter wieder finden.
- `TestContact_TenantIsolation_CrossTenant`: 2 Tenants, je ein Kontakt → Tenant A sieht nur seinen.
- `TestContact_NestedCreate`: POST mit eingebetteten Adressen und Kommunikation → alles in einer Transaktion angelegt.
- `TestContact_Search_Comprehensive`: 10 Kontakte anlegen, verschiedene Suchbegriffe testen.
- `TestContact_ConcurrentUpdate`: 2 gleichzeitige Updates → kein Datenverlust (optimistic locking oder last-write-wins).

### Test Case Pack
1) **Privatkunde anlegen**
   - Input: last_name="Müller", first_name="Hans", contact_type="private", address=[billing: "Hauptstr. 1, 80331 München"], phone="089-123456"
   - Expected: Kontakt gespeichert, ID zurück, Adresse und Telefon verknüpft

2) **Geschäftskunde anlegen**
   - Input: company_name="Bau GmbH", last_name="Schmidt", contact_type="business", vat_id="DE123456789"
   - Expected: Kontakt gespeichert, kein Warning

3) **Geschäftskunde ohne Firmenname**
   - Input: last_name="Schmidt", contact_type="business"
   - Expected: 400 Bad Request, Fehler "company_name ist Pflicht bei Geschäftskunden"

4) **Geschäftskunde ohne USt-IdNr**
   - Input: company_name="Bau GmbH", last_name="Schmidt", contact_type="business"
   - Expected: 201 Created, aber Response enthält warning "Steuernummer/USt-IdNr fehlt"

5) **Mehrere Adressen**
   - Input: Kontakt mit billing-Adresse (is_default=true) + construction_site-Adresse
   - Expected: Beide gespeichert, billing ist Default

6) **Zweite Default-Adresse**
   - Input: Neue Adresse mit is_default=true zu Kontakt der bereits eine Default-Adresse hat
   - Expected: Neue wird Default, alte verliert is_default

7) **Archivieren mit verknüpften Daten**
   - Input: DELETE /contacts/{id} (Kontakt hat Adressen und Kommunikation)
   - Expected: is_archived=true, Adressen und Kommunikation bleiben erhalten

8) **Suche Teilstring**
   - Input: GET /contacts?search=Müll
   - Expected: Findet "Müller" und "Müllmann"

9) **Tenant-Isolation**
   - Input: Kontakt in Tenant A anlegen, GET /contacts mit Tenant B Header
   - Expected: Leere Liste (oder 404 bei Direkt-Zugriff)

10) **Pagination**
    - Input: 25 Kontakte, GET /contacts?page=1&page_size=10
    - Expected: 10 Ergebnisse, total_count=25, has_next=true

## Verification Checklist
- [ ] Migration erstellt und `make migrate-up` erfolgreich
- [ ] Migration ist reversibel (`make migrate-down` funktioniert)
- [ ] Model-Structs in `apps/api/internal/model/` angelegt
- [ ] Repository mit allen CRUD-Operationen + Suche implementiert
- [ ] Service-Layer mit Business-Validierungen implementiert
- [ ] Handler registriert in `cmd/server/main.go` mit korrekten Middlewares
- [ ] Permissions (`contacts.view/create/edit/delete`) in Permission-System registriert
- [ ] OpenAPI-Spec in `api/paths/` und `api/schemas/` definiert
- [ ] `make swagger-bundle` erfolgreich
- [ ] `make generate` erzeugt Request/Response Models
- [ ] Handler verwendet generierte Models (nicht eigene Structs)
- [ ] Alle Unit Tests bestehen (`go test ./internal/repository/... ./internal/service/...`)
- [ ] Alle API Tests bestehen (`go test ./internal/handler/...`)
- [ ] Alle Integration Tests bestehen
- [ ] Tenant-Isolation verifiziert (kein Cross-Tenant-Zugriff möglich)
- [ ] `make lint` zeigt keine neuen Issues
- [ ] `make fmt` zeigt keine Formatierungsfehler
- [ ] Soft-Delete funktioniert korrekt (keine harten Löschungen)
- [ ] Pagination funktioniert mit korrekten Counts
- [ ] Suchfunktion ist case-insensitive und unterstützt Teilstrings

## Dependencies
- Terp Auth & Tenant-System (existiert)
- Terp Permission-System (existiert)
- Zahlungsbedingungen (ZMI-TICKET-163) — Optional-FK, kann NULL sein bis Ticket implementiert

## Notes
- `payment_terms_id` ist nullable und wird erst aktiv wenn ZMI-TICKET-163 implementiert ist.
- Kontakte sind bewusst NICHT mit bestehenden Mitarbeitern (employees) verknüpft — das sind zwei separate Domänen (Kunden vs. Personal).
- Für die Zukunft: Kontakte werden von Projekten (ZMI-TICKET-110) und Dokumenten (ZMI-TICKET-121) referenziert.
