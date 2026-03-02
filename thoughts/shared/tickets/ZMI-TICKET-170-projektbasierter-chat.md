# ZMI-TICKET-170: Projektbasierter Chat — Echtzeit-Messaging

Status: Proposed
Priority: P3
Owner: TBD
Epic: Phase 8 — Kommunikation
Source: plancraft-anforderungen.md.pdf, Abschnitt 7.1 Projektbasierter Chat
Blocked by: ZMI-TICKET-110

## Goal
Echtzeit-Chat pro Projekt. Text-Nachrichten, Foto-Upload, Datei-Upload. Sichtbar für alle gebuchten Team-Mitglieder + Admins. Chat-Verlauf bleibt bei Archivierung read-only erhalten.

## Scope
- **In scope:** Datenmodell (chat_messages), WebSocket-basierter Echtzeit-Chat, Nachrichten (Text + Medien), Foto/Datei-Upload, Nachricht löschen (für alle / nur für mich).
- **Out of scope:** Mobile App (ZMI-TICKET-193), Offline-Fähigkeit (ZMI-TICKET-194), Push-Notifications (ZMI-TICKET-171).

## Requirements

### Datenmodell

#### Tabelle `chat_messages`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| tenant_id | UUID | FK tenants, NOT NULL | |
| project_id | UUID | FK projects, NOT NULL | |
| sender_id | UUID | FK users, NOT NULL | |
| message_type | VARCHAR(20) | NOT NULL, DEFAULT 'text' | 'text', 'image', 'file', 'system' |
| content | TEXT | | Nachrichtentext |
| file_id | UUID | FK project_files, NULL | Bei Medien |
| reply_to_id | UUID | FK chat_messages, NULL | Antwort auf Nachricht |
| is_deleted | BOOLEAN | NOT NULL, DEFAULT false | |
| deleted_for | UUID[] | | User-IDs die Nachricht versteckt haben |
| created_at | TIMESTAMPTZ | NOT NULL | |
| updated_at | TIMESTAMPTZ | NOT NULL | |

### WebSocket-Protokoll
- Verbindung: `ws://api/ws/chat/{projectId}`
- Events: `message.new`, `message.deleted`, `typing.start`, `typing.stop`
- Auth: JWT-Token als Query-Parameter oder Header

### Business Rules
1. Nur Projektmitglieder und Admins können Chat sehen/schreiben.
2. Nachricht löschen "für alle" → is_deleted=true, Platzhalter "Nachricht entfernt".
3. Nachricht löschen "nur für mich" → user_id zu deleted_for hinzufügen.
4. Fotos aus Chat → automatisch in Projekt-Dateiablage.
5. Archiviertes Projekt → Chat read-only.
6. Große Fotos (>20MB) → automatische Komprimierung vor Upload.

### API / OpenAPI
| Method | Path | Beschreibung |
|--------|------|--------------|
| GET | /projects/{id}/chat | Nachrichten (paginiert, neueste zuerst) |
| POST | /projects/{id}/chat | Nachricht senden |
| DELETE | /chat/{messageId} | Nachricht löschen |
| POST | /chat/{messageId}/hide | Für mich ausblenden |
| WS | /ws/chat/{projectId} | WebSocket-Verbindung |

### Permissions
- `chat.view`, `chat.send`, `chat.delete`

## Acceptance Criteria
1. Echtzeit-Chat pro Projekt via WebSocket.
2. Text + Foto + Datei Nachrichten.
3. Nachrichten löschen (für alle / nur für mich).
4. Fotos automatisch in Dateiablage.
5. Archiviertes Projekt → read-only.

## Tests
### Unit Tests
- `TestChat_SendMessage`: Nachricht gespeichert mit Sender + Timestamp.
- `TestChat_DeleteForAll`: is_deleted=true, Platzhalter angezeigt.
- `TestChat_DeleteForMe`: deleted_for enthält User, andere sehen noch.
- `TestChat_ArchivedProject`: Senden → Error "project archived".
- `TestChat_OnlyMembers`: Nicht-Mitglied → 403.

### API Tests
- `TestChatHandler_Send_201`, `TestChatHandler_List_200`, `TestChatHandler_Delete_200`

### Integration Tests
- `TestChat_WebSocket_Realtime`: Nachricht senden → WebSocket-Event bei anderem Client.

## Verification Checklist
- [ ] Migration: chat_messages
- [ ] WebSocket-Server
- [ ] Text/Foto/Datei Nachrichten
- [ ] Löschen für alle / für mich
- [ ] Foto → Dateiablage
- [ ] Archiviert → read-only
- [ ] Alle Tests bestehen

## Dependencies
- ZMI-TICKET-110 (Projekte), ZMI-TICKET-111 (Dateiablage)
