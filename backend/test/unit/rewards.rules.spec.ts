import {
  activationLink,
  afterEmailFailure,
  applyDailyCap,
  COUPON_ALPHABET,
  couponEmail,
  effectiveStatus,
  expiresAt,
  generateCouponCode,
  hashToken,
  isWellFormedToken,
  MAX_REASON_LENGTH,
  newActivationToken,
  NoPointsReason,
  pointsForAnswers,
} from '../../src/modules/rewards/rewards.rules';

const TEN = { crowd: 10, noise: 10, wifi: 10 };
const minutes = (m: number) => m * 60_000;

describe('Rewards rules (PB-24..PB-27)', () => {
  it('TC-M6-13 gives the configured points for each answered category; Wi-Fi "not used" and no answer give none (RWD-002, CON-004)', () => {
    expect(pointsForAnswers({ crowd: 'not_crowded', noise: 'quiet', wifi: 'good' }, TEN)).toBe(30);
    expect(pointsForAnswers({ crowd: 'very_crowded' }, TEN)).toBe(10);
    expect(pointsForAnswers({ noise: 'noisy', wifi: 'poor' }, TEN)).toBe(20);
    expect(pointsForAnswers({ wifi: 'not_used' }, TEN)).toBe(0);
    expect(pointsForAnswers({}, TEN)).toBe(0);
    // Values come from the configuration (FR-039), not from the code.
    expect(
      pointsForAnswers({ crowd: 'not_crowded', wifi: 'average' }, { crowd: 5, noise: 0, wifi: 15 }),
    ).toBe(20);
  });

  it('TC-M6-14 applies the daily cap at its boundaries (RWD-016)', () => {
    expect(applyDailyCap(30, 0, 100)).toBe(30);
    expect(applyDailyCap(30, 70, 100)).toBe(30); // lands exactly on the cap
    expect(applyDailyCap(30, 71, 100)).toBe(29);
    expect(applyDailyCap(30, 90, 100)).toBe(10);
    expect(applyDailyCap(30, 99, 100)).toBe(1);
    expect(applyDailyCap(30, 100, 100)).toBe(0);
    // An administrator lowered the cap below what was already earned: none, never negative.
    expect(applyDailyCap(30, 100, 50)).toBe(0);
  });

  it('TC-M6-15 makes coupon codes and activation tokens from secure random bits in the agreed form (SEC-012, SDS 6.6.7)', () => {
    expect(COUPON_ALPHABET).toHaveLength(32);
    expect(COUPON_ALPHABET).not.toMatch(/[0O1I]/);
    expect(new Set(COUPON_ALPHABET).size).toBe(32);
    // All-zero bits give the first letter, all-one bits the last: every 5 bits is one character.
    expect(generateCouponCode(() => Buffer.alloc(5, 0))).toBe('AAAA-AAAA');
    expect(generateCouponCode(() => Buffer.alloc(5, 0xff))).toBe('9999-9999');
    const codes = new Set<string>();
    for (let i = 0; i < 2000; i += 1) {
      const code = generateCouponCode();
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
      codes.add(code);
    }
    expect(codes.size).toBeGreaterThan(1990); // 40 bits: repeats are vanishingly rare

    const token = newActivationToken();
    expect(token).toHaveLength(22);
    expect(isWellFormedToken(token)).toBe(true);
    expect(isWellFormedToken(token.slice(1))).toBe(false);
    expect(isWellFormedToken(`${token.slice(1)}/`)).toBe(false);
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toBe(hashToken(newActivationToken()));
  });

  it('TC-M6-16 schedules e-mail retries 1, 5, 15 and 60 minutes after the first failure, then gives up (EIR-013, SDS 6.6.9)', () => {
    const t0 = new Date('2026-11-24T10:00:00Z');
    const first = afterEmailFailure(1, t0, null);
    expect(first).toEqual({
      emailStatus: 'pending',
      nextEmailAttemptAt: new Date(t0.getTime() + minutes(1)),
    });
    // Each retry runs a little late (the Scheduler ticks once a minute); the plan stays anchored on t0.
    const second = afterEmailFailure(
      2,
      new Date(t0.getTime() + minutes(1) + 20_000),
      first.nextEmailAttemptAt,
    );
    expect(second.nextEmailAttemptAt).toEqual(new Date(t0.getTime() + minutes(5)));
    const third = afterEmailFailure(
      3,
      new Date(t0.getTime() + minutes(5) + 40_000),
      second.nextEmailAttemptAt,
    );
    expect(third.nextEmailAttemptAt).toEqual(new Date(t0.getTime() + minutes(15)));
    const fourth = afterEmailFailure(
      4,
      new Date(t0.getTime() + minutes(15)),
      third.nextEmailAttemptAt,
    );
    expect(fourth.nextEmailAttemptAt).toEqual(new Date(t0.getTime() + minutes(60)));
    expect(
      afterEmailFailure(5, new Date(t0.getTime() + minutes(60)), fourth.nextEmailAttemptAt),
    ).toEqual({
      emailStatus: 'failed',
      nextEmailAttemptAt: null,
    });
  });

  it('TC-M6-17 keeps an activated coupon valid for exactly 5 minutes (RWD-018, RWD-020)', () => {
    const activatedAt = new Date('2026-11-24T10:00:00Z');
    const at = (ms: number) => new Date(activatedAt.getTime() + ms);
    expect(effectiveStatus({ status: 'issued', activatedAt: null }, at(minutes(600)))).toBe(
      'issued',
    );
    expect(effectiveStatus({ status: 'active', activatedAt }, at(0))).toBe('active');
    expect(effectiveStatus({ status: 'active', activatedAt }, at(minutes(5) - 1))).toBe('active');
    expect(effectiveStatus({ status: 'active', activatedAt }, at(minutes(5)))).toBe('expired');
    expect(effectiveStatus({ status: 'expired', activatedAt }, at(minutes(1)))).toBe('expired');
    expect(expiresAt(activatedAt)).toEqual(at(minutes(5)));
    expect(expiresAt(null)).toBeNull();
  });

  it('TC-M6-18 writes the coupon e-mail with reward, venue, code and an Activate link, escaping HTML (RWD-014)', () => {
    const link = activationLink('https://api.example/', 'abcdefghijklmnopqrstuv');
    expect(link).toBe('https://api.example/coupon/#t=abcdefghijklmnopqrstuv');
    const mail = couponEmail({
      to: 'student@studyspot.test',
      displayName: 'Zeina',
      reward: 'Free <b>espresso</b>',
      venueName: 'Café "Nile" & Co',
      code: 'K7QM-4TXD',
      link,
    });
    expect(mail.to).toBe('student@studyspot.test');
    expect(mail.subject).toBe('Your StudySpot coupon: Free <b>espresso</b> at Café "Nile" & Co');
    for (const part of [
      'Free <b>espresso</b>',
      'Café "Nile" & Co',
      'K7QM-4TXD',
      link,
      '5 minutes',
    ]) {
      expect(mail.text).toContain(part);
    }
    expect(mail.html).toContain('Free &lt;b&gt;espresso&lt;/b&gt;');
    expect(mail.html).toContain('Café &quot;Nile&quot; &amp; Co');
    expect(mail.html).not.toContain('<b>espresso</b>');
    expect(mail.html).toContain(`href="${link}"`);
    expect(mail.html).toContain('>Activate</a>');
  });

  it('TC-M6-19 tells the student why points were not given, in at most 120 characters (SDS 6.6.5, CON-007)', () => {
    const reasons = [
      NoPointsReason.nothingAnswered(),
      NoPointsReason.notPresent(),
      NoPointsReason.sameVenueToday(),
      NoPointsReason.tooSoon(),
      NoPointsReason.dailyCapReached(100),
      NoPointsReason.partlyCapped(100, 10, 30),
      NoPointsReason.dailyCapReached(1000),
      NoPointsReason.partlyCapped(1000, 100, 300),
    ];
    for (const reason of reasons) expect(reason.length).toBeLessThanOrEqual(MAX_REASON_LENGTH);
    expect(NoPointsReason.partlyCapped(100, 10, 30)).toBe(
      "You reached today's limit of 100 points, so this survey earned 10 of 30 points.",
    );
  });
});
