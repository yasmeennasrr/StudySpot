import { Inject, Injectable, Logger, Module } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PushAdapterModule } from '../../adapters/push/push-adapter.module';
import { DomainEvent, type PresenceDwellEvent } from '../../common/events/domain-events';
import { NOTIFY, PUSH, type INotify, type IPush } from '../../contracts';
import { DeviceTokenEntity, UserEntity } from '../../db/entities';

/**
 * STUB. Real version in Sprint 3 (PB-31, SEN-013..SEN-016).
 * TODO: store device tokens, respect users.presence_prompts_enabled, send at
 * most one "Are you at <venue>?" per visit through IPush.
 */
@Injectable()
export class StubNotificationsService implements INotify {
  private readonly logger = new Logger('Notifications');

  constructor(@Inject(PUSH) private readonly push: IPush) {}

  async registerDevice(): Promise<void> {}
  async setPresencePromptsEnabled(): Promise<void> {}

  async sendPresencePrompt(userId: string, venueId: string): Promise<void> {
    this.logger.debug({ userId, venueId }, 'Notifications.sendPresencePrompt (stub)');
  }

  /** Presence -> Notifications (SEN-014). */
  @OnEvent(DomainEvent.PresenceDwell)
  async onPresenceDwell(event: PresenceDwellEvent): Promise<void> {
    await this.sendPresencePrompt(event.userId, event.venueId);
  }
}

/** Notifications. Provides INotify. Uses IPush; listens to PresenceDwell. */
@Module({
  imports: [TypeOrmModule.forFeature([DeviceTokenEntity, UserEntity]), PushAdapterModule],
  providers: [{ provide: NOTIFY, useClass: StubNotificationsService }],
  exports: [NOTIFY],
})
export class NotificationsModule {}
