# ZMI-TICKET-111: Projektmappe — Dateiablage & Storage

Status: Proposed
Priority: P2
Owner: TBD
Epic: Phase 2 — Projektverwaltung
Source: plancraft-anforderungen.md.pdf, Abschnitt 4.3 Dateiablage
Blocked by: ZMI-TICKET-110

## Goal
Dateiablage pro Projekt implementieren: Upload von Fotos, PDFs, Plänen und sonstigen Dateien mit Ordnerstruktur, Vorschau, Soft-Delete und einem abstrahierten Storage-Layer (zunächst lokal, später S3-kompatibel).

## Scope
- **In scope:** Storage-Abstraktionsschicht, Datei-Upload/Download, Ordnerstruktur pro Projekt, Vorschau-Generierung (Thumbnails), Soft-Delete mit 30 Tagen Wiederherstellung, Deduplizierung bei doppelten Dateinamen, Upload-Limit.
- **Out of scope:** Chat-Foto-Integration (ZMI-TICKET-170), Mobile-Upload (ZMI-TICKET-193), Frontend UI (ZMI-TICKET-113).

## Requirements

### Datenmodell

#### Tabelle `project_folders`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| project_id | UUID | FK projects, NOT NULL | |
| parent_id | UUID | FK project_folders, NULL | Übergeordneter Ordner |
| name | VARCHAR(255) | NOT NULL | Ordnername |
| sort_order | INT | NOT NULL, DEFAULT 0 | |
| created_at | TIMESTAMPTZ | NOT NULL | |
| created_by | UUID | FK users | |

**Constraint:** UNIQUE (project_id, parent_id, name) — keine doppelten Ordnernamen auf gleicher Ebene.

#### Tabelle `project_files`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| project_id | UUID | FK projects, NOT NULL | |
| folder_id | UUID | FK project_folders, NULL | NULL = Projekt-Root |
| original_name | VARCHAR(500) | NOT NULL | Original-Dateiname |
| storage_name | VARCHAR(500) | NOT NULL | Name im Storage (mit UUID-Prefix) |
| storage_path | VARCHAR(1000) | NOT NULL | Voller Pfad im Storage |
| content_type | VARCHAR(100) | NOT NULL | MIME-Type |
| file_size | BIGINT | NOT NULL | Dateigröße in Bytes |
| thumbnail_path | VARCHAR(1000) | | Pfad zum Thumbnail (NULL wenn kein Bild/PDF) |
| checksum_sha256 | VARCHAR(64) | | SHA256-Hash für Integritätsprüfung |
| source | VARCHAR(20) | DEFAULT 'upload' | 'upload', 'chat', 'report', 'scan' |
| is_deleted | BOOLEAN | NOT NULL, DEFAULT false | Soft-Delete |
| deleted_at | TIMESTAMPTZ | | Zeitpunkt der Löschung |
| deleted_by | UUID | FK users | |
| uploaded_at | TIMESTAMPTZ | NOT NULL | |
| uploaded_by | UUID | FK users, NOT NULL | |

### Storage-Abstraktionsschicht
```go
type StorageProvider interface {
    Upload(ctx context.Context, path string, reader io.Reader, contentType string) error
    Download(ctx context.Context, path string) (io.ReadCloser, error)
    Delete(ctx context.Context, path string) error
    Exists(ctx context.Context, path string) (bool, error)
}
```

**Implementierungen:**
- `LocalStorageProvider`: Dateisystem-basiert (Entwicklung, kleine Instanzen)
- `S3StorageProvider`: S3-kompatibel (Produktion) — Stub in diesem Ticket, Implementierung als Future Enhancement

**Pfad-Konvention:** `{tenant_id}/projects/{project_id}/files/{uuid}_{original_name}`

### Business Rules
1. Maximale Dateigröße: 50 MB pro Datei (konfigurierbar pro Tenant).
2. Maximaler Gesamtspeicher pro Tenant: 10 GB (konfigurierbar).
3. Doppelte Dateinamen im gleichen Ordner: Automatische Umbenennung (`plan.pdf` → `plan (1).pdf`).
4. Soft-Delete: Dateien werden als gelöscht markiert, nach 30 Tagen endgültig aus Storage entfernt (Cleanup-Job).
5. Wiederherstellung: Gelöschte Dateien können innerhalb von 30 Tagen wiederhergestellt werden.
6. Ordner können maximal 5 Ebenen tief verschachtelt werden.
7. Ordner löschen: Nur wenn leer (keine Dateien oder Unterordner).
8. Thumbnail-Generierung: Automatisch für Bilder (PNG, JPEG, WebP) und PDFs (erste Seite). Max 200x200px.
9. Erlaubte MIME-Types: Bilder (png, jpeg, webp, svg, gif, tiff), PDFs, Office-Dokumente (docx, xlsx, pptx), DWG/DXF (Pläne), ZIP, TXT. Ausgeschlossen: Ausführbare Dateien (.exe, .sh, .bat).
10. SHA256-Checksum wird beim Upload berechnet für Integritätsprüfung.
11. Beim Upload durch Chat (source='chat'): Automatisch in Ordner "Chat-Fotos" ablegen (wird bei Bedarf erstellt).

