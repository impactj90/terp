# ZMI-TICKET-191: Kolonnenverwaltung

Status: Proposed
Priority: P4
Owner: TBD
Epic: Phase 10 — Erweiterungen
Source: plancraft-anforderungen.md.pdf, Abschnitt 6.3 Kolonnenverwaltung + Abschnitt 7 Plantafel
Blocked by: ZMI-TICKET-111, ZMI-TICKET-113

## Goal
Kolonnen (feste Arbeitsgruppen/Teams) verwalten. Meister/Vorarbeiter als Kolonnenführer, Mitarbeiter als Mitglieder. Kolonnen können als Einheit auf Projekte in der Plantafel geplant werden, anstatt jeden Mitarbeiter einzeln zu planen.

## Scope
- **In scope:** Kolonnen-CRUD, Mitglieder-Zuordnung, Kolonnenführer, Kolonne als Planungseinheit in Plantafel, Kolonnen-basierte Zeiterfassung (Kolonnenführer bucht für gesamte Kolonne).
- **Out of scope:** Dynamische Kolonnen pro Tag, Skill-basiertes Matching, Kolonnen-übergreifende Kapazitätsplanung.

## Requirements

### Datenmodell

#### Tabelle `teams` (Kolonnen)
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| tenant_id | UUID | FK tenants, NOT NULL | |
| name | VARCHAR(255) | NOT NULL | Kolonnenname (z.B. "Kolonne Müller") |
| leader_id | UUID | FK users, NULL | Kolonnenführer |
| color | VARCHAR(7) | NULL | Farbe für Plantafel (#hex) |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | |
| notes | TEXT | NULL | Interne Notizen |
| created_at | TIMESTAMPTZ | NOT NULL | |
| updated_at | TIMESTAMPTZ | NOT NULL | |

**Unique:** `(tenant_id, name)` — Keine doppelten Kolonnennamen pro Mandant.

#### Tabelle `team_members`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| team_id | UUID | FK teams, NOT NULL | |
| user_id | UUID | FK users, NOT NULL | |
| joined_at | TIMESTAMPTZ | NOT NULL | |

**Unique:** `(team_id, user_id)` — Ein Mitarbeiter nur einmal pro Kolonne.

### Business Rules
1. Ein Mitarbeiter kann in mehreren Kolonnen sein (z.B. Montags in Kolonne A, Dienstags in Kolonne B).
2. Kolonnenführer muss selbst Mitglied der Kolonne sein.
3. Kolonne in Plantafel planen → erstellt automatisch Plantafel-Einträge für alle Mitglieder.
4. Kolonnenführer kann Zeiten für die gesamte Kolonne erfassen (Sammel-Zeitbuchung).
5. Kolonne deaktivieren → keine neuen Planungen möglich, bestehende bleiben erhalten.
6. Kolonne löschen nur wenn keine aktiven Planungen → Soft-Delete.
7. Mitglied aus Kolonne entfernen → zukünftige Planungen des Mitglieds bleiben, aber Kolonnenzuordnung wird gelöst.

### API / OpenAPI
| Method | Path | Beschreibung |
|--------|------|--------------|
| GET | /teams | Kolonnen auflisten |
| POST | /teams | Kolonne erstellen |
| GET | /teams/{id} | Kolonne mit Mitgliedern |
| PATCH | /teams/{id} | Kolonne bearbeiten |
| DELETE | /teams/{id} | Kolonne löschen (Soft-Delete) |
| POST | /teams/{id}/members | Mitglied hinzufügen |
| DELETE | /teams/{id}/members/{userId} | Mitglied entfernen |
| POST | /teams/{id}/plan | Kolonne auf Projekt planen (Batch) |
| POST | /teams/{id}/time-entries | Sammel-Zeitbuchung |

### Permissions
- `teams.view`, `teams.manage`

## Acceptance Criteria
1. Kolonnen CRUD funktioniert.
2. Mitglieder zuordnen/entfernen.
3. Kolonnenführer setzen.
4. Kolonne als Einheit auf Projekt planen → Einträge für alle Mitglieder.
5. Sammel-Zeitbuchung durch Kolonnenführer.

## Tests
### Unit Tests
- `TestTeam_Create`: Kolonne erstellen → Name, Tenant, Leader.
- `TestTeam_Create_DuplicateName`: Gleicher Name → 409 Conflict.
- `TestTeam_Update`: Name ändern → aktualisiert.
- `TestTeam_Delete_NoPlanning`: Keine Planungen → gelöscht.
- `TestTeam_Delete_ActivePlanning`: Aktive Planungen → 409 Conflict.
- `TestTeam_Deactivate`: is_active=false → keine neuen Planungen.
- `TestTeamMember_Add`: Mitglied hinzufügen → in team_members.
- `TestTeamMember_Add_Duplicate`: Bereits Mitglied → 409 Conflict.
- `TestTeamMember_Remove`: Mitglied entfernen → zukünftige Planungen bleiben.
- `TestTeamLeader_MustBeMember`: Leader setzen, nicht Mitglied → 400.
- `TestTeamLeader_SetValid`: Leader setzen, ist Mitglied → OK.
- `TestTeamPlan_Batch`: Kolonne planen → Einträge für alle 3 Mitglieder.
- `TestTeamPlan_Inactive`: Inaktive Kolonne planen → 400.
- `TestTeamTimeEntry_Batch`: Sammel-Zeitbuchung → Einträge für alle Mitglieder.
- `TestTeamTimeEntry_NotLeader`: Nicht-Leader versucht Sammel-Buchung → 403.

### API Tests
- `TestTeamHandler_Create_201`
- `TestTeamHandler_List_200`
- `TestTeamHandler_Get_200`
- `TestTeamHandler_Update_200`
- `TestTeamHandler_Delete_200`
- `TestTeamHandler_Delete_409_ActivePlanning`
- `TestTeamMemberHandler_Add_201`
- `TestTeamMemberHandler_Remove_200`
- `TestTeamPlanHandler_Batch_201`
- `TestTeamTimeEntryHandler_Batch_201`

### Integration Tests
- `TestTeam_FullFlow`: Kolonne erstellen → Mitglieder → Planen → Zeitbuchung.
- `TestTeam_PlanCreatesEntries`: 3 Mitglieder planen → 3 Plantafel-Einträge.

### Test Case Pack
| # | Szenario | Erwartung |
|---|----------|-----------|
| 1 | Kolonne erstellen | Name + Leader gesetzt |
| 2 | 3 Mitglieder zuordnen | team_members hat 3 Einträge |
| 3 | Kolonne planen auf Projekt | 3 Plantafel-Einträge |
| 4 | Sammel-Zeitbuchung | 3 Zeiteinträge erstellt |
| 5 | Mitglied entfernen | Zukünftige Planungen bleiben |
| 6 | Kolonne deaktivieren | Neue Planung → 400 |
| 7 | Doppelter Name | 409 Conflict |

## Verification Checklist
- [ ] Migration: teams, team_members
- [ ] Kolonnen-CRUD
- [ ] Mitglieder-Zuordnung
- [ ] Kolonnenführer-Logik
- [ ] Batch-Planung (Kolonne → Plantafel)
- [ ] Sammel-Zeitbuchung
- [ ] Deaktivierung
- [ ] Soft-Delete mit Prüfung
- [ ] Unique-Constraints
- [ ] Alle Tests bestehen

## Dependencies
- ZMI-TICKET-111 (Projektverwaltung), ZMI-TICKET-113 (Plantafel)

## Notes
- Bestehende `user_groups` in Terp sind für Berechtigungsgruppen. `teams` sind explizit Baukolonnen für operative Planung — kein Overlap.
- Plantafel-Integration: Kolonne als Drag-Source in der Plantafel (Erweiterung von ZMI-TICKET-113).
