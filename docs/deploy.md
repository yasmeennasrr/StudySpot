# Deploying StudySpot (Render + Supabase)

Owner: M1. The API runs on Render's free tier; the database is Supabase PostgreSQL with PostGIS. Every push to `main` redeploys automatically.

## What is already done

- **Supabase project `studyspot`** (region eu-central-1, Frankfurt, free tier).
  - The schema from `InitialSchema1792946643956` is applied: 19 tables, with PostGIS, pg_trgm and uuid-ossp in the `extensions` schema.
  - It is recorded in `schema_migrations`, so `migration:run` on Render sees nothing to do and only applies newer migrations.
  - Row Level Security is on for every table, with no policies. Supabase's public Data API (anon key) can read nothing; the backend connects as the database owner and is not affected.
  - Loaded data: the 3 sample venues and the development account `dev@studyspot.test` / `devpass123` (the account the token `stub.00000000-0000-4000-8000-000000000001` uses until M2's login lands).
- **`render.yaml`** at the repo root describes the web service: build, start, health check, and environment variables.

## Live service

- API: https://studyspot-api-x8u6.onrender.com/api/v1
- Docs: https://studyspot-api-x8u6.onrender.com/api/docs
- Health: https://studyspot-api-x8u6.onrender.com/api/v1/health

## One-time steps (M1)

### 1. Get the database connection string

1. Open the project in the [Supabase dashboard](https://supabase.com/dashboard), then go to **Project Settings → Database**.
2. Click **Reset database password**, generate a password, and keep it somewhere safe (a password manager). It is never committed or pasted in chat.
3. Click **Connect** (top of the page) and choose **Session pooler**. Copy the URI. It looks like:

   ```
   postgresql://postgres.irhjhmelouiqenoaleox:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
   ```

   Replace `[YOUR-PASSWORD]` with the new password. Use the Session pooler and not the direct connection: the direct host is IPv6-only and Render cannot reach it.

### 2. Create the Render service

1. Sign in to [Render](https://render.com) with GitHub, then choose **New → Blueprint**.
2. Pick the `StudySpot` repository. If it is not listed, Yasmeen (the repo owner) must allow Render on it.
3. Render reads `render.yaml` and asks for the secret values:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | The Session pooler URI from step 1 |
   | `PUBLIC_BASE_URL` | `https://studyspot-api.onrender.com`. Use the URL Render shows; fix it after the first deploy if it differs |
   | `GOOGLE_GEOCODING_API_KEY` | Leave empty for now. The offline geocoder knows the main Cairo areas |
   | `GEMINI_API_KEY`, `SENDGRID_API_KEY` | Leave empty (Sprint 2 and 3) |

   Render sets `DATABASE_SSL=true`, `DATABASE_RUN_MIGRATIONS=true`, and generates `JWT_ACCESS_SECRET`.
4. Click **Apply**. The first build takes about 3 minutes.

### 3. Check it

- Open `https://<your-service>.onrender.com/api/v1/health`. It should return `{"status":"ok","database":"up",...}`.
- Open `https://<your-service>.onrender.com/api/docs` for the interactive API docs.
- Try `GET /api/v1/venues/search?area=zamalek`, then `PUT /api/v1/me/favorites/6f1c2a10-0000-4000-8000-000000000002` with the header `Authorization: Bearer stub.00000000-0000-4000-8000-000000000001`, then `GET /api/v1/me/favorites`.

Share the base URL (`https://<your-service>.onrender.com/api/v1`) with M5 and M6 for the app's `API_BASE_URL`.

## Later

- **Seed data:** when M3's `backend/seed/venues.json` or M4's `records.json` change, load them into Supabase from your laptop. Put the Supabase URI in `backend/.env` together with `DATABASE_SSL=true`, then run `npm --prefix backend run seed`. Switch `.env` back to the local database afterwards.
- **Google geocoding:** in Google Cloud, create a key restricted to the Geocoding API, then add it as `GOOGLE_GEOCODING_API_KEY` in Render (Environment tab). The backend switches from the offline geocoder to Google on the next deploy. Locally, put it in `backend/.env`.
- **Free-tier sleep:** Render's free service sleeps after 15 minutes idle, and the first request after that takes up to a minute. Open `/api/v1/health` a minute before a demo.
- **Supabase pausing:** free projects pause after a week with no activity. Restore the project from the dashboard if the health check reports `database: down`.
