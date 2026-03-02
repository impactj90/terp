# ZMI-TICKET-110: Projektmappe — Datenmodell & API

Status: Proposed
Priority: P1
Owner: TBD
Epic: Phase 2 — Projektverwaltung
Source: plancraft-anforderungen.md.pdf, Abschnitt 4.1 Projektstruktur, 4.2 Projekt-Dashboard
Blocked by: ZMI-TICKET-101
Blocks: ZMI-TICKET-111, ZMI-TICKET-112, ZMI-TICKET-113, ZMI-TICKET-121, ZMI-TICKET-150, ZMI-TICKET-170

## Goal
Projektverwaltung als zentraler Sammelort für alle bauprojektbezogenen Daten: Kundenzuordnung, Baustellenadresse, Status-Workflow, Tags/Labels, Notizen und Verknüpfung mit Mitarbeitern. Die Projektmappe ist das Bindeglied zwischen Kontakten, Dokumenten, Zeiterfassung, Baudokumentation und Finanzen.

## Scope
- **In scope:** Datenmodell, Migration, Repository, Service, Handler, OpenAPI für Projekte CRUD, Status-Workflow, Projekt-Tags, Projekt-Mitarbeiter-Zuordnung, Verknüpfung mit Kontakten und bestehender Zeiterfassung.
- **Out of scope:** Dateiablage (ZMI-TICKET-111), Dashboard-Berechnungen (ZMI-TICKET-112), Frontend (ZMI-TICKET-113), Dokumente (ZMI-TICKET-121+), Chat (ZMI-TICKET-170).

## Requirements

### Datenmodell

