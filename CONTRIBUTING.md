# Working on StudySpot

Six members, one area each (M1 to M6), working in parallel through shared contracts. Read this once before your first pull request.

## Who owns what (Sprint 1)

| Member | Area | Where in the repo |
| --- | --- | --- |
| M1 | Platform and architecture: CI, contracts, schema, module wiring, API layer, Configuration, Audit, Clock, Scheduler | `backend/src/{common,config,contracts,db,health}`, `backend/src/modules/{configuration,audit,clock,scheduler}`, `.github/`, `docs/architecture/` |
| M2 | Accounts, auth | `backend/src/modules/accounts/` |
| M3 | Venues search, nearby, filters, Maps adapter, seed data | `backend/src/modules/venues/search/`, `backend/src/adapters/maps/`, `backend/seed/venues.json` |
| M4 | Venue details, Conditions, preferences, favorites | `backend/src/modules/venues/{details,venue-query.service.ts,preferences-favorites.*}`, `backend/src/modules/conditions/`, `backend/seed/records.json` |
| M5 | Flutter app shell, accounts and permission screens, preferences and favorites screens | `app/` (structure, `lib/core`, `lib/features/{auth,permissions,preferences,favorites}`) |
| M6 | Flutter discovery screens: search, filters, map, details | `app/lib/features/{search,map,venue_details}` |

Files marked **STUB** contain a `TODO(Mx)` that says exactly what the real version must do. Replace the stub class, keep the contract.

## The five shared contracts (agreed Monday 26 Oct)

1. `contracts/openapi.yaml`: every endpoint, request and response. The app's models come from here.
2. `backend/src/contracts/*.ts`: the module interfaces and their injection tokens.
3. `backend/src/db/entities/` + `backend/src/db/migrations/`: the database schema.
4. `backend/seed/`: seed data.
5. This file.

After Monday, a change to any of them needs a pull request that every affected member approves. Say so in the PR description.

## Rules the CI enforces

- **Modules talk only through contracts.** Inject the token (`@Inject(CONDITIONS) private readonly conditions: IConditions`) and add the provider's `*.module.ts` to your module's `imports`. Importing another module's service, or anything inside it, fails `npm run deps:check`.
- **Events for "something happened"**: `this.events.emit(DomainEvent.SurveyStored, payload)`; the listener uses `@OnEvent(DomainEvent.SurveyStored)`. The event catalogue is in `backend/src/common/events/domain-events.ts`.
- **Errors**: throw `AppError.notFound(...)`, `AppError.invalidInput(...)` and so on. Never build error JSON yourself. Messages say what failed and what the user can do next (USE-008).
- **Validation**: every request body and query uses a DTO class with `class-validator` decorators. Unknown fields are rejected automatically.
- **Time**: inject `CLOCK` and call `this.clock.now()`. Never call `new Date()` in business rules, or your time rules can't be tested.
- **Tunable numbers** (freshness limits, points, radius): read from `IConfig`, never hard-code them.
- **Schema changes**: edit the entity, then `npm run migration:generate src/db/migrations/<Name>`. Never edit a migration that is already on `main`.
- **Secrets**: only in `.env` (never committed) and in Render's settings.

## Branches, commits, pull requests

- Branch from `main`: `m<N>/<pb-id>-short-name`, for example `m3/pb-08-nearby-search`.
- Commit messages start with the Jira key: `SS-12 Add nearby search with PostGIS`.
- Open a pull request early (draft is fine). Fill in the template: PB item, requirement IDs, test cases.
- **Every PR needs one review from another member and a green CI run.** Nobody merges their own PR without review.
- Squash-merge into `main`. Delete the branch afterwards.

## Local setup

```bash
# 1. Database (Docker), or use the team's Supabase dev database URL instead
docker compose up -d db

# 2. Backend
cd backend
cp .env.example .env          # set DATABASE_URL if not using docker
npm install
npm run migration:run
npm run seed
npm run start:dev             # http://localhost:3000/api/v1, docs at http://localhost:3000/api/docs

# 3. Before pushing
npm run lint && npm run typecheck && npm run deps:check && npm test
npm run test:int              # needs the database
```

Development sign-in while M2's work is in progress: send `Authorization: Bearer stub.00000000-0000-4000-8000-000000000001` (dev user `dev@studyspot.test` / `devpass123`).

## Test cases (PB-45)

Every member writes 12 to 15 documented test cases in `docs/testing/test-cases.csv`, using the columns already there. Name tests in code with the same ID (`it('TC-M3-04 ...')`), so a reader can go from the sheet to the code. Use equivalence partitioning and boundary values (for example 59 vs 61 minutes, 7 vs 8 characters).