### API / OpenAPI

| Method | Path | Beschreibung |
|--------|------|--------------|
| POST | /projects/{id}/files | Datei hochladen (multipart/form-data) |
| GET | /projects/{id}/files | Dateien & Ordner auflisten (optional folder_id) |
| GET | /projects/{id}/files/{fileId} | Datei-Metadaten |
| GET | /projects/{id}/files/{fileId}/download | Datei herunterladen |
| GET | /projects/{id}/files/{fileId}/thumbnail | Thumbnail abrufen |
| PATCH | /projects/{id}/files/{fileId} | Datei umbenennen oder verschieben |
| DELETE | /projects/{id}/files/{fileId} | Soft-Delete |
| POST | /projects/{id}/files/{fileId}/restore | Wiederherstellen |
| GET | /projects/{id}/files/trash | Gelöschte Dateien (Papierkorb) |
| POST | /projects/{id}/folders | Ordner anlegen |
| PATCH | /projects/{id}/folders/{folderId} | Ordner umbenennen |
| DELETE | /projects/{id}/folders/{folderId} | Ordner löschen (nur wenn leer) |
| GET | /projects/{id}/storage-usage | Speicherverbrauch des Projekts |

#### Upload Request
- Content-Type: multipart/form-data
- Felder: `file` (Binärdaten), `folder_id` (optional UUID)

#### List Response
```json
{
  "folders": [
    { "id": "...", "name": "Pläne", "file_count": 3, "created_at": "..." }
  ],
  "files": [
    {
      "id": "...",
      "original_name": "grundriss.pdf",
      "content_type": "application/pdf",
      "file_size": 2456789,
      "has_thumbnail": true,
      "thumbnail_url": "/api/projects/.../files/.../thumbnail",
      "download_url": "/api/projects/.../files/.../download",
      "uploaded_at": "...",
      "uploaded_by": { "id": "...", "name": "Hans Müller" }
    }
  ],
  "current_folder": { "id": "...", "name": "Pläne", "parent_id": "..." },
  "breadcrumbs": [
    { "id": null, "name": "Dateien" },
    { "id": "...", "name": "Pläne" }
  ],
  "storage_usage": { "used_bytes": 45678901, "limit_bytes": 10737418240 }
}
```

### Permissions
- `projects.files.view` — Dateien anzeigen/herunterladen
- `projects.files.upload` — Dateien hochladen
- `projects.files.delete` — Dateien löschen
- `projects.files.manage` — Ordner verwalten, Dateien verschieben/umbenennen

## Acceptance Criteria
1. Dateien können hochgeladen und heruntergeladen werden.
2. Ordnerstruktur funktioniert (erstellen, verschachteln bis 5 Ebenen).
3. Doppelte Dateinamen werden automatisch umbenannt.
4. Soft-Delete mit Papierkorb und Wiederherstellung funktioniert.
5. Thumbnails werden für Bilder und PDFs generiert.
6. Upload-Limit (50 MB) wird durchgesetzt.
7. Speicherverbrauch wird korrekt berechnet.
8. Ausführbare Dateien werden abgelehnt.
9. Storage-Provider ist austauschbar (Interface).
10. SHA256-Checksum wird berechnet und gespeichert.

## Tests

### Unit Tests — Storage Provider
- `TestLocalStorage_Upload`: Datei hochladen → existiert auf Dateisystem.
- `TestLocalStorage_Download`: Hochgeladene Datei herunterladen → gleiche Bytes.
- `TestLocalStorage_Delete`: Datei löschen → existiert nicht mehr.
- `TestLocalStorage_Exists_True`: Vorhandene Datei → true.
- `TestLocalStorage_Exists_False`: Nicht vorhandene Datei → false.
- `TestLocalStorage_Upload_CreatesDirectories`: Verschachtelte Pfade → Directories automatisch erstellt.
- `TestLocalStorage_PathTraversal`: "../../../etc/passwd" → Fehler (Sicherheit).

