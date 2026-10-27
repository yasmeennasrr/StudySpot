# StudySpot app (Flutter): starting point for M5 and M6

M5 creates the Flutter project here on Monday. Until then this folder only holds this guide, and CI skips the app job.

## Create the project (M5, once)

```bash
cd app
flutter create --org edu.aucegypt --project-name studyspot --platforms android,ios .
```

## Agreed structure (MVVM, SDS 8)

```
lib/
  main.dart
  core/
    api/            ApiClient (dio), MockApiClient (reads ../backend/seed/venues.sample.json shape), AuthInterceptor
    models/         generated from ../contracts/openapi.yaml
    routing/        go_router
    widgets/        ErrorView (USE-008), ConditionLabel (status labels, USE-003)
  features/
    auth/           M5: terms (PRIV-011), register, sign-in, sign-out
    permissions/    M5: location purpose screen, manual area entry (PRIV-003, USE-007)
    preferences/    M5
    favorites/      M5
    search/         M6: search + nearby list + filter sheet
    map/            M6
    venue_details/  M6
  each feature: view.dart (widgets) <-> view_model.dart (state, no Flutter imports) <-> repository.dart (calls ApiClient)
```

## Talking to the backend

- Base URL: `http://10.0.2.2:3000/api/v1` from the Android emulator, `http://localhost:3000/api/v1` from the iOS simulator, or the Render staging URL.
- The contract: `../contracts/openapi.yaml`. Browse it at `/api/docs` on any running backend.
- Errors always look like `{ "code": "INVALID_INPUT", "message": "...", "details": [...], "requestId": "..." }`. Show `message` to the user.
- Timeout for normal calls 10 s; StudyMatch (Sprint 3) 12 s (SDS 5.1).
- Protected calls need `Authorization: Bearer <accessToken>` from `POST /auth/login` (dev user `dev@studyspot.test` / `devpass123`). Access tokens last 15 minutes: on a 401, call `POST /auth/refresh` with the refresh token, then retry once. Each refresh returns a new refresh token; store it and drop the old one.
- Status labels for crowd, noise and Wi-Fi come from `ConditionValue.status`:
  `current` → "Current: Quiet" · `hours_ago` → "3 hours ago: Quiet" (from `newestInputAt`) ·
  `historical` → "Estimate based on historical data: Quiet" · `unavailable` → "Unavailable". Mark crowd and noise as estimates.

## Generating models from the contract (optional)

```bash
dart pub global activate openapi_generator_cli   # or use json_serializable by hand
```

If generation takes longer than writing a few model classes by hand, write them by hand and keep the field names identical to the spec.
