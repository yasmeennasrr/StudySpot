import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';
import { AuthGuard, CurrentUser } from '../../common/http/auth.guard';
import {
  FAVORITES,
  PREFERENCES,
  VENUE_QUERY,
  type AuthUser,
  type IFavorites,
  type IPreferences,
  type IVenueQuery,
  type SearchResult,
  type VenueDetails,
  type VenueSummary,
} from '../../contracts';
import {
  BrowseVenuesQueryDto,
  fromFilterCriteria,
  NearbyVenuesQueryDto,
  PreferencesDto,
  SearchVenuesQueryDto,
  toFilterCriteria,
  type FilterFieldsDto,
} from './dto/venue-query.dto';

/** User API, public venue routes (tag "venues"). Owners: M3 (search, nearby, browse), M4 (details). */
@Controller('venues')
export class VenuesController {
  constructor(@Inject(VENUE_QUERY) private readonly venues: IVenueQuery) {}

  /** Browse every active venue A to Z, optionally filtered, without a name, area or location. */
  @Get()
  browse(@Query() query: BrowseVenuesQueryDto): Promise<SearchResult> {
    if (query.maxDistance !== undefined) {
      throw AppError.invalidInput(
        'maxDistance needs a location. Use /venues/nearby, or remove maxDistance to see all venues.',
      );
    }
    return this.venues.search({ filters: toFilterCriteria(query), limit: query.limit });
  }

  @Get('search')
  search(@Query() query: SearchVenuesQueryDto): Promise<SearchResult> {
    if (!query.q && !query.area && query.lat === undefined) {
      throw AppError.invalidInput('Type a name or an area, or allow location, to search.');
    }
    return this.venues.search({
      q: query.q,
      area: query.area,
      near:
        query.lat !== undefined && query.lng !== undefined
          ? { lat: query.lat, lng: query.lng }
          : undefined,
      radiusMeters: query.radius,
      filters: toFilterCriteria(query),
      limit: query.limit,
    });
  }

  @Get('nearby')
  nearby(@Query() query: NearbyVenuesQueryDto): Promise<SearchResult> {
    return this.venues.search({
      near: { lat: query.lat, lng: query.lng },
      radiusMeters: query.radius,
      filters: toFilterCriteria(query),
      limit: query.limit,
    });
  }

  @Get(':venueId')
  details(@Param('venueId', new ParseUUIDPipe()) venueId: string): Promise<VenueDetails> {
    return this.venues.getDetails(venueId);
  }
}

/** User API, the signed-in user's own venue data (tag "me"). Owner: M4. SEC-004: own data only. */
@Controller('me')
@UseGuards(AuthGuard)
export class MyVenuesController {
  constructor(
    @Inject(PREFERENCES) private readonly preferences: IPreferences,
    @Inject(FAVORITES) private readonly favorites: IFavorites,
  ) {}

  @Get('preferences')
  async getPreferences(@CurrentUser() user: AuthUser): Promise<FilterFieldsDto> {
    return fromFilterCriteria(await this.preferences.get(user.id));
  }

  @Put('preferences')
  async putPreferences(
    @CurrentUser() user: AuthUser,
    @Body() body: PreferencesDto,
  ): Promise<FilterFieldsDto> {
    return fromFilterCriteria(await this.preferences.replace(user.id, toFilterCriteria(body)));
  }

  @Delete('preferences')
  @HttpCode(204)
  async deletePreferences(@CurrentUser() user: AuthUser): Promise<void> {
    await this.preferences.clear(user.id);
  }

  @Get('favorites')
  async listFavorites(@CurrentUser() user: AuthUser): Promise<{ items: VenueSummary[] }> {
    return { items: await this.favorites.list(user.id) };
  }

  @Put('favorites/:venueId')
  @HttpCode(204)
  async addFavorite(
    @CurrentUser() user: AuthUser,
    @Param('venueId', new ParseUUIDPipe()) venueId: string,
  ): Promise<void> {
    await this.favorites.add(user.id, venueId);
  }

  @Delete('favorites/:venueId')
  @HttpCode(204)
  async removeFavorite(
    @CurrentUser() user: AuthUser,
    @Param('venueId', new ParseUUIDPipe()) venueId: string,
  ): Promise<void> {
    await this.favorites.remove(user.id, venueId);
  }
}
