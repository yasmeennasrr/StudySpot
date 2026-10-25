# StudySpot test plan, Sprint 1 (Milestone 2)

Owner: M1 · Applies to: everything merged into `main` for Milestone 2 (due Sun 1 Nov 2026) · Related: [`test-cases.csv`](test-cases.csv) (the cases), [`traceability-matrix.md`](traceability-matrix.md) (generated: requirement → cases → result).

## 1. Purpose and scope

This plan says what we test in Sprint 1, how, with which tools, and when a feature counts as tested. It covers the Sprint 1 backlog:

| Area | Owner | What is tested |
| --- | --- | --- |
| Platform: API layer, errors, validation, Configuration, Audit, Clock, Scheduler, schema, deploy | M1 | Error format and codes, validation, request IDs, rate limit, health, config history, audit events, migrations and data rules |
| Saved preferences (PB-13) and favorites (PB-14) | M1 | Save, replace, clear; add, list, remove; own data only (SEC-004) |
| Google geocoding adapter (PB-07) | M1 | Area → point inside Egypt; not found vs provider failure (EIR-011) |
| Accounts and auth | M2 | Register, sign in, refresh, sign out, password rules, session expiry, suspended users |
| Venue search, nearby, filters | M3 | Search by name, area and location; radius; each FR-013 filter; ordering |
| Venue details, Conditions | M4 | Static vs dynamic groups (FR-019); Current / hours ago / historical / unavailable labels at their time limits |
| Flutter: shell, auth and permission screens, preferences and favorites screens | M5 | Widget tests for forms and states; manual run on a phone |
| Flutter: search, filters, map, details | M6 | Widget tests for lists, filters and the details layout; manual run on a phone |

Out of scope for Sprint 1: Presence, Surveys, QR codes, Rewards, Audio, Notifications, StudyMatch and Admin (they have interfaces and stubs only; their tests come in Sprints 2 and 3), load testing, and security penetration testing.

## 2. Test levels

| Level | What it checks | Tool | Where | Runs in CI |
| --- | --- | --- | --- | --- |
| Unit | One class with its collaborators mocked (services, adapters, filters, resolvers) | Jest + ts-jest | `backend/test/unit/`, `src/**/*.spec.ts` | Yes, every push |
| API layer | The real HTTP pipeline (validation, error filter, rate limit, request IDs) around a probe or real controller, no database | Jest + Supertest | `backend/test/e2e/` | Yes |
| Integration | The whole backend on a real PostgreSQL 16 + PostGIS database, through HTTP | Jest + Supertest, `postgis/postgis:16-3.4` | `backend/test/int/` | Yes (CI database service) |
| Contract | Every operation in `contracts/openapi.yaml` is routed; the spec is valid | swagger-parser, TC-M1-28 | `backend/test/int/app.int-spec.ts` | Yes |
| Widget | Flutter screens render each state (loading, data, empty, error) | `flutter_test` | `app/test/` | Yes, once `app/pubspec.yaml` exists |
| System / acceptance | Use cases end to end on the deployed API and a real phone | Manual, following the use case steps | Render + the app | No (recorded in the sheet as "Manual") |

## 3. Techniques (use the name in the Technique column)

| Technique | Use it for | StudySpot example |
| --- | --- | --- |
| Equivalence partitioning | Inputs that fall into classes that behave the same | Preference `noise`: valid words {quiet, moderate, noisy} vs anything else (TC-M1-49) |
| Boundary value analysis | Limits in the SRS | Radius 99 / 100 / 5000 / 5001 m (TC-M1-10); password 7 vs 8 characters; "Current" at 59 vs 61 minutes; session 13 d 23 h vs 14 d |
| Use-case based | Main and alternative flows of a UC | UC-03 search by area, alternative 4b maps unavailable |
| Error guessing | Failures the SRS implies but does not list | Geocoder network down (TC-M1-40); a favorite whose venue was deleted (TC-M1-46) |
| Contract testing | App and backend agree | Every OpenAPI path is routed (TC-M1-28) |
| Inspection | Structure that is checked by reading or listing | All tables and PostGIS exist (TC-M1-32); module boundaries (`npm run deps:check`) |

Time rules are tested with `FakeClock` (`backend/src/modules/clock/fake-clock.ts`), never by waiting. External services are tested with fakes or a mocked `fetch` (see `backend/test/unit/google-geocoding.adapter.spec.ts`), so no test needs a key or the internet.

