# Requirements traceability matrix

> Generated from [`test-cases.csv`](test-cases.csv) by `npm run test:matrix`. Do not edit by hand: edit the sheet and run the command again.

## Summary

**67** test cases: **67** pass, **0** fail, **0** not run yet. They cover **46** requirement IDs.

| Member | Test cases | Pass | Fail | Not run | Automated |
| --- | ---: | ---: | ---: | ---: | ---: |
| M1 | 55 | 55 | 0 | 0 | 55 |
| M3 | 12 | 12 | 0 | 0 | 12 |

| Level | Test cases |
| --- | ---: |
| API layer | 10 |
| Integration | 25 |
| Unit | 32 |

## Requirement → test cases

| Requirement | Test cases | Levels | Status |
| --- | --- | --- | --- |
| DATA-001 | TC-M1-32 | Integration | ✅ all pass |
| DATA-002 | TC-M1-32, TC-M1-33 | Integration | ✅ all pass |
| DATA-003 | TC-M1-32 | Integration | ✅ all pass |
| DATA-004 | TC-M1-32 | Integration | ✅ all pass |
| DATA-005 | TC-M1-32 | Integration | ✅ all pass |
| DATA-006 | TC-M1-32 | Integration | ✅ all pass |
| DATA-007 | TC-M1-32 | Integration | ✅ all pass |
| DATA-008 | TC-M1-32 | Integration | ✅ all pass |
| DATA-009 | TC-M1-32 | Integration | ✅ all pass |
| DATA-010 | TC-M1-32 | Integration | ✅ all pass |
| DATA-011 | TC-M1-32 | Integration | ✅ all pass |
| DATA-012 | TC-M1-19, TC-M1-21, TC-M1-22, TC-M1-30, TC-M1-32 | Unit, Integration | ✅ all pass |
| EIR-008 | TC-M1-05, TC-M1-07, TC-M1-08, TC-M1-27, TC-M1-28 | Unit, API layer, Integration | ✅ all pass |
| EIR-010 | TC-M1-28 | Integration | ✅ all pass |
| EIR-011 | TC-M1-01, TC-M1-03, TC-M1-12, TC-M1-34, TC-M1-37, TC-M1-38, TC-M1-39, TC-M1-40, TC-M1-41 | Unit, API layer | ✅ all pass |
| FR-009 | TC-M3-02, TC-M3-03, TC-M3-04 | Unit | ✅ all pass |
| FR-010 | TC-M3-01, TC-M3-02, TC-M3-03, TC-M3-04, TC-M3-05, TC-M3-06, TC-M3-07, TC-M3-08, TC-M3-09, TC-M3-10, TC-M3-11, TC-M3-12 | Integration, Unit | ✅ all pass |
| FR-011 | TC-M1-31, TC-M1-34, TC-M1-35, TC-M1-36 | Integration, Unit | ✅ all pass |
| FR-012 | TC-M3-01, TC-M3-05, TC-M3-06, TC-M3-07, TC-M3-08, TC-M3-09, TC-M3-10, TC-M3-11, TC-M3-12 | Integration | ✅ all pass |
| FR-022 | TC-M1-43, TC-M1-48 | Unit, Integration | ✅ all pass |
| FR-023 | TC-M1-48 | Integration | ✅ all pass |
| FR-024 | TC-M1-48 | Integration | ✅ all pass |
| FR-026 | TC-M1-45, TC-M1-50, TC-M1-52 | Unit, Integration | ✅ all pass |
| FR-027 | TC-M1-46, TC-M1-47, TC-M1-50, TC-M1-51 | Unit, Integration | ✅ all pass |
| FR-039 | TC-M1-19, TC-M1-21 | Unit | ✅ all pass |
| PRIV-013 | TC-M1-24 | Unit | ✅ all pass |
| PRIV-016 | TC-M1-23 | Unit | ✅ all pass |
| QR-007 | TC-M1-23 | Unit | ✅ all pass |
| QR-009 | TC-M1-23 | Unit | ✅ all pass |
| RT-001 | TC-M1-18 | Unit | ✅ all pass |
| RT-004 | TC-M1-31 | Integration | ✅ all pass |
| RT-006 | TC-M1-20 | Unit | ✅ all pass |
| RT-008 | TC-M1-18 | Unit | ✅ all pass |
| RWD-002 | TC-M1-18 | Unit | ✅ all pass |
| RWD-009 | TC-M1-33 | Integration | ✅ all pass |
| RWD-016 | TC-M1-18 | Unit | ✅ all pass |
| RWD-018 | TC-M1-23 | Unit | ✅ all pass |
| SEC-001 | TC-M1-54 | Integration | ✅ all pass |
| SEC-003 | TC-M1-06, TC-M1-16 | Unit, API layer | ✅ all pass |
| SEC-004 | TC-M1-46, TC-M1-53 | Unit, Integration | ✅ all pass |
| SEC-007 | TC-M1-02, TC-M1-09, TC-M1-10, TC-M1-15, TC-M1-49, TC-M1-52 | Unit, API layer, Integration | ✅ all pass |
| SEC-010 | TC-M1-14, TC-M1-29 | API layer, Integration | ✅ all pass |
| SEC-013 | TC-M1-04, TC-M1-17 | Unit, API layer | ✅ all pass |
| UC-03 | TC-M1-35 | Unit | ✅ all pass |
| UC-22 | TC-M1-25 | Unit | ✅ all pass |
| USE-008 | TC-M1-01, TC-M1-06, TC-M1-11, TC-M1-13, TC-M1-44 | Unit, API layer | ✅ all pass |
| Referential integrity | TC-M1-55 | Integration | ✅ all pass |
| SDS 5.1 | TC-M1-42 | Unit | ✅ all pass |
| SDS 6 | TC-M1-26 | Integration | ✅ all pass |

