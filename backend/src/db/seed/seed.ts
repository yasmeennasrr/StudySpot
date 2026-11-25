/**
 * Loads seed data into the database (PB-02). Safe to run again: venues are
 * upserted by id, and dynamic records are replaced for the seeded venues.
 *
 *   npm run seed
 *
 * Also creates the development account dev@studyspot.test / devpass123 (id ...0001),
 * so there is always someone to sign in as with POST /auth/login.
 * Set SEED_DEV_USER=false to skip it.
 *
 * Files (backend/seed/):
 *   venues.json   M3's fictional demo cafés. Falls back to venues.sample.json.
 *   offers.json   demo coupon offers (PB-25), upserted by id. Offers of a venue that is
 *                 not in the venue file are skipped.
 *   records.json  optional synthetic history (90 days of survey inputs), written by M4
 *                 with `npm run seed:records`, so the details screen shows current,
 *                 hours-ago, historical and unavailable values. Its times are moved
 *                 to the time of seeding (see shiftRecords).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { In, IsNull } from 'typeorm';
import dataSource from '../data-source';
import { CouponOfferEntity, DynamicRecordEntity, UserEntity, VenueEntity } from '../entities';

export interface SeedVenue {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address?: string | null;
  area?: string | null;
  /** HTTPS link to a photo (see seed/PHOTOS.md for sources and licences). */
  photoUrl?: string | null;
  openingHours?: VenueEntity['openingHours'];
  priceLevel?: 1 | 2 | 3 | 4 | null;
  wifiAvailable?: boolean | null;
  outletsAvailable?: boolean | null;
  studyType?: 'individual' | 'group' | 'both' | null;
  sizeClass?: 'small' | 'medium' | 'large';
}

export interface SeedOffer {
  id: string;
  venueId: string;
  reward: string;
  pointCost: number;
}

/** Problems in offers.json, so a typo fails the seed instead of the database (PB-25). */
export function validateOffer(o: SeedOffer, index: number): string[] {
  const problems: string[] = [];
  const where = `offers[${index}] (${o.reward ?? 'no reward'})`;
  if (!/^[0-9a-f-]{36}$/i.test(o.id ?? '')) problems.push(`${where}: id must be a UUID`);
  if (!/^[0-9a-f-]{36}$/i.test(o.venueId ?? '')) problems.push(`${where}: venueId must be a UUID`);
  if (!o.reward || o.reward.length > 120)
    problems.push(`${where}: reward is required, at most 120 characters`);
  if (!Number.isInteger(o.pointCost) || o.pointCost <= 0)
    problems.push(`${where}: pointCost must be a whole number above 0`);
  return problems;
}

export interface SeedRecord {
  venueId: string;
  conditionType: 'crowd' | 'noise' | 'wifi';
  value: 1 | 2 | 3;
  sourceType: 'qr_survey' | 'in_app_survey' | 'audio_analysis' | 'present_user_count';
  recordedAt: string;
}

/** records.json: the records and the time they were generated for. */
export interface SeedRecordsFile {
  anchor: string;
  records: SeedRecord[];
}

const WEEK_MS = 7 * 86_400_000;
const DAY_MS = 86_400_000;

/**
 * Moves generated records to the time of seeding, so the demo always shows every
 * label (M4). Inputs from the last day before the anchor move by the exact time
 * passed, so "current" stays current; older history moves by whole weeks only,
 * so its weekday and hour patterns stay where they were (SDS 6.6.3).
 */
export function shiftRecords(file: SeedRecordsFile, now: Date): SeedRecord[] {
  const anchor = new Date(file.anchor).getTime();
  const passed = Math.max(0, now.getTime() - anchor);
  const weeks = Math.floor(passed / WEEK_MS) * WEEK_MS;
  return file.records.map((r) => {
    const t = new Date(r.recordedAt).getTime();
    const shift = anchor - t <= DAY_MS ? passed : weeks;
    return { ...r, recordedAt: new Date(t + shift).toISOString() };
  });
}

const SEED_DIR = join(__dirname, '../../../seed');

/** Development account. Password hash is bcrypt (cost 10) of "devpass123". */
export const DEV_USER = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'dev@studyspot.test',
  displayName: 'Dev Student',
  passwordHash: '$2a$10$HFErJJquFuYG2FgFKY4wjue68rP.20m4cEu81pjwtR0xxRgT99c72',
} as const;

/**
 * Local staff accounts for the Staff Console (PB-32). Only created when the database
 * is local (DATABASE_SSL not true), never on Supabase: there, create staff with
 * `npm run staff:create`, which asks for a password.
 *   admin@studyspot.test / adminpass123 (admin), mod@studyspot.test / modpass123 (moderator)
 */
