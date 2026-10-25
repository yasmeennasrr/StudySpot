import type { IClock } from '../../contracts';

/**
 * Test clock. Use it to check every time rule at its boundary
 * (59 vs 61 minutes, 13 days 23 h vs 14 days, 89 vs 91 days):
 *
 *   const clock = new FakeClock('2026-10-27T10:00:00+03:00');
 *   clock.advance({ minutes: 61 });
 *   Test.createTestingModule({...}).overrideProvider(CLOCK).useValue(clock)
 */
export class FakeClock implements IClock {
  private current: Date;

  constructor(start: string | Date = '2026-10-27T10:00:00+03:00') {
    this.current = new Date(start);
  }

  now(): Date {
    return new Date(this.current);
  }

  set(time: string | Date): void {
    this.current = new Date(time);
  }

  advance(by: { days?: number; hours?: number; minutes?: number; seconds?: number }): void {
    const ms =
      (by.days ?? 0) * 86_400_000 +
      (by.hours ?? 0) * 3_600_000 +
      (by.minutes ?? 0) * 60_000 +
      (by.seconds ?? 0) * 1_000;
    this.current = new Date(this.current.getTime() + ms);
  }
}
