import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { DomainEvent, type ConfigChangedEvent } from '../../common/events/domain-events';
import { AppError } from '../../common/errors/app-error';
import {
  CLOCK,
  CONFIG_DEFAULTS,
  type ConfigKey,
  type ConfigValues,
  type IClock,
  type IConfig,
} from '../../contracts';
import { ConfigHistoryEntity, ConfigValueEntity } from '../../db/entities';

const CACHE_MS = 30_000;

/**
 * Configuration (new in SDS v0.3, DATA-012). Owner: M1.
 * Values live in config_values; a key with no row uses CONFIG_DEFAULTS.
 * Reads are cached for 30 s; a change writes history and emits ConfigChanged.
 */
@Injectable()
export class ConfigurationService implements IConfig {
  private cache: { values: ConfigValues; loadedAt: number } | null = null;

  constructor(
    @InjectRepository(ConfigValueEntity) private readonly values: Repository<ConfigValueEntity>,
    private readonly dataSource: DataSource,
    private readonly events: EventEmitter2,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async get<K extends ConfigKey>(key: K): Promise<ConfigValues[K]> {
    return (await this.getAll())[key];
  }

  async getAll(): Promise<ConfigValues> {
    const now = this.clock.now().getTime();
    if (this.cache && now - this.cache.loadedAt < CACHE_MS) {
      return this.cache.values;
    }
    const rows = await this.values.find();
    const merged: ConfigValues = { ...CONFIG_DEFAULTS };
    for (const row of rows) {
      if (row.key in CONFIG_DEFAULTS) {
        (merged as unknown as Record<string, unknown>)[row.key] = row.value;
      }
    }
    this.cache = { values: merged, loadedAt: now };
    return merged;
  }

  async set<K extends ConfigKey>(
    key: K,
    value: ConfigValues[K],
    changedByUserId: string,
  ): Promise<void> {
    if (!(key in CONFIG_DEFAULTS)) {
      throw AppError.invalidInput(`Unknown setting "${String(key)}".`);
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw AppError.invalidInput(`Setting "${String(key)}" must be a number of zero or more.`);
    }
    const oldValue = await this.get(key);
    await this.dataSource.transaction(async (tx) => {
      await tx.getRepository(ConfigValueEntity).save({ key, value, updatedBy: changedByUserId });
      await tx
        .getRepository(ConfigHistoryEntity)
        .insert({ key, oldValue, newValue: value, changedBy: changedByUserId });
    });
    this.cache = null;
    const event: ConfigChangedEvent = {
      key,
      oldValue,
      newValue: value,
      changedBy: changedByUserId,
      at: this.clock.now(),
    };
    this.events.emit(DomainEvent.ConfigChanged, event);
  }
}
