import type { ConfigService } from '@nestjs/config';
import type { IConditions, IPresence, IReceiptCodes, IRewards, ISurvey } from '../../src/contracts';
import { SchedulerService } from '../../src/modules/scheduler/scheduler.module';

/** TC-M1-23..TC-M1-25: the Scheduler calls each owning module and survives failures (UC-22). */
describe('SchedulerService', () => {
  const make = (enabled: string) => {
    const calls: string[] = [];
    const track = (name: string, result: number | Error) =>
      jest.fn(async () => {
        calls.push(name);
        if (result instanceof Error) throw result;
        return result;
      });
    const presence = {
      purgeExpired: track('presence', new Error('db down')),
    } as unknown as IPresence;
    const codes = { expireStale: track('codes', 2) } as unknown as IReceiptCodes;
    const rewards = {
      expireCoupons: track('coupons', 1),
      retryFailedEmails: track('emails', 0),
    } as unknown as IRewards;
    const conditions = { purgeExpiredRecords: track('records', 5) } as unknown as IConditions;
    const surveys = { purgeExpired: track('surveys', 3) } as unknown as ISurvey;
    const config = { get: () => enabled } as unknown as ConfigService;
    return {
      calls,
      service: new SchedulerService(presence, codes, rewards, conditions, surveys, config),
    };
  };

  it('TC-M1-23 runs every per-minute job even when one fails', async () => {
    const { calls, service } = make('true');
    await expect(service.everyMinute()).resolves.toBeUndefined();
    expect(calls).toEqual(['presence', 'codes', 'coupons', 'emails']);
  });

  it('TC-M1-24 runs the daily 90-day purge on records and surveys (PRIV-013)', async () => {
    const { calls, service } = make('true');
    await service.daily();
    expect(calls).toEqual(['records', 'surveys']);
  });

  it('TC-M1-25 does nothing when SCHEDULER_ENABLED=false', async () => {
    const { calls, service } = make('false');
    await service.everyMinute();
    await service.daily();
    expect(calls).toEqual([]);
  });
});