## 4. Writing a test case

Each member documents **12 to 15** cases in `test-cases.csv`, one row each:

| Column | Fill with |
| --- | --- |
| TC-ID | `TC-M<your number>-<two digits>`, e.g. `TC-M3-04`. Never reuse an ID |
| Requirement | SRS IDs, comma separated. Ranges allowed: `FR-022..FR-024`. Notes in brackets are ignored by the matrix |
| Technique | One of section 3 |
| Level | Unit, API layer, Integration, Widget, or Manual |
| Preconditions, Input, Expected | Concrete values, not "valid input" |
| Actual, Result, Date, Tester | Filled when run: `As expected` / what happened; `Pass` or `Fail`; date; `M3` |
| Automated test | Path of the test file from the repo root, or `-` for a manual case |

Put the ID in the automated test's name, e.g. `it('TC-M3-04 rejects a radius of 5001 m', ...)`. The matrix generator checks that the file exists and mentions the ID.

## 5. Environments

| Environment | Database | Used for |
| --- | --- | --- |
| Local | Docker `studyspot-db` (PostGIS) from `npm run setup`. Integration tests always use the separate `studyspot_test` database in the same container (setup creates it), never the one in `backend/.env` | Development, `npm run check`, `npm run test:int` |
| CI (GitHub Actions) | `postgis/postgis:16-3.4` service | Every pull request and every push to `main` |
| Deployed | Supabase PostgreSQL + PostGIS, API on Render | Manual system tests from the app; the demo |

## 6. Entry and exit criteria

**A pull request may be reviewed when:** CI is green (lint, types, architecture rules, contract, unit, migrations, integration, build), the PR template lists the PB item, requirement IDs and test case IDs, and new rows are in `test-cases.csv`.

**A backlog item is done when:** its test cases are in the sheet and pass, at least one is automated, the reviewer has run the feature once, and it works on the deployed API.

**Sprint 1 testing is finished when:**

1. Every member has 12 to 15 documented cases (at least 60 from M2 to M6).
2. Every Sprint 1 requirement in the backlog has at least one case in the matrix.
3. No case is `Fail` without a linked issue and a note in the release notes.
4. `npm run test:matrix -- --check` reports no sheet problems.
5. CI on `main` is green and the deployed health check answers `{status: ok, database: up}`.

## 7. Defects

Open a GitHub issue (or a Jira bug) with: steps, expected, actual, request ID from the error body or the `X-Request-Id` header, and severity:

- **Blocker:** a core flow (sign in, search, details) does not work, or data is exposed to the wrong user. Fixed before merge day.
- **Major:** a requirement is not met but there is a workaround. Fixed in Sprint 1 if possible, otherwise listed in the release notes.
- **Minor:** wording, layout, or a rare edge case. Scheduled.

Put the issue number in the Actual column of the failing case.

## 8. Schedule (week of 26 Oct)

| Day | Testing work |
| --- | --- |
| Mon 26 | Contracts frozen; each member lists the requirements they will cover |
| Tue to Thu | Write automated tests together with the feature; add rows to the sheet in the same PR |
| Fri 30 (merge day, M1 leads) | All PRs merged after review; full CI on `main`; deploy to Render; manual smoke test of the core flows on a phone |
| Sat 31 | Everyone's rows collected; M1 runs `npm run test:matrix`, fixes sheet problems with the owners, and adds the matrix to the SDS |
| Sun 1 Nov | Submission |

## 9. Commands

```bash
npm run check                    # lint, types, architecture rules, unit + API-layer tests
npm run test:int                 # integration tests on studyspot_test (Docker running)
npm run test:matrix              # rebuild docs/testing/traceability-matrix.md from the sheet
npm run test:matrix -- --check   # the same, failing on sheet problems (CI runs this)
cd app && flutter test           # Flutter widget tests
```

## 10. Risks

| Risk | Effect | What we do |
| --- | --- | --- |
| Stubs replaced late in the week | Little time to test real code | Stubs keep the contract, so tests written against the API stay valid; merge day is Friday, not Sunday |
| No Google key | Real geocoding untested against Google | Adapter fully tested with a mocked `fetch`; the fake stays active until a key is added |
| Render free tier sleeps | First request after idle takes up to a minute | Open `/api/v1/health` before a demo |
| Shared test database | Integration tests wipe it | They ignore `backend/.env` and only use `studyspot_test` (or `TEST_DATABASE_URL`); never set that to your dev or the deployed database |
