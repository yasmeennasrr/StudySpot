import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager, LessThanOrEqual } from 'typeorm';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import {
  CLOCK,
  CONFIG,
  EMAIL,
  PRESENCE,
  type AwardResult,
  type CouponOfferView,
  type CouponView,
  type IClock,
  type IConfig,
  type IEmail,
  type IPresence,
  type IRewards,
  type PointsSummary,
  type StoredSurvey,
} from '../../contracts';
import {
  CouponEntity,
  CouponOfferEntity,
  PointsLedgerEntity,
  UserEntity,
  VenueEntity,
} from '../../db/entities';
import {
  activationLink,
  afterEmailFailure,
  applyDailyCap,
  COUPON_VALID_MS,
  couponEmail,
  effectiveStatus,
  expiresAt,
  generateCouponCode,
  hashToken,
  isWellFormedToken,
  MIN_MINUTES_BETWEEN_AWARDS,
  newActivationToken,
  NoPointsReason,
  pointsForAnswers,
  REWARDS_TIME_ZONE,
  STATUS_ORDER,
  type PointsConfig,
} from './rewards.rules';

/** A coupon row with the two things its view needs from other tables. */
type CouponWithVenue = CouponEntity & { venue?: VenueEntity };

/** How many due e-mails one Scheduler run re-sends (each send has its own timeout). */
const EMAIL_RETRY_BATCH = 25;

/**
 * Rewards & Coupons (SDS 6.3; PB-24 points, PB-25 redeem, PB-26 e-mail, PB-27 activation,
 * PB-38 coupon expiry). Provides IRewards. Uses IPresence (anti-abuse rule 3), IConfig
 * (points and cap), IEmail (coupon e-mail) and IClock (every time rule).
 *
 * Every change to points runs in one transaction that first locks the user's row
 * (SELECT ... FOR UPDATE). That serialises awards and redemptions of the same user, so
 * two requests at once can never pass the daily cap or spend the same points twice
 * (RWD-009, RWD-011, RWD-016). The database is the last line: points_balance >= 0 and
 * one survey_award per survey are constraints, not just code.
 */
