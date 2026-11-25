import { And, IsNull, LessThanOrEqual, Not, type Repository } from 'typeorm';
import type { ReceiptCodeEntity } from '../../db/entities';

/** QR-007: a scanned code expires 10 minutes after its first scan if no survey was sent. */
export const SCANNED_CODE_VALID_MINUTES = 10;
/** QR-009: a code nobody scanned expires 24 hours after it was created. */
export const UNSCANNED_CODE_VALID_HOURS = 24;

/**
 * PB-38: marks stale receipt codes expired (QR-007, QR-009); expired codes earn no
 * points. Used codes are never touched. Kept in its own file so the real QR Codes
 * service (PB-21..PB-23) calls the same rule from its expireStale().
 */
export async function expireStaleReceiptCodes(
  codes: Repository<ReceiptCodeEntity>,
  now: Date,
): Promise<number> {
  const scannedBefore = new Date(now.getTime() - SCANNED_CODE_VALID_MINUTES * 60_000);
  const createdBefore = new Date(now.getTime() - UNSCANNED_CODE_VALID_HOURS * 3_600_000);
  const scanned = await codes.update(
    { status: 'scanned', firstScanAt: And(Not(IsNull()), LessThanOrEqual(scannedBefore)) },
    { status: 'expired' },
  );
  const unscanned = await codes.update(
    { status: 'unused', createdAt: LessThanOrEqual(createdBefore) },
    { status: 'expired' },
  );
  return (scanned.affected ?? 0) + (unscanned.affected ?? 0);
}
