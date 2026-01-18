# ZMI Time Clone - PRD Part 6: Gaps, Unknowns & Implementation Guide

## 1. Identified Gaps (Information Not in Manual)

### 1.1 Critical Gaps

| Area | Gap | Impact | Recommendation |
|------|-----|--------|----------------|
| **Macros** | Macro system not documented | Cannot implement custom calculations | Build generic scripting engine or defer |
| **Terminal Protocol** | Communication protocol undocumented | Cannot integrate real terminals | Build web/mobile clock-in only initially |
| **Exact Formulas** | Some calculation edge cases unclear | May calculate differently | Test against real ZMI data if available |
| **Workflow Engine** | Approval workflow not detailed | Cannot implement approvals | Design simple approval flow |
| **Multi-language** | UI language support not specified | Unknown localization needs | Build with i18n from start |

### 1.2 Partial Information

| Area | What We Know | What's Missing |
|------|--------------|----------------|
| **Vacation Calculation** | Basic formula | Edge cases (mid-month changes, transfers) |
| **Flextime Caps** | Cap values | Exact timing (when during month?) |
| **Shift Detection** | Algorithm concept | Priority order, fallback behavior |
| **Reports** | Report types | Exact layouts, calculations |
| **Payroll Export** | Concept | Specific format specifications |

### 1.3 Intentionally Omitted

Based on the manual, these modules exist but were not detailed:
- ZMI Auftrag (Order/Project tracking)
- ZMI Kostenstelle (Cost center)
- ZMI Fahrzeugdatenerfassung (Vehicle tracking)
- ZMI Mehrmaschinenbedienung (Multi-machine)
- ZMI Zutrittskontrolle (Access control)
- ZMI Plantafel (Shift planning board)

**Recommendation:** Build core time tracking first, add modules later.

---

## 2. Assumptions Made

### 2.1 Technical Assumptions

| Assumption | Rationale |
|------------|-----------|
| PostgreSQL database | Best fit for complex time calculations, JSON support |
| UTC storage, local display | Standard practice for multi-timezone |
| Minutes as base unit | Avoids floating point issues |
| Soft delete pattern | Required for audit compliance |
| Event-driven calculation | Scalable, allows async processing |

### 2.2 Business Logic Assumptions

| Assumption | Based On |
|------------|----------|
| Bookings are paired chronologically | Manual description of pairing |
| Breaks are mutually exclusive by type | Fixed vs. variable break rules |
| Only one absence per day | Unique constraint implied |
| Month calculation runs after day | Logical dependency |
| Vacation is always in days | Manual shows day values |

### 2.3 UI/UX Assumptions

| Assumption | Rationale |
|------------|-----------|
| Web-first design | Cloud requirement |
| Role-based dashboards | Different user needs |
| Inline editing for bookings | Efficiency for corrections |
| Calendar-based absence view | Industry standard |

---

## 3. Questions for Client/Stakeholder

### 3.1 Must Answer Before Development

1. **Existing Data Migration**
   - Do we need to import data from existing ZMI system?
   - What format is the export?
   - How much historical data?

2. **Terminal Integration**
   - Which terminals are currently in use?
   - Do we need direct integration or manual import?
   - Alternative: Pure web/mobile time clock?

3. **Payroll Systems**
   - Which payroll systems need integration?
   - Can we get format specifications?
   - Is real-time or batch export needed?

4. **Macro Requirements**
   - What custom calculations are currently in use?
   - Can we get examples of macro scripts?
   - Are they essential for go-live?

5. **User Volume**
   - How many employees?
   - How many concurrent users?
   - Peak usage times?

### 3.2 Can Decide During Development

- Exact color scheme
- Report layouts
- Mobile app native vs. PWA
- Notification preferences
- Dashboard widgets

### 3.3 Can Defer to Phase 2

- Advanced modules (Orders, Cost centers, etc.)
- Hardware terminal integration
- Complex workflow approvals
- Custom reporting engine
- API for third-party integrations

---

## 4. Implementation Roadmap

### Phase 1: Core MVP (8-12 weeks)

**Goal:** Basic time tracking functional

| Week | Focus |
|------|-------|
| 1-2 | Database setup, Auth, Tenant structure |
| 3-4 | Employee management, Basic UI shell |
| 5-6 | Day plans, Week plans, Plan assignment |
| 7-8 | Booking capture (web), Daily calculation |
| 9-10 | Monthly calculation, Flextime balance |
| 11-12 | Basic reports, Testing, Bug fixes |

**Deliverables:**
- ✅ User login
- ✅ Employee CRUD
- ✅ Time plan configuration
- ✅ Web-based clock in/out
- ✅ Basic calculations
- ✅ Monthly report

### Phase 2: Complete Feature Set (6-8 weeks)

| Week | Focus |
|------|-------|
| 1-2 | Absence management, Vacation calculation |
| 3-4 | Correction assistant, Error handling |
| 5-6 | Advanced reports, Export functionality |
| 7-8 | Month closing, Audit trail, Polish |

**Deliverables:**
- ✅ Full absence workflow
- ✅ Vacation balance tracking
- ✅ Error detection and correction
- ✅ Payroll export (basic)
- ✅ Audit logging

### Phase 3: Advanced Features (4-6 weeks)

| Week | Focus |
|------|-------|
| 1-2 | Mobile app / PWA |
| 3-4 | Shift auto-detection, Advanced plans |
| 5-6 | Custom query builder, Dashboard |

### Phase 4: Integrations (Ongoing)

- Terminal integration (if needed)
- Payroll system connectors
- SSO providers
- Additional modules

---

## 5. Technology Recommendations

### 5.1 Backend

