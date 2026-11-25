import { createHash, randomBytes } from 'node:crypto';
import type { CouponStatus, EmailMessage, PointsSummary, SurveyAnswers } from '../../contracts';

/**
 * Pure rules of Rewards & Coupons (PB-24..PB-27). No database and no clock here,
 * so every rule is unit-tested at its boundary (test/unit/rewards.rules.spec.ts).
 */

/** RWD-018: an activated coupon is valid for 5 minutes, then expires. */
export const COUPON_VALID_MINUTES = 5;
export const COUPON_VALID_MS = COUPON_VALID_MINUTES * 60_000;

/** SDS 6.6.5 rule 2: at least 5 minutes between two points-earning surveys. */
export const MIN_MINUTES_BETWEEN_AWARDS = 5;

/** SDS 6.6.9: retries 1, 5, 15 and 60 minutes after the first failure; then "e-mail failed". */
export const EMAIL_RETRY_MINUTES = [1, 5, 15, 60] as const;

/** RWD-016, SDS 6.6.5 rule 1: calendar days are counted in Cairo time. */
export const REWARDS_TIME_ZONE = 'Africa/Cairo';

/** Survey reasons are stored in surveys.no_points_reason, which holds 120 characters. */
export const MAX_REASON_LENGTH = 120;

// ------------------------------------------------------------------ codes (SDS 6.6.7)

