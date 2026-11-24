import { Body, Controller, Get, Inject, Param, Put, Query } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsNumber, Max, Min } from 'class-validator';
import { In, Repository } from 'typeorm';
import { AppError } from '../../common/errors/app-error';
import { DomainEvent, type StaffActionEvent } from '../../common/events/domain-events';
import { CurrentUser } from '../../common/http/auth.guard';
import { StaffOnly } from '../../common/http/staff.guard';
import {
  CLOCK,
  CONFIG,
  CONFIG_DEFAULTS,
  EDITABLE_SETTINGS,
  type AuthUser,
  type ConfigKey,
  type EditableSetting,
  type IClock,
  type IConfig,
} from '../../contracts';
import { UserEntity } from '../../db/entities';

export class UpdateSettingDto {
  @IsNumber({ allowNaN: false, allowInfinity: false })
  value: number;
}

export class SettingsHistoryQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export interface SettingView extends EditableSetting {
  value: number;
  defaultValue: number;
}

export interface SettingChangeView {
  key: string;
  label: string;
  oldValue: unknown;
  newValue: unknown;
  changedBy: { id: string; email: string | null; displayName: string | null };
  changedAt: string;
}

/**
 * Staff API, settings (PB-34, FR-039, FR-040, DATA-012, UC-19). Owner: M1.
 * Administrators only. Every change is kept in config_history and written to the
 * security log as a staff action (FR-044).
 */
@Controller('staff/settings')
@StaffOnly('admin')
export class StaffSettingsController {
  constructor(
    @Inject(CONFIG) private readonly config: IConfig,
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    private readonly events: EventEmitter2,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  @Get()
  async list(): Promise<SettingView[]> {
    const values = await this.config.getAll();
    return EDITABLE_SETTINGS.map((s) => ({
      ...s,
      value: values[s.key],
      defaultValue: CONFIG_DEFAULTS[s.key],
    }));
  }

  @Get('history')
  async history(@Query() query: SettingsHistoryQuery): Promise<SettingChangeView[]> {
    const changes = await this.config.history({ limit: query.limit ?? 50 });
    const ids = [...new Set(changes.map((c) => c.changedBy))];
    const people = ids.length ? await this.users.find({ where: { id: In(ids) } }) : [];
    return changes.map((c) => {
      const who = people.find((p) => p.id === c.changedBy);
      return {
        key: c.key,
        label: EDITABLE_SETTINGS.find((s) => s.key === c.key)?.label ?? c.key,
        oldValue: c.oldValue,
        newValue: c.newValue,
        changedBy: {
          id: c.changedBy,
          email: who?.email ?? null,
          displayName: who?.displayName ?? null,
        },
        changedAt: c.changedAt,
      };
    });
  }

  @Put(':key')
  async update(
    @Param('key') key: string,
    @Body() dto: UpdateSettingDto,
    @CurrentUser() staff: AuthUser,
  ): Promise<SettingView> {
    const rule = EDITABLE_SETTINGS.find((s) => s.key === key);
    if (!rule) throw AppError.notFound(`"${key}" is not a setting that can be changed here.`);
    const before = await this.config.get(rule.key);
    await this.config.set(rule.key as ConfigKey, dto.value, staff.id);
    const event: StaffActionEvent = {
      staffUserId: staff.id,
      action: 'config.changed',
      target: rule.key,
      at: this.clock.now(),
      details: { oldValue: before, newValue: dto.value },
    };
    this.events.emit(DomainEvent.StaffAction, event);
    return { ...rule, value: dto.value, defaultValue: CONFIG_DEFAULTS[rule.key] };
  }
}
