import { CONFIG_DEFAULTS, type ConditionType, type Level } from '../../src/contracts';
import {
  ConditionResolver,
  type ResolveContext,
} from '../../src/modules/conditions/condition-resolver';
import {
  crowdLevelFromCount,
  historicalSets,
  usableFor,
  weightedUpperMedian,
  type InputRecord,
  type RecordSource,
} from '../../src/modules/conditions/condition-rules';

/**
 * TC-M4-01..TC-M4-11: the fallback chain current -> hours ago -> historical ->
 * unavailable and the combining rules of SDS 6.6.1 to 6.6.3, at their boundaries.
 * 2026-10-27 10:00 Cairo (UTC+3) is a Tuesday.
 */
const NOW = new Date('2026-10-27T10:00:00+03:00');
const resolver = new ConditionResolver();
let seq = 0;

function rec(
  type: ConditionType,
  value: Level,
  minutesAgo: number,
  sourceType: RecordSource = 'in_app_survey',
  userId: string | null = null,
): InputRecord {
  return {
    id: `r${++seq}`,
    conditionType: type,
    value,
    sourceType,
    recordedAt: new Date(NOW.getTime() - minutesAgo * 60_000),
    userId,
  };
}

function resolve(type: ConditionType, records: InputRecord[], extra: Partial<ResolveContext> = {}) {
  const freshness = {
    crowd: CONFIG_DEFAULTS['freshness.crowdMinutes'],
    noise: CONFIG_DEFAULTS['freshness.noiseMinutes'],
    wifi: CONFIG_DEFAULTS['freshness.wifiMinutes'],
  };
  return resolver.resolve({
    type,
    at: NOW,
    records: [...records].sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime()),
    presentCount: 0,
    sizeClass: 'medium',
    limits: {
      freshnessMinutes: freshness[type],
      lastKnownMaxHours: CONFIG_DEFAULTS['conditions.lastKnownMaxHours'],
      historicalMinRecords: CONFIG_DEFAULTS['conditions.historicalMinRecords'],
    },
    ...extra,
  });
}

const HOUR = 60;
const DAY = 24 * HOUR;

