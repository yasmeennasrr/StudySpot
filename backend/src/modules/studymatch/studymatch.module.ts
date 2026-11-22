import { Module } from '@nestjs/common';
import { LlmAdapterModule } from '../../adapters/llm/llm-adapter.module';
import { STUDY_MATCH } from '../../contracts';
import { ClockModule } from '../clock/clock.module';
import { ConditionsModule } from '../conditions/conditions.module';
import { VenuesModule } from '../venues/venues.module';
import { StudyMatchTools } from './studymatch-tools';
import { StudyMatchService } from './studymatch.service';

/**
 * StudyMatch Orchestrator (PB-29, PB-46). Provides IStudyMatch.
 * Uses ILLM (behind ResilientLlm), IVenueQuery, IConditions, IPreferences, IClock.
 */
@Module({
  imports: [LlmAdapterModule, VenuesModule, ConditionsModule, ClockModule],
  providers: [
    StudyMatchTools,
    StudyMatchService,
    { provide: STUDY_MATCH, useExisting: StudyMatchService },
  ],
  exports: [STUDY_MATCH],
})
export class StudyMatchModule {}
