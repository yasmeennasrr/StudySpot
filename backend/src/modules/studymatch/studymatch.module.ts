import { Inject, Injectable, Module } from '@nestjs/common';
import { LlmAdapterModule } from '../../adapters/llm/llm-adapter.module';
import { AppError } from '../../common/errors/app-error';
import {
  CONDITIONS,
  LLM,
  PREFERENCES,
  STUDY_MATCH,
  VENUE_QUERY,
  type IConditions,
  type ILLM,
  type IPreferences,
  type IStudyMatch,
  type IVenueQuery,
  type StudyMatchAnswer,
} from '../../contracts';
import { ConditionsModule } from '../conditions/conditions.module';
import { VenuesModule } from '../venues/venues.module';

/**
 * STUB. Spike in Sprint 2, full feature in Sprint 3 (PB-29, PB-30, PB-46).
 * TODO: orchestrator loop with the read-only tool allow-list of SDS 6.6.8
 * (find_venues, get_venue_details, get_conditions, get_my_preferences,
 * recommend_venues), 9 s request deadline, ranking by Venues (SDS 6.6.4), and
 * the AI_UNAVAILABLE fallback to standard results through IVenueQuery (AI-029).
 */
@Injectable()
export class StubStudyMatchService implements IStudyMatch {
  constructor(
    @Inject(LLM) private readonly llm: ILLM,
    @Inject(VENUE_QUERY) private readonly venues: IVenueQuery,
    @Inject(CONDITIONS) private readonly conditions: IConditions,
    @Inject(PREFERENCES) private readonly preferences: IPreferences,
  ) {}

  async ask(): Promise<StudyMatchAnswer> {
    throw AppError.notImplemented('StudyMatch', 'Sprint 3');
  }
}

/** StudyMatch Orchestrator. Provides IStudyMatch. Uses ILLM, IVenueQuery, IConditions, IPreferences. */
@Module({
  imports: [LlmAdapterModule, VenuesModule, ConditionsModule],
  providers: [{ provide: STUDY_MATCH, useClass: StubStudyMatchService }],
  exports: [STUDY_MATCH],
})
export class StudyMatchModule {}
