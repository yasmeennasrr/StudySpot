# StudySpot architecture (SDS v0.3 material, owner M1)

Everything here answers the Milestone 1 feedback: the big picture first, every backend module visibly connected, and each pattern tied to real classes in the code.

## Diagrams

| File | What it shows | SDS place |
| --- | --- | --- |
| [`uml/overview-core-loop.png`](uml/overview-core-loop.png) | The big picture: contribute → estimate → discover → reward → visit | New section 1.4 "Big picture", first architecture slide |
| [`uml/fig1-system-components.png`](uml/fig1-system-components.png) | System components: app, staff console, venue page, backend layers, database, external services | Figure 1 (redrawn) |
| [`uml/fig2-backend-modules.png`](uml/fig2-backend-modules.png) | All 14 backend modules with provided interfaces (lollipops), «use» links and domain events | Figure 2 (redrawn: fixes "silo components") |
| [`generated/module-graph.png`](generated/module-graph.png) | The same links, generated from the code | New 5.2, next to Figure 2 |
| [`generated/dependency-matrix.md`](generated/dependency-matrix.md) | Caller × provider matrix: interface or event in each cell, generated from the code | New 5.2 table |
| [`uml/deployment.png`](uml/deployment.png) | UML deployment: phone, Render container, Supabase, Google, SendGrid, GitHub | Replaces the bullet list in 10.2 |
| [`uml/er-diagram.png`](uml/er-diagram.png) | Database schema, 19 tables | New section 6.7 "Database schema" |
| [`uml/conditions-class.png`](uml/conditions-class.png) | Conditions class diagram: `ConditionsService`, the Chain of Responsibility (`ConditionResolver` and its four handlers), the combining rules, and `VenueDetailsService` (M4) | Section 14 (Sprint 1 detailed design) |
| [`uml/view-details-sequence.png`](uml/view-details-sequence.png) | "View details" sequence (UC-04): API → facade → details → conditions cache → records → chain, with the 400/404 branches (M4) | Section 14 (Sprint 1 detailed design) |

Sources are PlantUML (`uml/*.puml`); re-render with `plantuml -tpng -tsvg docs/architecture/uml/*.puml`. The generated files come from `cd backend && npm run deps:graph`.

## SDS v0.3 with tracked changes

[`docs/specs/StudySpot_SDS_v0.3_M1_tracked.docx`](../specs/StudySpot_SDS_v0.3_M1_tracked.docx) is SDS v0.2 with M1's changes as Word tracked changes (author "Mohammad Kasaby (M1)"): new 1.4, 5.2 (Table 25), 6.7, 14; Figures 1 and 2 replaced; Figures 0, 7, 8, 9 added; Presence, Configuration and Clock rows; change-log row 0.3. Other members add their parts with Track Changes on, under their own names, then M1 merges on Saturday.

## What changed since SDS v0.2 (for the change log)

1. **Two new components:** *Presence* (`IPresence`) receives location reports and receipt-scan check-ins, keeps raw records for 2 hours (PRIV-016), counts present users for Conditions (RT-007, RT-008), and triggers presence prompts (SEN-014). *Configuration* (`IConfig`) holds every tunable value with change history (DATA-012, FR-039, FR-040). A *Clock* (`IClock`) service, promised in SDS 9 for testability, is now a component.
2. **Every module is wired.** Links that were missing in v0.2 Figure 2 are now drawn and exist in code: API Layer → Accounts (`IAuth`, the guard on every protected route); Audio Analysis → Conditions (`NoiseRecorded`); Presence → Notifications (`PresenceDwell`); Surveys → Rewards (in-app surveys earn points, CON-001, OD-27); Rewards → Presence (anti-abuse rule 3); QR Codes → Presence (scan check-in, RT-008b); Administration → Configuration; Scheduler → Conditions and Surveys (90-day purge, PRIV-013); Accounts → Audit Log (`SignInFailed`, previously "not drawn").
3. **Boundaries are enforced.** CI runs dependency-cruiser (`backend/.dependency-cruiser.cjs`): a module that imports another module's internals, an adapter that imports a module, or a circular import fails the build.
4. **One error format** for every endpoint: `{ code, message, details?, requestId }`. Codes: the four of SDS 6.6.8 (INVALID_INPUT, NOT_FOUND, NOT_ALLOWED, UNAVAILABLE) plus UNAUTHENTICATED, CONFLICT, RATE_LIMITED, NOT_IMPLEMENTED, INTERNAL.
5. **Request tracing:** every log line carries the request ID (also returned as `X-Request-Id`), so one request can be followed through API → module → module.
6. **Database schema** now exists (SDS 1.2 said "not yet covered"): 19 tables, PostGIS geography points with a GiST index, a trigram index for name search, CHECK constraints for RWD-009 and price level, and a partial unique index for RWD-011.

