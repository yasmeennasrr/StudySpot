import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MapsAdapterModule } from '../../adapters/maps/maps-adapter.module';
import { FAVORITES, PREFERENCES, VENUE_QUERY } from '../../contracts';
import {
  FavoriteEntity,
  ReviewEntity,
  UserPreferencesEntity,
  VenueEntity,
} from '../../db/entities';
import { AccountsModule } from '../accounts/accounts.module';
import { ClockModule } from '../clock/clock.module';
import { ConditionsModule } from '../conditions/conditions.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { StubVenueDetailsService } from './details/venue-details.service.stub';
import { FavoritesService, PreferencesService } from './preferences-favorites.service';
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
    TypeOrmModule.forFeature([VenueEntity, ReviewEntity, UserPreferencesEntity, FavoriteEntity]),
    ConditionsModule,
    MapsAdapterModule,
    ConfigurationModule,
    AccountsModule,
    ClockModule,
  ],
  controllers: [VenuesController, MyVenuesController],
  providers: [
    VenueSearchService,
    StubVenueDetailsService,
    { provide: VENUE_QUERY, useClass: VenueQueryFacade },
    { provide: PREFERENCES, useClass: PreferencesService },
    { provide: FAVORITES, useClass: FavoritesService },
  ],
  exports: [VENUE_QUERY, PREFERENCES, FAVORITES],
})
export class VenuesModule {}
