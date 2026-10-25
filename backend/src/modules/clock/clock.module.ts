import { Injectable, Module } from '@nestjs/common';
import { CLOCK, type IClock } from '../../contracts';

/** Real time. Tests swap in FakeClock (./fake-clock) to move time. */
@Injectable()
export class SystemClock implements IClock {
  now(): Date {
    return new Date();
  }
}

/** Clock (new in SDS v0.3). Owner: M1. Provides IClock. */
@Module({
  providers: [{ provide: CLOCK, useClass: SystemClock }],
  exports: [CLOCK],
})
export class ClockModule {}