describe('ConditionResolver (Chain of Responsibility, SDS 6.6)', () => {
  it('TC-M4-01 a noise input 59 min old is current, 61 min old is "hours ago" (RT-001)', () => {
    const fresh = resolve('noise', [rec('noise', 1, 59)]);
    expect(fresh).toMatchObject({ status: 'current', level: 1, label: 'Quiet', isEstimate: true });
    expect(fresh.newestInputAt).toBe(new Date(NOW.getTime() - 59 * 60_000).toISOString());
    expect(fresh.basedOn).toEqual(['surveys']);

    expect(resolve('noise', [rec('noise', 1, 61)]).status).toBe('hours_ago');
  });

  it('TC-M4-02 the newest input 23 h 59 min old is "hours ago", 24 h 1 min old falls to historical (RT-016)', () => {
    const lastKnown = resolve('crowd', [rec('crowd', 3, 24 * HOUR - 1)]);
    expect(lastKnown).toMatchObject({ status: 'hours_ago', level: 3, label: 'High' });
    expect(lastKnown.newestInputAt).not.toBeNull();

    const old = resolve('crowd', [rec('crowd', 3, 24 * HOUR + 1)]);
    expect(old).toMatchObject({
      status: 'historical',
      level: 3,
      newestInputAt: null,
      basedOn: ['historical'],
    });
  });

  it('TC-M4-03 Wi-Fi stays current for 6 hours: 5 h 59 min current, 6 h 1 min "hours ago" (RT-001)', () => {
    expect(resolve('wifi', [rec('wifi', 3, 6 * HOUR - 1)])).toMatchObject({
      status: 'current',
      label: 'Good',
      isEstimate: false,
    });
    expect(resolve('wifi', [rec('wifi', 3, 6 * HOUR + 1)]).status).toBe('hours_ago');
  });

  it('TC-M4-04 no record at all gives "unavailable" with no level or label (RT-018, FR-021)', () => {
    for (const type of ['crowd', 'noise', 'wifi'] as const) {
      expect(resolve(type, [])).toEqual({
        level: null,
        label: null,
        status: 'unavailable',
        newestInputAt: null,
        basedOn: [],
        isEstimate: type !== 'wifi',
      });
    }
  });

  it('TC-M4-05 one Quiet audio result (weight 2) and two Noisy answers give Moderate (SDS 6.6.2 example)', () => {
    const value = resolve('noise', [
      rec('noise', 1, 5, 'audio_analysis'),
      rec('noise', 3, 10, 'in_app_survey', 'u1'),
      rec('noise', 3, 15, 'qr_survey', 'u2'),
    ]);
    expect(value).toMatchObject({ status: 'current', level: 2, label: 'Moderate' });
    expect(value.basedOn).toEqual(['surveys', 'audio']);
  });

  it('TC-M4-06 a weighted average of exactly .5 rounds up (1.5 -> 2, 2.5 -> 3)', () => {
    expect(resolve('wifi', [rec('wifi', 1, 10), rec('wifi', 2, 20)]).level).toBe(2);
    expect(resolve('wifi', [rec('wifi', 2, 10), rec('wifi', 3, 20)]).level).toBe(3);
    expect(
      resolve('wifi', [rec('wifi', 1, 10), rec('wifi', 1, 20), rec('wifi', 2, 30)]).level,
    ).toBe(1);
  });

  it('TC-M4-07 only the newest answer of each user counts (SDS 6.6.1, 6.6.2)', () => {
    // Without the rule: (1 + 3 + 3 + 3) / 4 = 2.5 -> Noisy. With it: (1 + 3) / 2 = 2 -> Moderate.
    const value = resolve('noise', [
      rec('noise', 1, 5, 'in_app_survey', 'quiet-user'),
      rec('noise', 3, 10, 'in_app_survey', 'loud-user'),
      rec('noise', 3, 20, 'in_app_survey', 'loud-user'),
      rec('noise', 3, 30, 'in_app_survey', 'loud-user'),
    ]);
    expect(value.level).toBe(2);
  });

  it('TC-M4-08 present users are a lower bound for crowd: a survey can raise it, never lower it (SDS 6.6.1)', () => {
    const both = resolve('crowd', [rec('crowd', 1, 10)], { presentCount: 10 });
    expect(both).toMatchObject({
      status: 'current',
      level: 3,
      basedOn: ['present_users', 'surveys'],
    });
    expect(both.newestInputAt).toBe(NOW.toISOString());

    const surveyHigher = resolve('crowd', [rec('crowd', 3, 10)], { presentCount: 1 });
    expect(surveyHigher.level).toBe(3);

    const onlyPresence = resolve('crowd', [], { presentCount: 5 });
    expect(onlyPresence).toMatchObject({ status: 'current', level: 2, basedOn: ['present_users'] });

    // A count of 0 is no input (A-003), so the chain moves on.
    expect(resolve('crowd', [], { presentCount: 0 }).status).toBe('unavailable');
  });

  it('TC-M4-09 present-user count to crowd level at the size-class thresholds (RT-020)', () => {
    expect(crowdLevelFromCount(0, 'medium')).toBeNull();
    expect(crowdLevelFromCount(1, 'medium')).toBe(1);
    expect(crowdLevelFromCount(4, 'medium')).toBe(1);
    expect(crowdLevelFromCount(5, 'medium')).toBe(2);
    expect(crowdLevelFromCount(9, 'medium')).toBe(2);
    expect(crowdLevelFromCount(10, 'medium')).toBe(3);
    expect(crowdLevelFromCount(3, 'small')).toBe(2);
    expect(crowdLevelFromCount(6, 'small')).toBe(3);
    expect(crowdLevelFromCount(7, 'large')).toBe(1);
    expect(crowdLevelFromCount(16, 'large')).toBe(3);
  });

  it('TC-M4-10 historical estimate uses the first set with 3 records; the median tie goes up (SDS 6.6.3)', () => {
    // Same weekday (Tuesday) and hour, 1, 2 and 3 weeks ago: all Quiet.
    const sameHour = [1, 2, 3].map((w) => rec('noise', 1, w * 7 * DAY));
    // Weekend mornings (Sat 3 and 10 days ago, Fri 4 and 11 days ago), Noisy:
    // another day type, so only in the "all records" set.
    const friday = [3, 4, 10, 11].map((d) => rec('noise', 3, d * DAY));
    const sets = historicalSets([...sameHour, ...friday], NOW);
    expect(sets[0]).toHaveLength(3);
    expect(resolve('noise', [...sameHour, ...friday]).level).toBe(1);

    // Only 2 same-hour records: set 1 is skipped, set 2 (weekday, +-1 h) still has only 2,
    // so all 6 records are used: [1,1,3,3,3,3] -> upper median 3.
    const fewer = [...sameHour.slice(0, 2), ...friday];
    expect(resolve('noise', fewer)).toMatchObject({ status: 'historical', level: 3 });

    // Same day type within one hour: Monday 10:50 counts for Tuesday 10:00.
    const mondayNear = rec('noise', 2, DAY - 50);
    expect(historicalSets([mondayNear], NOW)[1]).toEqual([mondayNear]);
    const mondayFar = rec('noise', 2, DAY - 70);
    expect(historicalSets([mondayFar], NOW)[1]).toEqual([]);

    expect(weightedUpperMedian([rec('noise', 1, 0), rec('noise', 2, 0)])).toBe(2);
    expect(
      weightedUpperMedian([
        rec('noise', 1, 0),
        rec('noise', 1, 0),
        rec('noise', 3, 0),
        rec('noise', 3, 0),
      ]),
    ).toBe(3);
  });

  it('TC-M4-11 audio never feeds crowd or Wi-Fi; presence rows are not used as records (RT-015)', () => {
    expect(usableFor('noise', 'audio_analysis')).toBe(true);
    expect(usableFor('crowd', 'audio_analysis')).toBe(false);
    expect(usableFor('wifi', 'audio_analysis')).toBe(false);
    expect(usableFor('crowd', 'present_user_count')).toBe(false);
    for (const type of ['crowd', 'noise', 'wifi'] as const) {
      expect(usableFor(type, 'qr_survey')).toBe(true);
      expect(usableFor(type, 'in_app_survey')).toBe(true);
    }
  });
});
