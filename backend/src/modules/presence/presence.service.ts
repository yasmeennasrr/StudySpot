import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { DomainEvent, type PresenceDwellEvent } from '../../common/events/domain-events';
import { CLOCK, CONFIG, type IClock, type IConfig, type IPresence } from '../../contracts';
import { PresenceRecordEntity, PresenceVisitEntity, VenueEntity } from '../../db/entities';

/**
 * Presence (PB-18). Resolves location samples against the indexed venue points,
 * keeps unconfirmed visit candidates separate from counted presence, and emits
 * PresenceDwell once when a candidate remains at a venue for the configured time.
 */
@Injectable()
export class PresenceService implements IPresence {
  constructor(
    @InjectRepository(PresenceRecordEntity)
    private readonly records: Repository<PresenceRecordEntity>,
    @InjectRepository(PresenceVisitEntity)
    private readonly visits: Repository<PresenceVisitEntity>,
    @InjectRepository(VenueEntity)
    private readonly venues: Repository<VenueEntity>,
    @Inject(CONFIG) private readonly config: IConfig,
    @Inject(CLOCK) private readonly clock: IClock,
    private readonly events: EventEmitter2,
  ) {}

  async reportLocation(
    userId: string,
    lat: number,
    lng: number,
    confirmed: boolean,
  ): Promise<{ venueId: string | null }> {
    const venueId = await this.findVenue(lat, lng);
    if (confirmed) {
      if (!venueId) return { venueId: null };
      const recordedAt = this.clock.now();
      let accepted = false;
      await this.visits.manager.transaction(async (manager) => {
        await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [userId]);
        const visits = manager.getRepository(PresenceVisitEntity);
        const visit = await visits.findOne({ where: { userId, venueId, active: true } });
        // A location only counts after the user answers the dwell prompt.
        if (!visit?.promptedAt) return;
        visit.confirmedAt = recordedAt;
        visit.lastSeenAt = recordedAt;
        await visits.save(visit);
        await manager.getRepository(PresenceRecordEntity).save({
          userId,
          venueId,
          source: 'location',
          recordedAt,
        });
        accepted = true;
      });
      return { venueId: accepted ? venueId : null };
    }

    const event = await this.updateVisitCandidate(userId, venueId);
    if (event) this.events.emit(DomainEvent.PresenceDwell, event);
    return { venueId };
  }

  async recordReceiptScan(userId: string, venueId: string): Promise<void> {
    await this.records.save({
      userId,
      venueId,
      source: 'receipt_scan',
      recordedAt: this.clock.now(),
    });
  }

  async isPresent(userId: string, venueId: string): Promise<boolean> {
    const [locationMinutes, scanMinutes] = await Promise.all([
      this.config.get('presence.locationValidMinutes'),
      this.config.get('presence.scanValidMinutes'),
    ]);
    const now = this.clock.now();
    return this.records
      .createQueryBuilder('presence')
      .where('presence.userId = :userId', { userId })
      .andWhere('presence.venueId = :venueId', { venueId })
      .andWhere(
        `((presence.source = 'location' AND presence.recordedAt >= :locationSince)
          OR (presence.source = 'receipt_scan' AND presence.recordedAt >= :scanSince))`,
        {
          locationSince: new Date(now.getTime() - locationMinutes * 60_000),
          scanSince: new Date(now.getTime() - scanMinutes * 60_000),
        },
      )
      .getExists();
  }

  async countPresent(venueId: string): Promise<number> {
    const [locationMinutes, scanMinutes] = await Promise.all([
      this.config.get('presence.locationValidMinutes'),
      this.config.get('presence.scanValidMinutes'),
    ]);
    const now = this.clock.now();
    const result = await this.records
      .createQueryBuilder('presence')
      .select('COUNT(DISTINCT presence.userId)', 'count')
      .where('presence.venueId = :venueId', { venueId })
      .andWhere(
        `((presence.source = 'location' AND presence.recordedAt >= :locationSince)
          OR (presence.source = 'receipt_scan' AND presence.recordedAt >= :scanSince))`,
        {
          locationSince: new Date(now.getTime() - locationMinutes * 60_000),
          scanSince: new Date(now.getTime() - scanMinutes * 60_000),
        },
      )
      .getRawOne<{ count: string }>();
    return Number(result?.count ?? 0);
  }

  async purgeExpired(): Promise<number> {
    const hours = await this.config.get('presence.rawRetentionHours');
    const before = new Date(this.clock.now().getTime() - hours * 3_600_000);
    const [records, visits] = await Promise.all([
      this.records.delete({ recordedAt: LessThan(before) }),
      this.visits.delete({ lastSeenAt: LessThan(before) }),
    ]);
    return (records.affected ?? 0) + (visits.affected ?? 0);
  }

  private async findVenue(lat: number, lng: number): Promise<string | null> {
    const radius = await this.config.get('presence.venueRadiusMeters');
    const point = 'ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography';
    const candidate = await this.venues
      .createQueryBuilder('venue')
      .select('venue.id', 'id')
      .where('venue.active = true')
      .andWhere(`ST_DWithin(venue.location, ${point}, :radius)`, {
        lat,
        lng,
        radius,
      })
      .orderBy(`ST_Distance(venue.location, ${point})`, 'ASC')
      .addOrderBy('venue.id', 'ASC')
      .getRawOne<{ id: string }>();
    return candidate?.id ?? null;
  }

  private async updateVisitCandidate(
    userId: string,
    venueId: string | null,
  ): Promise<PresenceDwellEvent | null> {
    const now = this.clock.now();
    const [dwellMinutes, locationValidMinutes] = await Promise.all([
      this.config.get('presence.dwellMinutesForPrompt'),
      this.config.get('presence.locationValidMinutes'),
    ]);
    let event: PresenceDwellEvent | null = null;

    await this.visits.manager.transaction(async (manager) => {
      // Serialize samples for one user so concurrent mobile updates cannot emit
      // duplicate dwell events or create two active candidate visits.
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [userId]);
      const visits = manager.getRepository(PresenceVisitEntity);
      const active = await visits.findOne({ where: { userId, active: true } });
      if (!venueId) {
        if (active) await visits.update(active.id, { active: false });
        return;
      }

      const staleAfterMs = locationValidMinutes * 2 * 60_000;
      let visit = active;
      if (
        !visit ||
        visit.venueId !== venueId ||
        (now.getTime() - visit.lastSeenAt.getTime() > staleAfterMs && !visit.promptedAt)
      ) {
        if (visit) await visits.update(visit.id, { active: false });
        visit = visits.create({
          userId,
          venueId,
          active: true,
          startedAt: now,
          lastSeenAt: now,
          promptedAt: null,
        });
      } else {
        visit.lastSeenAt = now;
        if (visit.confirmedAt) {
          // Keep the 15-minute presence window fresh while the user stays at
          // the venue, but only after an explicit response to the prompt.
          await manager.getRepository(PresenceRecordEntity).save({
            userId,
            venueId,
            source: 'location',
            recordedAt: now,
          });
        }
      }

      if (!visit.promptedAt && now.getTime() - visit.startedAt.getTime() >= dwellMinutes * 60_000) {
        visit.promptedAt = now;
        event = { userId, venueId, since: visit.startedAt };
      }
      await visits.save(visit);
    });

    return event;
  }
}