### Unit Tests — Repository
- `TestFileRepository_Create`: Datei-Metadaten speichern.
- `TestFileRepository_List_ByFolder`: Dateien in Ordner auflisten.
- `TestFileRepository_List_Root`: Dateien ohne Ordner (Root-Level).
- `TestFileRepository_List_ExcludesDeleted`: Gelöschte nicht in Standard-Liste.
- `TestFileRepository_SoftDelete`: is_deleted=true, deleted_at gesetzt.
- `TestFileRepository_Restore`: is_deleted=false, deleted_at=NULL.
- `TestFileRepository_ListTrash`: Nur gelöschte Dateien.
- `TestFileRepository_StorageUsage`: Summe file_size der nicht-gelöschten Dateien.
- `TestFolderRepository_Create`: Ordner anlegen.
- `TestFolderRepository_Create_Nested`: Unterordner anlegen.
- `TestFolderRepository_Create_DuplicateName`: Gleicher Name → Fehler.
- `TestFolderRepository_Delete_Empty`: Leerer Ordner → OK.
- `TestFolderRepository_Delete_NonEmpty`: Nicht-leer → Fehler.
- `TestFolderRepository_MaxDepth`: 6. Ebene → Fehler.

### Unit Tests — Service
- `TestFileService_Upload`: Datei upload → Storage + DB Eintrag.
- `TestFileService_Upload_DuplicateName`: "plan.pdf" existiert → "plan (1).pdf".
- `TestFileService_Upload_DuplicateName_Multiple`: 3x gleicher Name → "(1)", "(2)", "(3)".
- `TestFileService_Upload_TooLarge`: >50 MB → Fehler.
- `TestFileService_Upload_ForbiddenType`: .exe → Fehler "Dateityp nicht erlaubt".
- `TestFileService_Upload_StorageLimitExceeded`: Speicherlimit überschritten → Fehler.
- `TestFileService_Upload_SHA256`: Checksum wird berechnet.
- `TestFileService_Download`: Datei herunterladen → korrekte Bytes.
- `TestFileService_GenerateThumbnail_Image`: JPEG → Thumbnail 200x200.
- `TestFileService_GenerateThumbnail_PDF`: PDF → Thumbnail der ersten Seite.
- `TestFileService_GenerateThumbnail_NoThumbnail`: DOCX → kein Thumbnail (NULL).
- `TestFileService_SoftDelete`: Markiert als gelöscht.
- `TestFileService_Restore`: Wiederherstellung.
- `TestFileService_Restore_After30Days`: >30 Tage → Fehler "Datei endgültig gelöscht".
- `TestFileService_CleanupJob`: Dateien >30 Tage gelöscht → aus Storage entfernt.
- `TestFileService_MoveFile`: Datei in anderen Ordner verschieben.
- `TestFileService_RenameFile`: Datei umbenennen.
- `TestFileService_ChatAutoFolder`: source='chat' → automatisch in "Chat-Fotos" Ordner.

### API Tests
- `TestFileHandler_Upload_201`: Datei hochladen → 201 mit Metadaten.
- `TestFileHandler_Upload_201_WithFolder`: In Ordner hochladen.
- `TestFileHandler_Upload_400_TooLarge`: >50 MB → 400.
- `TestFileHandler_Upload_400_ForbiddenType`: .exe → 400.
- `TestFileHandler_Upload_403`: Ohne projects.files.upload → 403.
- `TestFileHandler_Download_200`: Datei herunterladen → korrekte Bytes + Content-Type.
- `TestFileHandler_Download_404`: Nicht existierende Datei → 404.
- `TestFileHandler_Thumbnail_200`: Thumbnail abrufen → Bild.
- `TestFileHandler_Thumbnail_404`: Kein Thumbnail → 404.
- `TestFileHandler_List_200`: Dateien + Ordner + Breadcrumbs.
- `TestFileHandler_List_200_InFolder`: Dateien im Unterordner.
- `TestFileHandler_Delete_200`: Soft-Delete.
- `TestFileHandler_Restore_200`: Wiederherstellen.
- `TestFileHandler_Trash_200`: Papierkorb-Liste.
- `TestFolderHandler_Create_201`: Ordner anlegen.
- `TestFolderHandler_Create_400_MaxDepth`: 6. Ebene → 400.
- `TestFolderHandler_Delete_200`: Leerer Ordner löschen.
- `TestFolderHandler_Delete_400_NonEmpty`: Nicht-leer → 400.
- `TestFileHandler_StorageUsage_200`: Speicherverbrauch korrekt.

### Integration Tests
- `TestFile_UploadDownloadRoundtrip`: Upload → Download → gleiche Bytes (SHA256 Match).
- `TestFile_FolderStructure`: Ordner anlegen → Dateien hochladen → Navigieren → Breadcrumbs korrekt.
- `TestFile_SoftDelete_Restore_Lifecycle`: Upload → Delete → Trash sichtbar → Restore → wieder in Liste.
- `TestFile_DuplicateNames`: 3x gleiche Datei hochladen → korrekte Umbenennung.
- `TestFile_StorageLimit`: Limit auf 1 MB setzen → Upload 500KB OK → Upload 600KB Fehler.
- `TestFile_TenantIsolation`: Dateien von Projekt A Tenant 1 nicht über Tenant 2 erreichbar.
- `TestFile_CleanupJob`: Gelöschte Datei >30 Tage → Cleanup entfernt aus Storage.

