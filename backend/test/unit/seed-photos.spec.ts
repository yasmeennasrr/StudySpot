import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isHttpsUrl, SeedVenue, validateVenue } from '../../src/db/seed/seed';

// The seed's database connection is not needed to check its data.
jest.mock('../../src/db/data-source', () => ({ __esModule: true, default: {} }));

const BASE: SeedVenue = {
  id: '6f1c2a10-0000-4000-8000-000000000001',
  name: 'Test Café',
  lat: 30.02,
  lng: 31.49,
};

describe('Venue photos in the seed data', () => {
  it('TC-M6-52 accepts an https photo link or none, and rejects http, other schemes, broken and over-long links (FR-016)', () => {
    expect(validateVenue(BASE, 0)).toEqual([]);
    expect(validateVenue({ ...BASE, photoUrl: null }, 0)).toEqual([]);
    expect(
      validateVenue({ ...BASE, photoUrl: 'https://images.unsplash.com/photo-1?w=1200' }, 0),
    ).toEqual([]);

    for (const bad of [
      'http://images.unsplash.com/photo-1',
      'javascript:alert(1)',
      'data:image/png;base64,AAAA',
      'not a link',
      '',
      `https://example.com/${'a'.repeat(500)}`,
    ]) {
      const problems = validateVenue({ ...BASE, photoUrl: bad }, 3);
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain('venues[3] (Test Café): photoUrl must be an https:// link');
    }

    expect(isHttpsUrl('https://a.b/c', 13)).toBe(true);
    expect(isHttpsUrl('https://a.b/cd', 13)).toBe(false);
  });

  it('TC-M6-53 every demo place in seed/venues.json has a valid photo, each a different one, credited in seed/PHOTOS.md (FR-016)', () => {
    const seedDir = join(__dirname, '../../seed');
    const venues = JSON.parse(readFileSync(join(seedDir, 'venues.json'), 'utf8')) as SeedVenue[];
    const credits = readFileSync(join(seedDir, 'PHOTOS.md'), 'utf8');

    expect(venues.flatMap(validateVenue)).toEqual([]);
    const photos = venues.map((v) => v.photoUrl);
    expect(
      photos.every((p) => typeof p === 'string' && p.startsWith('https://images.unsplash.com/')),
    ).toBe(true);
    expect(new Set(photos).size).toBe(venues.length);
    for (const v of venues) {
      const photoId = /photo-([0-9a-f-]+)/.exec(v.photoUrl!)![1];
      expect(credits).toContain(`| ${v.name} |`);
      expect(photos.filter((p) => p!.includes(photoId))).toHaveLength(1);
    }
  });
});
