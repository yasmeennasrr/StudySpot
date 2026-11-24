import type { Repository } from 'typeorm';
import type { DeviceTokenEntity, UserEntity, VenueEntity } from '../../src/db/entities';
import { NotificationsService } from '../../src/modules/notifications/notifications.module';

describe('NotificationsService', () => {
  function setup(enabled = true) {
    const devices = {
      upsert: jest.fn(),
      findBy: jest.fn().mockResolvedValue([{ token: 'fcm-installation-id-1' }]),
    };
    const users = {
      update: jest.fn(),
      findOne: jest.fn().mockResolvedValue({ id: 'user-1', presencePromptsEnabled: enabled }),
    };
    const venues = {
      findOne: jest.fn().mockResolvedValue({ id: 'venue-1', name: 'Campus Cafe' }),
    };
    const push = { send: jest.fn().mockResolvedValue(undefined) };
    const service = new NotificationsService(
      devices as unknown as Repository<DeviceTokenEntity>,
      users as unknown as Repository<UserEntity>,
      venues as unknown as Repository<VenueEntity>,
      push,
    );
    return { service, devices, users, push };
  }

  it('registers an installation ID and sends a venue-specific check-in only when enabled', async () => {
    const { service, devices, push } = setup();
    await service.registerDevice('user-1', 'fcm-installation-id-1');
    await service.sendPresencePrompt('user-1', 'venue-1');

    expect(devices.upsert).toHaveBeenCalledWith(
      { userId: 'user-1', token: 'fcm-installation-id-1' },
      ['token'],
    );
    expect(push.send).toHaveBeenCalledWith(
      'fcm-installation-id-1',
      'Are you here?',
      'Are you at Campus Cafe?',
      { type: 'presence_check_in', venueId: 'venue-1', venueName: 'Campus Cafe' },
    );
  });

  it('does not send a prompt when the account has opted out', async () => {
    const { service, push } = setup(false);
    await service.sendPresencePrompt('user-1', 'venue-1');
    expect(push.send).not.toHaveBeenCalled();
  });

  it('persists the account preference', async () => {
    const { service, users } = setup();
    await service.setPresencePromptsEnabled('user-1', false);
    expect(users.update).toHaveBeenCalledWith({ id: 'user-1' }, { presencePromptsEnabled: false });
  });
});
