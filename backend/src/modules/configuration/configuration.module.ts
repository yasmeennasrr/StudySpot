import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CONFIG } from '../../contracts';
import { ConfigHistoryEntity, ConfigValueEntity } from '../../db/entities';
import { ClockModule } from '../clock/clock.module';
import { ConfigurationService } from './configuration.service';

/** Configuration (new in SDS v0.3). Owner: M1. Provides IConfig. Uses IClock. */
@Module({
  imports: [TypeOrmModule.forFeature([ConfigValueEntity, ConfigHistoryEntity]), ClockModule],
  providers: [{ provide: CONFIG, useClass: ConfigurationService }],
  exports: [CONFIG],
})
export class ConfigurationModule {}
