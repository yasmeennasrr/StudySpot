import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AdapterUnavailableError } from '../../src/common/errors/app-error';
import {
  FakeMapsAdapter,
  GoogleGeocodingAdapter,
  MapsAdapterModule,
} from '../../src/adapters/maps/maps-adapter.module';
import { MAPS } from '../../src/contracts';

/**
 * TC-M1-34..TC-M1-42: the real Google geocoding adapter (PB-07, EIR-011), tested
 * against a mocked fetch so no key or network is needed.
 */
const KEY = 'test-key-123';

const jsonResponse = (body: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as unknown as Response;

const make = (impl: (url: URL, init?: RequestInit) => Promise<Response>, timeoutMs = 3000) => {
  const fetchFn = jest.fn(impl as unknown as typeof fetch);
  return { fetchFn, adapter: new GoogleGeocodingAdapter(KEY, { fetchFn, timeoutMs }) };
};

const reasonOf = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(AdapterUnavailableError);
    return (err as AdapterUnavailableError).reason;
  }
  throw new Error('expected AdapterUnavailableError');
};

describe('GoogleGeocodingAdapter', () => {
  it('TC-M1-34 returns the first result and searches inside Egypt only', async () => {
    const { adapter, fetchFn } = make(async () =>
      jsonResponse({
        status: 'OK',
        results: [
          {
            formatted_address: 'Zamalek, Cairo Governorate, Egypt',
            geometry: { location: { lat: 30.0609, lng: 31.2197 } },
          },
        ],
      }),
    );
    await expect(adapter.geocode('  Zamalek ')).resolves.toEqual({
      point: { lat: 30.0609, lng: 31.2197 },
      formattedAddress: 'Zamalek, Cairo Governorate, Egypt',
    });
    const url = fetchFn.mock.calls[0][0] as URL;
    expect(url.origin + url.pathname).toBe('https://maps.googleapis.com/maps/api/geocode/json');
    expect(url.searchParams.get('address')).toBe('Zamalek');
    expect(url.searchParams.get('region')).toBe('eg');
    expect(url.searchParams.get('components')).toBe('country:EG');
    expect(url.searchParams.get('key')).toBe(KEY);
  });

  it('TC-M1-35 maps ZERO_RESULTS to null (area not found, not an outage)', async () => {
    const { adapter } = make(async () => jsonResponse({ status: 'ZERO_RESULTS', results: [] }));
    await expect(adapter.geocode('Atlantis')).resolves.toBeNull();
  });

  it('TC-M1-36 returns null for an empty or blank area without calling Google', async () => {
    const { adapter, fetchFn } = make(async () => jsonResponse({ status: 'OK' }));
    await expect(adapter.geocode('')).resolves.toBeNull();
    await expect(adapter.geocode('   ')).resolves.toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each(['OVER_QUERY_LIMIT', 'REQUEST_DENIED', 'INVALID_REQUEST', 'UNKNOWN_ERROR'])(
    'TC-M1-37 turns Google status %s into AdapterUnavailableError',
    async (status) => {
      const { adapter } = make(async () => jsonResponse({ status, error_message: 'nope' }));
      expect(await reasonOf(adapter.geocode('Maadi'))).toBe(status);
    },
  );

  it('TC-M1-38 turns an HTTP error into AdapterUnavailableError', async () => {
    const { adapter } = make(async () => jsonResponse({}, 503));
    expect(await reasonOf(adapter.geocode('Maadi'))).toBe('HTTP 503');
  });

  it('TC-M1-39 gives up after the timeout (EIR-011)', async () => {
    const { adapter } = make(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
      50,
    );
    const started = Date.now();
    expect(await reasonOf(adapter.geocode('Maadi'))).toBe('timeout');
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('TC-M1-40 turns a network failure into AdapterUnavailableError', async () => {
    const { adapter } = make(async () => {
      throw new TypeError('fetch failed');
    });
    expect(await reasonOf(adapter.geocode('Maadi'))).toBe('network error');
  });

  it('TC-M1-41 rejects an OK answer with no usable location, and invalid JSON', async () => {
    const noGeometry = make(async () => jsonResponse({ status: 'OK', results: [{}] }));
    expect(await reasonOf(noGeometry.adapter.geocode('Maadi'))).toBe('unusable response');
    const badJson = make(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => {
            throw new SyntaxError('Unexpected token <');
          },
        }) as unknown as Response,
    );
    expect(await reasonOf(badJson.adapter.geocode('Maadi'))).toBe('unusable response');
  });

  it('TC-M1-42 uses the fake without a key and the Google adapter with one', async () => {
    const build = async (key: string) => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
            ignoreEnvVars: true,
            load: [() => ({ GOOGLE_GEOCODING_API_KEY: key })],
          }),
          MapsAdapterModule,
        ],
      }).compile();
      return moduleRef.get(MAPS);
    };
    expect(await build('')).toBeInstanceOf(FakeMapsAdapter);
    expect(await build(KEY)).toBeInstanceOf(GoogleGeocodingAdapter);
  });
});