## Patterns: where each one lives in the code

| Pattern | Problem it solves in StudySpot | Participants (real names) | File(s) | Status |
| --- | --- | --- | --- | --- |
| Client–Server | Secrets, AI access and rules stay on the server (SEC-005, AI-005) | Flutter `ApiClient` ↔ NestJS API | `app/lib/core/api/`, `backend/src/main.ts` | Built |
| Layered | Validation, rules and data access separated (SEC-006, SEC-007) | `*Controller` → `*Service` → TypeORM repository | every `backend/src/modules/*` | Built |
| Modular monolith | One deployment, clear ownership per member | 14 NestJS modules, contracts in `src/contracts` | `backend/src/app.module.ts`, `.dependency-cruiser.cjs` | Built, enforced in CI |
| Dependency injection via interface tokens | Modules depend on interfaces, not classes, so stubs swap for real code | `@Inject(CONDITIONS) conditions: IConditions` | `backend/src/contracts/*.ts` | Built |
| Observer (domain events) | Publisher and listener stay decoupled (PERF-005, SEC-010) | `EventEmitter2.emit(DomainEvent.SignInFailed)` → `AuditService.onSignInFailed` | `src/common/events/domain-events.ts`, `src/modules/audit/audit.service.ts` | Built (SignInFailed, StaffAction listener, SurveyStored/NoiseRecorded listeners) |
| Adapter | Swap a provider by changing one class; failures become one error (EIR-011) | `IMaps` ← `GoogleGeocodingAdapter`, `FakeMapsAdapter`; `IEmail`, `IPush`, `ILLM`, `IAudioAI` with fakes | `backend/src/adapters/*` | Built: `GoogleGeocodingAdapter` (timeout, Egypt-only, errors → `AdapterUnavailableError`) is used when `GOOGLE_GEOCODING_API_KEY` is set; other providers are fakes until their sprint |
| Facade | Other modules see one small surface for venue data (AI-007, AI-008) | `VenueQueryFacade implements IVenueQuery` | `src/modules/venues/venue-query.service.ts` | Built |
| Repository | Only repositories touch the database; easy to mock (SEC-006) | `Repository<VenueEntity>` etc. via `TypeOrmModule.forFeature` | `src/db/entities/`, each module | Built |
| Strategy | Filters and estimation methods change without touching callers (FR-013, RT-020) | `IFilterCriterion`: `NoiseFilter`, `PriceFilter`, … in `VenueFilterPipeline` | `src/modules/venues/search/` | M3, Sprint 1 |
| Chain of Responsibility | Fallback order in one place (RT-014, RT-018) | `ConditionResolver`: `CurrentHandler` → `HoursAgoHandler` → `HistoricalHandler` → `UnavailableHandler` | `src/modules/conditions/condition-resolver.ts` (rules in `condition-rules.ts`) | Built (M4) |
| Global exception filter (API Layer) | One error format for every endpoint (USE-008) | `AllExceptionsFilter`, `AppError`, `AdapterUnavailableError` | `src/common/errors/` | Built |
| State | Only valid transitions for codes and coupons (QR-006..QR-010, RWD-017..RWD-020) | receipt code unused → scanned → used/expired; coupon issued → active → expired | `receipt_codes.status`, `coupons.status` | Schema built; logic Sprint 2–3 |
| Unit of Work | Points, code status and balance change together (RWD-009, RWD-011) | `dataSource.transaction(...)` (already used by `ConfigurationService.set`) | `src/modules/configuration/configuration.service.ts`; rewards Sprint 2 | Built (config); rewards Sprint 2 |
| Decorator + Circuit Breaker | AI outage fails fast (EIR-015, AI-028) | `ResiliencePolicy` wrapping `GeminiLlmAdapter`, `GeminiAudioAdapter` | `src/adapters/llm`, `src/adapters/audio-ai` | Sprint 3 (fault-injecting fakes ready) |

## Module ownership

See [CONTRIBUTING.md](../../CONTRIBUTING.md#who-owns-what-sprint-1).
