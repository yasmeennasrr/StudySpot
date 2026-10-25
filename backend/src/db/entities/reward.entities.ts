import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserEntity } from './user.entities';
import { VenueEntity } from './venue.entities';
import { SurveyEntity } from './contribution.entities';

/** Coupons a venue offers for points (RWD-005). */
@Entity({ name: 'coupon_offers' })
@Check('chk_coupon_offers_cost', '"point_cost" > 0')
export class CouponOfferEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('ix_coupon_offers_venue')
  @Column({ name: 'venue_id', type: 'uuid' })
  venueId: string;

  @ManyToOne(() => VenueEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'venue_id', foreignKeyConstraintName: 'fk_coupon_offers_venue' })
  venue?: VenueEntity;

  /** e.g. "Free espresso", "15% off any drink". */
  @Column({ type: 'varchar', length: 120 })
  reward: string;

  @Column({ name: 'point_cost', type: 'integer' })
  pointCost: number;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

/** Issued coupons (DATA-011, RWD-014..RWD-021, SDS 6.6.7, 6.6.9). State: issued -> active -> expired. */
@Entity({ name: 'coupons' })
@Index('ix_coupons_owner', ['ownerUserId', 'redeemedAt'])
@Index('ix_coupons_email_retry', ['emailStatus', 'nextEmailAttemptAt'])
export class CouponEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 8 characters from a 32-character alphabet, shown as XXXX-XXXX. */
  @Index('uq_coupons_code', { unique: true })
  @Column({ type: 'varchar', length: 9 })
  code: string;

  @Column({ name: 'offer_id', type: 'uuid' })
  offerId: string;

  @ManyToOne(() => CouponOfferEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'offer_id', foreignKeyConstraintName: 'fk_coupons_offer' })
  offer?: CouponOfferEntity;

  /** Copied from the offer so the coupon stays readable if the offer changes. */
  @Column({ type: 'varchar', length: 120 })
  reward: string;

  @Column({ name: 'venue_id', type: 'uuid' })
  venueId: string;

  @ManyToOne(() => VenueEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'venue_id', foreignKeyConstraintName: 'fk_coupons_venue' })
  venue?: VenueEntity;

  @Column({ name: 'owner_user_id', type: 'uuid' })
  ownerUserId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_user_id', foreignKeyConstraintName: 'fk_coupons_owner' })
  owner?: UserEntity;

  @Column({ name: 'point_cost', type: 'integer' })
  pointCost: number;

  @Column({ name: 'redeemed_at', type: 'timestamptz' })
  redeemedAt: Date;

  /** SHA-256 of the one-use activation-link token (SDS 6.6.7). */
  @Index('uq_coupons_activation_hash', { unique: true })
  @Column({ name: 'activation_token_hash', type: 'varchar', length: 128 })
  activationTokenHash: string;

  @Column({ name: 'activated_at', type: 'timestamptz', nullable: true })
  activatedAt: Date | null;

  @Column({
    type: 'enum',
    enum: ['issued', 'active', 'expired'],
    enumName: 'coupon_status',
    default: 'issued',
  })
  status: 'issued' | 'active' | 'expired';

  @Column({
    name: 'email_status',
    type: 'enum',
    enum: ['pending', 'sent', 'failed'],
    enumName: 'coupon_email_status',
    default: 'pending',
  })
  emailStatus: 'pending' | 'sent' | 'failed';

  @Column({ name: 'email_attempts', type: 'smallint', default: 0 })
  emailAttempts: number;

  @Column({ name: 'next_email_attempt_at', type: 'timestamptz', nullable: true })
  nextEmailAttemptAt: Date | null;
}

/** Every points award and redemption (DATA-008); feeds the points history (RWD-012). */
@Entity({ name: 'points_ledger' })
/** Partial unique index: one survey_award per survey (RWD-011); created in the migration. */
@Index('uq_points_ledger_survey_award', { synchronize: false })
@Index('ix_points_ledger_user_time', ['userId', 'createdAt'])
export class PointsLedgerEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_points_ledger_user' })
  user?: UserEntity;

  /** Positive for awards, negative for redemptions. */
  @Column({ type: 'integer' })
  delta: number;

  @Column({
    type: 'enum',
    enum: ['survey_award', 'coupon_redemption', 'no_award'],
    enumName: 'points_reason',
  })
  reason: 'survey_award' | 'coupon_redemption' | 'no_award';

  /** RWD-011: at most one award per survey (partial unique index in the migration). */
  @Column({ name: 'survey_id', type: 'uuid', nullable: true })
  surveyId: string | null;

  @ManyToOne(() => SurveyEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'survey_id', foreignKeyConstraintName: 'fk_points_ledger_survey' })
  survey?: SurveyEntity;

  @Column({ name: 'coupon_id', type: 'uuid', nullable: true })
  couponId: string | null;

  @ManyToOne(() => CouponEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'coupon_id', foreignKeyConstraintName: 'fk_points_ledger_coupon' })
  coupon?: CouponEntity;

  /** Reason shown when no points were awarded (SDS 6.6.5). */
  @Column({ type: 'varchar', length: 200, nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