```
Framework: Node.js + NestJS  or  Python + FastAPI
Database: PostgreSQL 15+
Cache: Redis
Queue: Bull (Node) or Celery (Python)
Search: PostgreSQL full-text (initially)
```

**Why NestJS:**
- TypeScript for type safety
- Modular architecture
- Built-in validation
- Good ORM options (TypeORM, Prisma)

**Why FastAPI:**
- Python ecosystem for calculations
- Automatic OpenAPI docs
- Async support
- Easy to learn

### 5.2 Frontend

```
Framework: React 18+ with TypeScript
State: TanStack Query + Zustand
UI Library: Shadcn/ui or Ant Design
Forms: React Hook Form + Zod
Charts: Recharts
Tables: TanStack Table
```

### 5.3 Infrastructure

```
Container: Docker
Orchestration: Kubernetes or Docker Compose
CI/CD: GitHub Actions
Hosting: AWS / GCP / Azure
Storage: S3-compatible
CDN: CloudFront / CloudFlare
```

### 5.4 Development Tools

```
API Docs: OpenAPI 3.0
Testing: Jest/Vitest, Playwright
Monitoring: Sentry, DataDog
Logging: Structured JSON logs
```

---

## 6. Data Migration Strategy

### 6.1 If Migrating from ZMI Time

1. **Export from ZMI**
   - Employee master data
   - Historical bookings
   - Time plan definitions
   - Absence records

2. **Transform**
   - Map fields to new schema
   - Convert time formats
   - Resolve foreign key references

3. **Validate**
   - Compare calculated values
   - Verify vacation balances
   - Check flextime carryovers

4. **Import**
   - Start with master data
   - Then historical (in date order)
   - Recalculate all months

### 6.2 Clean Start

If not migrating:
1. Set up tenants and departments
2. Create time plans
3. Import employees (CSV)
4. Set offset values (vacation, flextime)
5. Start fresh from specific date

---

## 7. Testing Strategy

### 7.1 Unit Tests

- Calculation functions (rounding, breaks, overtime)
- Business rule validation
- Date/time utilities

### 7.2 Integration Tests

- API endpoint tests
- Database operations
- Calculation pipeline

### 7.3 End-to-End Tests

- Complete booking flow
- Absence request flow
- Month closing flow
- Report generation

### 7.4 Test Data Scenarios

| Scenario | Tests |
|----------|-------|
| Normal day | Standard come/go, correct calculation |
| Overtime | Hours over target credited |
| Undertime | Hours under target tracked |
| Break scenarios | All break types |
| Rounding | All rounding modes |
| Shift change | Auto-detection works |
| Night shift | Day change handling |
| Vacation | Deduction correct |
| Holiday | Credits correct |
| Month end | Carryover correct |
| Year end | Annual entitlement reset |

---

## 8. Security Considerations

### 8.1 Authentication

- Password hashing (bcrypt/argon2)
- JWT with short expiry
- Refresh token rotation
- Session invalidation
- Brute force protection

### 8.2 Authorization

- Row-level security (tenant isolation)
- Permission checks on every request
- Audit logging

### 8.3 Data Protection

- Encryption at rest
- TLS in transit
- PII handling (GDPR)
- Data retention policies
- Right to deletion

### 8.4 API Security

- Rate limiting
- Input validation
- SQL injection prevention
- XSS prevention
- CORS configuration

---

## 9. Performance Targets

| Metric | Target |
|--------|--------|
| Page load | < 2 seconds |
| API response | < 200ms (95th percentile) |
| Day calculation | < 100ms |
| Month calculation | < 5 seconds |
| Report generation | < 10 seconds |
| Concurrent users | 100+ |
| Data retention | 10+ years |

---

## 10. Success Criteria

### MVP Success

- [ ] Employees can clock in/out via web
- [ ] Daily times calculated correctly
- [ ] Monthly totals accurate
- [ ] Basic reports generated
- [ ] No data loss
- [ ] System stable under load

### Full Release Success

- [ ] Feature parity with core ZMI Time
- [ ] Users trained and productive
- [ ] Data migrated successfully
- [ ] Payroll export working
- [ ] < 5 support tickets/week
- [ ] 99.9% uptime

---

## 11. Open Items Tracker

| ID | Item | Status | Owner | Due |
|----|------|--------|-------|-----|
| 1 | Confirm payroll export formats | Open | Client | |
| 2 | Get sample macro scripts | Open | Client | |
| 3 | Define terminal strategy | Open | Team | |
| 4 | Finalize tech stack | Open | Team | |
| 5 | Set up dev environment | Open | Dev | |
| 6 | Create detailed sprint plan | Open | PM | |

---

## Appendix: Glossary

| German Term | English | Description |
|-------------|---------|-------------|
| Mandant | Tenant | Company/organization |
| Buchung | Booking | Time punch/clock event |
| Kommen | Come/Arrive | Clock in |
| Gehen | Go/Leave | Clock out |
| Tagesplan | Day Plan | Daily schedule rules |
| Wochenplan | Week Plan | Weekly schedule |
| Fehltag | Absence Day | Day off (vacation, sick, etc.) |
| Urlaub | Vacation | Paid time off |
| Krankheit | Illness | Sick leave |
| Gleitzeit | Flextime | Flexible working hours |
| Sollzeit | Target Time | Expected hours |
| Istzeit | Actual Time | Hours worked |
| Überstunden | Overtime | Hours over target |
| Kernzeit | Core Time | Mandatory presence |
| Zuschlag | Bonus/Premium | Extra pay multiplier |
| Kappung | Capping | Limit/cap on values |
| Tarif | Tariff | Employment terms |
| Auswertung | Evaluation | Report/analysis |