/** 32 characters: A-Z and 2-9 without 0, O, 1 and I, so a code is easy to read at a till. */
export const COUPON_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** 8 characters (40 random bits) from the OS secure generator, shown as XXXX-XXXX. */
export function generateCouponCode(random: (size: number) => Buffer = randomBytes): string {
  const bytes = random(5);
  let bits = 0n;
  for (const b of bytes) bits = (bits << 8n) | BigInt(b);
  let out = '';
  for (let i = 0; i < 8; i += 1) {
    const index = Number((bits >> BigInt(35 - i * 5)) & 31n);
    out += COUPON_ALPHABET[index];
  }
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

/** Activation-link token: 128 random bits in URL-safe base64 (22 characters), one use only. */
export function newActivationToken(random: (size: number) => Buffer = randomBytes): string {
  return random(16).toString('base64url');
}

/** Only the SHA-256 of the token is stored, so a database leak cannot activate coupons. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function isWellFormedToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{22}$/.test(token);
}

// ------------------------------------------------------------------ points (RWD-002, RWD-016)

export type PointsConfig = PointsSummary['perCategory'];

/**
 * Points for one survey before the daily cap: the configured points for each category
 * answered. Wi-Fi "did not use it" (CON-004) is a valid answer but carries no Wi-Fi
 * information and adds no dynamic record, so it earns no points; otherwise tapping
 * "not used" would be free points.
 */
export function pointsForAnswers(answers: SurveyAnswers, perCategory: PointsConfig): number {
  let points = 0;
  if (answers.crowd) points += perCategory.crowd;
  if (answers.noise) points += perCategory.noise;
  if (answers.wifi && answers.wifi !== 'not_used') points += perCategory.wifi;
  return points;
}

/** RWD-016: what is left of today's cap decides the award; never negative. */
export function applyDailyCap(points: number, earnedToday: number, dailyCap: number): number {
  return Math.max(0, Math.min(points, dailyCap - earnedToday));
}

/** Why fewer or no points were given (SDS 6.6.5: "the user is told ... why"). */
export const NoPointsReason = {
  nothingAnswered: () =>
    'No points this time: answer at least one question to earn points. Your answers were saved.',
  notPresent: () =>
    'No points this time: be at the venue when you send an in-app survey. Your answers were saved.',
  sameVenueToday: () =>
    'No points this time: you already earned points at this venue today. Your answers were saved.',
  tooSoon: () =>
    `No points this time: wait ${MIN_MINUTES_BETWEEN_AWARDS} minutes between surveys that earn points. Your answers were saved.`,
  dailyCapReached: (cap: number) =>
    `No points this time: you reached today's limit of ${cap} points. Your answers were saved.`,
  partlyCapped: (cap: number, awarded: number, full: number) =>
    `You reached today's limit of ${cap} points, so this survey earned ${awarded} of ${full} points.`,
} as const;

// ------------------------------------------------------------------ coupon life cycle (RWD-017..RWD-020)

/** issued -> active -> expired. Expiry is checked on every read, not only by the Scheduler. */
export function effectiveStatus(
  coupon: { status: CouponStatus; activatedAt: Date | null },
  now: Date,
): CouponStatus {
  if (coupon.status === 'active' && coupon.activatedAt) {
    return now.getTime() >= coupon.activatedAt.getTime() + COUPON_VALID_MS ? 'expired' : 'active';
  }
  return coupon.status;
}

export function expiresAt(activatedAt: Date | null): Date | null {
  return activatedAt ? new Date(activatedAt.getTime() + COUPON_VALID_MS) : null;
}

/** Order on the coupons screen: running countdown first, then ready to use, then used. */
export const STATUS_ORDER: Record<CouponStatus, number> = { active: 0, issued: 1, expired: 2 };

// ------------------------------------------------------------------ e-mail retry (SDS 6.6.9)

/**
 * What to record after a send attempt fails. `attempts` counts every attempt so far,
 * including the one that just failed (1 = the first send). Retries are timed from the
 * first failure: 1, 5, 15 and 60 minutes after it. After the fourth retry fails the
 * coupon is marked "failed" and the Scheduler stops; the coupon stays in the app.
 */
export function afterEmailFailure(
  attempts: number,
  now: Date,
  previouslyDue: Date | null,
): { emailStatus: 'pending' | 'failed'; nextEmailAttemptAt: Date | null } {
  const retriesDone = attempts - 1;
  if (retriesDone >= EMAIL_RETRY_MINUTES.length) {
    return { emailStatus: 'failed', nextEmailAttemptAt: null };
  }
  const firstFailureAt =
    retriesDone === 0 || !previouslyDue
      ? now.getTime()
      : previouslyDue.getTime() - EMAIL_RETRY_MINUTES[retriesDone - 1] * 60_000;
  return {
    emailStatus: 'pending',
    nextEmailAttemptAt: new Date(firstFailureAt + EMAIL_RETRY_MINUTES[retriesDone] * 60_000),
  };
}

// ------------------------------------------------------------------ the coupon e-mail (RWD-014)

export function activationLink(publicBaseUrl: string, token: string): string {
  // The token rides in the fragment (#), which browsers never send to a server or a log.
  return `${publicBaseUrl.replace(/\/+$/, '')}/coupon/#t=${token}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** RWD-014: reward, venue, coupon code and an "Activate" link, to the account's address. */
export function couponEmail(input: {
  to: string;
  displayName: string;
  reward: string;
  venueName: string;
  code: string;
  link: string;
}): EmailMessage {
  const { to, displayName, reward, venueName, code, link } = input;
  const text = [
    `Hi ${displayName},`,
    '',
    `Here is your StudySpot coupon: ${reward} at ${venueName}.`,
    `Coupon code: ${code}`,
    '',
    `Activate it at the counter: ${link}`,
    '',
    `Only activate it when you are at the counter. Once activated it is valid for ${COUPON_VALID_MINUTES} minutes, then it expires and cannot be used again.`,
    'You can also find and activate this coupon in the StudySpot app under Rewards.',
  ].join('\n');
  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#1d1b20;line-height:1.5">
<p>Hi ${escapeHtml(displayName)},</p>
<p>Here is your StudySpot coupon:</p>
<p style="font-size:20px;margin:8px 0"><strong>${escapeHtml(reward)}</strong><br>at ${escapeHtml(venueName)}</p>
<p>Coupon code: <strong style="font-family:monospace;font-size:18px;letter-spacing:2px">${escapeHtml(code)}</strong></p>
<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#2f6f4f;color:#ffffff;padding:12px 24px;border-radius:24px;text-decoration:none;font-weight:bold">Activate</a></p>
<p style="color:#49454f;font-size:14px">Only activate it when you are at the counter. Once activated it is valid for ${COUPON_VALID_MINUTES} minutes, then it expires and cannot be used again. You can also find this coupon in the StudySpot app under Rewards.</p>
</body></html>`;
  return { to, subject: `Your StudySpot coupon: ${reward} at ${venueName}`, text, html };
}