export const DEV_STAFF = [
  {
    id: '00000000-0000-4000-8000-0000000000a1',
    email: 'admin@studyspot.test',
    displayName: 'Dev Admin',
    role: 'admin' as const,
    passwordHash: '$2b$10$7AgoTnb9VwvwjfZikbh2.esSqxBO4WKJOkbEeHOYmjNLP82SMdeYK',
  },
  {
    id: '00000000-0000-4000-8000-0000000000a2',
    email: 'mod@studyspot.test',
    displayName: 'Dev Moderator',
    role: 'moderator' as const,
    passwordHash: '$2b$10$yuEltm5bkBYPXIzoYINEHOyiA.NP1S16jpZdkSSppWNCoSW/l4XA.',
  },
];

function readJson<T>(name: string): T | null {
  const file = join(SEED_DIR, name);
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : null;
}

export function validateVenue(v: SeedVenue, index: number): string[] {
  const problems: string[] = [];
  const where = `venues[${index}] (${v.name ?? 'no name'})`;
  if (!/^[0-9a-f-]{36}$/i.test(v.id ?? '')) problems.push(`${where}: id must be a UUID`);
  if (!v.name || v.name.length > 120)
    problems.push(`${where}: name is required, at most 120 characters`);
  if (typeof v.lat !== 'number' || v.lat < 21 || v.lat > 32)
    problems.push(`${where}: lat must be a number inside Egypt`);
  if (typeof v.lng !== 'number' || v.lng < 24 || v.lng > 37)
    problems.push(`${where}: lng must be a number inside Egypt`);
  if (v.priceLevel != null && ![1, 2, 3, 4].includes(v.priceLevel))
    problems.push(`${where}: priceLevel must be 1..4`);
  if (v.photoUrl != null && !isHttpsUrl(v.photoUrl, 500))
    problems.push(`${where}: photoUrl must be an https:// link of at most 500 characters`);
  return problems;
}

/** True for an absolute https:// URL no longer than [max] characters. */
export function isHttpsUrl(value: string, max: number): boolean {
  if (value.length > max) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const venues =
    readJson<SeedVenue[]>('venues.json') ?? readJson<SeedVenue[]>('venues.sample.json');
  if (!venues) throw new Error(`No seed/venues.json or seed/venues.sample.json in ${SEED_DIR}`);
  const offers = readJson<SeedOffer[]>('offers.json') ?? [];
  const problems = [...venues.flatMap(validateVenue), ...offers.flatMap(validateOffer)];
  if (problems.length) throw new Error('Seed data has problems:\n' + problems.join('\n'));

  await dataSource.initialize();
  try {
    await dataSource.transaction(async (tx) => {
      if (process.env.SEED_DEV_USER !== 'false') {
        await tx
          .getRepository(UserEntity)
          .createQueryBuilder()
          .insert()
          .values({ ...DEV_USER, termsAcceptedAt: new Date(), role: 'user' })
          .orIgnore()
          .execute();
      }
      if (process.env.SEED_DEV_USER !== 'false' && process.env.DATABASE_SSL !== 'true') {
        await tx
          .getRepository(UserEntity)
          .createQueryBuilder()
          .insert()
          .values(DEV_STAFF.map((s) => ({ ...s, termsAcceptedAt: new Date() })))
          .orIgnore()
          .execute();
      }
      const repo = tx.getRepository(VenueEntity);
      for (const v of venues) {
        await repo.save({
          id: v.id,
          name: v.name,
          location: { type: 'Point', coordinates: [v.lng, v.lat] },
          address: v.address ?? null,
          area: v.area ?? null,
          photoUrl: v.photoUrl ?? null,
          openingHours: v.openingHours ?? null,
          priceLevel: v.priceLevel ?? null,
          wifiAvailable: v.wifiAvailable ?? null,
          outletsAvailable: v.outletsAvailable ?? null,
          studyType: v.studyType ?? null,
          sizeClass: v.sizeClass ?? 'medium',
          source: 'team',
          active: true,
        });
      }
      const venueIds = new Set(venues.map((v) => v.id));
      const seededOffers = offers.filter((o) => venueIds.has(o.venueId));
      for (const o of seededOffers) {
        await tx.getRepository(CouponOfferEntity).save({ ...o, active: true });
      }
      const file = readJson<SeedRecordsFile>('records.json');
      let records: SeedRecord[] | null = null;
      if (file) {
        const ids = venues.map((v) => v.id);
        const known = new Set(ids);
        // Records of a venue that is not in the venue file are skipped, not an error.
        records = shiftRecords(file, new Date()).filter((r) => known.has(r.venueId));
        const repo = tx.getRepository(DynamicRecordEntity);
        await repo.delete({ venueId: In(ids), surveyId: IsNull() });
        for (let i = 0; i < records.length; i += 1000) {
          await repo.insert(
            records
              .slice(i, i + 1000)
              .map((r) => ({ ...r, recordedAt: new Date(r.recordedAt), surveyId: null })),
          );
        }
      }
      console.log(
        `Seeded ${venues.length} venues, ${seededOffers.length} coupon offers${records ? ` and ${records.length} dynamic records` : ''}.`,
      );
    });
  } finally {
    await dataSource.destroy();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