#### Tabelle `projects`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| tenant_id | UUID | FK tenants, NOT NULL | |
| project_number | VARCHAR(50) | | Projektnummer (optional, Tenant-unique) |
| name | VARCHAR(255) | NOT NULL | Projektname (z.B. "Malerarbeiten Müller") |
| description | TEXT | | Projektbeschreibung |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'offer' | Status-Workflow (siehe unten) |
| contact_id | UUID | FK contacts, NULL | Verknüpfter Kunde |
| site_street | VARCHAR(255) | | Baustellenadresse: Straße |
| site_zip | VARCHAR(20) | | Baustellenadresse: PLZ |
| site_city | VARCHAR(100) | | Baustellenadresse: Ort |
| site_country | VARCHAR(2) | DEFAULT 'DE' | Baustellenadresse: Land |
| site_notes | TEXT | | Anfahrtshinweise, Zugangsinformationen |
| start_date | DATE | | Geplanter Projektbeginn |
| end_date | DATE | | Geplantes Projektende |
| actual_start_date | DATE | | Tatsächlicher Beginn (automatisch aus erster Zeitbuchung) |
| actual_end_date | DATE | | Tatsächliches Ende (manuell bei Abschluss) |
| notes | TEXT | | Interne Notizen |
| color | VARCHAR(7) | | Farbcode für Plantafel/Kalender (#RRGGBB) |
| is_archived | BOOLEAN | NOT NULL, DEFAULT false | Soft-Delete |
| created_at | TIMESTAMPTZ | NOT NULL | |
| updated_at | TIMESTAMPTZ | NOT NULL | |
| created_by | UUID | FK users | |
| updated_by | UUID | FK users | |

#### Status-Workflow
```
offer → in_progress → completed → archived
  ↓                       ↑
  └── cancelled ──────────┘ (kann aus jedem Status)
```

| Status | Beschreibung | Erlaubte Übergänge |
|--------|-------------|-------------------|
| `offer` | Angebotsstadium, noch kein Auftrag | → in_progress, cancelled |
| `in_progress` | Aktives Projekt, Arbeiten laufen | → completed, cancelled |
| `completed` | Projekt abgeschlossen, Schlussrechnung ausstehend | → archived, in_progress (Wiederaufnahme) |
| `archived` | Projekt archiviert, keine Änderungen mehr | → in_progress (Wiederaufnahme, selten) |
| `cancelled` | Projekt storniert/abgesagt | → offer (Reaktivierung) |

#### Tabelle `project_tags`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| tenant_id | UUID | FK tenants, NOT NULL | |
| name | VARCHAR(50) | NOT NULL | Tag-Name (z.B. "Neubau", "Sanierung", "Privat") |
| color | VARCHAR(7) | DEFAULT '#6B7280' | Tag-Farbe (Hex) |
| created_at | TIMESTAMPTZ | NOT NULL | |

**Constraint:** UNIQUE (tenant_id, name)

#### Tabelle `project_tag_assignments`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| project_id | UUID | FK projects, NOT NULL | |
| tag_id | UUID | FK project_tags, NOT NULL | |

**Constraint:** PK (project_id, tag_id)

#### Tabelle `project_members`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| project_id | UUID | FK projects, NOT NULL | |
| employee_id | UUID | FK employees, NOT NULL | |
| role | VARCHAR(20) | NOT NULL, DEFAULT 'worker' | 'leader' (Bauleiter), 'worker' (Mitarbeiter) |
| assigned_at | TIMESTAMPTZ | NOT NULL | |
| removed_at | TIMESTAMPTZ | | NULL = aktiv, Datum = entfernt |

**Constraint:** UNIQUE (project_id, employee_id) WHERE removed_at IS NULL

### Indizes
- `projects`: (tenant_id, status)
- `projects`: (tenant_id, is_archived)
- `projects`: (tenant_id, contact_id)
- `projects`: (tenant_id, project_number) UNIQUE WHERE project_number IS NOT NULL
- `projects`: GIN-Index auf (name, description) für Volltextsuche
- `project_members`: (project_id, removed_at)
- `project_members`: (employee_id, removed_at) — "Auf welchen Projekten bin ich?"

### Business Rules
1. `name` ist Pflicht (min 2 Zeichen).
2. `project_number` ist optional, aber Tenant-weit eindeutig wenn gesetzt.
3. Status-Übergänge müssen dem Workflow folgen. Ungültige Übergänge → Fehler.
4. `contact_id` referenziert einen Kontakt aus ZMI-TICKET-101. Wenn gesetzt, wird `contact.company_name` oder `contact.last_name` im Projekt angezeigt.
5. Baustellenadresse kann von der Rechnungsadresse des Kontakts abweichen.
6. Beim Status-Wechsel zu `in_progress`: Wenn kein `actual_start_date`, automatisch auf heute setzen.
7. Beim Status-Wechsel zu `completed`: `actual_end_date` automatisch auf heute wenn nicht gesetzt.
8. Archivierte Projekte tauchen in Standard-Listen nicht auf (Filter-Default).
9. Projekt-Mitglieder: Ein Mitarbeiter kann auf mehrere Projekte gebucht sein.
10. Baustellen-Mitarbeiter (Mobile App, Zukunft) sehen nur Projekte auf denen sie gebucht sind.
11. Tags sind Tenant-scoped und können projektenübergreifend verwendet werden.
12. `color` wird für Plantafel/Kalender-Darstellung genutzt (optional).
13. Wenn ein Kontakt archiviert wird, bleiben Projekt-Verknüpfungen erhalten (Warnung "Kontakt archiviert").

### Verknüpfung mit bestehender Zeiterfassung
- Die bestehende `orders`-Tabelle (ZMI-TICKET-017) kann mit `projects` verknüpft werden über ein optionales FK `project_id` auf der `orders`-Tabelle.
- Alternativ: `projects` ersetzt langfristig `orders` als Projekt-Entität für Zeitbuchungen.
- Für jetzt: Neues FK `project_id` auf `orders` (nullable), damit Zeitbuchungen über Orders an Projekte gebunden werden können.

### API / OpenAPI

#### Projekt-Endpoints
| Method | Path | Beschreibung |
|--------|------|--------------|
| POST | /projects | Projekt anlegen |
| GET | /projects | Liste mit Suche, Filter, Pagination |
| GET | /projects/{id} | Projekt-Detail (inkl. Kontakt, Tags, Members) |
| PATCH | /projects/{id} | Projekt aktualisieren |
| DELETE | /projects/{id} | Soft-Delete (archivieren) |
| POST | /projects/{id}/status | Status-Übergang (z.B. { "status": "in_progress" }) |
| POST | /projects/{id}/duplicate | Projekt duplizieren (ohne Dokumente/Dateien) |

#### Tag-Endpoints
| Method | Path | Beschreibung |
|--------|------|--------------|
| GET | /project-tags | Alle Tags des Tenants |
| POST | /project-tags | Tag anlegen |
| PATCH | /project-tags/{id} | Tag aktualisieren |
| DELETE | /project-tags/{id} | Tag löschen |
| POST | /projects/{id}/tags | Tags zu Projekt zuordnen |
| DELETE | /projects/{id}/tags/{tagId} | Tag von Projekt entfernen |

#### Mitglieder-Endpoints
| Method | Path | Beschreibung |
|--------|------|--------------|
| GET | /projects/{id}/members | Projekt-Mitglieder auflisten |
| POST | /projects/{id}/members | Mitarbeiter zum Projekt hinzufügen |
| PATCH | /projects/{id}/members/{memberId} | Rolle ändern (worker ↔ leader) |
| DELETE | /projects/{id}/members/{memberId} | Mitarbeiter vom Projekt entfernen (Soft: removed_at) |
| GET | /employees/{id}/projects | Projekte eines Mitarbeiters |

#### Query-Parameter für GET /projects
- `search` (string): Volltextsuche über name, description, project_number
- `status` (string): Filter nach Status (Komma-separiert für mehrere: "offer,in_progress")
- `contact_id` (UUID): Projekte eines bestimmten Kunden
- `tag_id` (UUID): Projekte mit bestimmtem Tag
- `member_id` (UUID): Projekte mit bestimmtem Mitarbeiter
- `is_archived` (bool): Default false
- `start_date_from`, `start_date_to`: Datumsbereich
- `sort_by`: 'name' | 'project_number' | 'status' | 'start_date' | 'created_at' | 'updated_at'
- `sort_order`: 'asc' | 'desc'
- `page`, `page_size`: Pagination

#### GET /projects/{id} Response
```json
{
  "id": "...",
  "project_number": "P-2026-001",
  "name": "Malerarbeiten Müller",
  "status": "in_progress",
  "contact": {
    "id": "...",
    "display_name": "Müller, Hans",
    "company_name": null,
    "is_archived": false
  },
  "site_address": {
    "street": "Gartenweg 5",
    "zip": "80339",
    "city": "München",
    "country": "DE"
  },
  "tags": [
    { "id": "...", "name": "Sanierung", "color": "#EF4444" }
  ],
  "members": [
    { "id": "...", "employee_id": "...", "name": "Peter Schmidt", "role": "leader" },
    { "id": "...", "employee_id": "...", "name": "Karl Weber", "role": "worker" }
  ],
  "stats": {
    "document_count": 3,
    "file_count": 12,
    "time_entries_hours": 47.5,
    "open_invoices_amount": 1250.00
  },
  "start_date": "2026-03-01",
  "end_date": "2026-04-15",
  "actual_start_date": "2026-03-03",
  "actual_end_date": null,
  "notes": "Schlüssel beim Nachbarn",
  "color": "#3B82F6",
  "created_at": "...",
  "updated_at": "..."
}
```

### Permissions
- `projects.view` — Projekte anzeigen
- `projects.create` — Projekte anlegen
- `projects.edit` — Projekte bearbeiten
- `projects.delete` — Projekte archivieren
- `projects.members` — Mitglieder verwalten

## Acceptance Criteria
1. Projekt-CRUD funktioniert mit striktem Tenant-Scoping.
2. Status-Workflow erzwingt gültige Übergänge.
3. Kontakt-Verknüpfung funktioniert (FK zu contacts).
4. Baustellenadresse ist unabhängig von der Kontaktadresse.
5. Tags können angelegt, zugeordnet und entfernt werden.
6. Mitarbeiter können zu Projekten zugeordnet werden (leader/worker).
7. actual_start_date wird automatisch bei Status-Wechsel zu in_progress gesetzt.
8. Volltextsuche über Name, Beschreibung und Projektnummer.
9. Filter nach Status, Kontakt, Tag, Mitarbeiter, Datumsbereich.
10. Projekt-Detail enthält Statistiken (document_count, file_count, etc. als Platzhalter).
11. Soft-Delete archiviert statt zu löschen.

## Tests

### Unit Tests — Repository

#### Projekt CRUD
- `TestProjectRepository_Create`: Projekt mit allen Feldern anlegen.
- `TestProjectRepository_Create_MinimalFields`: Nur name → OK, Defaults korrekt (status=offer).
- `TestProjectRepository_Create_WithContact`: Projekt mit contact_id → Verknüpfung korrekt.
- `TestProjectRepository_Create_DuplicateNumber`: Gleiche project_number im Tenant → Fehler.
- `TestProjectRepository_Create_DuplicateNumber_DifferentTenant`: Gleiche Nummer, anderer Tenant → OK.
- `TestProjectRepository_Update`: Felder aktualisieren, updated_at gesetzt.
- `TestProjectRepository_Archive`: is_archived = true, nicht in Default-Liste.
- `TestProjectRepository_TenantIsolation`: Projekt Tenant A nicht in Tenant B.
- `TestProjectRepository_GetWithRelations`: GET lädt Kontakt, Tags, Members mit.

#### Suche & Filter
- `TestProjectRepository_Search_Name`: Suche über Projektname.
- `TestProjectRepository_Search_Number`: Suche über Projektnummer.
- `TestProjectRepository_Search_Description`: Suche über Beschreibung.
- `TestProjectRepository_Search_Partial`: Teilstring "Maler" findet "Malerarbeiten Müller".
- `TestProjectRepository_Filter_Status`: Filter status="in_progress".
- `TestProjectRepository_Filter_MultiStatus`: Filter status="offer,in_progress".
- `TestProjectRepository_Filter_Contact`: Filter nach contact_id.
- `TestProjectRepository_Filter_Tag`: Filter nach tag_id.
- `TestProjectRepository_Filter_Member`: Filter nach member_id.
- `TestProjectRepository_Filter_DateRange`: start_date_from + start_date_to.
- `TestProjectRepository_List_Pagination`: Pagination korrekt.
- `TestProjectRepository_List_Sorting`: Sortierung nach verschiedenen Feldern.

#### Tags
- `TestTagRepository_Create`: Tag anlegen.
- `TestTagRepository_Create_DuplicateName`: Gleicher Name im Tenant → Fehler.
- `TestTagRepository_List`: Alle Tags des Tenants.
- `TestTagRepository_Delete`: Tag löschen.
- `TestTagRepository_Delete_InUse`: Tag in Verwendung löschen → Tag-Zuordnungen werden entfernt.
- `TestTagAssignment_Add`: Tag zu Projekt zuordnen.
- `TestTagAssignment_Add_Duplicate`: Gleicher Tag nochmal → Fehler oder idempotent.
- `TestTagAssignment_Remove`: Tag von Projekt entfernen.

#### Mitglieder
- `TestMemberRepository_Add`: Mitarbeiter zu Projekt hinzufügen.
- `TestMemberRepository_Add_Duplicate`: Gleicher Mitarbeiter nochmal → Fehler.
- `TestMemberRepository_Add_WithRole`: Rolle "leader" setzen.
- `TestMemberRepository_Remove`: removed_at wird gesetzt (Soft-Remove).
- `TestMemberRepository_Remove_NotHardDelete`: Entfernter Mitarbeiter bleibt in History.
- `TestMemberRepository_List_Active`: Nur aktive Mitglieder (removed_at IS NULL).
- `TestMemberRepository_ChangeRole`: worker → leader.
- `TestMemberRepository_ProjectsByEmployee`: Projekte eines Mitarbeiters.

### Unit Tests — Service

#### Status-Workflow
- `TestProjectService_StatusTransition_OfferToInProgress`: OK.
- `TestProjectService_StatusTransition_OfferToCancelled`: OK.
- `TestProjectService_StatusTransition_InProgressToCompleted`: OK.
- `TestProjectService_StatusTransition_InProgressToCancelled`: OK.
- `TestProjectService_StatusTransition_CompletedToArchived`: OK.
- `TestProjectService_StatusTransition_CompletedToInProgress`: OK (Wiederaufnahme).
- `TestProjectService_StatusTransition_ArchivedToInProgress`: OK (Reaktivierung).
- `TestProjectService_StatusTransition_CancelledToOffer`: OK (Reaktivierung).
- `TestProjectService_StatusTransition_OfferToCompleted`: Fehler (ungültig).
- `TestProjectService_StatusTransition_OfferToArchived`: Fehler.
- `TestProjectService_StatusTransition_CancelledToInProgress`: Fehler.
- `TestProjectService_StatusTransition_CompletedToCancelled`: Fehler.
- `TestProjectService_StatusTransition_SetsActualStartDate`: offer → in_progress → actual_start_date = heute.
- `TestProjectService_StatusTransition_SetsActualEndDate`: in_progress → completed → actual_end_date = heute.
- `TestProjectService_StatusTransition_KeepsExistingDates`: actual_start_date bereits gesetzt → nicht überschreiben.

#### Validierung
- `TestProjectService_Create_EmptyName`: Leerer Name → Fehler.
- `TestProjectService_Create_ShortName`: 1 Zeichen → Fehler (min 2).
- `TestProjectService_Create_InvalidContactId`: Nicht existierender Kontakt → Fehler.
- `TestProjectService_Create_ArchivedContact`: Archivierter Kontakt → Warnung (kein Block).
- `TestProjectService_Create_ContactOtherTenant`: Kontakt aus anderem Tenant → Fehler.
- `TestProjectService_Create_InvalidColor`: Ungültiger Hex-Code → Fehler.
- `TestProjectService_Create_EndBeforeStart`: end_date < start_date → Fehler.

#### Duplizierung
- `TestProjectService_Duplicate`: Projekt duplizieren → Name "(Kopie)", status="offer", keine Members/Tags.
- `TestProjectService_Duplicate_WithTags`: Option tags_too=true → Tags übernommen.

### API Tests (Handler)
- `TestProjectHandler_Create_201`: Valides Projekt → 201.
- `TestProjectHandler_Create_201_WithContact`: Mit contact_id → Kontakt verknüpft.
- `TestProjectHandler_Create_400_NoName`: Ohne name → 400.
- `TestProjectHandler_Create_400_InvalidContact`: Ungültige contact_id → 400.
- `TestProjectHandler_Create_400_EndBeforeStart`: end_date < start_date → 400.
- `TestProjectHandler_Create_401`: Ohne Auth → 401.
- `TestProjectHandler_Create_403`: Ohne projects.create → 403.
- `TestProjectHandler_Get_200`: Detail mit Kontakt, Tags, Members, Stats.
- `TestProjectHandler_Get_404`: Nicht existierende ID → 404.
- `TestProjectHandler_Get_404_OtherTenant`: Anderer Tenant → 404.
- `TestProjectHandler_List_200`: Liste mit Pagination.
- `TestProjectHandler_List_Search`: Suchparameter.
- `TestProjectHandler_List_FilterStatus`: Status-Filter.
- `TestProjectHandler_List_FilterMultiStatus`: Komma-separierte Status.
- `TestProjectHandler_List_FilterContact`: Kontakt-Filter.
- `TestProjectHandler_List_FilterTag`: Tag-Filter.
- `TestProjectHandler_List_FilterMember`: Mitarbeiter-Filter.
- `TestProjectHandler_List_ExcludesArchived`: Default ohne Archivierte.
- `TestProjectHandler_Patch_200`: Felder aktualisieren.
- `TestProjectHandler_Patch_PartialUpdate`: Nur name → Rest bleibt.
- `TestProjectHandler_Delete_200`: Soft-Delete.
- `TestProjectHandler_StatusChange_200`: offer → in_progress.
- `TestProjectHandler_StatusChange_400`: offer → completed (ungültig).
- `TestProjectHandler_Duplicate_201`: Projekt dupliziert.

#### Tags
- `TestProjectHandler_AddTag_200`: Tag zuordnen.
- `TestProjectHandler_AddTag_404`: Unbekannter Tag → 404.
- `TestProjectHandler_RemoveTag_200`: Tag entfernen.
- `TestTagHandler_Create_201`: Tag anlegen.
- `TestTagHandler_Create_400_DuplicateName`: Doppelter Name → 400.
- `TestTagHandler_Delete_200`: Tag löschen.

#### Members
- `TestMemberHandler_Add_201`: Mitarbeiter hinzufügen.
- `TestMemberHandler_Add_400_Duplicate`: Doppelt → 400.
- `TestMemberHandler_Add_400_UnknownEmployee`: Unbekannter Mitarbeiter → 400.
- `TestMemberHandler_ChangeRole_200`: Rolle ändern.
- `TestMemberHandler_Remove_200`: Mitarbeiter entfernen.
- `TestMemberHandler_List_200`: Mitglieder-Liste (nur aktive).
- `TestMemberHandler_EmployeeProjects_200`: GET /employees/{id}/projects.

### Integration Tests
- `TestProject_FullLifecycle`: Anlegen → Kontakt + Tags + Members zuordnen → Status offer → in_progress → completed → archived.
- `TestProject_StatusDates`: offer → in_progress (actual_start_date gesetzt) → completed (actual_end_date gesetzt).
- `TestProject_ContactArchived`: Kontakt archivieren → Projekt zeigt Warnung aber bleibt funktional.
- `TestProject_MemberHistory`: Mitarbeiter hinzufügen → entfernen → neuen hinzufügen → History korrekt.
- `TestProject_TenantIsolation`: 2 Tenants, Projekte, Tags, Members isoliert.
- `TestProject_Search_Comprehensive`: 20 Projekte, verschiedene Filter-Kombinationen.
- `TestProject_DuplicateWithTags`: Projekt mit Tags duplizieren → Tags übernommen.

### Test Case Pack
1) **Neues Projekt anlegen**
   - Input: name="Malerarbeiten Müller", contact_id=<Hans Müller>, site_street="Gartenweg 5", site_zip="80339", site_city="München", start_date="2026-03-01"
   - Expected: Projekt mit status="offer", actual_start_date=NULL

