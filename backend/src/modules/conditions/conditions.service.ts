import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';
import {
  DomainEvent,
  type NoiseRecordedEvent,
  type SurveyStoredEvent,
} from '../../common/events/domain-events';
import {
  CLOCK,
  CONFIG,
  PRESENCE,
  type ConditionType,
  type ConfigValues,
  type IClock,
  type IConditions,
  type IConfig,
  type IPresence,
  type Level,
  type VenueConditions,
  type VenueSizeClass,
} from '../../contracts';
import { DynamicRecordEntity, VenueEntity } from '../../db/entities';
import { ConditionResolver, type ResolveLimits } from './condition-resolver';
import { usableFor, type InputRecord, type RecordSource } from './condition-rules';

const TYPES: ConditionType[] = ['crowd', 'noise', 'wifi'];

const FRESHNESS_KEY = {
  crowd: 'freshness.crowdMinutes',
  noise: 'freshness.noiseMinutes',
  wifi: 'freshness.wifiMinutes',
} as const;

interface RecordRow {
  id: string;
  venue_id: string;
  condition_type: ConditionType;
  value: number;
  source_type: RecordSource;
  recorded_at: Date;
  user_id: string | null;
}

/**
 * Conditions, the estimation engine (SDS 6.3). Owner: M4 (PB-11, PB-12).
 * Loads the last 90 days of dynamic records for the venues asked for (one query),
 * asks IPresence how many users are present, and lets ConditionResolver decide
 * each value: current -> hours ago -> historical -> unavailable (SDS 8).
 * Results are cached for conditions.cacheSeconds (RT-006); a new survey or noise
 * result drops the venue's cache entry, so it shows within 10 s (PERF-005).
 */
@Injectable()
export class ConditionsService implements IConditions {
  private readonly logger = new Logger('Conditions');
  private readonly resolver = new ConditionResolver();
  private readonly cache = new Map<string, { value: VenueConditions; expiresAt: number }>();

  constructor(
    @InjectRepository(DynamicRecordEntity)
    private readonly records: Repository<DynamicRecordEntity>,
    @InjectRepository(VenueEntity) private readonly venues: Repository<VenueEntity>,
    @Inject(PRESENCE) private readonly presence: IPresence,
    @Inject(CONFIG) private readonly config: IConfig,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async getConditions(venueId: string, at?: Date): Promise<VenueConditions> {
    return (await this.getConditionsForMany([venueId], at)).get(venueId)!;
  }

  async getConditionsForMany(venueIds: string[], at?: Date): Promise<Map<string, VenueConditions>> {
    const ids = [...new Set(venueIds)];
    const now = at ?? this.clock.now();
    // A fixed `at` is a test or a what-if question: never served from or stored in the cache.
    const useCache = at === undefined;
    const result = new Map<string, VenueConditions>();
    const missing: string[] = [];
    for (const id of ids) {
      const hit = useCache ? this.cache.get(id) : undefined;
      if (hit && hit.expiresAt > now.getTime()) result.set(id, hit.value);
      else missing.push(id);
    }
    if (missing.length > 0) {
      const cfg = await this.config.getAll();
      const computed = await this.compute(missing, now, cfg);
      const expiresAt = now.getTime() + cfg['conditions.cacheSeconds'] * 1000;
      for (const [id, value] of computed) {
        result.set(id, value);
        if (useCache) this.cache.set(id, { value, expiresAt });
      }
    }
    return new Map(ids.map((id) => [id, result.get(id)!]));
  }

  invalidate(venueId: string): void {
    this.cache.delete(venueId);
  }

  /** Deletes dynamic records older than conditions.historicalDays (PRIV-013). */
  async purgeExpiredRecords(): Promise<number> {
    const days = await this.config.get('conditions.historicalDays');
    const before = new Date(this.clock.now().getTime() - days * 86_400_000);
    const res = await this.records.delete({ recordedAt: LessThan(before) });
    return res.affected ?? 0;
  }

  /** Surveys -> Conditions (PERF-005: a new survey shows within 10 s). */
  @OnEvent(DomainEvent.SurveyStored)
  onSurveyStored(event: SurveyStoredEvent): void {
    this.invalidate(event.venueId);
  }

  /** Audio Analysis -> Conditions (RT-021). */
  @OnEvent(DomainEvent.NoiseRecorded)
  onNoiseRecorded(event: NoiseRecordedEvent): void {
    this.invalidate(event.venueId);
  }

  /** A changed freshness limit or threshold applies at once, not after the cache expires. */
  @OnEvent(DomainEvent.ConfigChanged)
  onConfigChanged(): void {
    this.cache.clear();
  }

  private async compute(
    venueIds: string[],
    at: Date,
    cfg: ConfigValues,
  ): Promise<Map<string, VenueConditions>> {
    const since = new Date(at.getTime() - cfg['conditions.historicalDays'] * 86_400_000);
    const [rows, venues, counts] = await Promise.all([
      this.loadRecords(venueIds, since, at),
      this.venues.find({ select: { id: true, sizeClass: true }, where: { id: In(venueIds) } }),
      Promise.all(venueIds.map((id) => this.presence.countPresent(id))),
    ]);
    const sizeOf = new Map<string, VenueSizeClass>(venues.map((v) => [v.id, v.sizeClass]));

    const byVenueType = new Map<string, InputRecord[]>();
    for (const row of rows) {
      if (!usableFor(row.condition_type, row.source_type)) continue;
      const key = `${row.venue_id}:${row.condition_type}`;
      const list = byVenueType.get(key) ?? [];
      list.push({
        id: row.id,
        conditionType: row.condition_type,
        value: Number(row.value) as Level,
        sourceType: row.source_type,
        recordedAt: new Date(row.recorded_at),
        userId: row.user_id,
      });
      byVenueType.set(key, list);
    }

    const out = new Map<string, VenueConditions>();
    venueIds.forEach((venueId, i) => {
      const resolve = (type: ConditionType) =>
        this.resolver.resolve({
          type,
          at,
          records: byVenueType.get(`${venueId}:${type}`) ?? [],
          presentCount: counts[i],
          sizeClass: sizeOf.get(venueId) ?? 'medium',
          limits: this.limitsFor(type, cfg),
        });
      const [crowd, noise, wifi] = TYPES.map(resolve);
      out.set(venueId, { venueId, crowd, noise, wifi });
    });
    this.logger.debug({ venues: venueIds.length, records: rows.length }, 'Conditions computed');
    return out;
  }

  private limitsFor(type: ConditionType, cfg: ConfigValues): ResolveLimits {
    return {
      freshnessMinutes: cfg[FRESHNESS_KEY[type]],
      lastKnownMaxHours: cfg['conditions.lastKnownMaxHours'],
      historicalMinRecords: cfg['conditions.historicalMinRecords'],
    };
  }

  /**
   * Newest first. Records of surveys a moderator removed are left out (FR-029);
   * the survey author is joined for the "newest answer per user" rule only.
   */
  private loadRecords(venueIds: string[], since: Date, at: Date): Promise<RecordRow[]> {
    return this.records.query(
      `SELECT r.id, r.venue_id, r.condition_type, r.value, r.source_type, r.recorded_at,
              s.user_id
         FROM dynamic_records r
         LEFT JOIN surveys s ON s.id = r.survey_id
        WHERE r.venue_id = ANY($1::uuid[])
          AND r.recorded_at >= $2 AND r.recorded_at <= $3
          AND s.removed_at IS NULL
        ORDER BY r.recorded_at DESC, r.id`,
      [venueIds, since, at],
    );
  }
}
