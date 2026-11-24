import { Inject, Injectable, Logger, Module } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PushAdapterModule } from '../../adapters/push/push-adapter.module';
import { DomainEvent, type PresenceDwellEvent } from '../../common/events/domain-events';
import { NOTIFY, PUSH, type INotify, type IPush } from '../../contracts';
import { DeviceTokenEntity, UserEntity, VenueEntity } from '../../db/entities';
import { AccountsModule } from '../accounts/accounts.module';
import { NotificationsController } from './notifications.controller';

/** Installation registration, presence-notification consent and dwell prompts (PB-31). */
@Injectable()
export class NotificationsService implements INotify {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(DeviceTokenEntity)
    private readonly devices: Repository<DeviceTokenEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(VenueEntity)
    private readonly venues: Repository<VenueEntity>,
    @Inject(PUSH) private readonly push: IPush,
  ) {}

  async registerDevice(userId: string, installationId: string): Promise<void> {
    // An installation ID may move between accounts when someone signs out and another
    // account signs in on the same installation.
    await this.devices.upsert({ userId, token: installationId }, ['token']);
  }

  async setPresencePromptsEnabled(userId: string, enabled: boolean): Promise<void> {
    await this.users.update({ id: userId }, { presencePromptsEnabled: enabled });
  }

  async sendPresencePrompt(userId: string, venueId: string): Promise<void> {
    const [user, venue, devices] = await Promise.all([
      this.users.findOne({
        where: { id: userId },
        select: { id: true, presencePromptsEnabled: true },
      }),
      this.venues.findOne({ where: { id: venueId }, select: { id: true, name: true } }),
      this.devices.findBy({ userId }),
    ]);
    if (!user?.presencePromptsEnabled || !venue || devices.length === 0) return;

    const results = await Promise.allSettled(
      devices.map((device) =>
        this.push.send(device.token, 'Are you here?', `Are you at ${venue.name}?`, {
          type: 'presence_check_in',
          venueId,
          venueName: venue.name,
        }),
      ),
    );
    const failures = results.filter((result) => result.status === 'rejected').length;
    if (failures > 0) {
      this.logger.warn({ failures, userId }, 'One or more presence pushes failed');
    }
  }

  /** Presence -> Notifications (SEN-014). Presence persists the once-per-visit guard. */
  @OnEvent(DomainEvent.PresenceDwell)
  async onPresenceDwell(event: PresenceDwellEvent): Promise<void> {
    await this.sendPresencePrompt(event.userId, event.venueId);
  }
}

@Module({
  imports: [
    TypeOrmModule.forFeature([DeviceTokenEntity, UserEntity, VenueEntity]),
    AccountsModule,
    PushAdapterModule,
  ],
  controllers: [NotificationsController],
  providers: [{ provide: NOTIFY, useClass: NotificationsService }],
  exports: [NOTIFY],
})
export class NotificationsModule {}