@Injectable()
export class RewardsService implements IRewards {
  private readonly logger = new Logger('Rewards');
  private readonly publicBaseUrl: string;
  private retrying = false;

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @Inject(PRESENCE) private readonly presence: IPresence,
    @Inject(CONFIG) private readonly config: IConfig,
    @Inject(EMAIL) private readonly email: IEmail,
    @Inject(CLOCK) private readonly clock: IClock,
    env: ConfigService,
  ) {
    this.publicBaseUrl = String(env.get('PUBLIC_BASE_URL', 'http://localhost:3000'));
  }

  // ================================================================ points (PB-24)

  async awardForSurvey(survey: StoredSurvey): Promise<AwardResult> {
    const now = this.clock.now();
    const perCategory = await this.perCategory();
    const dailyCap = await this.config.get('points.dailyCap');
    const full = pointsForAnswers(survey.answers, perCategory);
    // Rule 3 is asked before the transaction: it reads another module's data and must
    // describe the moment the survey was sent. A QR survey counts as present (the scan).
    const present =
      full === 0 || survey.source === 'qr'
        ? true
        : await this.presence.isPresent(survey.userId, survey.venueId);

    return this.db.transaction(async (m) => {
      const balance = await this.lockUser(m, survey.userId);
      if (balance === null) throw AppError.notFound('This account no longer exists.');

      // RWD-011: a survey is rewarded at most once. A repeat call returns the first result.
      const earlier = await m.getRepository(PointsLedgerEntity).findOne({
        where: [
          { surveyId: survey.id, reason: 'survey_award' },
          { surveyId: survey.id, reason: 'no_award' },
        ],
      });
      if (earlier) return { points: Math.max(0, earlier.delta), reason: earlier.note };

      const blocked = await this.blockedReason(m, survey, full, present, now);
      if (blocked) return this.recordNoAward(m, survey, blocked, now);

      const earnedToday = await this.earnedOn(m, survey.userId, now);
      const points = applyDailyCap(full, earnedToday, dailyCap);
      if (points === 0) {
        return this.recordNoAward(m, survey, NoPointsReason.dailyCapReached(dailyCap), now);
      }
      const reason = points < full ? NoPointsReason.partlyCapped(dailyCap, points, full) : null;
      await m.getRepository(PointsLedgerEntity).insert({
        userId: survey.userId,
        delta: points,
        reason: 'survey_award',
        surveyId: survey.id,
        couponId: null,
        note: reason,
        createdAt: now,
      });
      await m.getRepository(UserEntity).increment({ id: survey.userId }, 'pointsBalance', points);
      return { points, reason };
    });
  }

  async getBalance(userId: string): Promise<number> {
    const user = await this.db
      .getRepository(UserEntity)
      .findOne({ where: { id: userId }, select: { id: true, pointsBalance: true } });
    if (!user) throw AppError.notFound('This account no longer exists.');
    return user.pointsBalance;
  }

  async getPointsSummary(userId: string): Promise<PointsSummary> {
    const [balance, earnedToday, dailyCap, perCategory] = await Promise.all([
      this.getBalance(userId),
      this.earnedOn(this.db.manager, userId, this.clock.now()),
      this.config.get('points.dailyCap'),
      this.perCategory(),
    ]);
    return { balance, earnedToday, dailyCap, perCategory };
  }

  // ================================================================ offers and redeem (PB-25)

  async listOffers(): Promise<CouponOfferView[]> {
    const offers = await this.db.getRepository(CouponOfferEntity).find({
      where: { active: true, venue: { active: true } },
      relations: { venue: true },
      order: { pointCost: 'ASC', reward: 'ASC' },
    });
    return offers
      .map((o) => ({
        id: o.id,
        venueId: o.venueId,
        venueName: o.venue?.name ?? '',
        reward: o.reward,
        pointCost: o.pointCost,
      }))
      .sort((a, b) => a.pointCost - b.pointCost || a.venueName.localeCompare(b.venueName));
  }

  async redeem(userId: string, offerId: string): Promise<CouponView> {
    const now = this.clock.now();
    const token = newActivationToken();

    // Unit of Work (RWD-007..RWD-009): all of it, or none of it.
    const { coupon, user } = await this.db.transaction(async (m) => {
      const balance = await this.lockUser(m, userId);
      if (balance === null) throw AppError.notFound('This account no longer exists.');
      const offer = await m.getRepository(CouponOfferEntity).findOne({
        where: { id: offerId, active: true, venue: { active: true } },
        relations: { venue: true },
      });
      if (!offer) {
        throw AppError.notFound(
          'This coupon is no longer offered. Pick another one from the list.',
        );
      }
      if (balance < offer.pointCost) {
        // RWD-008: rejected, balance unchanged (nothing was written yet).
        throw new AppError(
          ErrorCode.CONFLICT,
          `You need ${offer.pointCost - balance} more points for this coupon. Your points have not changed.`,
          { reason: 'INSUFFICIENT_POINTS', balance, pointCost: offer.pointCost },
        );
      }
      const saved = await m.getRepository(CouponEntity).save({
        code: await this.uniqueCode(m),
        offerId: offer.id,
        reward: offer.reward,
        venueId: offer.venueId,
        ownerUserId: userId,
        pointCost: offer.pointCost,
        redeemedAt: now,
        activationTokenHash: hashToken(token),
        activatedAt: null,
        status: 'issued',
        emailStatus: 'pending',
        emailAttempts: 0,
        // Safety net: if the process stops before the first send, the Scheduler sends it.
        nextEmailAttemptAt: new Date(now.getTime() + 60_000),
      });
      await m.getRepository(UserEntity).decrement({ id: userId }, 'pointsBalance', offer.pointCost);
      await m.getRepository(PointsLedgerEntity).insert({
        userId,
        delta: -offer.pointCost,
        reason: 'coupon_redemption',
        surveyId: null,
        couponId: saved.id,
        note: null,
        createdAt: now,
      });
      const owner = await m.getRepository(UserEntity).findOneOrFail({
        where: { id: userId },
        select: { id: true, email: true, displayName: true },
      });
      return { coupon: Object.assign(saved, { venue: offer.venue }), user: owner };
    });

    // RWD-014, PERF-010: e-mailed right after the redemption is committed. A failure
    // never undoes the redemption; the coupon is in the app either way (EIR-013).
    await this.deliver(coupon, user, token);
    return this.toView(coupon, this.clock.now());
  }

  async listCoupons(userId: string): Promise<CouponView[]> {
    const now = this.clock.now();
    const coupons = await this.db.getRepository(CouponEntity).find({
      where: { ownerUserId: userId },
      relations: { venue: true },
      order: { redeemedAt: 'DESC' },
    });
    return coupons
      .map((c) => this.toView(c, now))
      .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  }

  // ================================================================ activation (PB-27)

  async activate(userId: string, couponId: string): Promise<CouponView> {
    return this.activateWhere({ id: couponId, ownerUserId: userId });
  }

  async getCouponByToken(token: string): Promise<CouponView> {
    const coupon = isWellFormedToken(token)
      ? await this.db.getRepository(CouponEntity).findOne({
          where: { activationTokenHash: hashToken(token) },
          relations: { venue: true },
        })
      : null;
    if (!coupon) throw this.linkNotValid();
    return this.toView(coupon, this.clock.now());
  }

  async activateByToken(token: string): Promise<CouponView> {
    if (!isWellFormedToken(token)) throw this.linkNotValid();
    return this.activateWhere({ activationTokenHash: hashToken(token) }, true);
  }

  // ================================================================ Scheduler jobs (PB-38, PB-26)

  async expireCoupons(): Promise<number> {
    const cutoff = new Date(this.clock.now().getTime() - COUPON_VALID_MS);
    const result = await this.db
      .getRepository(CouponEntity)
      .update({ status: 'active', activatedAt: LessThanOrEqual(cutoff) }, { status: 'expired' });
    return result.affected ?? 0;
  }

  async retryFailedEmails(): Promise<number> {
    if (this.retrying) return 0; // a slow run never overlaps the next minute's run
    this.retrying = true;
    try {
      const now = this.clock.now();
      const due = await this.db.getRepository(CouponEntity).find({
        where: { emailStatus: 'pending', nextEmailAttemptAt: LessThanOrEqual(now) },
        relations: { venue: true, owner: true },
        order: { nextEmailAttemptAt: 'ASC' },
        take: EMAIL_RETRY_BATCH,
      });
      let attempted = 0;
      for (const coupon of due) {
        if (!coupon.owner) continue;
        // Only the hash of the first token is stored, so a re-send carries a new token.
        // The earlier link was never delivered, so nothing a student holds stops working.
        const token = newActivationToken();
        const claimed = await this.db.getRepository(CouponEntity).update(
          {
            id: coupon.id,
            emailStatus: 'pending',
            nextEmailAttemptAt: coupon.nextEmailAttemptAt!,
          },
          { activationTokenHash: hashToken(token) },
        );
        if (!claimed.affected) continue;
        await this.deliver(coupon, coupon.owner, token);
        attempted += 1;
      }
      return attempted;
    } finally {
      this.retrying = false;
    }
  }

  // ================================================================ helpers

  private async perCategory(): Promise<PointsConfig> {
    const [crowd, noise, wifi] = await Promise.all([
      this.config.get('points.crowd'),
      this.config.get('points.noise'),
      this.config.get('points.wifi'),
    ]);
    return { crowd, noise, wifi };
  }

  /** Locks the user's row for the rest of the transaction; returns the balance, or null. */
  private async lockUser(m: EntityManager, userId: string): Promise<number | null> {
    const rows: { points_balance: number }[] = await m.query(
      'SELECT points_balance FROM users WHERE id = $1 FOR UPDATE',
      [userId],
    );
    return rows.length ? Number(rows[0].points_balance) : null;
  }

  /** SDS 6.6.5: the first rule that blocks the points, or null when none does. */
  private async blockedReason(
    m: EntityManager,
    survey: StoredSurvey,
    full: number,
    present: boolean,
    now: Date,
  ): Promise<string | null> {
    if (full === 0) return NoPointsReason.nothingAnswered();
    if (!present) return NoPointsReason.notPresent();
    const [sameVenue]: { n: number }[] = await m.query(
      `SELECT count(*)::int AS n
         FROM points_ledger l JOIN surveys s ON s.id = l.survey_id
        WHERE l.user_id = $1 AND l.reason = 'survey_award' AND l.delta > 0 AND s.venue_id = $2
          AND (l.created_at AT TIME ZONE '${REWARDS_TIME_ZONE}')::date
            = ($3::timestamptz AT TIME ZONE '${REWARDS_TIME_ZONE}')::date`,
      [survey.userId, survey.venueId, now],
    );
    if (sameVenue.n > 0) return NoPointsReason.sameVenueToday();
    const since = new Date(now.getTime() - MIN_MINUTES_BETWEEN_AWARDS * 60_000);
    const [recent]: { n: number }[] = await m.query(
      `SELECT count(*)::int AS n FROM points_ledger
        WHERE user_id = $1 AND reason = 'survey_award' AND delta > 0
          AND created_at > $2 AND created_at <= $3`,
      [survey.userId, since, now],
    );
    if (recent.n > 0) return NoPointsReason.tooSoon();
    return null;
  }

  /** Survey points earned on the Cairo calendar day of `at` (RWD-016). */
  private async earnedOn(m: EntityManager, userId: string, at: Date): Promise<number> {
    const [row]: { n: number }[] = await m.query(
      `SELECT coalesce(sum(delta), 0)::int AS n FROM points_ledger
        WHERE user_id = $1 AND reason = 'survey_award'
          AND (created_at AT TIME ZONE '${REWARDS_TIME_ZONE}')::date
            = ($2::timestamptz AT TIME ZONE '${REWARDS_TIME_ZONE}')::date`,
      [userId, at],
    );
    return row.n;
  }

  /** The survey is kept; the reason goes to the points history (SDS 6.6.5, RWD-012). */
  private async recordNoAward(
    m: EntityManager,
    survey: StoredSurvey,
    reason: string,
    now: Date,
  ): Promise<AwardResult> {
    await m.getRepository(PointsLedgerEntity).insert({
      userId: survey.userId,
      delta: 0,
      reason: 'no_award',
      surveyId: survey.id,
      couponId: null,
      note: reason,
      createdAt: now,
    });
    return { points: 0, reason };
  }

  /** A fresh code that no other coupon has (SDS 6.6.7); the unique index is the backstop. */
  private async uniqueCode(m: EntityManager): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = generateCouponCode();
      if (!(await m.getRepository(CouponEntity).exist({ where: { code } }))) return code;
    }
    throw AppError.unavailable('Could not create a coupon right now. Please try again.');
  }

  /**
   * One send attempt and its outcome (SDS 6.6.9). The adapter never retries; this
   * records "sent", or the time of the next retry, or "failed" after the last one.
   */
  private async deliver(
    coupon: CouponWithVenue,
    owner: Pick<UserEntity, 'email' | 'displayName'>,
    token: string,
  ): Promise<void> {
    const attempts = coupon.emailAttempts + 1;
    let update: Partial<CouponEntity>;
    try {
      await this.email.send(
        couponEmail({
          to: owner.email,
          displayName: owner.displayName,
          reward: coupon.reward,
          venueName: coupon.venue?.name ?? '',
          code: coupon.code,
          link: activationLink(this.publicBaseUrl, token),
        }),
      );
      update = { emailStatus: 'sent', emailAttempts: attempts, nextEmailAttemptAt: null };
    } catch (err) {
      const next = afterEmailFailure(attempts, this.clock.now(), coupon.nextEmailAttemptAt);
      this.logger.warn(
        { couponId: coupon.id, attempts, next: next.nextEmailAttemptAt, err: String(err) },
        next.emailStatus === 'failed'
          ? 'Coupon e-mail failed for the last time; the coupon stays in the app'
          : 'Coupon e-mail failed; the Scheduler will retry',
      );
      update = { ...next, emailAttempts: attempts };
    }
    await this.db.getRepository(CouponEntity).update({ id: coupon.id }, update);
    Object.assign(coupon, update);
  }

  /**
   * RWD-017..RWD-020, one transaction with the coupon row locked, so two taps at once
   * cannot both start a timer. issued -> active starts the 5 minutes; tapping again while
   * it runs shows the same countdown (the timer never restarts); expired is final.
   */
  private async activateWhere(
    where: { id: string; ownerUserId: string } | { activationTokenHash: string },
    viaLink = false,
  ): Promise<CouponView> {
    const now = this.clock.now();
    const outcome = await this.db.transaction(async (m) => {
      const repo = m.getRepository(CouponEntity);
      const locked = await repo.findOne({ where, lock: { mode: 'pessimistic_write' } });
      if (!locked) return null;
      const status = effectiveStatus(locked, now);
      if (status === 'issued') {
        locked.status = 'active';
        locked.activatedAt = now;
        await repo.update({ id: locked.id }, { status: 'active', activatedAt: now });
      } else if (status === 'expired' && locked.status !== 'expired') {
        locked.status = 'expired';
        await repo.update({ id: locked.id }, { status: 'expired' });
      }
      const venue = await m
        .getRepository(VenueEntity)
        .findOne({ where: { id: locked.venueId }, select: { id: true, name: true } });
      return Object.assign(locked, { venue: venue ?? undefined }) as CouponWithVenue;
    });
    if (!outcome) {
      throw viaLink ? this.linkNotValid() : AppError.notFound('Coupon not found.');
    }
    const view = this.toView(outcome, now);
    if (view.status === 'expired') {
      throw new AppError(
        ErrorCode.CONFLICT,
        'This coupon has expired. A coupon can be activated only once, and its points are not refunded.',
        { reason: 'COUPON_EXPIRED', coupon: view },
      );
    }
    return view;
  }

  private linkNotValid(): AppError {
    return AppError.notFound(
      'This activation link is not valid. Open the coupon from the StudySpot app instead.',
    );
  }

  private toView(c: CouponWithVenue, now: Date): CouponView {
    const status = effectiveStatus(c, now);
    return {
      id: c.id,
      code: c.code,
      reward: c.reward,
      venueId: c.venueId,
      venueName: c.venue?.name ?? '',
      pointCost: c.pointCost,
      status,
      redeemedAt: c.redeemedAt.toISOString(),
      activatedAt: c.activatedAt ? c.activatedAt.toISOString() : null,
      expiresAt: expiresAt(c.activatedAt)?.toISOString() ?? null,
      emailStatus: c.emailStatus,
    };
  }
}