2) **Status-Wechsel mit Datum-Automatik**
   - Input: POST /projects/{id}/status { "status": "in_progress" }
   - Expected: status="in_progress", actual_start_date=heute

3) **Ungültiger Status-Übergang**
   - Input: Projekt mit status="offer", POST /status { "status": "completed" }
   - Expected: 400 "Ungültiger Status-Übergang: offer → completed nicht erlaubt"

4) **Projekt mit Tags**
   - Setup: Tags "Sanierung" und "Privat" existieren
   - Input: POST /projects/{id}/tags mit beiden Tags
   - Expected: Projekt hat 2 Tags, in GET /projects?tag_id=<Sanierung> auffindbar

5) **Mitarbeiter zuordnen**
   - Input: POST /projects/{id}/members { employee_id, role: "leader" }
   - Expected: Mitarbeiter als Bauleiter zugeordnet

6) **Mitarbeiter sieht seine Projekte**
   - Setup: Mitarbeiter auf 2 von 5 Projekten
   - Input: GET /employees/{id}/projects
   - Expected: Nur die 2 zugeordneten Projekte

7) **Baustellenadresse unabhängig vom Kunden**
   - Setup: Kunde hat Rechnungsadresse "Hauptstr. 1"
   - Input: Projekt mit site_street="Gartenweg 5" (andere Adresse)
   - Expected: Beide Adressen korrekt, unabhängig

