/**
 * The database the integration tests use. They DROP and recreate its schema, so it
 * must never be your dev database or Supabase. `npm run setup` creates it in Docker;
 * CI overrides it with TEST_DATABASE_URL.
 */
export const TEST_DATABASE_URL = 'postgres://studyspot:studyspot@localhost:5432/studyspot_test';
