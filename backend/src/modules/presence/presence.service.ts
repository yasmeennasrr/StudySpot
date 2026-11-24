import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { DomainEvent, type PresenceDwellEvent } from '../../common/events/domain-events';
import { CLOCK, CONFIG, type IClock, type IConfig, type IPresence } from '../../contracts';
import {
  PresenceRecordEntity,
  PresenceVisitEntity,
  UserEntity,
  VenueEntity,
} from '../../db/entities';

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
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
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
  ): Promise<{ venueId: string | null }> {
    const user = await this.users.findOne({
      where: { id: userId },
      select: { id: true, presencePromptsEnabled: true },
    });
    if (!user?.presencePromptsEnabled) return { venueId: null };

    const venueId = await this.findVenue(lat, lng);
    const event = await this.updateVisitCandidate(userId, venueId);
    if (event) this.events.emit(DomainEvent.PresenceDwell, event);
    return { venueId };
  }

  async respondToPrompt(userId: string, venueId: string, confirmed: boolean): Promise<boolean> {
    const now = this.clock.now();
    let accepted = false;
    await this.visits.manager.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [userId]);
      const visits = manager.getRepository(PresenceVisitEntity);
      const visit = await visits.findOne({ where: { userId, venueId, active: true } });
      if (!visit?.promptedAt || visit.respondedAt) return;

      visit.respondedAt = now;
      if (confirmed) {
        visit.confirmedAt = now;
        visit.lastSeenAt = now;
        await manager.getRepository(PresenceRecordEntity).save({
          userId,
          venueId,
          source: 'location',
          recordedAt: now,
        });
      }
      await visits.save(visit);
      accepted = true;
    });
    return accepted;
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
    const [retentionHours, scanMinutes] = await Promise.all([
      this.config.get('presence.rawRetentionHours'),
      this.config.get('presence.scanValidMinutes'),
    ]);
    const now = this.clock.now();
    const locationPresent = await this.visits
      .createQueryBuilder('presence')
      .where('presence.userId = :userId', { userId })
      .andWhere('presence.venueId = :venueId', { venueId })
      .andWhere('presence.active = true')
      .andWhere('presence.confirmedAt IS NOT NULL')
      .andWhere('presence.lastSeenAt >= :locationSince', {
        locationSince: new Date(now.getTime() - retentionHours * 3_600_000),
      })
      .getExists();
    if (locationPresent) return true;

    return this.records
      .createQueryBuilder('presence')
      .where('presence.userId = :userId', { userId })
      .andWhere('presence.venueId = :venueId', { venueId })
      .andWhere('presence.source = :source', { source: 'receipt_scan' })
      .andWhere('presence.recordedAt >= :scanSince', {
        scanSince: new Date(now.getTime() - scanMinutes * 60_000),
      })
      .getExists();
  }

  async countPresent(venueId: string): Promise<number> {
    const [retentionHours, scanMinutes] = await Promise.all([
      this.config.get('presence.rawRetentionHours'),
      this.config.get('presence.scanValidMinutes'),
    ]);
    const now = this.clock.now();
    const [locationRows, scanRows] = await Promise.all([
      this.visits
        .createQueryBuilder('presence')
        .select('DISTINCT presence.userId', 'userId')
        .where('presence.venueId = :venueId', { venueId })
        .andWhere('presence.active = true')
        .andWhere('presence.confirmedAt IS NOT NULL')
        .andWhere('presence.lastSeenAt >= :locationSince', {
          locationSince: new Date(now.getTime() - retentionHours * 3_600_000),
        })
        .getRawMany<{ userId: string }>(),
      this.records
        .createQueryBuilder('presence')
        .select('DISTINCT presence.userId', 'userId')
        .where('presence.venueId = :venueId', { venueId })
        .andWhere('presence.source = :source', { source: 'receipt_scan' })
        .andWhere('presence.recordedAt >= :scanSince', {
          scanSince: new Date(now.getTime() - scanMinutes * 60_000),
        })
        .getRawMany<{ userId: string }>(),
    ]);
    return new Set([...locationRows, ...scanRows].map((row) => row.userId)).size;
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
    const [dwellMinutes, retentionHours] = await Promise.all([
      this.config.get('presence.dwellMinutesForPrompt'),
      this.config.get('presence.rawRetentionHours'),
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

      const staleAfterMs = retentionHours * 3_600_000;
      let visit = active;
      if (
        !visit ||
        visit.venueId !== venueId ||
        now.getTime() - visit.lastSeenAt.getTime() > staleAfterMs
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
          // Refresh the visit's last-seen lease while the user stays at the
          // venue, but only after an explicit response to the prompt.
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
