/**
 * Write a review (PB-15) and report one (PB-16): input rules and service rules,
 * without a database. TC-M4-16, TC-M4-17. The database path is in
 * test/int/reviews-moderation.int-spec.ts.
 */
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AppError } from '../../src/common/errors/app-error';
import { WriteReviewDto } from '../../src/modules/venues/reviews/reviews.controller';
import { ReviewsService } from '../../src/modules/venues/reviews/reviews.service';

const VENUE = '6f1c2a10-0000-4000-8000-000000000001';
const ALICE = '00000000-0000-4000-8000-0000000000a1';
const BOB = '00000000-0000-4000-8000-0000000000b2';
const NOW = new Date('2026-11-21T10:00:00Z');

function problems(body: Record<string, unknown>): string[] {
  const dto = plainToInstance(WriteReviewDto, body, { enableImplicitConversion: true });
  return validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).map((e) => e.property);
}

describe('Review input (SDS 6.6.6)', () => {
  it('TC-M4-16 accepts 1 to 5 whole stars with optional text up to 1000 characters, and nothing else', () => {
    expect(problems({ rating: 1 })).toEqual([]);
    expect(problems({ rating: 5, text: 'x'.repeat(1000) })).toEqual([]);
    expect(problems({ rating: 3, text: null })).toEqual([]);
    // Boundaries: 0 and 6 stars, half stars, missing rating, 1001 characters.
    expect(problems({ rating: 0 })).toEqual(['rating']);
    expect(problems({ rating: 6 })).toEqual(['rating']);
    expect(problems({ rating: 3.5 })).toEqual(['rating']);
    expect(problems({ text: 'no stars' })).toEqual(['rating']);
    expect(problems({ rating: 4, text: 'x'.repeat(1001) })).toEqual(['text']);
    // The author, venue and time come from the system, never from the body (DATA-007).
    expect(problems({ rating: 4, userId: BOB })).toEqual(['userId']);
  });
});

describe('ReviewsService rules', () => {
  const venueExists = jest.fn();
  const findOne = jest.fn();
  const findOneOrFail = jest.fn();
  const txQuery = jest.fn();
  const dbQuery = jest.fn();
  const service = new ReviewsService(
    { exists: venueExists } as never,
    { findOne, findOneOrFail } as never,
    {
      transaction: (work: (tx: { query: typeof txQuery }) => unknown) => work({ query: txQuery }),
      query: dbQuery,
    } as never,
    { now: () => NOW },
  );

  beforeEach(() => {
    jest.resetAllMocks();
    txQuery.mockImplementation((sql: string) =>
      Promise.resolve(sql.startsWith('INSERT') ? [{ id: 'r1' }] : []),
    );
    findOneOrFail.mockResolvedValue({
      id: 'r1',
      venueId: VENUE,
      userId: ALICE,
      rating: 4,
      text: null,
      removedAt: null,
      createdAt: NOW,
      user: { displayName: 'Alice' },
    });
  });

  it('TC-M4-17 writes or replaces one review per venue, clears old reports, and refuses own or removed reviews', async () => {
    // A blank text is stored as no text; the time is the submission time.
    venueExists.mockResolvedValue(true);
    const mine = await service.write(ALICE, VENUE, { rating: 4, text: '   ' });
    expect(txQuery.mock.calls[0][0]).toContain('ON CONFLICT (venue_id, user_id) DO UPDATE');
    expect(txQuery.mock.calls[0][1]).toEqual([VENUE, ALICE, 4, null, NOW]);
    expect(txQuery.mock.calls[1]).toEqual([
      'DELETE FROM review_reports WHERE review_id = $1',
      ['r1'],
    ]);
    expect(mine).toEqual({
      id: 'r1',
      venueId: VENUE,
      rating: 4,
      text: null,
      authorDisplayName: 'Alice',
      createdAt: NOW.toISOString(),
      hidden: false,
    });

    // A deactivated or unknown venue cannot be reviewed.
    venueExists.mockResolvedValue(false);
    await expect(service.write(ALICE, VENUE, { rating: 4 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    // Reporting: own review refused, removed or unknown review not found, repeat is safe.
    findOne.mockResolvedValue({
      id: 'r1',
      userId: ALICE,
      removedAt: null,
      venue: { active: true },
    });
    await expect(service.report(ALICE, 'r1')).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    await service.report(BOB, 'r1');
    expect(dbQuery.mock.calls[0][0]).toContain('ON CONFLICT (review_id, reporter_id) DO NOTHING');
    expect(dbQuery.mock.calls[0][1]).toEqual(['r1', BOB, NOW]);

    findOne.mockResolvedValue({ id: 'r1', userId: ALICE, removedAt: NOW, venue: { active: true } });
    await expect(service.report(BOB, 'r1')).rejects.toBeInstanceOf(AppError);
    findOne.mockResolvedValue(null);
    await expect(service.report(BOB, 'r2')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
