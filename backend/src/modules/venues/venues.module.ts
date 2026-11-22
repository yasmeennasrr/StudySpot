import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MapsAdapterModule } from '../../adapters/maps/maps-adapter.module';
import { FAVORITES, PREFERENCES, VENUE_QUERY } from '../../contracts';
import {
  FavoriteEntity,
  ReviewEntity,
  ReviewReportEntity,
  UserPreferencesEntity,
  VenueEntity,
} from '../../db/entities';
import { AccountsModule } from '../accounts/accounts.module';
import { ClockModule } from '../clock/clock.module';
import { ConditionsModule } from '../conditions/conditions.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { VenueDetailsService } from './details/venue-details.service';
import { FavoritesService, PreferencesService } from './preferences-favorites.service';
import { RecommendationService } from './recommendations/recommendation.service';
import { ReviewsController } from './reviews/reviews.controller';
import { ReviewsService } from './reviews/reviews.service';
import { VenueSearchService } from './search/venue-search.service';
import { VenueQueryFacade } from './venue-query.service';
import { MyVenuesController, VenuesController } from './venues.controller';

/**
 * Venues & Search. Owners: M3 (search/), M4 (details/, facade), M1 (preferences, favorites).
 * Provides IVenueQuery, IPreferences, IFavorites.
 * Uses IConditions, IMaps, IConfig, IClock, and IAuth (guard on /me routes).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      VenueEntity,
      ReviewEntity,
      ReviewReportEntity,
      UserPreferencesEntity,
      FavoriteEntity,
    ]),
    ConditionsModule,
    MapsAdapterModule,
    ConfigurationModule,
    AccountsModule,
    ClockModule,
  ],
  controllers: [VenuesController, MyVenuesController, ReviewsController],
  providers: [
    VenueSearchService,
    VenueDetailsService,
    RecommendationService,
    ReviewsService,
    { provide: VENUE_QUERY, useClass: VenueQueryFacade },
    { provide: PREFERENCES, useClass: PreferencesService },
    { provide: FAVORITES, useClass: FavoritesService },
  ],
  exports: [VENUE_QUERY, PREFERENCES, FAVORITES],
})
export class VenuesModule {}
