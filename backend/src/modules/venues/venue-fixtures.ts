import type { VenueStatic } from '../../contracts';

/**
 * Three sample venues used by the Sprint 1 stubs until M3's seed data and
 * PostGIS queries replace them. Same ids as backend/seed/venues.sample.json.
 */
export const SAMPLE_VENUES: VenueStatic[] = [
  {
    id: '6f1c2a10-0000-4000-8000-000000000001',
    name: 'Sample Study Café (New Cairo)',
    location: { lat: 30.0205, lng: 31.4952 },
    address: '90th Street, New Cairo',
    area: 'New Cairo',
    openingHours: {
      0: [{ open: '08:00', close: '00:00' }],
      1: [{ open: '08:00', close: '00:00' }],
      2: [{ open: '08:00', close: '00:00' }],
      3: [{ open: '08:00', close: '00:00' }],
      4: [{ open: '08:00', close: '02:00' }],
      5: [{ open: '10:00', close: '02:00' }],
      6: [{ open: '10:00', close: '00:00' }],
    },
    priceLevel: 2,
    wifiAvailable: true,
    outletsAvailable: true,
    studyType: 'both',
  },
  {
    id: '6f1c2a10-0000-4000-8000-000000000002',
    name: 'Sample Quiet Corner (Zamalek)',
    location: { lat: 30.0626, lng: 31.2197 },
    address: '26th of July Street, Zamalek',
    area: 'Zamalek',
    openingHours: {
      0: [{ open: '09:00', close: '23:00' }],
      1: [{ open: '09:00', close: '23:00' }],
      2: [{ open: '09:00', close: '23:00' }],
      3: [{ open: '09:00', close: '23:00' }],
      4: [{ open: '09:00', close: '23:00' }],
      6: [{ open: '11:00', close: '23:00' }],
    },
    priceLevel: 3,
    wifiAvailable: true,
    outletsAvailable: false,
    studyType: 'individual',
  },
  {
    id: '6f1c2a10-0000-4000-8000-000000000003',
    name: 'Sample Group Hub (Maadi)',
    location: { lat: 29.9597, lng: 31.2585 },
    address: 'Road 9, Maadi',
    area: 'Maadi',
    openingHours: null,
    priceLevel: 1,
    wifiAvailable: false,
    outletsAvailable: true,
    studyType: 'group',
  },
];

/** Great-circle distance in metres, for the in-memory stubs only (real code uses PostGIS). */
export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}
