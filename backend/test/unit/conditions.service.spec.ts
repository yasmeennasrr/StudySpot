import { LessThan, type Repository } from 'typeorm';
import { DomainEvent } from '../../src/common/events/domain-events';
import { CONFIG_DEFAULTS, type ConfigKey, type IConfig, type IPresence } from '../../src/contracts';
import type { DynamicRecordEntity, VenueEntity } from '../../src/db/entities';
import { FakeClock } from '../../src/modules/clock/fake-clock';
import { ConditionsService } from '../../src/modules/conditions/conditions.service';

/**
 * TC-M4-12, TC-M4-13: the Conditions service around the resolver: the 60-second
 * cache with event-driven refresh (RT-006, PERF-005) and the 90-day purge (PRIV-013).
 * The resolver rules are in condition-resolver.spec.ts; the database query is
 * covered by the integration test (venue-details.int-spec.ts).
 */
const VENUE = '6f1c2a10-0000-4000-8000-000000000001';

function setup() {
  const clock = new FakeClock('2026-10-27T10:00:00+03:00');
  let rows: unknown[] = [];
  const records = {
    query: jest.fn(async () => rows),
    delete: jest.fn(async () => ({ affected: 7, raw: [] })),
  };
  const venues = { find: jest.fn(async () => [{ id: VENUE, sizeClass: 'medium' }]) };
  const presence = { countPresent: jest.fn(async () => 0) } as unknown as IPresence;
  const config = {
    getAll: async () => CONFIG_DEFAULTS,
    get: async (key: ConfigKey) => CONFIG_DEFAULTS[key],
  } as unknown as IConfig;
  const service = new ConditionsService(
    records as unknown as Repository<DynamicRecordEntity>,
    venues as unknown as Repository<VenueEntity>,
    presence,
    config,
    clock,
  );
  const noiseRow = (level: number, minutesAgo: number) => ({
    id: `r${level}-${minutesAgo}`,
    venue_id: VENUE,
    condition_type: 'noise',
    value: level,
    source_type: 'in_app_survey',
    recorded_at: new Date(clock.now().getTime() - minutesAgo * 60_000),
    user_id: null,
  });
  return { service, clock, records, setRows: (r: unknown[]) => (rows = r), noiseRow };
}

describe('ConditionsService', () => {
  it('TC-M4-12 caches results for 60 s; a stored survey or noise result refreshes at once (RT-006, PERF-005)', async () => {
    const { service, clock, records, setRows, noiseRow } = setup();
    setRows([noiseRow(1, 10)]);
    expect((await service.getConditions(VENUE)).noise.label).toBe('Quiet');

    // Two Noisy surveys arrive: (3 + 3 + 1) / 3 = 2.3 would be Moderate, three make it
    // (3 + 3 + 3 + 1) / 4 = 2.5 -> Noisy. Within 60 s the cached value is still served...
    setRows([noiseRow(3, 0), noiseRow(3, 1), noiseRow(3, 2), noiseRow(1, 10)]);
    clock.advance({ seconds: 59 });
    expect((await service.getConditions(VENUE)).noise.label).toBe('Quiet');
    expect(records.query).toHaveBeenCalledTimes(1);

    // ...until the SurveyStored event drops the entry.
    service.onSurveyStored({
      surveyId: 's1',
      venueId: VENUE,
      userId: 'u1',
      source: 'in_app',
      submittedAt: clock.now(),
    });
    expect((await service.getConditions(VENUE)).noise.label).toBe('Noisy');
    expect(records.query).toHaveBeenCalledTimes(2);

    // Without an event the entry expires after 60 s.
    clock.advance({ seconds: 61 });
    await service.getConditions(VENUE);
    expect(records.query).toHaveBeenCalledTimes(3);

    // A fixed `at` is never cached; the listeners are wired to the right events.
    await service.getConditions(VENUE, clock.now());
    await service.getConditions(VENUE, clock.now());
    expect(records.query).toHaveBeenCalledTimes(5);
    const listens = (method: keyof ConditionsService) =>
      Reflect.getMetadata('EVENT_LISTENER_METADATA', ConditionsService.prototype[method]);
    expect(listens('onSurveyStored')[0].event).toBe(DomainEvent.SurveyStored);
    expect(listens('onNoiseRecorded')[0].event).toBe(DomainEvent.NoiseRecorded);
    expect(listens('onConfigChanged')[0].event).toBe(DomainEvent.ConfigChanged);
  });

  it('TC-M4-13 the daily purge deletes dynamic records older than 90 days (PRIV-013)', async () => {
    const { service, clock, records } = setup();
    expect(await service.purgeExpiredRecords()).toBe(7);
    const cutoff = new Date(clock.now().getTime() - 90 * 86_400_000);
    expect(records.delete).toHaveBeenCalledWith({ recordedAt: LessThan(cutoff) });
  });
});