### Test Case Pack
1) **Foto hochladen**
   - Input: POST /files mit JPEG (2 MB) in Root
   - Expected: 201, Thumbnail generiert, SHA256 berechnet

2) **PDF hochladen mit Ordner**
   - Setup: Ordner "Pläne" existiert
   - Input: POST /files mit PDF (5 MB), folder_id="Pläne"
   - Expected: In Ordner "Pläne", Thumbnail aus erster Seite

3) **Doppelter Dateiname**
   - Setup: "grundriss.pdf" existiert in Root
   - Input: Neue Datei "grundriss.pdf" hochladen
   - Expected: Gespeichert als "grundriss (1).pdf"

4) **50 MB Limit**
   - Input: 60 MB Datei hochladen
   - Expected: 400 "Datei zu groß (max. 50 MB)"

5) **Executable blockiert**
   - Input: "tool.exe" hochladen
   - Expected: 400 "Dateityp .exe nicht erlaubt"

6) **Datei löschen und wiederherstellen**
   - Input: DELETE → Trash prüfen → POST /restore
   - Expected: Datei in Trash sichtbar, nach Restore wieder in Original-Ordner

7) **Ordner 5 Ebenen tief**
   - Input: A → B → C → D → E (5 Ebenen)
   - Expected: OK

8) **Ordner 6 Ebenen → Fehler**
   - Input: A → B → C → D → E → F
   - Expected: 400 "Maximale Ordnertiefe (5) erreicht"

9) **Nicht-leeren Ordner löschen**
   - Setup: Ordner mit 2 Dateien
   - Input: DELETE /folders/{id}
   - Expected: 400 "Ordner ist nicht leer"

10) **Speicherverbrauch prüfen**
    - Setup: 3 Dateien (1MB + 2MB + 3MB)
    - Input: GET /storage-usage
    - Expected: used_bytes = 6291456 (6 MB)

## Verification Checklist
- [ ] Migration erstellt (project_folders, project_files)
- [ ] Migration reversibel
- [ ] StorageProvider Interface definiert
- [ ] LocalStorageProvider implementiert
- [ ] S3StorageProvider Stub vorhanden (Interface erfüllt, not implemented error)
- [ ] Pfad-Konvention eingehalten
- [ ] Path-Traversal-Schutz implementiert
- [ ] Upload-Limit (50 MB) durchgesetzt
- [ ] Speicherlimit pro Tenant durchgesetzt
- [ ] Doppelte Dateinamen automatisch umbenannt
- [ ] Forbidden MIME Types blockiert
- [ ] SHA256-Checksum berechnet
- [ ] Thumbnail-Generierung für Bilder (PNG, JPEG)
- [ ] Thumbnail-Generierung für PDFs (erste Seite)
- [ ] Soft-Delete mit deleted_at funktioniert
- [ ] Papierkorb-Endpoint zeigt gelöschte Dateien
- [ ] Wiederherstellung funktioniert
- [ ] Ordnerstruktur bis 5 Ebenen
- [ ] Ordner löschen nur wenn leer
- [ ] Breadcrumbs in List-Response
- [ ] Storage-Usage Berechnung korrekt
- [ ] source='chat' → Auto-Ordner "Chat-Fotos"
- [ ] Permissions durchgesetzt
- [ ] Tenant-Isolation verifiziert
- [ ] Alle Unit Tests bestehen
- [ ] Alle API Tests bestehen
- [ ] Alle Integration Tests bestehen
- [ ] `make lint` zeigt keine neuen Issues

## Dependencies
- ZMI-TICKET-110 (Projekte — projects Tabelle)
- Thumbnail-Generierung: `imaging`-Library (Go) für Bilder, Headless Chrome oder `pdfcpu` für PDFs

## Notes
- Die StorageProvider-Abstraktion wird auch von ZMI-TICKET-107 (Logo), ZMI-TICKET-140 (PDF-Generierung) und ZMI-TICKET-170 (Chat-Fotos) wiederverwendet.
- Cleanup-Job für gelöschte Dateien >30 Tage: Kann über den bestehenden Scheduler (ZMI-TICKET-022) laufen.
- Thumbnail-Generierung für PDFs erfordert externe Dependencies. Fallback: Kein Thumbnail wenn PDF-Rendering nicht möglich.
- Für große Dateien (>10 MB) könnte ein Chunked Upload sinnvoll sein — Future Enhancement.
