import { EventEmitter2 } from '@nestjs/event-emitter';
import type { DataSource, Repository } from 'typeorm';
import { AppError } from '../../src/common/errors/app-error';
import { DomainEvent } from '../../src/common/events/domain-events';
import { CONFIG_DEFAULTS } from '../../src/contracts';
import type { ConfigValueEntity } from '../../src/db/entities';
import { FakeClock } from '../../src/modules/clock/fake-clock';
import { ConfigurationService } from '../../src/modules/configuration/configuration.service';

/** TC-M1-18..TC-M1-22: configurable values (DATA-012, FR-039, FR-040). */
describe('ConfigurationService', () => {
  let rows: { key: string; value: unknown }[];
  let find: jest.Mock;
  let saved: unknown[];
  let history: unknown[];
  let events: EventEmitter2;
  let clock: FakeClock;
  let service: ConfigurationService;

  beforeEach(() => {
    rows = [];
    saved = [];
    history = [];
    find = jest.fn(async () => rows);
    const repo = { find } as unknown as Repository<ConfigValueEntity>;
    const dataSource = {
      transaction: async (work: (tx: unknown) => Promise<void>) =>
        work({
          getRepository: (entity: { name: string }) =>
            entity.name === 'ConfigValueEntity'
              ? { save: async (r: unknown) => saved.push(r) }
              : { insert: async (r: unknown) => history.push(r) },
        }),
    } as unknown as DataSource;
    events = new EventEmitter2();
    clock = new FakeClock();
    service = new ConfigurationService(repo, dataSource, events, clock);
  });

  it('TC-M1-18 returns the SRS defaults when nothing is stored', async () => {
    expect(await service.get('freshness.crowdMinutes')).toBe(60);
    expect(await service.get('freshness.wifiMinutes')).toBe(360);
    expect(await service.get('points.dailyCap')).toBe(100);
    expect(await service.get('presence.venueRadiusMeters')).toBe(50);
    expect(await service.getAll()).toEqual(CONFIG_DEFAULTS);
  });

  it('TC-M1-19 prefers stored values and ignores unknown stored keys', async () => {
    rows = [
      { key: 'points.dailyCap', value: 80 },
      { key: 'not.a.setting', value: 1 },
    ];
    expect(await service.get('points.dailyCap')).toBe(80);
    expect(await service.getAll()).not.toHaveProperty('not.a.setting');
  });

  it('TC-M1-20 caches for 30 s, then reloads (boundary 29 s vs 31 s)', async () => {
    await service.get('points.crowd');
    clock.advance({ seconds: 29 });
    await service.get('points.crowd');
    expect(find).toHaveBeenCalledTimes(1);
    clock.advance({ seconds: 2 });
    await service.get('points.crowd');
    expect(find).toHaveBeenCalledTimes(2);
  });

  it('TC-M1-21 saves a change with history and emits ConfigChanged', async () => {
    const seen: unknown[] = [];
    events.on(DomainEvent.ConfigChanged, (e) => seen.push(e));
    await service.set('points.dailyCap', 120, 'admin-1');
    expect(saved).toEqual([{ key: 'points.dailyCap', value: 120, updatedBy: 'admin-1' }]);
    expect(history).toEqual([
      { key: 'points.dailyCap', oldValue: 100, newValue: 120, changedBy: 'admin-1' },
    ]);
    expect(seen).toEqual([
      expect.objectContaining({ key: 'points.dailyCap', oldValue: 100, newValue: 120 }),
    ]);
  });

  it.each([
    ['unknown key', 'nope.key', 5],
    ['negative value', 'points.crowd', -1],
    ['not a number', 'points.crowd', 'ten'],
  ])('TC-M1-22 rejects %s', async (_case, key, value) => {
    await expect(service.set(key as never, value as never, 'admin-1')).rejects.toBeInstanceOf(
      AppError,
    );
    expect(saved).toHaveLength(0);
  });
});
