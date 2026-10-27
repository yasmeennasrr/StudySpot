import type { ConditionType, ConditionValue, VenueSizeClass } from '../../contracts';
import {
  conditionValue,
  crowdLevelFromCount,
  historicalSets,
  inputsOf,
  newestPerUser,
  unavailable,
  weightedLevel,
  weightedUpperMedian,
  type InputRecord,
} from './condition-rules';

/** The tunable limits one resolution needs, read from IConfig by the service. */
export interface ResolveLimits {
  /** freshness.<type>Minutes (RT-001). */
  freshnessMinutes: number;
  /** conditions.lastKnownMaxHours (RT-016). */
  lastKnownMaxHours: number;
  /** conditions.historicalMinRecords (SDS 6.6.3). */
  historicalMinRecords: number;
}

/** Everything a handler needs to decide one value of one venue. */
export interface ResolveContext {
  type: ConditionType;
  at: Date;
  /** Usable records of this type, newest first, none after `at` and none older than 90 days. */
  records: InputRecord[];
  /** Users present at the venue now (IPresence, RT-008). Used for crowd only. */
  presentCount: number;
  sizeClass: VenueSizeClass;
  limits: ResolveLimits;
}

/**
 * Chain of Responsibility (SDS 8): each handler either resolves the value or
 * passes the request on. The fallback order of SRS 3.9 lives only here.
 */
export abstract class ConditionHandler {
  private next: ConditionHandler | null = null;

  setNext(handler: ConditionHandler): ConditionHandler {
    this.next = handler;
    return handler;
  }

  resolve(ctx: ResolveContext): ConditionValue {
    const value = this.tryResolve(ctx);
    if (value) return value;
    if (!this.next) return unavailable(ctx.type);
    return this.next.resolve(ctx);
  }

  protected abstract tryResolve(ctx: ResolveContext): ConditionValue | null;
}

const minutesBefore = (at: Date, minutes: number) => new Date(at.getTime() - minutes * 60_000);

/**
 * "Current": inputs inside the freshness limit (RT-001: 60 min crowd and noise,
 * 6 h Wi-Fi). Crowd takes the higher of the present-user level and the survey
 * level, because present users are only a lower bound (SDS 6.6.1).
 */
export class CurrentHandler extends ConditionHandler {
  protected tryResolve(ctx: ResolveContext): ConditionValue | null {
    const since = minutesBefore(ctx.at, ctx.limits.freshnessMinutes);
    const fresh = newestPerUser(ctx.records.filter((r) => r.recordedAt >= since));
    const recordLevel = weightedLevel(fresh);
    const presentLevel =
      ctx.type === 'crowd' ? crowdLevelFromCount(ctx.presentCount, ctx.sizeClass) : null;
    if (recordLevel === null && presentLevel === null) return null;

    const level = Math.max(recordLevel ?? 0, presentLevel ?? 0) as 1 | 2 | 3;
    const basedOn = presentLevel !== null ? ['present_users' as const] : [];
    // A present-user count is taken now; otherwise the newest record's time (RT-013).
    const newest = presentLevel !== null ? ctx.at : fresh[0].recordedAt;
    return conditionValue(ctx.type, level, 'current', newest, [...basedOn, ...inputsOf(fresh)]);
  }
}

/**
 * "X hours ago": no current input, but some within the last 24 hours (RT-016).
 * The value is what was current when the newest input arrived: the inputs within
 * one freshness window before it, combined by the same rule.
 */
export class HoursAgoHandler extends ConditionHandler {
  protected tryResolve(ctx: ResolveContext): ConditionValue | null {
    const newest = ctx.records[0];
    if (!newest) return null;
    if (newest.recordedAt < minutesBefore(ctx.at, ctx.limits.lastKnownMaxHours * 60)) return null;

    const windowStart = minutesBefore(newest.recordedAt, ctx.limits.freshnessMinutes);
    const inputs = newestPerUser(ctx.records.filter((r) => r.recordedAt >= windowStart));
    const level = weightedLevel(inputs);
    if (level === null) return null;
    return conditionValue(ctx.type, level, 'hours_ago', newest.recordedAt, inputsOf(inputs));
  }
}

/**
 * "Estimate based on historical data" (SDS 6.6.3): the first record set with at
 * least historicalMinRecords records, else all records; weighted upper median.
 */
export class HistoricalHandler extends ConditionHandler {
  protected tryResolve(ctx: ResolveContext): ConditionValue | null {
    if (ctx.records.length === 0) return null;
    const sets = historicalSets(ctx.records, ctx.at);
    const chosen =
      sets.find((s) => s.length >= ctx.limits.historicalMinRecords) ?? sets[sets.length - 1];
    const level = weightedUpperMedian(chosen);
    if (level === null) return null;
    return conditionValue(ctx.type, level, 'historical', null, ['historical']);
  }
}

/** "Unavailable": no record at all in the last 90 days (RT-018, FR-021). Always answers. */
export class UnavailableHandler extends ConditionHandler {
  protected tryResolve(ctx: ResolveContext): ConditionValue {
    return unavailable(ctx.type);
  }
}

/** Builds the chain once: current -> hours ago -> historical -> unavailable. */
export class ConditionResolver {
  private readonly head: ConditionHandler;

  constructor() {
    this.head = new CurrentHandler();
    this.head
      .setNext(new HoursAgoHandler())
      .setNext(new HistoricalHandler())
      .setNext(new UnavailableHandler());
  }

  resolve(ctx: ResolveContext): ConditionValue {
    return this.head.resolve(ctx);
  }
}
