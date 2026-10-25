/**
 * Loads seed data into the database (PB-02). Safe to run again: venues are
 * upserted by id, and dynamic records are replaced for the seeded venues.
 *
 *   npm run seed
 *
 * Files (backend/seed/):
 *   venues.json   real cafés, written by M3. Falls back to venues.sample.json.
 *   records.json  optional synthetic history (90 days of survey inputs), written by M4,
 *                 so the details screen shows current, hours-ago and historical values.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { In, IsNull } from 'typeorm';
import dataSource from '../data-source';
import { DynamicRecordEntity, VenueEntity } from '../entities';

export interface SeedVenue {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address?: string | null;
  area?: string | null;
  openingHours?: VenueEntity['openingHours'];
  priceLevel?: 1 | 2 | 3 | 4 | null;
  wifiAvailable?: boolean | null;
  outletsAvailable?: boolean | null;
  studyType?: 'individual' | 'group' | 'both' | null;
  sizeClass?: 'small' | 'medium' | 'large';
}

export interface SeedRecord {
  venueId: string;
  conditionType: 'crowd' | 'noise' | 'wifi';
  value: 1 | 2 | 3;
  sourceType: 'qr_survey' | 'in_app_survey' | 'audio_analysis' | 'present_user_count';
  recordedAt: string;
}

const SEED_DIR = join(__dirname, '../../../seed');

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
  return problems;
}

async function main(): Promise<void> {
  const venues =
    readJson<SeedVenue[]>('venues.json') ?? readJson<SeedVenue[]>('venues.sample.json');
  if (!venues) throw new Error(`No seed/venues.json or seed/venues.sample.json in ${SEED_DIR}`);
  const problems = venues.flatMap(validateVenue);
  if (problems.length) throw new Error('Seed data has problems:\n' + problems.join('\n'));

  await dataSource.initialize();
  try {
    await dataSource.transaction(async (tx) => {
      const repo = tx.getRepository(VenueEntity);
      for (const v of venues) {
        await repo.save({
          id: v.id,
          name: v.name,
          location: { type: 'Point', coordinates: [v.lng, v.lat] },
          address: v.address ?? null,
          area: v.area ?? null,
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
      const records = readJson<SeedRecord[]>('records.json');
      if (records) {
        const ids = venues.map((v) => v.id);
        await tx
          .getRepository(DynamicRecordEntity)
          .delete({ venueId: In(ids), surveyId: IsNull() });
        await tx
          .getRepository(DynamicRecordEntity)
          .insert(
            records.map((r) => ({ ...r, recordedAt: new Date(r.recordedAt), surveyId: null })),
          );
      }
      console.log(
        `Seeded ${venues.length} venues${records ? ` and ${records.length} dynamic records` : ''}.`,
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