8) **Projekt duplizieren**
   - Input: POST /projects/{id}/duplicate
   - Expected: Neues Projekt "Malerarbeiten Müller (Kopie)", status="offer", keine Members

9) **Suche über Projektnummer**
   - Setup: Projekte P-2026-001, P-2026-002, P-2026-003
   - Input: GET /projects?search=P-2026-002
   - Expected: Nur P-2026-002

10) **Filter Kombination**
    - Setup: 10 Projekte, 3 mit status=in_progress und tag="Neubau"
    - Input: GET /projects?status=in_progress&tag_id=<Neubau>
    - Expected: 3 Projekte

11) **Archivierter Kontakt am Projekt**
    - Setup: Projekt mit Kontakt, Kontakt wird archiviert
    - Input: GET /projects/{id}
    - Expected: contact.is_archived=true, Projekt funktioniert weiterhin

12) **Wiederaufnahme eines abgeschlossenen Projekts**
    - Setup: Projekt mit status="completed"
    - Input: POST /status { "status": "in_progress" }
    - Expected: Status zurück auf in_progress, actual_end_date bleibt erhalten

## Verification Checklist
- [ ] Migration erstellt und `make migrate-up` erfolgreich
- [ ] Migration ist reversibel
- [ ] Tabellen: projects, project_tags, project_tag_assignments, project_members
- [ ] Indizes erstellt (Volltext, Status, Kontakt, Unique project_number)
- [ ] Model-Structs angelegt
- [ ] Repository: Projekt CRUD + Suche + Filter + Pagination
- [ ] Repository: Tag CRUD + Zuordnung
- [ ] Repository: Member CRUD + Soft-Remove + History
- [ ] Service: Status-Workflow mit allen gültigen/ungültigen Übergängen
- [ ] Service: Automatische Datum-Setzung bei Status-Wechsel
- [ ] Service: Validierung (Name, Kontakt, Datum, Farbe)
- [ ] Service: Duplizierung
- [ ] Handler registriert in `cmd/server/main.go`
- [ ] Permissions registriert (projects.view/create/edit/delete/members)
- [ ] OpenAPI-Spec definiert (paths + schemas)
- [ ] `make swagger-bundle` erfolgreich
- [ ] `make generate` erzeugt Models
- [ ] Handler verwendet generierte Models
- [ ] GET /projects/{id} enthält contact, tags, members, stats
- [ ] GET /projects filtert korrekt (Status, Kontakt, Tag, Member, Datum)
- [ ] Status-Endpoint validiert Übergänge
- [ ] Volltextsuche funktioniert
- [ ] Soft-Delete korrekt
- [ ] Tenant-Isolation verifiziert
- [ ] Alle Unit Tests bestehen
- [ ] Alle API Tests bestehen
- [ ] Alle Integration Tests bestehen
- [ ] `make lint` zeigt keine neuen Issues

## Dependencies
- ZMI-TICKET-101 (Kontakte — contacts Tabelle für FK)
- Bestehendes Employee-System (für project_members FK)
- Optional: ZMI-TICKET-017 (Orders — Verknüpfung für Zeitbuchungen)

## Notes
- Das `stats`-Objekt im GET Response enthält vorerst Platzhalter (0-Werte). Die echten Berechnungen kommen über ZMI-TICKET-112 (Dashboard) und werden befüllt sobald Dokumente, Dateien und Zeiteinträge verknüpft sind.
- Die bestehende `orders`-Tabelle wird über ein optionales FK `project_id` mit Projekten verknüpft. Migration dafür in diesem Ticket (ALTER TABLE orders ADD COLUMN project_id UUID REFERENCES projects).
- Baustellen-Mitarbeiter sehen in der Mobile App (Zukunft) nur Projekte auf denen sie als Member gebucht sind — diese Logik wird in ZMI-TICKET-193 implementiert.
- Die `color`-Eigenschaft wird in der Plantafel-Erweiterung (ZMI-TICKET-192) visuell genutzt.