## Test case → requirement

| Test case | Requirement | Technique | Level | Result | Automated test |
| --- | --- | --- | --- | --- | --- |
| TC-M1-01 | EIR-011, USE-008 | Equivalence partitioning (one class per error code) | Unit | pass | `backend/test/unit/all-exceptions.filter.spec.ts` |
| TC-M1-02 | SEC-007 | Equivalence partitioning | Unit | pass | `backend/test/unit/all-exceptions.filter.spec.ts` |
| TC-M1-03 | EIR-011 | Equivalence partitioning | Unit | pass | `backend/test/unit/all-exceptions.filter.spec.ts` |
| TC-M1-04 | SEC-013 (rate limit) | Equivalence partitioning | Unit | pass | `backend/test/unit/all-exceptions.filter.spec.ts` |
| TC-M1-05 | EIR-008 | Equivalence partitioning (4xx known, 4xx other, 5xx) | Unit | pass | `backend/test/unit/all-exceptions.filter.spec.ts` |
| TC-M1-06 | SEC-003 (no leaks), USE-008 | Error guessing | Unit | pass | `backend/test/unit/all-exceptions.filter.spec.ts` |
| TC-M1-07 | EIR-008 | Inspection | Unit | pass | `backend/test/unit/all-exceptions.filter.spec.ts` |
| TC-M1-08 | EIR-008 | Equivalence partitioning (valid class) | API layer | pass | `backend/test/e2e/api-layer.e2e-spec.ts` |
| TC-M1-09 | SEC-007 | Equivalence partitioning (invalid classes) | API layer | pass | `backend/test/e2e/api-layer.e2e-spec.ts` |
| TC-M1-10 | SEC-007 | Boundary value analysis | API layer | pass | `backend/test/e2e/api-layer.e2e-spec.ts` |
| TC-M1-11 | USE-008 | Equivalence partitioning | API layer | pass | `backend/test/e2e/api-layer.e2e-spec.ts` |
| TC-M1-12 | EIR-011 | Equivalence partitioning | API layer | pass | `backend/test/e2e/api-layer.e2e-spec.ts` |
| TC-M1-13 | USE-008 | Error guessing | API layer | pass | `backend/test/e2e/api-layer.e2e-spec.ts` |
| TC-M1-14 | SEC-010 (traceability) | State-based | API layer | pass | `backend/test/e2e/api-layer.e2e-spec.ts` |
| TC-M1-15 | SEC-007 | Equivalence partitioning (safe / unsafe id) | API layer | pass | `backend/test/e2e/api-layer.e2e-spec.ts` |
| TC-M1-16 | SEC-003 | Inspection | API layer | pass | `backend/test/e2e/api-layer.e2e-spec.ts` |
| TC-M1-17 | SEC-013 (rate limit) | Boundary value analysis | API layer | pass | `backend/test/e2e/api-layer.e2e-spec.ts` |
| TC-M1-18 | RT-001, RWD-002, RWD-016, RT-008 | Equivalence partitioning | Unit | pass | `backend/test/unit/configuration.service.spec.ts` |
| TC-M1-19 | DATA-012, FR-039 | Equivalence partitioning | Unit | pass | `backend/test/unit/configuration.service.spec.ts` |
| TC-M1-20 | RT-006 (cache) | Boundary value analysis | Unit | pass | `backend/test/unit/configuration.service.spec.ts` |
| TC-M1-21 | DATA-012, FR-039 | Equivalence partitioning (valid) | Unit | pass | `backend/test/unit/configuration.service.spec.ts` |
| TC-M1-22 | DATA-012 | Equivalence partitioning (invalid classes) | Unit | pass | `backend/test/unit/configuration.service.spec.ts` |
| TC-M1-23 | QR-007, QR-009, RWD-018, PRIV-016 | Error guessing (one job fails) | Unit | pass | `backend/test/unit/scheduler.spec.ts` |
| TC-M1-24 | PRIV-013 | Equivalence partitioning | Unit | pass | `backend/test/unit/scheduler.spec.ts` |
| TC-M1-25 | UC-22 (Scheduler switch) | Equivalence partitioning | Unit | pass | `backend/test/unit/scheduler.spec.ts` |
| TC-M1-26 | SDS 6 (architecture) | Inspection | Integration | pass | `backend/test/int/app.int-spec.ts` |
| TC-M1-27 | EIR-008 | Equivalence partitioning | Integration | pass | `backend/test/int/app.int-spec.ts` |
| TC-M1-28 | EIR-008, EIR-010 | Contract testing | Integration | pass | `backend/test/int/app.int-spec.ts` |
| TC-M1-29 | SEC-010 | Use-case based (UC-02 alt: wrong credentials) | Integration | pass | `backend/test/int/app.int-spec.ts` |
| TC-M1-30 | DATA-012 | Equivalence partitioning | Integration | pass | `backend/test/int/app.int-spec.ts` |
| TC-M1-31 | RT-004, FR-011 | Use-case based (UC-03 search by area) | Integration | pass | `backend/test/int/app.int-spec.ts` |
| TC-M1-32 | DATA-001..DATA-012 | Inspection | Integration | pass | `backend/test/int/app.int-spec.ts` |
| TC-M1-33 | RWD-009, DATA-002 | Boundary value analysis | Integration | pass | `backend/test/int/app.int-spec.ts` |
| TC-M1-34 | FR-011, EIR-011 | Equivalence partitioning (valid class) | Unit | pass | `backend/test/unit/google-geocoding.adapter.spec.ts` |
| TC-M1-35 | FR-011, UC-03 | Equivalence partitioning (no match) | Unit | pass | `backend/test/unit/google-geocoding.adapter.spec.ts` |
| TC-M1-36 | FR-011 | Boundary value analysis (empty input) | Unit | pass | `backend/test/unit/google-geocoding.adapter.spec.ts` |
| TC-M1-37 | EIR-011 | Equivalence partitioning (one class per error status) | Unit | pass | `backend/test/unit/google-geocoding.adapter.spec.ts` |
| TC-M1-38 | EIR-011 | Equivalence partitioning | Unit | pass | `backend/test/unit/google-geocoding.adapter.spec.ts` |
| TC-M1-39 | EIR-011 | Boundary value analysis (timeout) | Unit | pass | `backend/test/unit/google-geocoding.adapter.spec.ts` |
| TC-M1-40 | EIR-011 | Error guessing (network down) | Unit | pass | `backend/test/unit/google-geocoding.adapter.spec.ts` |
| TC-M1-41 | EIR-011 | Error guessing (bad answer) | Unit | pass | `backend/test/unit/google-geocoding.adapter.spec.ts` |
| TC-M1-42 | SDS 5.1 (Adapter) | Equivalence partitioning | Unit | pass | `backend/test/unit/google-geocoding.adapter.spec.ts` |
| TC-M1-43 | FR-022 | Equivalence partitioning | Unit | pass | `backend/test/unit/preferences-favorites.service.spec.ts` |
| TC-M1-44 | USE-008 | Error guessing (missing account) | Unit | pass | `backend/test/unit/preferences-favorites.service.spec.ts` |
| TC-M1-45 | FR-026 | Equivalence partitioning (invalid venue) | Unit | pass | `backend/test/unit/preferences-favorites.service.spec.ts` |
| TC-M1-46 | FR-027, SEC-004 | Equivalence partitioning | Unit | pass | `backend/test/unit/preferences-favorites.service.spec.ts` |
| TC-M1-47 | FR-027 | Error guessing | Unit | pass | `backend/test/unit/preferences-favorites.service.spec.ts` |
| TC-M1-48 | FR-022, FR-023, FR-024 | Use-case based (save, replace, clear preferences) | Integration | pass | `backend/test/int/preferences-favorites.int-spec.ts` |
| TC-M1-49 | SEC-007 | Equivalence partitioning + boundary values | Integration | pass | `backend/test/int/preferences-favorites.int-spec.ts` |
| TC-M1-50 | FR-026, FR-027 | Use-case based (add, list, remove favorite) | Integration | pass | `backend/test/int/preferences-favorites.int-spec.ts` |
| TC-M1-51 | FR-027 | Equivalence partitioning | Integration | pass | `backend/test/int/preferences-favorites.int-spec.ts` |
| TC-M1-52 | FR-026, SEC-007 | Equivalence partitioning (invalid classes) | Integration | pass | `backend/test/int/preferences-favorites.int-spec.ts` |
| TC-M1-53 | SEC-004 | Use-case based (two users) | Integration | pass | `backend/test/int/preferences-favorites.int-spec.ts` |
| TC-M1-54 | SEC-001 | Equivalence partitioning (no token) | Integration | pass | `backend/test/int/preferences-favorites.int-spec.ts` |
| TC-M1-55 | Referential integrity (SDS 6.7) | Error guessing | Integration | pass | `backend/test/int/preferences-favorites.int-spec.ts` |
| TC-M3-01 | FR-010, FR-012 | Boundary value analysis | Integration | pass | `backend/test/int/app.int-spec.ts` |
| TC-M3-02 | FR-009, FR-010 | Equivalence partitioning | Unit | pass | `backend/test/unit/venue-query.dto.spec.ts` |
| TC-M3-03 | FR-009, FR-010 | Equivalence partitioning | Unit | pass | `backend/test/unit/venue-query.dto.spec.ts` |
| TC-M3-04 | FR-009, FR-010 | Equivalence partitioning | Unit | pass | `backend/test/unit/venue-query.dto.spec.ts` |
| TC-M3-05 | FR-010, FR-012 | Boundary value analysis | Integration | pass | `backend/test/int/app.int-spec.ts` |
| TC-M3-06 | FR-010, FR-012 | Equivalence partitioning | Integration | pass | `backend/test/int/app.int-spec.ts` |
| TC-M3-07 | FR-010, FR-012 | Equivalence partitioning | Integration | pass | `backend/test/int/app.int-spec.ts` |
| TC-M3-08 | FR-010, FR-012 | Error guessing | Integration | pass | `backend/test/int/app.int-spec.ts` |
| TC-M3-09 | FR-010, FR-012 | Equivalence partitioning | Integration | pass | `backend/test/int/app.int-spec.ts` |
| TC-M3-10 | FR-010, FR-012 | Boundary value analysis | Integration | pass | `backend/test/int/app.int-spec.ts` |
| TC-M3-11 | FR-010, FR-012 | Boundary value analysis | Integration | pass | `backend/test/int/app.int-spec.ts` |
| TC-M3-12 | FR-010, FR-012 | Equivalence partitioning | Integration | pass | `backend/test/int/app.int-spec.ts` |

## Sheet problems

None.
