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
import { ConditionsModule } from '../conditions/conditions.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { StubVenueDetailsService } from './details/venue-details.service.stub';
import { StubFavoritesService, StubPreferencesService } from './preferences-favorites.service.stub';
import { StubVenueSearchService } from './search/venue-search.service.stub';
import { VenueQueryFacade } from './venue-query.service';
import { MyVenuesController, VenuesController } from './venues.controller';

/**
 * Venues & Search. Owners: M3 (search/), M4 (details/, preferences, favorites, facade).
 * Provides IVenueQuery, IPreferences, IFavorites.
 * Uses IConditions, IMaps, IConfig, and IAuth (guard on /me routes).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([VenueEntity, ReviewEntity, UserPreferencesEntity, FavoriteEntity]),
    ConditionsModule,
    MapsAdapterModule,
    ConfigurationModule,
    AccountsModule,
  ],
  controllers: [VenuesController, MyVenuesController],
  providers: [
    StubVenueSearchService,
    StubVenueDetailsService,
    { provide: VENUE_QUERY, useClass: VenueQueryFacade },
    { provide: PREFERENCES, useClass: StubPreferencesService },
    { provide: FAVORITES, useClass: StubFavoritesService },
  ],
  exports: [VENUE_QUERY, PREFERENCES, FAVORITES],
})
export class VenuesModule {}
