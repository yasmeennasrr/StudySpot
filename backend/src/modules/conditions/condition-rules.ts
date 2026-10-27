import {
  LEVEL_LABELS,
  type ConditionInput,
  type ConditionStatusKind,
  type ConditionType,
  type ConditionValue,
  type Level,
  type VenueSizeClass,
} from '../../contracts';

/**
 * The combining rules of SDS 6.6.1 to 6.6.3 as pure functions, so every rule
 * can be tested at its boundaries without a database. Owner: M4.
 */

export type RecordSource = 'qr_survey' | 'in_app_survey' | 'audio_analysis' | 'present_user_count';

/** One row of dynamic_records, plus the survey author for "newest answer per user". */
export interface InputRecord {
  id: string;
  conditionType: ConditionType;
  value: Level;
  sourceType: RecordSource;
  recordedAt: Date;
  /** Author of the survey behind the record; null for audio and seeded rows. */
  userId: string | null;
}

/**
 * Crowd thresholds per size class (RT-020): the present-user count at which the
 * level becomes Moderate and High. A count of 0 gives no input (SDS 6.6.1, A-003).
 */
export const CROWD_THRESHOLDS: Record<VenueSizeClass, { moderate: number; high: number }> = {
  small: { moderate: 3, high: 6 },
  medium: { moderate: 5, high: 10 },
  large: { moderate: 8, high: 16 },
};

const SURVEY_SOURCES: RecordSource[] = ['qr_survey', 'in_app_survey'];

/**
 * Which records feed which value. Crowd uses survey answers only (present users
 * come live from IPresence; audio never feeds crowd, RT-015). Noise uses audio
 * and surveys (RT-021). Wi-Fi uses surveys (RT-022).
 */
export function usableFor(type: ConditionType, source: RecordSource): boolean {
  if (SURVEY_SOURCES.includes(source)) return true;
  return type === 'noise' && source === 'audio_analysis';
}

/** Audio results weigh 2 because they are measured at the venue; survey answers 1 (SDS 6.6.2). */
export function weightOf(record: InputRecord): number {
  return record.sourceType === 'audio_analysis' ? 2 : 1;
}

/** Rounds half up and keeps the result a level (1..3). */
export function roundHalfUp(x: number): Level {
  return Math.min(3, Math.max(1, Math.floor(x + 0.5))) as Level;
}

/**
 * Keeps only the newest record of each survey author, so one person cannot
 * outweigh others by answering several times (SDS 6.6.1, 6.6.2). Records with no
 * author (audio, seeded history) each count. Input must be newest first.
 */
export function newestPerUser(records: InputRecord[]): InputRecord[] {
  const seen = new Set<string>();
  return records.filter((r) => {
    if (r.userId === null) return true;
    if (seen.has(r.userId)) return false;
    seen.add(r.userId);
    return true;
  });
}

/** Weighted average of the levels, rounded half up; null when there is no record. */
export function weightedLevel(records: InputRecord[]): Level | null {
  if (records.length === 0) return null;
  let sum = 0;
  let weights = 0;
  for (const r of records) {
    sum += weightOf(r) * r.value;
    weights += weightOf(r);
  }
  return roundHalfUp(sum / weights);
}

/**
 * Weighted median; when it falls between two levels the higher one is taken
 * (SDS 6.6.3). Each record is repeated by its weight, then the upper middle is read.
 */
export function weightedUpperMedian(records: InputRecord[]): Level | null {
  if (records.length === 0) return null;
  const values = records.flatMap((r) => Array<Level>(weightOf(r)).fill(r.value));
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)];
}

/** Present-user count to a crowd level by the venue's size class (RT-020); 0 gives no input. */
export function crowdLevelFromCount(count: number, sizeClass: VenueSizeClass): Level | null {
  if (count <= 0) return null;
  const t = CROWD_THRESHOLDS[sizeClass];
  if (count >= t.high) return 3;
  if (count >= t.moderate) return 2;
  return 1;
}

/** The kinds of input behind a set of records (RT-012). */
export function inputsOf(records: InputRecord[]): ConditionInput[] {
  const kinds: ConditionInput[] = [];
  if (records.some((r) => SURVEY_SOURCES.includes(r.sourceType))) kinds.push('surveys');
  if (records.some((r) => r.sourceType === 'audio_analysis')) kinds.push('audio');
  return kinds;
}

const CAIRO = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Africa/Cairo',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Weekday (0 = Sunday), hour and minute of the day in Africa/Cairo time (SDS 6.6.3). */
export function cairoTime(at: Date): { weekday: number; hour: number; minuteOfDay: number } {
  const parts = Object.fromEntries(CAIRO.formatToParts(at).map((p) => [p.type, p.value]));
  const hour = Number(parts.hour);
  return {
    weekday: WEEKDAYS.indexOf(parts.weekday),
    hour,
    minuteOfDay: hour * 60 + Number(parts.minute),
  };
}

/** Sunday to Thursday are working days; Friday and Saturday are the weekend in Egypt. */
export function isWeekend(weekday: number): boolean {
  return weekday === 5 || weekday === 6;
}

/**
 * The three record sets of SDS 6.6.3, most specific first: same weekday and
 * clock hour; same day type within one hour of the request time; all records.
 */
export function historicalSets(records: InputRecord[], at: Date): InputRecord[][] {
  const now = cairoTime(at);
  const sameHour: InputRecord[] = [];
  const sameDayType: InputRecord[] = [];
  for (const r of records) {
    const t = cairoTime(r.recordedAt);
    if (t.weekday === now.weekday && t.hour === now.hour) sameHour.push(r);
    const diff = Math.abs(t.minuteOfDay - now.minuteOfDay);
    const minutesApart = Math.min(diff, 1440 - diff);
    if (isWeekend(t.weekday) === isWeekend(now.weekday) && minutesApart <= 60) sameDayType.push(r);
  }
  return [sameHour, sameDayType, records];
}

/** Builds the value the app shows (RT-004). Crowd and noise are always estimates (USE-004). */
export function conditionValue(
  type: ConditionType,
  level: Level,
  status: Exclude<ConditionStatusKind, 'unavailable'>,
  newestInputAt: Date | null,
  basedOn: ConditionInput[],
): ConditionValue {
  return {
    level,
    label: LEVEL_LABELS[type][level],
    status,
    newestInputAt: newestInputAt ? newestInputAt.toISOString() : null,
    basedOn,
    isEstimate: type !== 'wifi' || status === 'historical',
  };
}

export function unavailable(type: ConditionType): ConditionValue {
  return {
    level: null,
    label: null,
    status: 'unavailable',
    newestInputAt: null,
    basedOn: [],
    isEstimate: type !== 'wifi',
  };
}
