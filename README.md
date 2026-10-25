# StudySpot

StudySpot is a mobile app that helps students find a good place to study right now. It combines study-specific café information with crowd, noise and Wi-Fi conditions. Each condition is labelled Current, "X hours ago", or an estimate based on historical data, and never shown as more recent than it is. Students earn points for short receipt-QR surveys and spend them on café coupons, and StudyMatch, an AI assistant, recommends places from real data only.

Software Engineering project, AUC, Fall 2026. Requirements: SRS v0.4; design: SDS v0.2 (v0.3 in progress for Milestone 2).

## Architecture in one picture

A Flutter app talks to one NestJS backend, a **modular monolith**, through a REST API. Inside the backend, 14 modules talk to each other only through interfaces in `backend/src/contracts`, and every outside service sits behind an adapter.

![Backend modules generated from the code](docs/architecture/generated/module-graph.png)

The graph above is generated from the code (`npm run deps:graph`), and CI fails if a module bypasses the interfaces (`npm run deps:check`). The UML diagrams are in [`docs/architecture/`](docs/architecture/).

## Repository layout

```
app/                 Flutter mobile app (M5, M6)
backend/             NestJS API: modules, contracts, database, tests
  src/contracts/     interfaces + tokens: the only door between modules
  src/modules/       14 business modules (Accounts, Venues, Conditions, ...)
  src/adapters/      Maps, E-mail, Push, LLM, Audio AI (fakes until configured)
  src/db/            entities, migrations, seed loader
  seed/              venue seed data
contracts/openapi.yaml   the API contract between app and backend
docs/architecture/   UML (PlantUML sources + rendered PNGs)
docs/testing/        test cases and results
```

## Quick start

```bash
docker compose up -d db
cd backend && cp .env.example .env && npm install
npm run migration:run && npm run seed
npm run start:dev
```

API: <http://localhost:3000/api/v1> · Interactive docs: <http://localhost:3000/api/docs> · Health: `/api/v1/health`

See [CONTRIBUTING.md](CONTRIBUTING.md) for the team rules, branches and pull requests.

## Sprint 1 status (Milestone 2)

| Module | State | Owner |
| --- | --- | --- |
| API layer (validation, errors, request IDs, rate limit, health) | Built | M1 |
| Configuration, Audit Log, Clock, Scheduler | Built | M1 |
| Database schema (19 tables, PostGIS) and migrations | Built | M1 |
| Accounts & Auth | Stub with dev token, real version in progress | M2 |
| Venues search, nearby, filters | Stub on sample data, real version in progress | M3 |
| Venue details, Conditions, preferences, favorites | Stub, real version in progress | M4 |
| Presence, Surveys, QR Codes, Rewards, Audio, Notifications, StudyMatch, Admin | Interfaces and stubs; built in Sprints 2 and 3 | — |
| Flutter app | In progress | M5, M6 |

## Tech stack

Flutter (Dart) · Node.js 20 + NestJS 11 (TypeScript) · TypeORM · PostgreSQL 16 + PostGIS on Supabase · Render · Google Maps · Google Gemini · SendGrid · Firebase Cloud Messaging · GitHub Actions · Jira
