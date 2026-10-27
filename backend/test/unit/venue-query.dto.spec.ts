import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SearchVenuesQueryDto } from '../../src/modules/venues/dto/venue-query.dto';

describe('SearchVenuesQueryDto coordinates', () => {
  it('TC-M3-02 allows a text search without coordinates', () => {
    const dto = plainToInstance(SearchVenuesQueryDto, { q: 'cafe' });

    expect(validateSync(dto)).toHaveLength(0);
  });

  it('TC-M3-03 accepts latitude and longitude together', () => {
    const dto = plainToInstance(SearchVenuesQueryDto, { lat: '30.02', lng: '31.49' });

    expect(validateSync(dto)).toHaveLength(0);
  });

  it.each([
    ['latitude only', { lat: '30.02' }],
    ['longitude only', { lng: '31.49' }],
  ])('TC-M3-04 rejects %s', (_description, query) => {
    const dto = plainToInstance(SearchVenuesQueryDto, query);

    expect(validateSync(dto).length).toBeGreaterThan(0);
  });
});
